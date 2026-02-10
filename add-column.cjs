require('dotenv').config();
const mysql = require('mysql2/promise');
const config = require('./server/config.cjs');

async function run() {
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database
  });
  
  console.log('Connected');
  
  const [cols] = await conn.query("SHOW COLUMNS FROM contacts LIKE 'crm_last_modified'");
  
  if (cols.length > 0) {
    console.log('Column already exists');
  } else {
    await conn.query('ALTER TABLE contacts ADD COLUMN crm_last_modified TIMESTAMP NULL');
    console.log('Column added');
    await conn.query('ALTER TABLE contacts ADD INDEX idx_crm_modified (crm_last_modified)');
    console.log('Index added');
  }
  
  await conn.end();
  console.log('Done!');
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
