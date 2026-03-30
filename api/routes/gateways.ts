import express, { Request, Response } from 'express';
import { query } from '../db.js';
import { verifyUserToken } from './auth.js';
import { getMqttClient } from '../mqtt.js';

const router = express.Router();

router.use(verifyUserToken);

// Helper to get allowed project IDs including children
const getAllowedProjectIds = async (userProjectIds: number[]): Promise<number[]> => {
  if (userProjectIds.length === 0) return [];
  const allProjects = await query('SELECT id, parent_id FROM projects');
  const allowed = new Set<number>(userProjectIds);
  
  let added = true;
  while (added) {
    added = false;
    for (const p of allProjects.rows) {
      if (p.parent_id && allowed.has(p.parent_id) && !allowed.has(p.id)) {
        allowed.add(p.id);
        added = true;
      }
    }
  }
  return Array.from(allowed);
};

// Get all gateways
router.get('/', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    let sql = `
      SELECT g.*, p.name as project_name 
      FROM gateway_info g
      LEFT JOIN projects p ON g.project_id = p.id
    `;
    const params: any[] = [];

    if (user.role !== 'ADMIN') {
      const allowedIds = await getAllowedProjectIds(user.project_ids || []);
      if (allowedIds.length === 0) {
        return res.json({ success: true, data: [] });
      }
      sql += ` WHERE g.project_id = ANY($1::int[])`;
      params.push(allowedIds);
    }
    
    sql += ` ORDER BY g.created_at DESC`;
    
    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch gateways' });
  }
});

// Get overview (Dashboard data)
router.get('/overview', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    
    // Default filters for ADMIN
    let projectFilter = '';
    let params: any[] = [];
    
    if (user.role !== 'ADMIN') {
      const allowedIds = await getAllowedProjectIds(user.project_ids || []);
      if (allowedIds.length === 0) {
        return res.json({
          success: true,
          data: {
            totalGateways: 0,
            onlineGateways: 0,
            totalProjects: 0,
            apiTokens: 0,
            systemUptime: process.uptime(),
            mqttStatus: getMqttClient()?.connected ? '已连接' : '未连接'
          }
        });
      }
      projectFilter = `WHERE project_id = ANY($1::int[])`;
      params.push(allowedIds);
    }

    const gatewayCount = await query(`SELECT COUNT(*) as count FROM gateway_info ${projectFilter}`, params);
    
    const onlineFilter = projectFilter ? `${projectFilter} AND status = 'ONLINE'` : `WHERE status = 'ONLINE'`;
    const onlineCount = await query(`SELECT COUNT(*) as count FROM gateway_info ${onlineFilter}`, params);
    
    // Project count
    let projectCountResult;
    if (user.role === 'ADMIN') {
      projectCountResult = await query('SELECT COUNT(*) as count FROM projects');
    } else {
      projectCountResult = { rows: [{ count: (await getAllowedProjectIds(user.project_ids || [])).length }] };
    }

    // API tokens (Only admin really cares, but we can show it)
    const tokenCount = await query("SELECT COUNT(*) as count FROM api_tokens WHERE status = 'ACTIVE'");

    // Try to get total data points collected today from the current month's table
    const currentDate = new Date();
    const monthStr = `${currentDate.getFullYear()}_${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
    const tableName = `telemetry_data_${monthStr}`;
    
    let todayDataCount = 0;
    try {
      // Check if table exists
      const tableExists = await query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = $1
        )
      `, [tableName]);

      if (tableExists.rows[0].exists) {
        const todayStr = currentDate.toISOString().split('T')[0];
        // If not admin, we would ideally filter by gateway_sncode, but for performance we might just show global or 0
        // For simplicity and performance, we show global data count for admin, and 0 for users for now
        if (user.role === 'ADMIN') {
          const countRes = await query(`SELECT COUNT(*) as count FROM ${tableName} WHERE DATE(ts) = $1`, [todayStr]);
          todayDataCount = parseInt(countRes.rows[0].count);
        }
      }
    } catch (e) {
      console.error('Error counting today data:', e);
    }

    res.json({
      success: true,
      data: {
        totalGateways: parseInt(gatewayCount.rows[0].count),
        onlineGateways: parseInt(onlineCount.rows[0].count),
        totalProjects: parseInt(projectCountResult.rows[0].count),
        activeApiTokens: parseInt(tokenCount.rows[0].count),
        todayDataCount,
        systemUptime: process.uptime(),
        mqttStatus: getMqttClient()?.connected ? '已连接' : '已断开'
      }
    });
  } catch (error) {
    console.error('Error fetching overview:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch overview' });
  }
});

