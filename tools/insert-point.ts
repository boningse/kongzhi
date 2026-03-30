import { query } from '../api/db.js';

async function run() {
  const args = process.argv.slice(2);
  const projectId = parseInt(args[0], 10);
  const name = args[1];
  const insname = args[2] || null;
  const propertyno = args[3] || null;
  if (!projectId || !name) {
    console.error('Usage: tsx tools/insert-point.ts <projectId> <name> [insname] [propertyno]');
    process.exit(1);
  }
  const res = await query(
    `INSERT INTO project_points (project_id, name, insname, propertyno, status)
     VALUES ($1, $2, $3, $4, 'ACTIVE') RETURNING *`,
    [projectId, name, insname, propertyno]
  );
  console.log('Inserted:', res.rows[0]);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });

