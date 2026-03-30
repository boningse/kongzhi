const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'omm',
  host: process.env.DB_HOST || '127.0.0.1',
  database: process.env.DB_NAME || 'postgres',
  password: process.env.DB_PASSWORD || 'BoNing@123',
  port: parseInt(process.env.DB_PORT || '5432'),
});

async function setupAdmin() {
  try {
    // 检查是否已存在管理员用户
    const existingUser = await pool.query('SELECT * FROM users WHERE username = $1', ['admin']);
    
    if (existingUser.rows.length > 0) {
      console.log('管理员用户已存在，正在更新密码...');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await pool.query('UPDATE users SET password = $1 WHERE username = $2', [hashedPassword, 'admin']);
      console.log('管理员密码已更新为: admin123');
    } else {
      console.log('创建新的管理员用户...');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await pool.query(
        'INSERT INTO users (username, password, role) VALUES ($1, $2, $3)',
        ['admin', hashedPassword, 'ADMIN']
      );
      console.log('管理员用户已创建，用户名: admin，密码: admin123');
    }
    
    console.log('设置完成！');
  } catch (error) {
    console.error('设置管理员用户时出错:', error);
  } finally {
    await pool.end();
  }
}

setupAdmin();