// Get recent telemetry data (across all monthly tables)
router.get('/telemetry', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { startDate, endDate } = req.query;
    let allowedIds: number[] = [];
    
    if (user.role !== 'ADMIN') {
      allowedIds = await getAllowedProjectIds(user.project_ids || []);
      if (allowedIds.length === 0) {
        return res.json({ success: true, data: [] });
      }
    }

    // Find all telemetry_data_* tables
    const tableResult = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'telemetry_data_%'
    `);
    
    if (tableResult.rows.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // Build a UNION ALL query for all discovered tables
    const unionQuery = tableResult.rows
      .map(row => `SELECT * FROM ${row.table_name}`)
      .join(' UNION ALL ');

    let sql = `
      WITH all_telemetry AS (${unionQuery})
      SELECT t.*, p.code as project_code, p.name as project_name 
      FROM all_telemetry t
      LEFT JOIN gateway_info g ON t.gateway_sncode = g.sncode
      LEFT JOIN projects p ON g.project_id = p.id
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramIndex = 1;
    
    if (user.role !== 'ADMIN') {
      sql += ` AND g.project_id = ANY($${paramIndex}::int[])`;
      params.push(allowedIds);
      paramIndex++;
    }

    if (startDate) {
      sql += ` AND t.ts >= $${paramIndex}`;
      params.push(new Date(startDate as string));
      paramIndex++;
    }

    if (endDate) {
      sql += ` AND t.ts <= $${paramIndex}`;
      params.push(new Date(endDate as string));
      paramIndex++;
    }
    
    sql += ` ORDER BY t.ts DESC LIMIT 2000`;

    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching telemetry data:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch telemetry data' });
  }
});

// Get raw MQTT logs
router.get('/raw-logs', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { startDate, endDate } = req.query;
    
    let sql = `
      SELECT r.* 
      FROM raw_mqtt_logs r
    `;
    const params: any[] = [];
    let paramIndex = 1;

    let hasWhere = false;

    if (user.role !== 'ADMIN') {
      const allowedIds = await getAllowedProjectIds(user.project_ids || []);
      if (allowedIds.length === 0) {
        return res.json({ success: true, data: [] });
      }
      sql += `
        INNER JOIN gateway_info g ON r.gateway_sncode = g.sncode
        WHERE g.project_id = ANY($${paramIndex}::int[])
      `;
      params.push(allowedIds);
      paramIndex++;
      hasWhere = true;
    }

    if (startDate) {
      sql += hasWhere ? ` AND r.received_at >= $${paramIndex}` : ` WHERE r.received_at >= $${paramIndex}`;
      hasWhere = true;
      // use string directly for DB to parse as local time
      params.push(startDate as string);
      paramIndex++;
    }

    if (endDate) {
      sql += hasWhere ? ` AND r.received_at <= $${paramIndex}` : ` WHERE r.received_at <= $${paramIndex}`;
      hasWhere = true;
      params.push(endDate as string);
      paramIndex++;
    }

    sql += ` ORDER BY r.received_at DESC LIMIT 1000`;

    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching raw logs:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch raw logs' });
  }
});

// Create a new gateway
router.post('/', async (req: Request, res: Response) => {
  const { sncode, alias, ip_address, project_id, publish_topic, subscribe_topic } = req.body;
  try {
    // Check if gateway already exists
    const existing = await query('SELECT sncode FROM gateway_info WHERE sncode = $1', [sncode]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'Gateway SN code already exists' });
    }

    const projectIdValue = project_id ? parseInt(project_id, 10) : null;

    await query(
      'INSERT INTO gateway_info (sncode, alias, ip_address, project_id, publish_topic, subscribe_topic, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [sncode, alias, ip_address || '', projectIdValue, publish_topic || null, subscribe_topic || null, 'OFFLINE']
    );

    // Dynamically subscribe to the new topic if it exists
    if (subscribe_topic) {
      const mqttClient = getMqttClient();
      if (mqttClient && mqttClient.connected) {
        mqttClient.subscribe(subscribe_topic, (err) => {
          if (!err) console.log(`Dynamically subscribed to new custom MQTT topic: ${subscribe_topic}`);
        });
      }
    }

    res.json({ success: true, message: 'Gateway created' });
  } catch (error) {
    console.error('Error creating gateway:', error);
    res.status(500).json({ success: false, error: 'Failed to create gateway' });
  }
});

