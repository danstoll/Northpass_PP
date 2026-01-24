---
sidebar_position: 14
title: Troubleshooting
---

# Troubleshooting Guide

## Common Issues

### ECONNREFUSED on /api/db/

**Cause**: Express server not running

**Solution**:
```bash
node server-with-proxy.cjs
```

### Database Connection Failed

**Cause**: Network/VPN issues or wrong credentials

**Check**:
```bash
mysql -h 20.29.25.238 -P 31337 -u northpass -p
```

**Solution**: Verify VPN connection and credentials in `server/db/connection.cjs`

### Cache Issues - Old Version Showing

**Cause**: Browser cached old assets

**Solutions**:
1. Hard refresh: `Ctrl+Shift+R`
2. Clear browser cache
3. Bump cache version in `src/services/cacheService.js`

### Sync Task Stuck in "Running"

**Cause**: Previous run crashed without completing

**Solution**:
```powershell
POST /api/db/sync/cleanup-stuck
```

Or manually:
```sql
UPDATE scheduled_tasks 
SET status = 'idle', is_running = 0 
WHERE status = 'running' AND started_at < DATE_SUB(NOW(), INTERVAL 30 MINUTE);
```

### 403 on Course Properties

**Cause**: Some courses don't expose NPCU properties

**Solution**: This is expected - the sync gracefully handles these

### Push to Impartner Failing

**Cause**: Table name mismatch or API error

**Check logs**:
```sql
SELECT * FROM sync_logs 
WHERE sync_type = 'sync_to_impartner' 
ORDER BY started_at DESC LIMIT 5;
```

### Users Not Appearing in Reports

**Cause**: User not linked to a partner

**Check**:
```sql
-- Is user in lms_users?
SELECT * FROM lms_users WHERE email = 'user@example.com';

-- Is user linked to a contact?
SELECT * FROM contacts WHERE email = 'user@example.com';

-- Is contact's partner active?
SELECT p.* FROM partners p
JOIN contacts c ON c.partner_id = p.id
WHERE c.email = 'user@example.com';
```

## Logs

### PM2 Logs (Production)
```bash
ssh NTXPTRAdmin@20.125.24.28 "pm2 logs northpass-portal --lines 100"
```

### Sync Logs (Database)
```sql
SELECT * FROM sync_logs ORDER BY started_at DESC LIMIT 20;
```

### Task Status
```sql
SELECT task_type, status, last_run_at, error_message 
FROM scheduled_tasks;
```

## Health Checks

### API Health
```powershell
Invoke-RestMethod -Uri "https://ptrlrndb.prod.ntxgallery.com/api/db/health"
```

### Database Health
```sql
SELECT 
  (SELECT COUNT(*) FROM partners WHERE is_active = 1) as active_partners,
  (SELECT COUNT(*) FROM contacts WHERE is_active = 1) as active_contacts,
  (SELECT COUNT(*) FROM lms_users) as lms_users,
  (SELECT COUNT(*) FROM enrollments) as enrollments;
```

### Sync Health
```powershell
Invoke-RestMethod -Uri "https://ptrlrndb.prod.ntxgallery.com/api/db/sync/status"
```

## Reset Procedures

### Reset Sync Task
```sql
UPDATE scheduled_tasks 
SET status = 'idle', 
    is_running = 0, 
    error_message = NULL 
WHERE task_type = 'sync_users';
```

### Clear Sync History
```sql
DELETE FROM sync_logs WHERE started_at < DATE_SUB(NOW(), INTERVAL 30 DAY);
```

### Re-run Full Sync
```powershell
Invoke-RestMethod -Uri "https://ptrlrndb.prod.ntxgallery.com/api/db/sync/users?mode=full" -Method Post
```
