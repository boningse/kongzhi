import { Pool as PgPool, PoolConfig as PgPoolConfig } from 'pg';
import format from 'pg-format';
import mysql from 'mysql2/promise';
import { query as localQuery } from './db.js';

interface Distribution {
  id: number;
  project_id: number;
  target_db_type: string;
  target_db_config: any;
  start_time: string | null;
}

const pgPools = new Map<number, PgPool>();
const mysqlPools = new Map<number, mysql.Pool>();

function getPgPool(distId: number, config: any): PgPool {
  if (pgPools.has(distId)) {
    return pgPools.get(distId)!;
  }
  
  const poolConfig: PgPoolConfig = {
    host: config.host,
    port: parseInt(config.port || '5432'),
    user: config.user,
    password: config.password,
    database: config.database,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
  
  const pool = new PgPool(poolConfig);
  pool.on('error', (err) => {
    console.error(`PostgreSQL distribution pool ${distId} error:`, err);
  });
  
  pgPools.set(distId, pool);
  return pool;
}

function getMysqlPool(distId: number, config: any): mysql.Pool {
  if (mysqlPools.has(distId)) {
    return mysqlPools.get(distId)!;
  }
  
  const pool = mysql.createPool({
    host: config.host,
    port: parseInt(config.port || '3306'),
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
  
  mysqlPools.set(distId, pool);
  return pool;
}

export async function distributeData(gatewaySncode: string, records: any[], ts: Date) {
  if (!records || records.length === 0) return;
  
  try {
    // 1. 获取网关所属的 project_id
    const gwResult = await localQuery('SELECT project_id FROM gateway_info WHERE sncode = $1', [gatewaySncode]);
    if (gwResult.rowCount === 0 || !gwResult.rows[0].project_id) {
      return;
    }
    const projectId = gwResult.rows[0].project_id;
    
    // 2. 找到所有匹配该项目的活动的分发配置
    const distResult = await localQuery(
      "SELECT id, project_ids, target_db_type, target_db_config, start_time FROM data_distributions WHERE $1 = ANY(project_ids) AND status = 'ACTIVE'",
      [projectId]
    );
    
    if (distResult.rowCount === 0) return;
    
    // 获取项目编号，用于表名拼接
    const projResult = await localQuery('SELECT code FROM projects WHERE id = $1', [projectId]);
    const projectCode = projResult.rowCount && projResult.rows[0].code ? projResult.rows[0].code : `proj_${projectId}`;
    
    // 生成年月后缀
    const dateObj = new Date(ts);
    const yearMonth = `${dateObj.getFullYear()}${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
    const tableName = `${yearMonth}_recorddata_${projectCode}`;

    // 格式化分发数据结构
    const distData = records.map(r => [
      r.insname || '',
      r.propertyno ? parseInt(r.propertyno, 10) || 0 : 0, // propertyno 对应 funcid
      formatDate(ts),
      r.value !== null && r.value !== undefined ? parseFloat(r.value) : null,
      1 // virtual 默认1
    ]);
    
    // 3. 执行分发
    for (const dist of distResult.rows as Distribution[]) {
      // 检查是否在分发时间范围内（如果有设置 start_time 的话）
      if (dist.start_time) {
        const startTime = new Date(dist.start_time);
        if (ts < startTime) {
          // 当前数据的时间早于该分发进程的启动时间，跳过分发
          continue;
        }
      }
      if (dist.target_db_type === 'postgresql') {
        try {
          const pool = getPgPool(dist.id, dist.target_db_config);
          
          // 确保目标表存在
          await pool.query(`
            CREATE TABLE IF NOT EXISTS "${tableName}" (
              "sign" VARCHAR(64),
              "funcid" INT,
              "receivetime" VARCHAR(64),
              "data" NUMERIC,
              "virtual" INT
            );
          `);
          
          // 批量插入
          const insertQuery = format(`INSERT INTO "${tableName}" (sign, funcid, receivetime, data, virtual) VALUES %L`, distData);
          await pool.query(insertQuery);
          
        } catch (e: any) {
          console.error(`Failed to distribute data to PG for distribution ${dist.id}:`, e.message || e);
        }
      } else if (dist.target_db_type === 'mysql') {
        try {
          const pool = getMysqlPool(dist.id, dist.target_db_config);
          
          // 确保目标表存在 (MySQL 语法)
          await pool.query(`
            CREATE TABLE IF NOT EXISTS \`${tableName}\` (
              \`sign\` VARCHAR(64),
              \`funcid\` INT,
              \`receivetime\` VARCHAR(64),
              \`data\` DOUBLE,
              \`virtual\` INT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
          `);
          
          // 批量插入 (MySQL)
          if (distData.length > 0) {
            await pool.query(`INSERT INTO \`${tableName}\` (sign, funcid, receivetime, data, virtual) VALUES ?`, [distData]);
          }
          
        } catch (e: any) {
          console.error(`Failed to distribute data to MySQL for distribution ${dist.id}:`, e.message || e);
        }
      } else if (dist.target_db_type === 'api') {
        try {
          const config = dist.target_db_config;
          const url = config.url;
          const method = config.method || 'POST';
          const headers = config.headers || {};
          
          // 将数据格式化为 JSON 发送
          const payload = records.map(r => ({
            sign: r.insname || '',
            funcid: r.propertyno ? parseInt(r.propertyno, 10) || 0 : 0,
            receivetime: formatDate(ts),
            data: r.value !== null && r.value !== undefined ? parseFloat(r.value) : null,
            virtual: 1
          }));

          fetch(url, {
            method,
            headers: {
              'Content-Type': 'application/json',
              ...headers
            },
            body: JSON.stringify(payload)
          }).catch(err => console.error(`API Distribution ${dist.id} failed:`, err));
        } catch (e) {
          console.error(`API Distribution config error ${dist.id}:`, e);
        }
      }
    }
  } catch (error) {
    console.error('Error in distributeData:', error);
  }
}

