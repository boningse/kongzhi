import { query } from './api/db.js';

query('SELECT sncode, subscribe_topic FROM gateway_info').then(res => { 
  console.log(res.rows); 
  process.exit(0); 
});