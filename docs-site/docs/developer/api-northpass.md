---
sidebar_position: 6
title: Northpass API
---

# Northpass API Reference

## Authentication

| Header | Value |
|--------|-------|
| X-Api-Key | `wcU0QRpN9jnPvXEc5KXMiuVWk` |

The Express proxy injects this header automatically.

## Base URL

- **Direct**: `https://api.northpass.com`
- **Via Proxy**: `/api/northpass` (recommended)

## Core Endpoints

### Groups

```http
GET /v2/groups
GET /v2/groups/{id}
GET /v2/groups/{id}/people
POST /v2/groups
DELETE /v2/groups/{id}/people/{person_id}
```

**Find group by name:**
```javascript
const response = await fetch('/api/northpass/v2/groups?filter[name]=Acme Corporation');
const { data } = await response.json();
```

### People (Users)

```http
GET /v2/people
GET /v2/people/{id}
GET /v2/people/{id}/course_progresses
POST /v2/people
```

**Incremental sync (updated since):**
```javascript
const timestamp = '2026-01-01T00:00:00Z';
const url = `/api/northpass/v2/people?filter[updated_at][gteq]=${timestamp}`;
```

### Courses

```http
GET /v2/courses
GET /v2/courses/{id}
GET /v2/properties/courses/{id}  # Get NPCU value
```

### Enrollments

```http
GET /v2/people/{id}/course_progresses
```

Returns completion status and dates for a user's courses.

## Pagination

Northpass uses page-based pagination:

```http
GET /v2/people?page[number]=1&page[size]=100
```

Response includes:
```json
{
  "data": [...],
  "meta": {
    "total_count": 32844,
    "total_pages": 329
  }
}
```

## Filtering

```http
# Filter by attribute
GET /v2/people?filter[email]=user@example.com

# Filter by date range
GET /v2/people?filter[updated_at][gteq]=2026-01-01T00:00:00Z

# Filter by group
GET /v2/groups/{group_id}/people
```

## Rate Limiting

- No official rate limit documented
- Recommend: 100ms delay between requests
- Use incremental sync to reduce API calls

## Error Handling

```javascript
const response = await fetch(url);
if (!response.ok) {
  if (response.status === 403) {
    // Permission denied (some course properties)
    return null;
  }
  throw new Error(`API error: ${response.status}`);
}
```

## Common Issues

| Issue | Solution |
|-------|----------|
| 403 on properties | Some courses don't expose properties - skip |
| CORS errors | Use the proxy endpoint, not direct API |
| Empty results | Check filter syntax matches API docs |
