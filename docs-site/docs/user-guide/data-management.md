---
sidebar_position: 6
title: Data Management
---

# Data Management

The Data Management section allows you to browse, search, and clean partner data.

## Accessing

Navigate to: **Admin → Data Management**

## Features

### Browse Partners

View all partners in the system with their:

- Partner name and tier
- Account owner (PAM)
- Region
- Active/Inactive status
- LMS group link status

### Search

Search for specific partners by:

- Partner name
- Account owner
- Email domain
- Salesforce ID

### Data Cleaning

Identify and fix data quality issues:

- Duplicate partner records
- Missing required fields
- Invalid email formats
- Mismatched Salesforce IDs

### LMS Matching

Review and manage partner-to-LMS-group links:

- View current links
- Fix incorrect matches
- Create missing links

## Partner Detail View

Click on a partner to see detailed information:

### Overview Tab

- Partner name, tier, type
- Account owner and email
- Region and country
- Status (active/inactive)
- Salesforce and Impartner IDs

### Contacts Tab

All contacts associated with the partner:

- Name and email
- Title
- LMS user link status
- Last activity date

### Certifications Tab

Certification summary for the partner:

- Total NPCU
- Breakdown by product category
- Individual user certifications
- Expiring certifications

### Activity Tab

Recent activity for the partner:

- Course completions
- New user registrations
- Certification expirations

## Data Quality Checks

### Duplicate Detection

The system checks for potential duplicates based on:

- Similar partner names
- Same Salesforce ID
- Matching email domains

### Missing Data

Flagged issues include:

- Partners without account owner
- Contacts without email
- Missing tier assignments

### Stale Data

Identifies:

- Partners with no recent activity
- Contacts not seen in 12+ months
- Outdated tier assignments

## Making Changes

### Edit Partner

1. Find the partner
2. Click **Edit**
3. Modify fields as needed
4. Click **Save**

**Note:** Most fields sync from Impartner CRM. Local edits may be overwritten on next sync.

### Deactivate Partner

1. Find the partner
2. Click **Deactivate**
3. Confirm the action

**Effect:** Partner and contacts are soft-deleted, LMS group memberships are removed.

### Merge Duplicates

1. Identify duplicate records
2. Select the primary record to keep
3. Click **Merge**
4. Review the merge preview
5. Confirm the merge

**Note:** This operation cannot be undone. Export data before merging.

## Export Data

Export partner data for offline analysis:

1. Apply any desired filters
2. Click **Export**
3. Choose CSV or Excel format
4. File downloads automatically

Exported data includes all visible columns plus additional details.
