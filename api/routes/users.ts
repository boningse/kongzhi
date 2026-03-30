import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { verifyUserToken } from './auth.js';

const router = express.Router();

router.use(verifyUserToken);

// Middleware to check if admin
const requireAdmin = (req: Request, res: Response, next: express.NextFunction) => {
  if ((req as any).user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  next();
};

router.get('/', requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await query('SELECT id, username, role, project_ids, created_at FROM users ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
});

router.post('/', requireAdmin, async (req: Request, res: Response) => {
  const { username, password, role, project_ids } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 10);
    const pIds = Array.isArray(project_ids) ? project_ids : [];
    const result = await query(
      'INSERT INTO users (username, password, role, project_ids) VALUES ($1, $2, $3, $4) RETURNING id, username, role, project_ids',
      [username, hashed, role || 'USER', pIds]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(400).json({ success: false, error: '用户名已存在' });
    }
    res.status(500).json({ success: false, error: 'Failed to create user' });
  }
});

router.put('/:id', requireAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { password, role, project_ids } = req.body;
  try {
    const pIds = Array.isArray(project_ids) ? project_ids : [];
    let sql = 'UPDATE users SET role = $1, project_ids = $2, updated_at = CURRENT_TIMESTAMP';
    const params: any[] = [role, pIds];
    
    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      sql += `, password = $3 WHERE id = $4`;
      params.push(hashed, id);
    } else {
      sql += ` WHERE id = $3`;
      params.push(id);
    }
    
    await query(sql, params);
    res.json({ success: true, message: 'User updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update user' });
  }
});

router.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    // Don't allow deleting yourself
    if (parseInt(id) === (req as any).user.id) {
      return res.status(400).json({ success: false, error: 'Cannot delete yourself' });
    }
    await query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete user' });
  }
});

export default router;
