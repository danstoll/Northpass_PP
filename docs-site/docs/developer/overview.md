---
sidebar_position: 1
title: Overview
---

# Northpass Partner Portal - Developer Guide

Welcome to the developer documentation for the Nintex Partner Portal (Northpass Integration).

## What is this project?

The Partner Portal is a web application that:
- Tracks partner certification progress from Northpass LMS
- Calculates NPCU (Nintex Partner Certification Units) per partner
- Syncs partner/contact data from Impartner CRM
- Provides reporting and analytics for Partner Account Managers (PAMs)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + Vite + MUI v5 |
| Backend | Express.js |
| Database | MariaDB 11.6.2 |
| LMS API | Northpass REST API |
| CRM API | Impartner PRM API |
| Deployment | Ubuntu 22.04 + PM2 |

## Production URL

**https://ptrlrndb.prod.ntxgallery.com**

## Key Concepts

### NPCU (Nintex Partner Certification Units)
- Only courses with NPCU > 0 count as certifications
- NPCU values: 0 (no certification), 1 (basic), 2 (advanced)
- **Expired certifications do NOT count** towards NPCU totals

### Partner Tiers
| Tier | NPCU Requirement |
|------|------------------|
| Premier | 20 NPCU |
| Select | 10 NPCU |
| Registered | 5 NPCU |
| Certified | Varies |

## Quick Links

- [Architecture](./architecture) - System design and data flow
- [Local Setup](./local-setup) - Get running locally
- [Database Schema](./database-schema) - Table definitions
- [Deployment](./deployment) - Deploy to production
