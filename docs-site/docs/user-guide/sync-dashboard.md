---
sidebar_position: 3
title: Sync Dashboard
---

# LMS Sync Dashboard

The Sync Dashboard shows all automated data synchronization tasks and allows manual sync operations.

## Accessing

Navigate to: **Admin → LMS Sync**

## Understanding Sync Tasks

Data is automatically synchronized from two sources:

1. **Northpass LMS** - Users, groups, courses, enrollments
2. **Impartner CRM** - Partners and contacts

## Task Categories

### Data Sync Tasks

| Task | Interval | What it does |
| ---- | -------- | ------------ |
| **Users** | 2 hours | Syncs LMS user accounts |
| **Groups** | 2 hours | Syncs LMS groups and matches to partners |
| **Courses** | 4 hours | Updates course catalog |
| **NPCU** | 6 hours | Updates certification point values |
| **Enrollments** | 4 hours | Syncs course completions |
| **Impartner** | 6 hours | Pulls partner/contact data from CRM |

### Analysis Tasks

| Task | Interval | What it does |
| ---- | -------- | ------------ |
| **Group Analysis** | 6 hours | Finds potential users by email domain |
| **Member Sync** | 6 hours | Confirms pending group memberships |

### Maintenance Tasks

| Task | Interval | What it does |
| ---- | -------- | ------------ |
| **Cleanup** | Daily | Removes old logs and data |

## Task Card Information

Each task card shows:

- **Status indicator** - Green (success), Yellow (running), Red (failed)
- **Last run time** - When the task last completed
- **Records processed** - How many records were handled
- **Interval** - How often it runs automatically

## Manual Operations

### Run Now

Click the **▶ Run Now** button on any task to trigger it immediately.

Use this when:

- You need fresh data urgently
- A scheduled sync was missed
- Troubleshooting data issues

### Enable/Disable

Toggle the switch to enable or disable automatic scheduling for a task.

### Change Interval

Click on the interval value to edit how often a task runs.

## Sync Modes

### Incremental (Default)

- Only syncs records changed since last run
- Much faster, uses fewer API calls
- Recommended for regular operations

### Full

- Syncs ALL records from source system
- Takes longer but ensures complete data
- Use for initial setup or data recovery

To run a full sync, expand the task options and select "Full" mode before clicking Run Now.

## History Tab

View the sync history to see:

- Past sync operations and their status
- Records processed, created, updated
- Error messages for failed syncs
- Duration of each sync

## Troubleshooting

**Task stuck in "Running"?**

- Wait 30 minutes (it may still be processing)
- Contact your administrator to reset the task

**Data not appearing?**

- Check if the relevant sync task ran successfully
- Look at the History tab for errors
- Try running a manual sync

**Wrong record counts?**

- Run a Full sync to refresh all data
- Check filters in Impartner CRM
