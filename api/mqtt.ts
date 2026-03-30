import mqtt from 'mqtt';
import { query } from './db.js';
import dotenv from 'dotenv';
import { broadcast } from './ws.js';
import { distributeData } from './distributor.js';

dotenv.config();

// Default to user provided config, or fallback to environment variables
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://223.80.108.95:15007';
const MQTT_USERNAME = process.env.MQTT_USERNAME || 'boning';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || 'BoNing@123';
const MQTT_TOPIC_SUB = process.env.MQTT_TOPIC_SUB || 's/+'; // Subscribing to telemetry data
const MQTT_TOPIC_PUB = process.env.MQTT_TOPIC_PUB || 'p/+'; // Topic prefix for publishing commands

let mqttClient: mqtt.MqttClient | null = null;
let isInitializing = false;

export const initMqtt = () => {
  if (mqttClient && mqttClient.connected) {
    console.log('MQTT client already connected, skipping...');
    return;
  }
  
  if (isInitializing) return;
  isInitializing = true;

  console.log(`Connecting to MQTT broker at ${MQTT_BROKER}...`);
  
  mqttClient = mqtt.connect(MQTT_BROKER, {
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    clientId: `ag-gateway-collector-${Math.random().toString(16).substring(2, 8)}`,
    reconnectPeriod: 5000,
  });

  mqttClient.on('connect', async () => {
    isInitializing = false;
    console.log('Successfully connected to MQTT broker.');
    
    // Subscribe to default topics
    mqttClient?.subscribe(MQTT_TOPIC_SUB, (err) => {
      if (err) {
        console.error(`Failed to subscribe to default topic ${MQTT_TOPIC_SUB}:`, err);
      } else {
        console.log(`Subscribed to default MQTT topic: ${MQTT_TOPIC_SUB}`);
      }
    });

    // Dynamically subscribe to all configured subscribe_topic in gateway_info
    try {
      const gateways = await query('SELECT subscribe_topic FROM gateway_info WHERE subscribe_topic IS NOT NULL AND subscribe_topic != \'\'');
      
      // Remove duplicates before subscribing
      const uniqueTopics = new Set<string>();
      // We already subscribe to MQTT_TOPIC_SUB, so don't subscribe again if it matches exactly
      uniqueTopics.add(MQTT_TOPIC_SUB);
      
      for (const gw of gateways.rows) {
        if (gw.subscribe_topic !== MQTT_TOPIC_SUB) {
          uniqueTopics.add(gw.subscribe_topic);
        }
      }

      for (const topic of uniqueTopics) {
        if (topic === MQTT_TOPIC_SUB) continue; // Already subscribed above
        mqttClient?.subscribe(topic, (err) => {
          if (err) {
            console.error(`Failed to subscribe to custom topic ${topic}:`, err);
          } else {
            console.log(`Subscribed to custom MQTT topic: ${topic}`);
          }
        });
      }
    } catch (e) {
      console.error('Failed to fetch custom subscribe topics from database:', e);
    }
  });

  mqttClient.on('message', async (topic, message) => {
    try {
      const payloadString = message.toString();
      // 在生产环境中减少不必要的日志打印，防止撑爆磁盘
      if (process.env.NODE_ENV !== 'production') {
        console.log(`\n[MQTT] Received message on topic: ${topic}`);
        // console.log(`[MQTT] Payload: ${payloadString}`); // 可能会非常大
      }

      // Try to parse as JSON
      const payload = JSON.parse(payloadString);

    // 只有非 V4/V3 格式时才广播（避免前端重复渲染两遍，因为 ingest 之后 websocket 里有专门的数据拉取或刷新通知）
      // Broadcast to WebSocket clients (You might want to only broadcast valid payloads)
      // broadcast({ type: 'mqtt_message', topic, payload });

      // Save raw MQTT log first (for debugging and real-time viewing)
      const sncodeForLog = payload?.sncode || null;
      try {
        await query(
          'INSERT INTO raw_mqtt_logs (gateway_sncode, topic, payload) VALUES ($1, $2, $3)',
          [sncodeForLog, topic, payload]
        );
      } catch (logErr) {
        console.error('[MQTT] Failed to save raw log:', logErr);
      }

      // Check if it matches V3/V4 payload format
      if (payload && payload.sncode && payload.dev) {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[MQTT] Valid V3/V4 payload detected for ${payload.sncode}, ingesting...`);
        }
        await updateGatewayStatus(payload.sncode, true);
        await ingestPayload(payload);
        // After ingest successfully, notify clients to refresh
        broadcast({ type: 'mqtt_message', topic, payload });
      } else {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[MQTT] Message on ${topic} is valid JSON but not a recognized V3/V4 format.`);
        }
      }
    } catch (e) {
      // Ignore non-JSON messages or unrelated messages
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[MQTT] Message on ${topic} is not valid JSON.`);
      }
    }
  });

  mqttClient.on('error', (err) => {
    isInitializing = false;
    console.error('MQTT Client Error:', err);
  });

  mqttClient.on('offline', () => {
    isInitializing = false;
    console.warn('MQTT Client went offline. Attempting to reconnect...');
  });

  // 定期检查网关是否掉线（超过 20 分钟没有数据上报则认为掉线）
  setInterval(async () => {
    try {
      // 20 minutes ago
      const timeoutThreshold = new Date(Date.now() - 20 * 60 * 1000);
      const result = await query(
        "UPDATE gateway_info SET status = 'OFFLINE' WHERE status = 'ONLINE' AND (last_online_time IS NULL OR last_online_time < $1) RETURNING sncode",
        [timeoutThreshold]
      );
      if (result.rowCount && result.rowCount > 0) {
        console.log(`[Status Monitor] Marked ${result.rowCount} gateways as OFFLINE due to timeout:`, result.rows.map(r => r.sncode));
      }
    } catch (err) {
      console.error('[Status Monitor] Error checking gateway offline status:', err);
    }
  }, 60 * 1000); // Check every minute
};

export const getMqttClient = () => mqttClient;

/**
 * Update gateway online status based on received data
 */
async function updateGatewayStatus(sncode: string, isOnline: boolean) {
  try {
    const statusStr = isOnline ? 'ONLINE' : 'OFFLINE';
    await query(
      "UPDATE gateway_info SET status = $1, last_online_time = CURRENT_TIMESTAMP WHERE sncode = $2 AND (status != $1 OR last_online_time IS NULL OR last_online_time < CURRENT_TIMESTAMP - interval '1 minute')",
      [statusStr, sncode]
    );
  } catch (error) {
    console.error(`Failed to update gateway ${sncode} status:`, error);
  }
}

/**
 * Shared ingestion logic for V3/V4 Data Push
 */
async function ingestPayload(payload: any) {
  const { time, sncode, dev } = payload;
  // Fallback to current time if time is missing
  const ts = time ? new Date(time * 1000) : new Date();

  try {
    const values: any[] = [];
    const dateObj = new Date(ts);
    const yearMonth = `${dateObj.getFullYear()}_${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
    const tableName = `telemetry_data_${yearMonth}`;

    // Ensure table exists
    await query(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id BIGSERIAL PRIMARY KEY,
        gateway_sncode VARCHAR(64) NOT NULL,
        device_code VARCHAR(64) NOT NULL,
        point_name VARCHAR(64) NOT NULL,
        insname VARCHAR(64),
        propertyno VARCHAR(64),
        paraname VARCHAR(64),
        quality INT NOT NULL,
        value VARCHAR(255) NOT NULL,
        ts TIMESTAMP NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_${tableName}_ts ON ${tableName}(ts);
      CREATE INDEX IF NOT EXISTS idx_${tableName}_sncode ON ${tableName}(gateway_sncode);
    `);

    let queryText = `INSERT INTO ${tableName} (gateway_sncode, device_code, point_name, insname, propertyno, paraname, quality, value, ts) VALUES `;
    let paramIndex = 1;

    // 准备点位映射：按项目加载映射，键为 insname|propertyno|device_code|gateway_sncode（均做规范化）
    let pointMap: Map<string, string> | null = null;
    try {
      const projRes = await query('SELECT project_id FROM gateway_info WHERE sncode = $1', [sncode]);
      const projectId = projRes.rows?.[0]?.project_id || null;
      if (projectId) {
        const pp = await query(
          "SELECT name, COALESCE(insname,'') insname, COALESCE(propertyno,'') propertyno, COALESCE(device_code,'') device_code, COALESCE(gateway_sncode,'') gateway_sncode FROM project_points WHERE (project_id = $1 OR gateway_sncode = $2) AND status = 'ACTIVE'",
          [projectId, sncode]
        );
        const norm = (v: any) => (v ?? '').toString().trim();
        const starToEmpty = (s: string) => (s === '*' ? '' : s);
        const normProp = (v: any) => {
          const s = norm(v);
          if (s === '*') return '';
          if (s === '') return '';
          const t = s.replace(/^0+/, '');
          return t === '' ? '0' : t;
        };
        pointMap = new Map();
        for (const r of pp.rows) {
          const ni = starToEmpty(norm(r.insname));
          const np = normProp(r.propertyno);
          const nd = starToEmpty(norm(r.device_code));
          const ns = starToEmpty(norm(r.gateway_sncode));
          const keys = new Set<string>([
            `${ni}|${np}|${nd}|${ns}`,  // full key
            `${ni}|||${ns}`,            // SN + insname
            `${ni}|${np}||${ns}`,       // SN + insname + propertyno
            `|${np}||${ns}`,            // SN + propertyno
            `|${np}|${nd}|${ns}`,       // SN + propertyno + device_code
            `${ni}|${np}|${nd}|`        // no SN fallback
          ]);
          for (const k of keys) {
            if (!pointMap.has(k)) pointMap.set(k, r.name);
          }
        }
      }
    } catch (e) {
      console.error('Load project points failed:', e);
    }
    const resolvePointName = (insname?: string, propertyno?: string, deviceCode?: string) => {
      if (!pointMap) return '';
      const norm = (v: any) => (v ?? '').toString().trim();
      const starToEmpty = (s: string) => (s === '*' ? '' : s);
      const normProp = (v: any) => {
        const s = norm(v);
        if (s === '*') return '';
        if (s === '') return '';
        const t = s.replace(/^0+/, '');
        return t === '' ? '0' : t;
      };
      const ni = starToEmpty(norm(insname));
      const np = normProp(propertyno);
      const nd = starToEmpty(norm(deviceCode));
      const ns = starToEmpty(norm(sncode));
      // 优先按 网关SN + insname 精确匹配，其次再考虑 propertyno / device_code
      const keyCandidates = [
        `${ni}|||${ns}`,           // by SN + insname
        `${ni}|${np}||${ns}`,      // by SN + insname + propertyno
        `|${np}||${ns}`,           // by SN + propertyno （少见但兼容）
        `${ni}|${np}|${nd}|${ns}`, // full with SN
        `${ni}|${np}|${nd}|`,      // no SN
        `|${np}|${nd}|${ns}`       // propertyno + device_code + SN
      ];
      for (const k of keyCandidates) {
        const v = pointMap.get(k);
        if (v) return v;
      }
      return '';
    };

    if (Array.isArray(dev)) {
      for (const pt of dev) {
        // 如果是 V4 数组格式，直接使用 insname 作为 point_name，如果有 dev 字段，则使用 dev 字段作为 device_code，否则也留空
        const valStr = pt.value === null ? '' : String(pt.value);
        const pName = resolvePointName(pt.insname || pt.pn, pt.propertyno, pt.dev || '');
        queryText += `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}), `;
        values.push(sncode, pt.dev || '', pName || pt.insname || pt.propertyno || '', pt.insname || '', pt.propertyno || '', pt.paraname || '', pt.quality || 0, valStr, ts);
      }
    } else {
      for (const [deviceCode, points] of Object.entries(dev)) {
        const pointsArray = points as Array<{ pn: string; q: number; v: string }>;
        for (const pt of pointsArray) {
          // Only process if q == 1 (quality valid)
          if (pt.q === 1) {
            const pName = resolvePointName((pt as any).insname || pt.pn, (pt as any).propertyno, deviceCode);
            queryText += `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}), `;
            values.push(sncode, deviceCode, pName || pt.pn, '', '', '', pt.q, pt.v, ts);
          }
        }
      }
    }

    if (values.length > 0) {
      queryText = queryText.slice(0, -2); // Remove last comma
      await query(queryText, values);
      
      // 触发数据分发
      const recordsToDistribute = [];
      if (Array.isArray(dev)) {
        // 如果是 V4 数组格式，直接使用原始 dev 数组进行分发，因为我们已经在 distributor.ts 中支持了读取 pt.insname 和 pt.propertyno
        recordsToDistribute.push(...dev);
      } else {
        // 如果是 V3 对象格式（dev: {"device_code": [{"pn": "...", "v": "..."}]}）
        for (const [deviceCode, points] of Object.entries(dev)) {
          const pointsArray = points as Array<{ pn: string; q: number; v: string; propertyno?: string; insname?: string }>;
          for (const pt of pointsArray) {
            if (pt.q === 1) {
              recordsToDistribute.push({ 
                insname: pt.insname || pt.pn, 
                propertyno: pt.propertyno || '', 
                value: pt.v 
              });
            }
          }
        }
      }
      
      distributeData(sncode, recordsToDistribute, ts).catch(err => {
        console.error('Data distribution failed in background:', err);
      });
    }
  } catch (error) {
    console.error('Failed to ingest MQTT payload to database:', error);
  }
}
