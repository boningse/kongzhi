import { query } from './db.js';
async function test() {
  const res = await query('SELECT column_name FROM information_schema.columns WHERE table_name = $1', ['gateway_info']);
  console.log(res.rows.map(r => r.column_name));
  process.exit(0);
}
test();