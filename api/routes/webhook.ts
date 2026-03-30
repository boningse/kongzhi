import express, { Request, Response } from 'express';
import { query } from '../db.js';

const router = express.Router();

/**
 * Handle V3/V4 Data Push Webhook from AG Gateway
 * Body example:
 * {
 *   "time": 1767018681,
 *   "sncode": "1312690CC87717F4",
 *   "dev": {
 *       "694e9d0f": [
 *           { "pn": "tag1", "q": 1, "v": "20.90" }
 *       ]
 *   }
 * }
 */
router.post('/ingest', async (req: Request, res: Response) => {
  const payload = req.body;
  
  if (!payload || !payload.sncode || !payload.dev) {
    return res.status(400).json({ success: false, error: 'Invalid payload format' });
  }

  const { time, sncode, dev } = payload;
  // Fallback to current time if time is missing
  const ts = time ? new Date(time * 1000) : new Date();

  try {
    // Update gateway online status since we received data from it via Webhook
    await query(
      "UPDATE gateway_info SET status = 'ONLINE', last_online_time = CURRENT_TIMESTAMP WHERE sncode = $1 AND (status != 'ONLINE' OR last_online_time IS NULL OR last_online_time < CURRENT_TIMESTAMP - interval '1 minute')",
      [sncode]
    );

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

    if (Array.isArray(dev)) {
      // New format: "dev": [ { "insname": "xxx", "propertyno": "yyy", "quality": 0, "value": null } ]
      for (const pt of dev) {
        // Here we might allow quality = 0 or 1, let's ingest all or just valid ones?
        // User didn't specify, let's ingest all.
        const valStr = pt.value === null ? '' : String(pt.value);
        queryText += `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}), `;
        values.push(sncode, pt.insname || '', '', pt.insname || '', pt.propertyno || '', pt.paraname || '', pt.quality || 0, valStr, ts);
      }
    } else {
      // Old format: "dev": { "device_code": [ { "pn": "tag1", "q": 1, "v": "20.90" } ] }
      for (const [deviceCode, points] of Object.entries(dev)) {
        const pointsArray = points as Array<{ pn: string; q: number; v: string }>;
        for (const pt of pointsArray) {
          // Only process if q == 1 (quality valid)
          if (pt.q === 1) {
            queryText += `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}), `;
            values.push(sncode, deviceCode, pt.pn, '', '', '', pt.q, pt.v, ts);
          }
        }
      }
    }

    if (values.length > 0) {
      queryText = queryText.slice(0, -2); // Remove last comma
      await query(queryText, values);
    }

    res.status(200).json({ success: true, message: 'Data ingested successfully' });
  } catch (error) {
    console.error('Ingestion error:', error);
    res.status(500).json({ success: false, error: 'Failed to ingest data' });
  }
});

export default router;
