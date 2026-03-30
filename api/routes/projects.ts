import express, { Request, Response } from 'express';
import { query } from '../db.js';
import { verifyUserToken } from './auth.js';

const router = express.Router();

router.use(verifyUserToken);

// Helper to build a project tree from flat rows
const buildProjectTree = (rows: any[], parentId: number | null = null): any[] => {
  return rows
    .filter(row => row.parent_id === parentId)
    .map(row => ({
      id: row.id.toString(),
      code: row.code || '',
      name: row.name,
      details: row.details || '',
      level: row.level,
      children: buildProjectTree(rows, row.id)
    }));
};

// Get all projects as a tree
router.get('/', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    let result;
    
    if (user.role === 'ADMIN') {
      result = await query('SELECT * FROM projects ORDER BY created_at ASC');
    } else {
      const pIds = user.project_ids || [];
      if (pIds.length === 0) {
        return res.json({ success: true, data: [] });
      }
      // Fetch user's projects and their children
      // Simple approach: fetch all, then filter based on allowed ids in memory or do a recursive CTE
      // Since tree depth is 3, let's just fetch all and filter in memory to keep the tree intact, 
      // or only return nodes where id is in pIds or parent is in pIds.
      const allProjects = await query('SELECT * FROM projects ORDER BY created_at ASC');
      
      const isAllowed = (pId: number): boolean => {
        if (pIds.includes(pId)) return true;
        const p = allProjects.rows.find(x => x.id === pId);
        if (p && p.parent_id) return isAllowed(p.parent_id);
        return false;
      };
      
      const allowedRows = allProjects.rows.filter(row => isAllowed(row.id));
      result = { rows: allowedRows };
    }
    
    const tree = buildProjectTree(result.rows, null);
    res.json({ success: true, data: tree });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch projects' });
  }
});

// Create a new project
router.post('/', async (req: Request, res: Response) => {
  const { parent_id, code, name, details, level } = req.body;
  try {
    if (level < 1 || level > 3) {
      return res.status(400).json({ success: false, error: 'Level must be between 1 and 3' });
    }

    const parentIdValue = parent_id ? parseInt(parent_id, 10) : null;
    
    const result = await query(
      'INSERT INTO projects (parent_id, code, name, details, level) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [parentIdValue, code, name, details, level]
    );
    
    res.json({ success: true, message: 'Project created', data: result.rows[0] });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ success: false, error: 'Failed to create project' });
  }
});

// Edit a project
router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { code, name, details } = req.body;
  try {
    const result = await query(
      'UPDATE projects SET code = $1, name = $2, details = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *',
      [code, name, details, parseInt(id, 10)]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    res.json({ success: true, message: 'Project updated', data: result.rows[0] });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ success: false, error: 'Failed to update project' });
  }
});

// Delete a project (CASCADE handles children)
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await query('DELETE FROM projects WHERE id = $1', [parseInt(id, 10)]);
    res.json({ success: true, message: 'Project deleted' });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ success: false, error: 'Failed to delete project' });
  }
});

export default router;
