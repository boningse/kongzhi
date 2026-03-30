import express, { Request, Response } from 'express';
import { query } from '../db.js';
import { verifyUserToken } from './auth.js';

const router = express.Router();
router.use(verifyUserToken);

// List points by project
router.get('/', async (req: Request, res: Response) => {
  try {
    const { project_id, page = '1', pageSize = '10', q } = req.query as {
      project_id?: string;
      page?: string;
      pageSize?: string;
      q?: string;
    };
    const pageNum = Math.max(parseInt(page as string, 10) || 1, 1);
    const sizeNum = Math.min(Math.max(parseInt(pageSize as string, 10) || 10, 1), 200);
    const offset = (pageNum - 1) * sizeNum;

    let baseSql = `
      FROM project_points pp
      LEFT JOIN projects p ON p.id = pp.project_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (project_id) {
      baseSql += ` AND pp.project_id = $${paramIndex++}`;
      params.push(parseInt(project_id, 10));
    }
    if (q && q.trim()) {
      baseSql += ` AND (
        COALESCE(p.code,'') ILIKE $${paramIndex} OR
        COALESCE(p.name,'') ILIKE $${paramIndex} OR
        COALESCE(pp.name,'') ILIKE $${paramIndex} OR
        COALESCE(pp.insname,'') ILIKE $${paramIndex} OR
        COALESCE(pp.propertyno,'') ILIKE $${paramIndex}
      )`;
      params.push(`%${q.trim()}%`);
      paramIndex++;
    }

    const countSql = `SELECT COUNT(*) AS total ${baseSql}`;
    const rowsSql = `
      SELECT pp.*, p.name AS project_name, p.code AS project_code
      ${baseSql}
      ORDER BY pp.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const rowsParams = params.concat([sizeNum, offset]);

    const [countRes, rowsRes] = await Promise.all([
      query(countSql, params),
      query(rowsSql, rowsParams),
    ]);

    const total = parseInt(countRes.rows[0]?.total || '0', 10);
    res.json({
      success: true,
      data: rowsRes.rows,
      pagination: { total, page: pageNum, pageSize: sizeNum },
    });
  } catch (e) {
    console.error('List points error:', e);
    res.status(500).json({ success: false, error: 'Failed to fetch points' });
  }
});

// Export CSV
router.get('/export', async (req: Request, res: Response) => {
  try {
    const { project_id } = req.query as { project_id?: string };
    if (!project_id) {
      return res.status(400).json({ success: false, error: 'project_id 必填' });
    }
    let baseSql = `
      FROM project_points pp
      LEFT JOIN projects p ON p.id = pp.project_id
      WHERE pp.project_id = $1
    `;
    const params: any[] = [parseInt(project_id, 10)];
    const rowsSql = `
      SELECT p.code AS project_code, p.name AS project_name, 
             pp.name, pp.insname, pp.propertyno, pp.device_code, pp.gateway_sncode, pp.status
      ${baseSql}
      ORDER BY p.code, pp.created_at DESC
    `;
    const rowsRes = await query(rowsSql, params);
    const escape = (v: any) => {
      const s = (v ?? '').toString();
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const header = ['project_code','project_name','name','insname','propertyno','device_code','gateway_sncode','status'].join(',');
    const lines = rowsRes.rows.map((r: any) => [
      escape(r.project_code),
      escape(r.project_name),
      escape(r.name),
      escape(r.insname),
      escape(r.propertyno),
      escape(r.device_code),
      escape(r.gateway_sncode),
      escape(r.status || 'ACTIVE'),
    ].join(','));
    const csv = [header, ...lines].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="points.csv"');
    res.send(csv);
  } catch (e) {
    console.error('Export points error:', e);
    res.status(500).json({ success: false, error: 'Failed to export points' });
  }
});

// Bulk import (JSON rows)
router.post('/bulk', async (req: Request, res: Response) => {
  try {
    const { rows, project_id } = req.body as { rows: any[]; project_id?: number };
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'rows 不能为空' });
    }
    if (!project_id) {
      return res.status(400).json({ success: false, error: 'project_id 必填' });
    }
    let success = 0, failed = 0;
    for (const r of rows) {
      try {
        const pid = project_id;
        if (!pid) {
          failed++; 
          continue;
        }
        await query(
          `INSERT INTO project_points (project_id, name, insname, propertyno, device_code, gateway_sncode, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (project_id, COALESCE(insname,'')) 
           DO UPDATE SET name = EXCLUDED.name, propertyno = EXCLUDED.propertyno, device_code = EXCLUDED.device_code, gateway_sncode = EXCLUDED.gateway_sncode, status = EXCLUDED.status, updated_at = CURRENT_TIMESTAMP`,
          [
            pid,
            r.name,
            r.insname || null,
            r.propertyno || null,
            r.device_code || null,
            r.gateway_sncode || null,
            r.status || 'ACTIVE'
          ]
        );
        success++;
      } catch (e) {
        console.error('Import row error:', e);
        failed++;
      }
    }
    res.json({ success: true, data: { success, failed } });
  } catch (e) {
    console.error('Bulk import error:', e);
    res.status(500).json({ success: false, error: 'Failed to import points' });
  }
});

// Delete by project
router.delete('/by-project/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const pid = parseInt(projectId, 10);
    if (!pid) return res.status(400).json({ success: false, error: '无效的 projectId' });
    const del = await query('DELETE FROM project_points WHERE project_id = $1', [pid]);
    res.json({ success: true, data: { deleted: del.rowCount || 0 }});
  } catch (e) {
    console.error('Delete by project error:', e);
    res.status(500).json({ success: false, error: 'Failed to delete points by project' });
  }
});
// Create
router.post('/', async (req: Request, res: Response) => {
  const { project_id, name, insname, propertyno, device_code, gateway_sncode, status } = req.body;
  try {
    if (!project_id || !name) {
      return res.status(400).json({ success: false, error: 'project_id 和 name 必填' });
    }
    const result = await query(
      `INSERT INTO project_points (project_id, name, insname, propertyno, device_code, gateway_sncode, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [project_id, name, insname || null, propertyno || null, device_code || null, gateway_sncode || null, status || 'ACTIVE']
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (e: any) {
    console.error('Create point error:', e);
    if (e.code === '23505') {
      return res.status(400).json({ success: false, error: '相同匹配条件的点位已存在，请调整 insname/propertyno/device_code/网关SN 组合' });
    }
    res.status(500).json({ success: false, error: 'Failed to create point' });
  }
});

// Update
router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, insname, propertyno, device_code, gateway_sncode, status } = req.body;
  try {
    const result = await query(
      `UPDATE project_points
       SET name = $1, insname = $2, propertyno = $3, device_code = $4, gateway_sncode = $5, status = $6, updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 RETURNING *`,
      [name, insname || null, propertyno || null, device_code || null, gateway_sncode || null, status || 'ACTIVE', parseInt(id, 10)]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Point not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (e) {
    console.error('Update point error:', e);
    res.status(500).json({ success: false, error: 'Failed to update point' });
  }
});

// Delete
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await query('DELETE FROM project_points WHERE id = $1', [parseInt(id, 10)]);
    res.json({ success: true, message: 'Point deleted' });
  } catch (e) {
    console.error('Delete point error:', e);
    res.status(500).json({ success: false, error: 'Failed to delete point' });
  }
});

export default router;
