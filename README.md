# FieldVibe - Technician Dispatch Application

A professional web-based technician dispatch management system built with Hono + Cloudflare Pages + D1 SQLite.

## 🚀 Live Application

- **URL**: https://3000-ijo6yail9m0850vvc7yio-5634da27.sandbox.novita.ai
- **Health Check**: `/api/health`

## 🔐 Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@fieldvibe.com | password123 |
| Admin | dispatcher@fieldvibe.com | password123 |
| Technician | john.smith@fieldvibe.com | password123 |
| Technician | emily.davis@fieldvibe.com | password123 |
| Technician | carlos.ruiz@fieldvibe.com | password123 |
| Technician | linda.park@fieldvibe.com | password123 |

## ✅ Completed Features

### Admin Interface
- **Dashboard** - KPI cards, today's schedule, field team status, recent activity
- **Weekly Calendar** - Time grid view with color-coded jobs, week navigation
- **Jobs Management** - Create/edit/cancel jobs with full filtering by status
- **Technician Management** - View all techs, performance stats, add new technicians
- **Client Management** - Full CRUD for client records
- **Reports** - Weekly time summary with progress bars, job status breakdown
- **Notifications** - Real-time notification center with mark-as-read
- **New Job Modal** - Full form with client/tech assignment, color tags, priority

### Technician Interface (Mobile-First)
- **Home Dashboard** - Today's jobs, weekly stats, active timer
- **My Jobs List** - All assigned/in-progress jobs
- **Clock In/Out** - GPS-enabled time tracking with live timer
- **Job Detail** - Full job info, client contact, directions link
- **Profile** - Stats and sign out
- **Bottom Navigation** - Mobile-friendly tab bar

### Backend API (Hono + D1)
- `POST /api/auth/login` - Login with JWT response
- `POST /api/auth/register` - Register new user
- `GET /api/auth/me` - Get current user
- `GET/POST/PUT/DELETE /api/jobs` - Full job CRUD
- `POST /api/time-logs/clock-in` - Clock in with GPS
- `POST /api/time-logs/clock-out` - Clock out with notes
- `GET /api/time-logs/active` - Current active session
- `GET /api/time-logs/summary` - Weekly time summary
- `GET/POST/PUT/DELETE /api/clients` - Client management
- `GET/POST/PUT /api/users` - User management
- `GET /api/users/technicians` - Active technician list
- `GET /api/notifications` - User notifications
- `PUT /api/notifications/:id/read` - Mark notification read
- `GET /api/dashboard/stats` - Role-based dashboard stats

## 🗃️ Data Models

- **Users** - Admins & Technicians with roles, specialty, avatar colors
- **Clients** - Company contacts with address/notes
- **Jobs** - Full job lifecycle (ASSIGNED → IN_PROGRESS → COMPLETED)
- **Time Logs** - Clock in/out with GPS coordinates and duration
- **Notifications** - System notifications per user with read status

## 🛠️ Tech Stack

- **Backend**: Hono v4 (TypeScript) on Cloudflare Workers
- **Frontend**: Vanilla JS + Tailwind CSS (CDN) + Day.js + Axios
- **Database**: Cloudflare D1 (SQLite)
- **Auth**: JWT (jose library) + SHA-256 password hashing
- **Build**: Vite + @hono/vite-build
- **Dev Server**: Wrangler Pages Dev + PM2

## 📁 Project Structure

```
webapp/
├── src/
│   ├── index.tsx          # Main app + HTML frontend (SPA)
│   ├── middleware/
│   │   └── auth.ts        # JWT auth middleware
│   ├── lib/
│   │   └── auth.ts        # JWT/hash utilities
│   └── routes/
│       ├── auth.ts        # Login/register/me
│       ├── jobs.ts        # Job CRUD
│       ├── timeLogs.ts    # Clock in/out
│       ├── clients.ts     # Client CRUD
│       ├── users.ts       # User management
│       ├── notifications.ts
│       └── dashboard.ts   # Stats & analytics
├── migrations/
│   └── 0001_initial_schema.sql
├── seed.sql               # Demo data
├── wrangler.jsonc         # Cloudflare config
├── ecosystem.config.cjs   # PM2 config
└── package.json
```

## 🚀 Local Development

```bash
# Install dependencies
npm install

# Apply database migrations
npm run db:migrate:local

# Seed demo data
npm run db:seed

# Build
npm run build

# Start dev server (PM2)
pm2 start ecosystem.config.cjs

# Reset database
npm run db:reset
```

## 🌍 Deployment to Cloudflare Pages

```bash
# Setup Cloudflare auth
npx wrangler login

# Create D1 database
npx wrangler d1 create webapp-production

# Update wrangler.jsonc with real database_id

# Apply migrations to production
npm run db:migrate:prod

# Deploy
npm run deploy
```

## Deployment Status
- **Platform**: Cloudflare Pages
- **Status**: ✅ Running in sandbox
- **Last Updated**: 2026-03-13
