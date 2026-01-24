---
sidebar_position: 4
title: Database Schema
---

# Database Schema

**Schema Version**: 19 (January 2026)

## Connection Details

| Property | Value |
|----------|-------|
| Host | `20.29.25.238` |
| Port | `31337` |
| Database | `northpass` |
| User | `northpass` |
| Password | `Nintex2025!` |

## Core Tables

### partners
Partner companies synced from Impartner CRM.

| Column | Type | Description |
|--------|------|-------------|
| id | INT | Primary key |
| account_name | VARCHAR(255) | Company name |
| partner_tier | VARCHAR(50) | Premier, Select, Registered, Certified |
| account_owner | VARCHAR(255) | PAM name |
| owner_email | VARCHAR(255) | PAM email |
| partner_type | VARCHAR(100) | Partner classification |
| salesforce_id | VARCHAR(20) | SF Account ID (15 or 18 char) |
| impartner_id | INT | Impartner Account ID |
| lms_group_id | VARCHAR(50) | Linked Northpass group ID |
| is_active | BOOLEAN | Active status |
| deleted_at | DATETIME | Soft delete timestamp |

### contacts
Contact records synced from Impartner CRM.

| Column | Type | Description |
|--------|------|-------------|
| id | INT | Primary key |
| email | VARCHAR(255) | Email address (unique) |
| first_name | VARCHAR(100) | First name |
| last_name | VARCHAR(100) | Last name |
| partner_id | INT | FK to partners |
| lms_user_id | VARCHAR(50) | Linked Northpass user ID |
| impartner_id | INT | Impartner User ID |
| is_active | BOOLEAN | Active status |

### lms_users
Users synced from Northpass LMS.

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR(50) | Northpass user ID |
| email | VARCHAR(255) | Email address |
| first_name | VARCHAR(100) | First name |
| last_name | VARCHAR(100) | Last name |
| created_at | DATETIME | LMS registration date |
| updated_at | DATETIME | Last update from API |

### lms_groups
Groups synced from Northpass LMS.

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR(50) | Northpass group ID |
| name | VARCHAR(255) | Group name |
| partner_id | INT | Linked partner (if matched) |

### enrollments
Course enrollments synced from Northpass.

| Column | Type | Description |
|--------|------|-------------|
| id | INT | Primary key |
| lms_user_id | VARCHAR(50) | FK to lms_users |
| course_id | VARCHAR(50) | Northpass course ID |
| status | VARCHAR(20) | enrolled, completed |
| completed_at | DATETIME | Completion timestamp |
| expires_at | DATETIME | Certification expiry |

### courses
Course catalog from Northpass.

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR(50) | Northpass course ID |
| name | VARCHAR(255) | Course title |
| npcu_value | INT | NPCU points (0, 1, or 2) |
| product_category | VARCHAR(100) | Product grouping |

## Sync Tables

### scheduled_tasks
Task scheduler configuration.

| Column | Type | Description |
|--------|------|-------------|
| id | INT | Primary key |
| task_type | VARCHAR(50) | Task identifier |
| enabled | BOOLEAN | Is task active |
| interval_minutes | INT | Run frequency |
| last_run_at | DATETIME | Last execution |
| next_run_at | DATETIME | Next scheduled run |
| status | VARCHAR(20) | idle, running, failed |
| config | JSON | Task-specific config (mode, etc.) |

### sync_logs
Sync operation history.

| Column | Type | Description |
|--------|------|-------------|
| id | INT | Primary key |
| sync_type | VARCHAR(50) | Type of sync |
| status | VARCHAR(20) | success, failed, running |
| records_processed | INT | Total processed |
| records_created | INT | New records |
| records_updated | INT | Updated records |
| started_at | DATETIME | Start time |
| completed_at | DATETIME | End time |
| error_message | TEXT | Error details if failed |

### login_history
User login tracking (Schema v19).

| Column | Type | Description |
|--------|------|-------------|
| id | INT | Primary key |
| user_id | INT | FK to users |
| email | VARCHAR(255) | Login email |
| success | BOOLEAN | Login succeeded |
| failure_reason | VARCHAR(100) | Why it failed |
| ip_address | VARCHAR(45) | Client IP |
| login_method | VARCHAR(20) | password, magic_link, sso |

## Indexes

Key indexes for performance:
- `contacts.email` - Unique, for lookups
- `partners.account_name` - For name searches
- `lms_users.email` - For matching
- `enrollments.lms_user_id` - For user queries
- `enrollments.completed_at` - For date filtering
