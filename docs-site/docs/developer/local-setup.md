---
sidebar_position: 3
title: Local Setup
---

# Local Development Setup

## Prerequisites

- Node.js 18+
- Access to MariaDB at `20.29.25.238:31337`
- Git

## Installation

```bash
git clone <repository-url>
cd northpass-portal
npm install
```

## Running Locally

You need **two terminals**:

### Terminal 1: Express Backend

```bash
node server-with-proxy.cjs
```

Runs on port 3000. Provides:
- `/api/db/*` - Database endpoints
- `/api/northpass/*` - Northpass API proxy
- `/api/impartner/*` - Impartner sync endpoints

### Terminal 2: Vite Dev Server

```bash
npm run dev
```

Runs on port 5173 with hot reload.

## Access the App

Open: **http://localhost:5173**

Admin login: **http://localhost:5173/admin**
- Password: `Nintex2025!`

## Environment

No `.env` file needed - configuration is hardcoded for simplicity:
- Database credentials in `server/db/connection.cjs`
- API keys in `server-with-proxy.cjs`

## VS Code Tasks

The project includes VS Code tasks in `.vscode/tasks.json`:

```json
{
  "label": "Start Development Server",
  "type": "shell",
  "command": "npm run dev",
  "isBackground": true
}
```

## Common Issues

| Issue | Solution |
|-------|----------|
| ECONNREFUSED on /api/db/ | Start Express server first (`node server-with-proxy.cjs`) |
| Database connection failed | Check VPN/network access to MariaDB |
| Cache issues | Hard refresh (Ctrl+Shift+R) or bump cache version |
| Port 3000 in use | Kill existing process or change port in server file |

## Testing API Endpoints

Use PowerShell to test endpoints:

```powershell
# Get sync status
Invoke-RestMethod -Uri "http://localhost:3000/api/db/sync/status"

# Run a sync
Invoke-RestMethod -Uri "http://localhost:3000/api/db/sync/users" -Method Post
```
