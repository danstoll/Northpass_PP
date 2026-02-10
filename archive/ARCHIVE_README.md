# Archive Directory

This directory contains files that are no longer actively used in the production Northpass Partner Portal but are kept for reference or potential future use.

## Archive Date
- Original archive: November 28, 2025
- Major cleanup: February 10, 2026

## Archived Files Organization

### 📁 test-scripts/ (February 2026)
**Purpose**: Test, exploration, and API discovery scripts

**25 files** including:
- `test-*.cjs` (11) - Impartner API tests, NPCU sync tests, transcript tests
- `explore-*.cjs` (6) - Impartner field/object exploration
- `discover-fields.cjs`, `get-schema.cjs`, `list-impartner-objects.cjs` - Schema discovery
- `setup-umami.ps1` - One-off Umami analytics setup
- `db-testSync.cjs`, `db-debugSync.cjs`, `db-verboseSync.cjs`, `db-benchmark.cjs` - DB sync debugging (originally in server/db/)
- `impartner-objects-v1.json` - Impartner objects snapshot (originally in impartner/)

**Reason**: One-off testing and exploration scripts. API discovery is complete; all sync functionality is now handled by the task scheduler.

---

### 📁 diagnostic-scripts/ (February 2026)
**Purpose**: One-off diagnostic and health-check scripts

**37 files** including:
- `check-*.cjs` (23) - DB checks, sync status, enrollment counts, partner status, NPCU cache, Salesforce IDs, etc.
- `find-*.cjs/ps1` (5) - Find missing partners, invalid courses, Impartner accounts
- `calc-npcu.cjs`, `get-primary-user.cjs`, `verify-protiviti.cjs` - Specific partner/data checks
- `db-checkEnrollments.cjs`, `db-checkPartner.cjs`, `db-count.cjs` - DB diagnostics (originally in server/db/)
- `find_impartner_account.cjs`, `inspect_partner.js`, `preview_sync_to_impartner.js` - Impartner diagnostics (originally in scripts/)

**Reason**: One-off diagnostic scripts used during development and troubleshooting. Monitoring is now handled by the sync dashboard and admin tools.

---

### 📁 data-fix-scripts/ (February 2026)
**Purpose**: One-off data repairs, migrations, and manual sync runners

**34 files** including:
- `add-*.cjs` (3) - Add columns/records
- `cleanup-*.cjs` (4) - Clean stuck logs, orphan records
- `deactivate-lms-users.cjs`, `disable-accounts.cjs` - Manual user deactivation
- `rebuild-npcu*.cjs`, `refresh-npcu.cjs` - NPCU cache rebuilds
- `repair-enrollments.cjs`, `update-sync-mode.cjs`, `enable-npcu-sync.cjs` - Data fixes
- `link-impact.cjs`, `offboard-impact.cjs` - Impact Networking one-off operations
- `db-*.cjs` (13) - Sync prototypes and migration scripts (originally in server/db/): continueSync, createNpcuCache, incrementalSync, quickSync, robustSync, runSync, syncEnrollments, syncGroupMembers, addPendingColumn, migrate-add-last-modified, run-migration
- `db-runSync.ps1`, `db-sync_progress.json` - PowerShell runner and state file
- `push_*.cjs`, `run_sync_to_impartner.cjs`, `sync-leads.cjs` - Manual sync launchers (originally in scripts/)

**Reason**: These were operational prototypes and one-off fixes. All sync functionality is now handled by the production task scheduler in `server/db/taskScheduler.cjs`.

---

### 📁 audit-files/ (February 2026)
**Purpose**: Audit outputs, log files, and data snapshots

**Files**:
- `audit-result.json`, `audit-result.txt`, `audit.json` - npm/code audit results
- `Nintex Partner Portal Unmatched_2026-01-16.xlsx` - Unmatched partner data (originally in files/)
- `sync-leads.log` - Lead sync log output

**Reason**: Historical audit outputs and data snapshots no longer needed in the project root.
