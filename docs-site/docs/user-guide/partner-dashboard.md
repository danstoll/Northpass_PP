---
sidebar_position: 7
title: Partner Dashboard
---

# Partner Dashboard

The Partner Dashboard is the public-facing view that partners see when they access their portal URL.

## Partner URL Format

```
https://ptrlrndb.prod.ntxgallery.com/?group=PARTNER_NAME&tier=TIER
```

**Parameters:**

| Parameter | Required | Description |
| --------- | -------- | ----------- |
| `group` or `company` | Yes | Exact partner name (must match LMS group) |
| `tier` | Yes | Partner tier: Premier, Select, Registered, Certified |

## What Partners See

### Header Section

- Partner company name
- Current tier badge
- NPCU progress towards tier requirement

### NPCU Summary

- Total current NPCU
- NPCU required for tier
- Visual progress bar
- Qualification status (Met/Not Met)

### Certification Breakdown

Certifications organized by product category:

- **Nintex Automation Cloud** (Nintex Workflow)
- **Nintex K2**
- **Nintex Promapp**
- **Nintex RPA**

Each category shows:

- Number of certified users
- Total NPCU from that product
- Expandable list of individual certifications

### Individual Certifications

Click to expand any category to see:

- User name
- Certification name
- Completion date
- Expiry date
- NPCU value

### Expiry Warnings

Certifications expiring within 90 days are highlighted with a warning indicator.

## Sharing Portal URLs

### Owner Report

The easiest way to get partner URLs is from the **Owner Report**:

1. Go to **Admin → Owner Report**
2. Find the partner
3. Copy the URL from the "Portal Link" column

### Manual URL Creation

To create a URL manually:

1. Get the exact partner group name from LMS
2. URL-encode any special characters (spaces become `%20`)
3. Add the tier parameter

**Example:**

Partner: "Acme Solutions Inc."  
Tier: Premier

URL: `https://ptrlrndb.prod.ntxgallery.com/?group=Acme%20Solutions%20Inc.&tier=Premier`

## Troubleshooting Partner Views

### "Partner not found"

- Check the group name matches exactly (case-sensitive)
- Verify the partner has an LMS group linked
- Run Group Analysis to find/create the group

### Wrong certification count

- Check if certifications have expired
- Verify enrollments sync has run recently
- Confirm user is in the partner's LMS group

### Missing users

- User may not be in the partner's LMS group
- Check Contact Group Audit in User Management
- Verify user completed the course (not just enrolled)

## Welcome Screen

If someone visits the portal without parameters, they see a welcome screen with:

- Explanation of the portal
- Instructions for PAMs
- Contact information for help
