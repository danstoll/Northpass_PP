---
sidebar_position: 8
title: Internal API
---

# Internal API Reference

All endpoints prefixed with `/api/db/`

## Sync Endpoints

### User Sync
```http
POST /api/db/sync/users
POST /api/db/sync/users?mode=full  # Force full sync
```

### Group Sync
```http
POST /api/db/sync/groups
POST /api/db/sync/groups?mode=full
```

### Course Sync
```http
POST /api/db/sync/courses
POST /api/db/sync/courses?mode=full
```

### NPCU Sync
```http
POST /api/db/sync/npcu
```

### Enrollment Sync
```http
POST /api/db/sync/enrollments
```

### Impartner Sync
```http
POST /api/impartner/sync/all
POST /api/impartner/sync/partners
POST /api/impartner/sync/contacts
```

## Report Endpoints

### Overview
```http
GET /api/db/reports/overview
```

### Partner Leaderboard
```http
GET /api/db/reports/leaderboard?limit=20
```

### User Certifications
```http
GET /api/db/reports/user-certifications?page=1&limit=1000
```

### Contacts Not in LMS
```http
GET /api/db/reports/contacts-not-in-lms?page=1&limit=1000
```

### Partners Without Groups
```http
GET /api/db/reports/partners-without-groups
```

## Analytics Endpoints

### Trend Summary
```http
GET /api/db/trends/kpi-summary
GET /api/db/trends/kpi-summary?region=AMER&tier=Premier
```

### Engagement Scores
```http
GET /api/db/analytics/engagement-scores
```

### Cohort Analysis
```http
GET /api/db/analytics/cohort
```

### User Segments
```http
GET /api/db/analytics/user-segments
```

## User Management

### Orphan Users
```http
GET /api/db/users/orphans
GET /api/db/users/orphans/partner/{id}
GET /api/db/users/breakdown
```

## Task Management

### Get Tasks
```http
GET /api/db/tasks
```

### Run Task
```http
POST /api/db/tasks/{taskType}/run
```

### Update Task Config
```http
PUT /api/db/tasks/{taskType}/config
Body: {"mode": "full"}
```

### Toggle Task
```http
PUT /api/db/tasks/{taskType}/toggle
Body: {"enabled": true}
```

## Common Query Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| page | Page number (1-based) | ?page=2 |
| limit | Records per page | ?limit=100 |
| region | Filter by region | ?region=AMER |
| tier | Filter by tier | ?tier=Premier |
| owner | Filter by owner email | ?owner=john@nintex.com |
| mode | Sync mode | ?mode=full |

## Response Format

All endpoints return JSON:

```json
{
  "success": true,
  "data": [...],
  "meta": {
    "total": 1500,
    "page": 1,
    "limit": 100
  }
}
```

Error responses:
```json
{
  "success": false,
  "error": "Error message"
}
```
