---
sidebar_position: 1
title: Getting Started
---

# Partner Portal User Guide

Welcome to the Nintex Partner Portal documentation for Partner Account Managers (PAMs).

## What is the Partner Portal?

The Partner Portal tracks partner certifications from Northpass LMS and helps you:

- View partner NPCU totals and tier qualification
- Track individual user certifications
- Identify partners needing attention
- Run reports on certification gaps

## Accessing the Portal

### Partner View

Share this URL format with partners:

```
https://ptrlrndb.prod.ntxgallery.com/?group=PARTNER_NAME&tier=TIER
```

**Example:**

```
https://ptrlrndb.prod.ntxgallery.com/?group=Acme%20Corporation&tier=Premier
```

**Parameters:**

- `group` or `company` - The exact partner name (must match LMS group name)
- `tier` - Partner tier: Premier, Select, Registered, or Certified

### Admin Dashboard

**URL:** [https://ptrlrndb.prod.ntxgallery.com/admin](https://ptrlrndb.prod.ntxgallery.com/admin)

Contact your administrator for the password.

## Key Features

| Feature | Description |
| ------- | ----------- |
| **Sync Dashboard** | Monitor automated data syncs from LMS and CRM |
| **Reports** | Run certification and compliance reports |
| **User Management** | Find and manage LMS users and groups |
| **Owner Report** | View all partners with their portal URLs |

## Understanding NPCU

**NPCU** (Nintex Partner Certification Units) measure partner certification level:

- Courses with NPCU = 0 don't count as certifications
- Courses with NPCU = 1 are basic certifications
- Courses with NPCU = 2 are advanced certifications

**Important:** Expired certifications do NOT count towards NPCU totals.

## Partner Tiers

| Tier | NPCU Required |
| ---- | ------------- |
| Premier | 20 |
| Select | 10 |
| Registered | 5 |
| Certified | Varies |

## Next Steps

- [Admin Login](./admin-login) - How to access the admin dashboard
- [Sync Dashboard](./sync-dashboard) - Understanding data synchronization
- [Reports](./reports) - Running and understanding reports
