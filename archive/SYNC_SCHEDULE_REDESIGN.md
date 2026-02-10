# Sync Schedule Redesign Proposal

## Current Problems

1. **No Task Dependencies** - Tasks run independently without checking prerequisites
2. **Fragile Incremental Syncs** - If one sync fails, downstream syncs use stale data
3. **API Rate Limiting Risk** - Multiple independent syncs hitting same APIs concurrently
4. **Inefficient Scheduling** - Tasks run on fixed intervals regardless of need
5. **No Deletion Handling** - Incremental syncs miss deletions/inactivations

## Data Flow & Dependencies

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         UPSTREAM DATA SOURCES                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   NORTHPASS LMS                          IMPARTNER CRM                       │
│   ─────────────                          ────────────                        │
│   • Users (22K+)                         • Partners (1.5K)                   │
│   • Groups (1.6K)                        • Contacts (40K)                    │
│   • Courses (452)                        • Leads                             │
│   • Enrollments (28K)                                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SYNC DEPENDENCY CHAIN                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TIER 1 - Foundation (can run in parallel)                                   │
│  ─────────────────────────────────────────                                   │
│  [sync_courses]     [impartner_sync]                                        │
│       ↓                    ↓                                                 │
│  [sync_npcu]         Partners & Contacts loaded                              │
│       ↓                                                                      │
│  Courses have NPCU values                                                    │
│                                                                              │
│  TIER 2 - Users & Groups (depends on Tier 1)                                │
│  ───────────────────────────────────────────                                │
│  [sync_users] → [sync_groups] → [group_members_sync]                        │
│       ↓              ↓                  ↓                                    │
│  LMS Users      Groups linked      Members confirmed                         │
│                 to Partners                                                  │
│                                                                              │
│  TIER 3 - Enrollments (depends on Tier 2)                                   │
│  ────────────────────────────────────────                                   │
│  [sync_enrollments]                                                          │
│       ↓                                                                      │
│  User certifications with NPCU values                                        │
│                                                                              │
│  TIER 4 - Aggregation & Push (depends on Tier 3)                            │
│  ───────────────────────────────────────────────                            │
│  [sync_to_impartner]                                                         │
│       ↓                                                                      │
│  Partner cert counts pushed to Impartner                                     │
│                                                                              │
│  TIER 5 - Reporting (depends on Tier 4)                                     │
│  ─────────────────────────────────────                                      │
│  [pam_weekly_report] [executive_weekly_report]                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Proposed Schedule

### Daily Sync Chain (Orchestrated)
Run once per day at **2:00 AM UTC** as a single orchestrated sequence:

| Step | Task | Mode | Est. Duration | Description |
|------|------|------|---------------|-------------|
| 1a | `sync_courses` | Full | 2-3 min | Refresh all courses |
| 1b | `impartner_sync_full` | Full | 5-10 min | Full partner/contact sync (detects deletions) |
| 2 | `sync_npcu` | Full | 1-2 min | Apply NPCU values to courses |
| 3 | `sync_users` | Full | 15-20 min | Full user sync |
| 4 | `sync_groups` | Full | 5-10 min | Full group sync with partner linking |
| 5 | `group_members_sync` | Full | 10-15 min | Confirm all group memberships |
| 6 | `sync_enrollments` | Full | 30-45 min | Full enrollment sync |
| 7 | `sync_to_impartner` | Full | 10-15 min | Push cert counts to Impartner |
| | **TOTAL** | | ~75-120 min | |

### Incremental Syncs (Throughout Day)
Lighter-weight syncs to catch recent changes:

| Task | Interval | Mode | When |
|------|----------|------|------|
| `sync_enrollments` | 4 hours | Incremental (7-day) | 6am, 10am, 2pm, 6pm, 10pm |
| `sync_to_impartner` | 6 hours | Incremental | After enrollment syncs complete |
| `sync_leads` | 6 hours | Incremental | 8am, 2pm, 8pm |

### Weekly Tasks
| Task | Schedule | Description |
|------|----------|-------------|
| `sync_leads_full` | Sunday 3:00 AM | Full lead sync (detect conversions/deletions) |
| `pam_weekly_report` | Monday 8:00 AM | Send PAM reports |
| `executive_weekly_report` | Monday 8:00 AM | Send executive rollup |
| `cleanup` | Sunday 4:00 AM | Purge old logs (>30 days) |

## Implementation: Orchestrated Daily Sync

Create a new `runDailySyncChain()` function that:

1. **Runs tasks in sequence** - Each task waits for previous to complete
2. **Validates prerequisites** - Checks data exists before dependent tasks run
3. **Handles failures gracefully** - Logs error, attempts recovery, notifies admins
4. **Tracks overall progress** - Single sync_log entry for the chain
5. **Supports partial restart** - Can resume from failed step

```javascript
async function runDailySyncChain() {
  const steps = [
    { name: 'sync_courses', fn: syncCoursesFull, required: true },
    { name: 'impartner_sync_full', fn: syncImpartnerFull, required: true },
    { name: 'sync_npcu', fn: syncNpcuValues, required: true },
    { name: 'sync_users', fn: syncUsersFull, required: true },
    { name: 'sync_groups', fn: syncGroupsFull, required: true },
    { name: 'group_members_sync', fn: syncGroupMembers, required: false },
    { name: 'sync_enrollments', fn: syncEnrollmentsFull, required: true },
    { name: 'sync_to_impartner', fn: syncToImpartner, required: false },
  ];

  for (const step of steps) {
    try {
      console.log(`[Daily Sync] Starting ${step.name}...`);
      await step.fn();
      console.log(`[Daily Sync] ${step.name} completed`);
    } catch (err) {
      console.error(`[Daily Sync] ${step.name} failed: ${err.message}`);
      if (step.required) {
        // Send alert and abort chain
        await sendSyncErrorAlert(`Daily sync chain failed at ${step.name}: ${err.message}`);
        throw err;
      }
      // Non-required step - log and continue
    }
  }
}
```

## Database Changes

### 1. Add `task_chain` column to scheduled_tasks
```sql
ALTER TABLE scheduled_tasks ADD COLUMN task_chain VARCHAR(50) NULL;
ALTER TABLE scheduled_tasks ADD COLUMN chain_order INT NULL;
```

### 2. Create task_chain_logs table
```sql
CREATE TABLE task_chain_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  chain_name VARCHAR(50) NOT NULL,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  status ENUM('running', 'completed', 'failed', 'partial') DEFAULT 'running',
  current_step VARCHAR(50) NULL,
  steps_completed JSON,
  error_message TEXT NULL,
  total_duration_seconds INT NULL
);
```

## Migration Steps

1. **Update scheduled_tasks table** - Add chain columns
2. **Configure task chains** - Set `task_chain = 'daily_full'` for daily tasks
3. **Add new scheduler logic** - Check for chain membership before running
4. **Test incrementally** - Run chain manually first
5. **Enable automated scheduling** - Set daily chain to run at 2:00 AM

## Immediate Fixes Needed

1. ✅ Fix `existingGroups.map is not a function` error (array check)
2. ✅ Fix `sync_to_impartner` INSERT error (use UPDATE instead)
3. Add `node-fetch` to server dependencies
4. Add defensive checks for null/undefined query results throughout sync services

## Benefits of New Approach

1. **Reliability** - Dependencies always satisfied before task runs
2. **Visibility** - Single chain status shows overall sync health
3. **Efficiency** - No redundant API calls or race conditions
4. **Recovery** - Can restart from failed step instead of full restart
5. **Alerting** - Immediate notification when critical step fails
6. **Scheduling Flexibility** - Weekly reports at specific day/time
