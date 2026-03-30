import { query } from './db.js';
async function run() {
  try {
    await query('ALTER TABLE gateway_info ADD COLUMN IF NOT EXISTS publish_topic VARCHAR(255);');
    console.log('Added publish_topic column to gateway_info');
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}
run();