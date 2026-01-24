---
sidebar_position: 11
title: Impartner Sync
---

# Impartner CRM Sync

## Overview

The Impartner sync replaces manual Excel imports with automated API sync.

**Service**: `server/db/impartnerSyncService.cjs`

## Sync Flow

```
Impartner CRM ──► Filter ──► Transform ──► MariaDB
                   │
                   ├─ Exclude Pending tier
                   ├─ Exclude Inactive
                   └─ Exclude test accounts
```

## API Configuration

```javascript
const IMPARTNER_CONFIG = {
  host: 'https://prod.impartner.live',
  apiKey: '<api-key>',
  tenantId: '1',
  pageSize: 100,
};
```

## Partner Sync

```javascript
await syncPartners();
```

**Process:**
1. Fetch all accounts from Impartner
2. Apply tier/status filters
3. Upsert into `partners` table
4. Detect deleted accounts (soft-delete)
5. Offboard deleted partners from LMS

## Contact Sync

```javascript
await syncContacts();
```

**Process:**
1. Fetch all users from Impartner
2. Apply email domain/pattern filters
3. Match to existing partners by account name
4. Upsert into `contacts` table
5. Link to LMS users by email
6. Detect deleted contacts (soft-delete)
7. Offboard deleted contacts from LMS

## Filter Configuration

```javascript
const FILTERS = {
  excludedTiers: ['Pending'],
  excludedStatuses: ['Inactive'],
  excludedDomains: ['bill.com', 'nintex.com', 'safalo.com'],
  excludedPatterns: ['demo', 'sales', 'support', 'test'],
};
```

## Incremental vs Full

### Incremental (default)
- Uses `ModifiedDate` filter
- Only fetches records changed since last sync

### Full
- Fetches all records
- Required for soft-delete detection
- Use: `?mode=full`

## Soft Delete Detection

During **full sync**, the system detects records that were:
- Deleted in Impartner
- Changed to excluded tier/status

These records are soft-deleted:
```sql
UPDATE partners 
SET is_active = FALSE, 
    deleted_at = NOW(),
    account_status = 'Inactive'
WHERE impartner_id = ?
```

## LMS Offboarding

**Service**: `server/db/offboardingService.cjs`

When partners/contacts are deactivated:

### Contact Offboarding
1. Remove from partner's LMS group
2. Remove from "All Partners" group

### Partner Offboarding
1. Find all users in partner's group
2. Remove each from "All Partners" group
3. Delete the partner's LMS group

## API Endpoints

```powershell
# Preview what would sync
GET /api/impartner/sync/preview

# Get sync status
GET /api/impartner/sync/status

# Sync partners only
POST /api/impartner/sync/partners

# Sync contacts only
POST /api/impartner/sync/contacts

# Full sync (both)
POST /api/impartner/sync/all

# Force full mode
POST /api/impartner/sync/all?mode=full
```

## Salesforce ID Matching

Impartner uses Salesforce IDs that can be 15 or 18 characters.

The sync handles both formats:
```javascript
// Match by prefix (first 15 chars are the same)
WHERE salesforce_id LIKE CONCAT(LEFT(?, 15), '%')
```