export async function distributeDataForDist(distId: number, gatewaySncode: string, records: any[], ts: Date) {
  if (!records || records.length === 0) return;
  try {
    const distRes = await localQuery(
      `SELECT id, project_ids, target_db_type, target_db_config, start_time 
       FROM data_distributions WHERE id = $1 AND status = 'ACTIVE'`,
      [distId]
    );
    if (distRes.rowCount === 0) return;
    const dist = distRes.rows[0] as Distribution & { project_ids: number[] };
    if (dist.start_time) {
      const startTime = new Date(dist.start_time);
      if (ts < startTime) return;
    }
    // 获取网关所属项目及项目码
    const gwResult = await localQuery('SELECT project_id FROM gateway_info WHERE sncode = $1', [gatewaySncode]);
    const projectId = gwResult.rows?.[0]?.project_id;
    const projResult = await localQuery('SELECT code FROM projects WHERE id = $1', [projectId]);
    const projectCode = projResult.rowCount && projResult.rows[0].code ? projResult.rows[0].code : `proj_${projectId}`;
    const dateObj = new Date(ts);
    const yearMonth = `${dateObj.getFullYear()}${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
    const tableName = `${yearMonth}_recorddata_${projectCode}`;
    const distData = records.map(r => [
      r.insname || '',
      r.propertyno ? parseInt(r.propertyno, 10) || 0 : 0,
      formatDate(ts),
      r.value !== null && r.value !== undefined ? parseFloat(r.value) : null,
      1
    ]);
    if (dist.target_db_type === 'postgresql') {
      const pool = getPgPool(dist.id, dist.target_db_config);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${tableName}" (
          "sign" VARCHAR(64),
          "funcid" INT,
          "receivetime" VARCHAR(64),
          "data" NUMERIC,
          "virtual" INT
        );
      `);
      const insertQuery = format(`INSERT INTO "${tableName}" (sign, funcid, receivetime, data, virtual) VALUES %L`, distData);
      await pool.query(insertQuery);
    } else if (dist.target_db_type === 'mysql') {
      const pool = getMysqlPool(dist.id, dist.target_db_config);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS \`${tableName}\` (
          \`sign\` VARCHAR(64),
          \`funcid\` INT,
          \`receivetime\` VARCHAR(64),
          \`data\` DOUBLE,
          \`virtual\` INT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
      `);
      if (distData.length > 0) {
        await pool.query(`INSERT INTO \`${tableName}\` (sign, funcid, receivetime, data, virtual) VALUES ?`, [distData]);
      }
    } else if (dist.target_db_type === 'api') {
      const config = dist.target_db_config;
      const url = config.url;
      const method = config.method || 'POST';
      const headers = config.headers || {};
      const payload = records.map(r => ({
        sign: r.insname || '',
        funcid: r.propertyno ? parseInt(r.propertyno, 10) || 0 : 0,
        receivetime: formatDate(ts),
        data: r.value !== null && r.value !== undefined ? parseFloat(r.value) : null,
        virtual: 1
      }));
      fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(payload)
      }).catch(err => console.error(`API Distribution ${dist.id} failed:`, err));
    }
  } catch (e) {
    console.error('distributeDataForDist error:', e);
  }
}

function formatDate(date: Date): string {
  // 修正时差：加上 8 小时 (北京时间 UTC+8)
  const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const d = beijingTime.getUTCDate().toString().padStart(2, '0');
  const m = (beijingTime.getUTCMonth() + 1).toString().padStart(2, '0');
  const y = beijingTime.getUTCFullYear();
  const hh = beijingTime.getUTCHours().toString().padStart(2, '0');
  const mm = beijingTime.getUTCMinutes().toString().padStart(2, '0');
  const ss = beijingTime.getUTCSeconds().toString().padStart(2, '0');
  return `${d}/${m}/${y} ${hh}:${mm}:${ss}`;
}
