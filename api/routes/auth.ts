import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware to verify user token
export const verifyUserToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    (req as any).user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  try {
    const result = await query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: '用户名或密码错误' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return res.status(401).json({ success: false, error: '用户名或密码错误' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, project_ids: user.project_ids },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          project_ids: user.project_ids
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.get('/me', verifyUserToken, (req: Request, res: Response) => {
  res.json({ success: true, data: (req as any).user });
});

// 用户注册接口
router.post('/register', async (req: Request, res: Response) => {
  const { username, password, role = 'USER', project_ids = [] } = req.body;
  
  try {
    // 检查用户名是否已存在
    const existingUser = await query('SELECT * FROM users WHERE username = $1', [username]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ success: false, error: '用户名已存在' });
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // 创建新用户
    const result = await query(
      'INSERT INTO users (username, password, role, project_ids) VALUES ($1, $2, $3, $4) RETURNING id, username, role, project_ids',
      [username, hashedPassword, role, project_ids]
    );

    const newUser = result.rows[0];
    
    res.json({
      success: true,
      data: {
        user: {
          id: newUser.id,
          username: newUser.username,
          role: newUser.role,
          project_ids: newUser.project_ids
        }
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

export default router;
