import bcrypt from 'bcryptjs';
import { query } from './db.js';

async function setupAdmin() {
  try {
    // 检查是否已存在管理员用户
    const existingUser = await query('SELECT * FROM users WHERE username = $1', ['admin']);
    
    if (existingUser.rows.length > 0) {
      console.log('管理员用户已存在，正在更新密码...');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await query('UPDATE users SET password = $1 WHERE username = $2', [hashedPassword, 'admin']);
      console.log('管理员密码已更新为: admin123');
    } else {
      console.log('创建新的管理员用户...');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await query(
        'INSERT INTO users (username, password, role) VALUES ($1, $2, $3)',
        ['admin', hashedPassword, 'ADMIN']
      );
      console.log('管理员用户已创建，用户名: admin，密码: admin123');
    }
    
    console.log('设置完成！');
  } catch (error) {
    console.error('设置管理员用户时出错:', error);
  }
}

setupAdmin();