// Delete a gateway
router.delete('/:sncode', async (req: Request, res: Response) => {
  const { sncode } = req.params;
  try {
    await query('DELETE FROM gateway_info WHERE sncode = $1', [sncode]);
    res.json({ success: true, message: 'Gateway deleted' });
  } catch (error) {
    console.error('Error deleting gateway:', error);
    res.status(500).json({ success: false, error: 'Failed to delete gateway' });
  }
});

// Edit a gateway
router.put('/:sncode', async (req: Request, res: Response) => {
  const { sncode } = req.params;
  const { alias, ip_address, project_id, publish_topic, subscribe_topic } = req.body;
  try {
    const projectIdValue = project_id ? parseInt(project_id, 10) : null;

    // Get old subscribe_topic to unsubscribe if changed
    const oldGw = await query('SELECT subscribe_topic FROM gateway_info WHERE sncode = $1', [sncode]);
    const oldSubscribeTopic = oldGw.rows.length > 0 ? oldGw.rows[0].subscribe_topic : null;

    const result = await query(
      'UPDATE gateway_info SET alias = $1, ip_address = $2, project_id = $3, publish_topic = $4, subscribe_topic = $5, updated_at = CURRENT_TIMESTAMP WHERE sncode = $6 RETURNING *',
      [alias, ip_address || '', projectIdValue, publish_topic || null, subscribe_topic || null, sncode]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Gateway not found' });
    }

    const mqttClient = getMqttClient();
    if (mqttClient && mqttClient.connected) {
      // If topic changed or removed, unsubscribe from the old one
      if (oldSubscribeTopic && oldSubscribeTopic !== subscribe_topic) {
        mqttClient.unsubscribe(oldSubscribeTopic, (err) => {
          if (!err) console.log(`Unsubscribed from old custom MQTT topic: ${oldSubscribeTopic}`);
        });
      }
      // If new topic is provided and different, subscribe to it
      if (subscribe_topic && oldSubscribeTopic !== subscribe_topic) {
        mqttClient.subscribe(subscribe_topic, (err) => {
          if (!err) console.log(`Dynamically subscribed to updated custom MQTT topic: ${subscribe_topic}`);
        });
      }
    }
    
    res.json({ success: true, message: 'Gateway updated', data: result.rows[0] });
  } catch (error) {
    console.error('Error updating gateway:', error);
    res.status(500).json({ success: false, error: 'Failed to update gateway' });
  }
});

// Internal Control API for dashboard (requires user token)
router.post('/control', async (req: Request, res: Response) => {
  try {
    const { sncode, command } = req.body;
    if (!sncode || !command) {
      return res.status(400).json({ success: false, error: 'Missing sncode or command in request body' });
    }

    const user = (req as any).user;
    
    // 1. Check if gateway exists and get info
    const gwResult = await query('SELECT project_id, publish_topic, status FROM gateway_info WHERE sncode = $1', [sncode]);
    if (gwResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Gateway not found' });
    }

    const gateway = gwResult.rows[0];

    // 2. Check user permission
    if (user.role !== 'ADMIN') {
      const allowedIds = await getAllowedProjectIds(user.project_ids || []);
      if (!gateway.project_id || !allowedIds.includes(gateway.project_id)) {
        return res.status(403).json({ success: false, error: 'Permission denied for this gateway' });
      }
    }

    // 3. Check publish topic
    if (!gateway.publish_topic) {
      return res.status(400).json({ success: false, error: 'Gateway has no publish_topic configured' });
    }

    // 4. Publish via MQTT
    const mqttClient = getMqttClient();
    if (!mqttClient || !mqttClient.connected) {
      return res.status(500).json({ success: false, error: 'MQTT client is not connected' });
    }

    const payload = typeof command === 'string' ? command : JSON.stringify(command);
    
    mqttClient.publish(gateway.publish_topic, payload, { qos: 1 }, (err) => {
      if (err) {
        console.error('Failed to publish MQTT message:', err);
        return res.status(500).json({ success: false, error: 'Failed to send command to gateway' });
      }
      res.json({ success: true, message: 'Command sent successfully', data: { topic: gateway.publish_topic } });
    });
  } catch (error) {
    console.error('Error in internal /control API:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
