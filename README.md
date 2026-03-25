# FieldVibe - Technician Dispatch Application

A professional web-based technician dispatch management system built with Hono + Cloudflare Pages + D1 SQLite.

## Project Overview
- **Name**: FieldVibe
- **Goal**: Manage technician dispatching, scheduling, time tracking, and admin/owner operations in a single lightweight edge app.
- **Current Status**: Running in sandbox and locally verified after auth/login bug fix.

## URLs
- **Sandbox URL**: https://3000-ijo6yail9m0850vvc7yio-5634da27.sandbox.novita.ai
- **Health Check**: `/api/health`
- **Local Dev**: `http://localhost:3000`

## User Guide
### Admin / Owner
- Sign in with email + password.
- Use **Dashboard** to view KPIs and team activity.
- Use **Calendar** to manage weekly schedules.
- Use **Jobs** to create, edit, assign, cancel, or review work orders.
- Use **Technicians** to add staff, edit profiles, change passwords, activate/deactivate accounts, and review productivity stats.
- Owners can also manage admin staff roles.

### Technician
- Sign in using the technician dropdown + password.
- Review assigned jobs from **Home**, **My Jobs**, or **Calendar**.
- Clock in/out from assigned jobs and track live work time.
- Open job detail to review customer info and navigation links.

## Completed Features
### Admin Interface
- Dashboard with KPI cards, daily schedule, team activity, and recent updates
- Weekly calendar with visual schedule blocks and week navigation
- Jobs CRUD with status filtering and detail modal
- Technician management with add/edit/delete and password reset
- Owner-only admin/staff role management
- Client CRUD management
- Reports with weekly time summaries and job status overview
- Notifications center with unread tracking and mark-as-read actions

### Technician Interface
- Mobile-first dashboard and bottom navigation
- Technician login dropdown flow
- Personal jobs list and calendar view
- Clock in / clock out workflow with GPS support
- Job detail modal with client info and directions link
- Profile screen with stats and sign out

### Authentication & Role Rules
- JWT-based authentication
- Roles: `OWNER`, `ADMIN`, `TECHNICIAN`
- Owner/admin can manage technician credentials
- Owner can manage role changes for non-owner users
- Fixed issue where owner-side technician password updates could break technician login when email was not safely preserved
- User edit flow now preserves email safely and backend ignores blank email updates

## Functional Entry URIs
### Web Pages
- `/` - SPA entry point

### Authentication
- `POST /api/auth/login` - Login with `{ email, password }`
- `POST /api/auth/register` - Register user
- `GET /api/auth/me` - Current authenticated user
- `GET /api/auth/technicians-public` - Public technician list for dropdown login

### Users
- `GET /api/users` - List users (admin/owner)
- `GET /api/users/:id` - Get user detail
- `POST /api/users` - Create user
- `PUT /api/users/:id` - Update user info, password, active state, role restrictions apply
- `DELETE /api/users/:id` - Delete user with owner/admin restrictions
- `GET /api/users/technicians` - Active technician list

### Jobs
- `GET /api/jobs`
- `GET /api/jobs/:id`
- `POST /api/jobs`
- `PUT /api/jobs/:id`
- `DELETE /api/jobs/:id`

### Clients
- `GET /api/clients`
- `GET /api/clients/:id`
- `POST /api/clients`
- `PUT /api/clients/:id`
- `DELETE /api/clients/:id`

### Time Logs
- `POST /api/time-logs/clock-in`
- `POST /api/time-logs/clock-out`
- `GET /api/time-logs/active`
- `GET /api/time-logs/summary`

### Notifications
- `GET /api/notifications`
- `GET /api/notifications/unread-count`
- `PUT /api/notifications/:id/read`
- `PUT /api/notifications/mark-all-read`

### Dashboard
- `GET /api/dashboard/stats`

## Data Architecture
### Data Models
- **Users**: identity, role, specialty, phone, avatar color, active status, password hash
- **Clients**: business contact information, address, notes
- **Jobs**: assignment, scheduling, color tag, priority, status, service type, description
- **Time Logs**: technician work sessions with GPS coordinates and duration
- **Notifications**: per-user alert feed and unread state

### Storage Services
- **Database**: Cloudflare D1 (SQLite)
- **Auth Storage**: JWT in browser localStorage

### Data Flow
- Frontend SPA calls Hono API routes under `/api/*`
- Hono routes read/write D1 data
- Authenticated requests use Bearer token
- Technician login dropdown consumes `/api/auth/technicians-public`

## Demo Accounts
| Role | Email | Password |
|------|-------|----------|
| Owner | djmhnr@gmail.com | password123 |
| Admin | mike.chen@gmail.com | password123 |
| Admin | sarah.johnson@gmail.com | password123 |
| Technician | john.smith@gmail.com | password123 |
| Technician | emily.davis@gmail.com | password123 |
| Technician | carlos.ruiz@gmail.com | password123 |
| Technician | linda.park@gmail.com | password123 |

## Not Yet Implemented
- Formal automated test suite
- Password change audit/history logging
- Email-based password reset flow
- Granular permission matrix beyond current role checks
- Production-tailwind build optimization instead of CDN warning
- Full deployment metadata for GitHub and Cloudflare production URLs

## Recommended Next Steps
1. Add automated API/auth regression tests for owner/admin/technician flows.
2. Add explicit frontend validation/messages around technician email and password changes.
3. Add audit logging for credential changes and role updates.
4. Push latest fix to GitHub and deploy to Cloudflare Pages production.
5. Replace Tailwind CDN usage with build-time Tailwind pipeline for production.

## Tech Stack
- **Backend**: Hono v4 (TypeScript) on Cloudflare Workers
- **Frontend**: Vanilla JS + Tailwind CSS (CDN) + Day.js + Axios
- **Database**: Cloudflare D1 (SQLite)
- **Auth**: JWT (`jose`) + SHA-256 password hashing
- **Build**: Vite + `@hono/vite-build`
- **Dev Server**: Wrangler Pages Dev + PM2

## Project Structure
```text
webapp/
├── src/
│   ├── index.tsx
│   ├── middleware/auth.ts
│   ├── lib/auth.ts
│   └── routes/
│       ├── auth.ts
│       ├── jobs.ts
│       ├── timeLogs.ts
│       ├── clients.ts
│       ├── users.ts
│       ├── notifications.ts
│       └── dashboard.ts
├── migrations/
├── public/
├── ecosystem.config.cjs
├── wrangler.jsonc
├── package.json
└── README.md
```

## Local Development
```bash
npm install
npm run db:migrate:local
npm run db:seed
npm run build
pm2 start ecosystem.config.cjs
```

## Deployment Status
- **Platform**: Cloudflare Pages / Workers-compatible build
- **Sandbox Status**: ✅ Running
- **Auth Fix Status**: ✅ Applied and locally verified
- **Last Updated**: 2026-03-25
