---
sidebar_position: 9
title: Sync Architecture
---

# Sync Architecture

## Overview

The sync system keeps MariaDB in sync with:
1. **Northpass LMS** - Users, groups, courses, enrollments
2. **Impartner CRM** - Partners, contacts

## Incremental vs Full Sync

### Incremental (Default)
- Uses `filter[updated_at][gteq]=<last_sync_time>`
- Only fetches changed records
- ~99% reduction in API calls

### Full Sync
- Fetches all records
- Use sparingly (initial load, data recovery)
- Triggered with `?mode=full`

## Sync Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Scheduler  │────►│   Service   │────►│  Database   │
│  (cron)     │     │  (sync fn)  │     │  (MariaDB)  │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  External   │
                    │    API      │
                    └─────────────┘
```

## Task Scheduler

Location: `server/db/taskScheduler.cjs`

Features:
- Database-backed task registry
- Mutex locks (prevent duplicate runs)
- Retry logic with backoff
- Execution history in `sync_logs`

### Task Lifecycle

```
idle → running → success/failed → idle
        │
        └─► Logs to sync_logs table
```

## Sync Tasks

| Task | Interval | Description |
|------|----------|-------------|
| sync_users | 2h | Northpass users |
| sync_groups | 2h | Northpass groups |
| sync_courses | 4h | Course catalog |
| sync_npcu | 6h | NPCU values |
| sync_enrollments | 4h | User enrollments (partner users only) |
| impartner_sync | 6h | Pull partners/contacts from CRM |
| sync_to_impartner | 6h | Push cert counts to CRM |
| group_analysis | 6h | Domain matching |
| group_members_sync | 6h | Confirm pending members |
| cleanup | 24h | Remove old logs |

## Partner Users Only

Analytics and enrollment sync only track **partner users**:
- Users in groups with `partner_id` set
- Users in contacts table with `partner_id`

Non-partner users (customers) are kept in `lms_users` for orphan discovery.

## Sync Logging

Every sync operation logs to `sync_logs`:

```sql
INSERT INTO sync_logs (
  sync_type,
  status,
  records_processed,
  records_created,
  records_updated,
  started_at
) VALUES (?, ?, ?, ?, ?, NOW());
```

## Error Handling

```javascript
try {
  await runSync();
  await logSuccess();
} catch (error) {
  await logFailure(error.message);
  // Task will retry on next scheduled run
}
```
