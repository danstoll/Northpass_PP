---
sidebar_position: 8
title: Certification Tracking
---

# Certification Tracking

Understanding how certifications are tracked and calculated in the Partner Portal.

## What Counts as a Certification?

A certification is a completed course with an **NPCU value greater than 0**.

| NPCU Value | Meaning |
| ---------- | ------- |
| 0 | Not a certification (awareness/intro course) |
| 1 | Basic certification |
| 2 | Advanced certification |

## Certification Lifecycle

### 1. Enrollment

User enrolls in a course in Northpass LMS.

- Tracked but doesn't count towards NPCU
- Status: "Enrolled"

### 2. Completion

User completes all course requirements.

- Now counts towards NPCU
- Status: "Completed"
- Expiry date set (typically 24 months from completion)

### 3. Active

Certification is valid and contributes to partner's NPCU total.

### 4. Expiring Soon

Within 90 days of expiry date.

- Highlighted with warning in reports
- Partner should recertify

### 5. Expired

Past the expiry date.

- **No longer counts towards NPCU**
- Removed from partner's certification total
- User must recertify to restore

## Expiry Rules

### Standard Expiry

Most certifications expire **24 months** after completion.

### Renewal

To renew a certification:

1. User retakes the certification course
2. New completion date is recorded
3. New 24-month expiry period begins
4. Old certification record is replaced

### Grace Period

There is no grace period. Once expired, the certification immediately stops counting.

## NPCU Calculation

### For a User

```
User NPCU = Sum of NPCU values for all active (non-expired) certifications
```

### For a Partner

```
Partner NPCU = Sum of User NPCU for all users in the partner's LMS group
```

### Example

**Partner: Acme Corp**

| User | Certification | NPCU | Status |
| ---- | ------------- | ---- | ------ |
| John | NAC Admin | 2 | Active |
| John | K2 Developer | 2 | Active |
| Jane | NAC Admin | 2 | Active |
| Jane | RPA Builder | 1 | **Expired** |
| Bob | Promapp | 1 | Active |

**Partner Total NPCU:** 2 + 2 + 2 + 1 = **7 NPCU**

(Jane's expired RPA cert doesn't count)

## Product Categories

Certifications are grouped by Nintex product:

| Category | Products Included |
| -------- | ----------------- |
| Nintex Automation Cloud | Nintex Workflow, NAC |
| Nintex K2 | K2 Five, K2 Cloud |
| Nintex Promapp | Promapp |
| Nintex RPA | RPA, Foxtrot |

## Reports for Tracking

### Expiring Certifications Report

Shows all certifications expiring in the next 90 days.

**Action:** Notify partners to recertify before expiry.

### User Certifications Report

Complete list of all user certifications with status.

**Use for:** Audit, troubleshooting, data export.

### Certification Gaps Report

Partners below their tier NPCU requirement.

**Action:** Targeted outreach to encourage training.

## Best Practices

### Proactive Monitoring

- Run Expiring Certifications report weekly
- Send reminders at 90, 60, and 30 days before expiry
- Track recertification completion

### Partner Communication

- Share certification status regularly with partners
- Highlight users needing recertification
- Provide direct links to certification courses

### Data Quality

- Verify user-to-partner associations monthly
- Check for orphan users after certification events
- Audit group memberships quarterly
