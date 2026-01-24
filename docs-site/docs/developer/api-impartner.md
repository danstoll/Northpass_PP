---
sidebar_position: 7
title: Impartner API
---

# Impartner API Reference

## Authentication

| Header | Value |
|--------|-------|
| Authorization | `prm-key <api-key>` |
| X-PRM-TenantId | `1` |

## Base URL

`https://prod.impartner.live`

## Endpoints

### Accounts (Partners)

```http
GET /api/objects/v1/Account
GET /api/objects/v1/Account/{id}
```

### Users (Contacts)

```http
GET /api/objects/v1/User
GET /api/objects/v1/User/{id}
```

## Pagination

```http
GET /api/objects/v1/Account?pageSize=100&page=1
```

## Filtering

Impartner uses OData-style filtering:

```http
# Filter by field
GET /api/objects/v1/Account?$filter=Partner_Tier__cf eq 'Premier'

# Multiple conditions
GET /api/objects/v1/Account?$filter=Partner_Tier__cf ne 'Pending' and Status ne 'Inactive'
```

## Field Mapping

### Partners (Account → partners table)

| Impartner Field | MariaDB Field |
|-----------------|---------------|
| Name | account_name |
| Partner_Tier__cf | partner_tier |
| Account_Owner__cf | account_owner |
| Account_Owner_Email__cf | owner_email |
| Partner_Type__cf | partner_type |
| CrmId | salesforce_id |
| Website | website |
| Region | account_region |
| MailingCountry | country |

### Contacts (User → contacts table)

| Impartner Field | MariaDB Field |
|-----------------|---------------|
| Email | email |
| FirstName | first_name |
| LastName | last_name |
| Title | title |
| Phone | phone |
| AccountName | partner_id (lookup) |

## Sync Filters

The sync excludes certain records:

**Partner Filters:**
- Excluded tiers: Pending
- Excluded statuses: Inactive
- Excluded names: Contains "nintex"

**Contact Filters:**
- Excluded domains: bill.com, nintex.com, safalo.com, crestan.com
- Excluded patterns: demo, sales, support, test, accounts

## Push to Impartner

The system can push certification data back to Impartner:

```http
PATCH /api/objects/v1/Account/{id}
Content-Type: application/json

{
  "Certification_Count__cf": 5,
  "Total_NPCU__cf": 12
}
```

## Service Location

`server/db/impartnerSyncService.cjs`

## API Endpoints (Internal)

```powershell
# Preview sync (dry run)
POST /api/impartner/sync/preview

# Sync partners
POST /api/impartner/sync/partners

# Sync contacts
POST /api/impartner/sync/contacts

# Full sync
POST /api/impartner/sync/all

# Push cert counts to Impartner
POST /api/db/certifications/sync-to-impartner
```
