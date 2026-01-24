---
sidebar_position: 9
title: FAQ
---

# Frequently Asked Questions

## General

### What is the Partner Portal?

The Partner Portal is a web application that tracks partner certifications from Northpass LMS and helps Partner Account Managers (PAMs) monitor partner training progress.

### Who should use this portal?

- **PAMs** - To track their partner's certification progress
- **Partners** - To view their own certification status (via shared URLs)
- **Administrators** - To manage data and run reports

### How often is data updated?

Data syncs automatically:

- Users and Groups: Every 2 hours
- Enrollments: Every 4 hours
- Partner/Contact data: Every 6 hours

You can also trigger manual syncs from the Sync Dashboard.

## Partner Views

### How do I get a partner's portal URL?

Go to **Admin → Owner Report** and copy the URL from the "Portal Link" column.

### Why does a partner show "not found"?

The partner name must exactly match the LMS group name. Check:

- Spelling and capitalization
- Special characters
- That a group exists for the partner

### Why are some certifications not showing?

Possible reasons:

- The certification has expired
- The user isn't in the partner's LMS group
- The course has NPCU = 0 (not a certification)
- The enrollment sync hasn't run yet

## NPCU & Certifications

### What is NPCU?

NPCU (Nintex Partner Certification Units) measure the value of certifications. Higher NPCU = more advanced certification.

### Do expired certifications count?

**No.** Once a certification expires, it no longer counts towards the partner's NPCU total.

### How long do certifications last?

Most certifications expire 24 months after completion.

### How does a user recertify?

The user must retake and complete the certification course in Northpass LMS.

## Sync & Data

### What's the difference between incremental and full sync?

- **Incremental:** Only syncs records changed since last run (faster)
- **Full:** Syncs all records (slower but more thorough)

### Why is a sync task "stuck"?

If a task shows "Running" for more than 30 minutes, it may be stuck. Contact an administrator to reset it.

### Why don't my CRM changes appear?

CRM data syncs every 6 hours. You can trigger a manual Impartner sync from the Sync Dashboard for immediate updates.

## Reports

### Can I schedule automatic reports?

Currently, all reports are on-demand. Contact your administrator if you need scheduled reports.

### How do I export report data?

Click the **Export** button on any report to download as CSV or Excel.

### Why is the report showing different numbers than yesterday?

Certification counts change as:

- New certifications are completed
- Existing certifications expire
- Users are added/removed from partner groups

## Troubleshooting

### I can't log into the admin dashboard

- Verify you have the correct password
- Try clearing browser cache
- Contact your administrator

### The page is showing old data

Try a hard refresh: **Ctrl + Shift + R** (Windows) or **Cmd + Shift + R** (Mac)

### I found incorrect data

1. Note the specific record(s) affected
2. Check when the last sync ran
3. Verify the data in the source system (Northpass or Impartner)
4. Contact an administrator if the issue persists

## Contact & Support

### Who do I contact for help?

Contact your system administrator or the platform development team.

### Where can I find more documentation?

This documentation site contains both:

- **User Guide** - For PAMs and daily users
- **Developer Guide** - For technical details and maintenance
