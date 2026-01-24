---
sidebar_position: 10
title: Sync Tasks
---

# Sync Task Details

## User Sync

**Service**: `lmsSyncService.syncUsers()`

Syncs users from Northpass LMS.

```javascript
// Incremental - only changed users
await syncUsers(); 

// Full - all users
await syncUsers('full');
```

**What it does:**
1. Fetches users from Northpass API
2. Upserts into `lms_users` table
3. Links to contacts by email match

## Group Sync

**Service**: `lmsSyncService.syncGroups()`

Syncs groups and attempts partner matching.

**Matching Logic:**
1. Exact name match to partner
2. With/without "ptr_" prefix
3. Fuzzy matching for common variations

## Course Sync

**Service**: `lmsSyncService.syncCourses()`

Syncs course catalog including NPCU values.

**Note:** Some courses return 403 on properties API - these are skipped gracefully.

## Enrollment Sync

**Service**: `lmsSyncService.syncEnrollments()`

**Important:** Only syncs for partner users (not all LMS users).

```javascript
// Get partner user IDs first
const partnerUsers = await getPartnerUserIds();

// Then fetch enrollments for each
for (const userId of partnerUsers) {
  const enrollments = await fetchEnrollments(userId);
  await saveEnrollments(enrollments);
}
```

## Impartner Sync

**Service**: `impartnerSyncService.syncAll()`

Pulls partner and contact data from Impartner CRM.

### Filters Applied
- Partners: Exclude Pending tier, Inactive status
- Contacts: Exclude internal domains, test accounts

### Soft Delete Detection
- Compares fetched IDs to existing records
- Records not in API response are soft-deleted:
  - `is_active = FALSE`
  - `deleted_at = NOW()`

### LMS Offboarding
When records are soft-deleted, they're also removed from LMS:
- Contact: Removed from partner group and "All Partners"
- Partner: All users removed from "All Partners", group deleted

## Push to Impartner

**Service**: `certificationService.syncToImpartner()`

Pushes certification counts back to Impartner CRM.

**Modes:**
- Incremental: Only partners with updated cert counts
- Full: All partners with valid tiers

**Excludes:**
- Pending tier
- Blank tier
- Inactive partners

## Running Tasks Manually

### Via API
```powershell
# Run specific task
Invoke-RestMethod -Uri "http://localhost:3000/api/db/tasks/sync_users/run" -Method Post

# With full mode
Invoke-RestMethod -Uri "http://localhost:3000/api/db/sync/users?mode=full" -Method Post
```

### Via Admin UI
1. Go to Admin → LMS Sync
2. Find task card
3. Click "▶ Run Now"
