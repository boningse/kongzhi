import express, { Request, Response, NextFunction } from 'express';
import { query } from '../db.js';
import { getMqttClient } from '../mqtt.js';

const router = express.Router();

// Middleware to verify API token
const verifyToken = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, code: 401, error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.split(' ')[1];
  
  try {
    const result = await query("SELECT * FROM api_tokens WHERE token = $1 AND status = 'ACTIVE'", [token]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, code: 401, error: 'Unauthorized: Invalid or inactive token' });
    }
    
    // Attach token info to request for later use
    (req as any).apiToken = result.rows[0];
    next();
  } catch (error) {
    console.error('Error verifying token:', error);
    res.status(500).json({ success: false, code: 500, error: 'Internal server error' });
  }
};

// Apply middleware to all routes in this router
router.use(verifyToken);

// Get shared telemetry data based on token permissions
router.get('/telemetry', async (req: Request, res: Response) => {
  try {
    const tokenInfo = (req as any).apiToken;
    const projectIds: number[] = tokenInfo.project_ids || [];
    const { start, end, limit } = req.query as { start?: string; end?: string; limit?: string };

    // Parse time range if provided
    let startDate: Date | null = null;
    let endDate: Date | null = null;
    if (start) {
      const s = new Date(start);
      if (isNaN(s.getTime())) {
        return res.status(400).json({ success: false, code: 400, error: 'Invalid start time format' });
      }
      startDate = s;
    }
    if (end) {
      const e = new Date(end);
      if (isNaN(e.getTime())) {
        return res.status(400).json({ success: false, code: 400, error: 'Invalid end time format' });
      }
      endDate = e;
    }
    if (startDate && endDate && startDate > endDate) {
      return res.status(400).json({ success: false, code: 400, error: 'start must be earlier than end' });
    }
    const rowLimit = Math.min(Math.max(parseInt(limit || '0', 10) || (startDate || endDate ? 5000 : 500), 1), 20000);
    
    // Find all telemetry_data_* tables
    const tableResult = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'telemetry_data_%'
    `);
    
    if (tableResult.rows.length === 0) {
      return res.json({ success: true, code: 0, data: [] });
    }

    // If a time range is provided, try to only union the involved months to reduce scan
    let tableNames: string[] = tableResult.rows.map(r => r.table_name);
    if (startDate || endDate) {
      const months = new Set<string>();
      const from = new Date(startDate || new Date(0));
      const to = new Date(endDate || new Date());
      const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
      const endCursor = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
      while (cursor <= endCursor) {
        const y = cursor.getUTCFullYear();
        const m = String(cursor.getUTCMonth() + 1).padStart(2, '0');
        months.add(`telemetry_data_${y}_${m}`);
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }
      tableNames = tableNames.filter(n => months.has(n));
      if (tableNames.length === 0) {
        return res.json({ success: true, code: 0, data: [] });
      }
    }

    const unionQuery = tableNames.map(n => `SELECT * FROM ${n}`).join(' UNION ALL ');

    const queryParams: any[] = [];
    let sql = '';

    // If project_ids is not empty, restrict to those projects and all their descendants. 
    // If it's empty, it means global access.
    if (projectIds.length > 0) {
      sql = `
      WITH RECURSIVE project_tree AS (
        SELECT id FROM projects WHERE id = ANY($1::int[])
        UNION
        SELECT p.id FROM projects p
        INNER JOIN project_tree pt ON p.parent_id = pt.id
      ),
      all_telemetry AS (${unionQuery})
      SELECT t.id, t.gateway_sncode, t.device_code, t.point_name, t.insname, t.propertyno, t.paraname, t.quality, t.value, t.ts, 
             p.code as project_code, p.name as project_name 
      FROM all_telemetry t
      LEFT JOIN gateway_info g ON t.gateway_sncode = g.sncode
      LEFT JOIN projects p ON g.project_id = p.id
      WHERE g.project_id IN (SELECT id FROM project_tree)
      `;
      queryParams.push(projectIds);
    } else {
      sql = `
      WITH all_telemetry AS (${unionQuery})
      SELECT t.id, t.gateway_sncode, t.device_code, t.point_name, t.insname, t.propertyno, t.paraname, t.quality, t.value, t.ts, 
             p.code as project_code, p.name as project_name 
      FROM all_telemetry t
      LEFT JOIN gateway_info g ON t.gateway_sncode = g.sncode
      LEFT JOIN projects p ON g.project_id = p.id
      `;
    }

    // Append time range filters if provided
    const whereClauses: string[] = [];
    if (startDate) {
      whereClauses.push(`t.ts >= $${queryParams.length + 1}`);
      queryParams.push(startDate.toISOString());
    }
    if (endDate) {
      whereClauses.push(`t.ts <= $${queryParams.length + 1}`);
      queryParams.push(endDate.toISOString());
    }
    if (whereClauses.length > 0) {
      sql += ` AND ${whereClauses.join(' AND ')}`;
    }

    sql += ` ORDER BY t.ts DESC LIMIT ${rowLimit}`;

    const result = await query(sql, queryParams);
    res.json({ success: true, code: 0, data: result.rows });
  } catch (error) {
    console.error('Error fetching shared telemetry data:', error);
    res.status(500).json({ success: false, code: 500, error: 'Failed to fetch data' });
  }
});

// Send control command to a gateway
router.post('/control', async (req: Request, res: Response) => {
  try {
    const { sncode, command } = req.body;
    if (!sncode || !command) {
      return res.status(400).json({ success: false, code: 400, error: 'Missing sncode or command in request body' });
    }

    const tokenInfo = (req as any).apiToken;
    const projectIds: number[] = tokenInfo.project_ids || [];

    // 1. Check if the gateway exists and get its publish_topic and project_id
    const gwResult = await query('SELECT project_id, publish_topic, status FROM gateway_info WHERE sncode = $1', [sncode]);
    if (gwResult.rows.length === 0) {
      return res.status(404).json({ success: false, code: 404, error: 'Gateway not found' });
    }

    const gateway = gwResult.rows[0];

    // 2. Check if the token has permission to access this gateway's project
    if (projectIds.length > 0) {
      // Find if gateway.project_id is in the allowed project tree
      const allowedResult = await query(`
        WITH RECURSIVE project_tree AS (
          SELECT id FROM projects WHERE id = ANY($1::int[])
          UNION
          SELECT p.id FROM projects p
          INNER JOIN project_tree pt ON p.parent_id = pt.id
        )
        SELECT 1 FROM project_tree WHERE id = $2
      `, [projectIds, gateway.project_id]);

      if (allowedResult.rows.length === 0) {
        return res.status(403).json({ success: false, code: 403, error: 'Permission denied for this gateway' });
      }
    }

    // 3. Check if publish_topic is configured
    if (!gateway.publish_topic) {
      return res.status(400).json({ success: false, code: 400, error: 'Gateway has no publish_topic configured' });
    }

    // 4. Publish via MQTT
    const mqttClient = getMqttClient();
    if (!mqttClient || !mqttClient.connected) {
      return res.status(500).json({ success: false, code: 500, error: 'MQTT client is not connected' });
    }

    const payload = typeof command === 'string' ? command : JSON.stringify(command);
    
    mqttClient.publish(gateway.publish_topic, payload, { qos: 1 }, (err) => {
      if (err) {
        console.error('Failed to publish MQTT message:', err);
        return res.status(500).json({ success: false, code: 500, error: 'Failed to send command to gateway' });
      }
      res.json({ success: true, code: 0, message: 'Command sent successfully', data: { topic: gateway.publish_topic } });
    });
  } catch (error) {
    console.error('Error in /control API:', error);
    res.status(500).json({ success: false, code: 500, error: 'Internal server error' });
  }
});

export default router;
