import express, { Request, Response } from 'express';
import { query } from '../db.js';
import { verifyUserToken } from './auth.js';

const router = express.Router();

router.use(verifyUserToken);

// Get all distributions
router.get('/', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    let result;
    
    if (user.role === 'ADMIN') {
      result = await query(`
        SELECT d.*
        FROM data_distributions d
        ORDER BY d.created_at DESC
      `);
    } else {
      const pIds = user.project_ids || [];
      if (pIds.length === 0) {
        return res.json({ success: true, data: [] });
      }
      
      const allProjects = await query('SELECT id, parent_id FROM projects');
      const isAllowed = (pId: number): boolean => {
        if (pIds.includes(pId)) return true;
        const p = allProjects.rows.find(x => x.id === pId);
        if (p && p.parent_id) return isAllowed(p.parent_id);
        return false;
      };
      
      const allowedPIds = allProjects.rows.filter(p => isAllowed(p.id)).map(p => p.id);
      
      if (allowedPIds.length === 0) {
        return res.json({ success: true, data: [] });
      }

      result = await query(`
        SELECT d.*
        FROM data_distributions d
        WHERE d.project_ids && $1::int[]
        ORDER BY d.created_at DESC
      `, [allowedPIds]);
    }
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching distributions:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch distributions' });
  }
});

// Create a new distribution
router.post('/', async (req: Request, res: Response) => {
  const { name, project_ids, source_data_info, target_db_type, target_db_config, status } = req.body;
  try {
    const defaultStatus = status || 'ACTIVE';
    const isStarting = defaultStatus === 'ACTIVE';
    const startCols = isStarting ? ', start_time' : '';
    const startVals = isStarting ? ', CURRENT_TIMESTAMP' : '';

    const result = await query(
      `INSERT INTO data_distributions 
        (name, project_ids, source_data_info, target_db_type, target_db_config, status${startCols}) 
       VALUES ($1, $2, $3, $4, $5, $6${startVals}) RETURNING *`,
      [name, project_ids || [], source_data_info, target_db_type, target_db_config, defaultStatus]
    );
    res.json({ success: true, message: 'Distribution created', data: result.rows[0] });
  } catch (error) {
    console.error('Error creating distribution:', error);
    res.status(500).json({ success: false, error: 'Failed to create distribution' });
  }
});

// Update a distribution status
router.put('/:id/status', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const isStarting = status === 'ACTIVE';
    const startTimeQuery = isStarting ? ', start_time = CURRENT_TIMESTAMP' : '';
    
    const result = await query(
      `UPDATE data_distributions 
       SET status = $1, updated_at = CURRENT_TIMESTAMP${startTimeQuery}
       WHERE id = $2 RETURNING *`,
      [status, parseInt(id, 10)]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Distribution not found' });
    }
    res.json({ success: true, message: `Distribution ${isStarting ? 'started' : 'stopped'}`, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating distribution status:', error);
    res.status(500).json({ success: false, error: 'Failed to update distribution status' });
  }
});

// Update a distribution
router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, project_ids, source_data_info, target_db_type, target_db_config, status } = req.body;
  try {
    const prevDist = await query('SELECT status FROM data_distributions WHERE id = $1', [parseInt(id, 10)]);
    if (prevDist.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Distribution not found' });
    }
    
    const wasActive = prevDist.rows[0].status === 'ACTIVE';
    const isNowActive = status === 'ACTIVE';
    const startTimeUpdate = (!wasActive && isNowActive) ? ', start_time = CURRENT_TIMESTAMP' : '';

    const result = await query(
      `UPDATE data_distributions 
       SET name = $1, project_ids = $2, source_data_info = $3, target_db_type = $4, target_db_config = $5, status = $6, updated_at = CURRENT_TIMESTAMP${startTimeUpdate}
       WHERE id = $7 RETURNING *`,
      [name, project_ids || [], source_data_info, target_db_type, target_db_config, status, parseInt(id, 10)]
    );
    
    res.json({ success: true, message: 'Distribution updated', data: result.rows[0] });
  } catch (error) {
    console.error('Error updating distribution:', error);
    res.status(500).json({ success: false, error: 'Failed to update distribution' });
  }
});

// Delete a distribution
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await query('DELETE FROM data_distributions WHERE id = $1', [parseInt(id, 10)]);
    res.json({ success: true, message: 'Distribution deleted' });
  } catch (error) {
    console.error('Error deleting distribution:', error);
    res.status(500).json({ success: false, error: 'Failed to delete distribution' });
  }
});

export default router;
