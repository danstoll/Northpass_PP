---
sidebar_position: 5
title: Database Connection
---

# Database Connection

## Connection Module

Location: `server/db/connection.cjs`

```javascript
const mariadb = require('mariadb');

const pool = mariadb.createPool({
  host: '20.29.25.238',
  port: 31337,
  user: 'northpass',
  password: 'Nintex2025!',
  database: 'northpass',
  connectionLimit: 10,
  acquireTimeout: 30000,
});

module.exports = { pool };
```

## Usage in Route Handlers

```javascript
const { pool } = require('./db/connection.cjs');

app.get('/api/db/partners', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query('SELECT * FROM partners WHERE is_active = 1');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});
```

## Connection Best Practices

### Always Release Connections
```javascript
let conn;
try {
  conn = await pool.getConnection();
  // ... queries
} finally {
  if (conn) conn.release();  // ALWAYS release
}
```

### Use Parameterized Queries
```javascript
// GOOD - prevents SQL injection
const rows = await conn.query(
  'SELECT * FROM partners WHERE id = ?',
  [partnerId]
);

// BAD - SQL injection risk
const rows = await conn.query(
  `SELECT * FROM partners WHERE id = ${partnerId}`
);
```

### Handle BigInt Results
MariaDB returns BigInt for COUNT(*). Convert to Number:

```javascript
const [{ count }] = await conn.query('SELECT COUNT(*) as count FROM partners');
const total = Number(count);
```

## Testing Connection

```powershell
# From command line using mysql client
mysql -h 20.29.25.238 -P 31337 -u northpass -p northpass

# Using the app
curl http://localhost:3000/api/db/health
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| ECONNREFUSED | DB not reachable | Check VPN/network |
| Too many connections | Connection leak | Ensure `conn.release()` in finally |
| Query timeout | Slow query | Add indexes or optimize |
| Access denied | Wrong credentials | Verify password |
