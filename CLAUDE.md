# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Badminton Digital Management — full-stack court booking/management system. React SPA frontend, Node/Express REST API backend, MySQL via Sequelize. Repo layout: `frontend/`, `backend/`, `docs/` (SRS, architecture, API design), `postman/`, `k6/` (load testing), `docker/` (compose + Dockerfiles).

## Commands

### Backend (`backend/`)
```bash
npm install
npm run dev        # nodemon dev server, http://localhost:5000
npm start           # production start
npm test            # Jest unit tests (backend/tests/)
npm test -- courtService.test.js   # single test file
npm run migrate     # sequelize-cli db:migrate
npm run seed         # sequelize-cli db:seed:all
```
Requires MySQL >= 8.0 and a `.env` (copy from `.env.example`) with `DB_*`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`.

### Frontend (`frontend/`)
```bash
npm install
npm run dev       # Vite dev server, http://localhost:5173, proxies /api -> localhost:5000
npm run build
npm run preview
npm test           # Vitest
```
`.env` needs `VITE_API_BASE_URL` (must be prefixed `VITE_` to be exposed via `import.meta.env`).

### Full stack via Docker
```bash
cd docker && docker compose up --build
```

## Architecture

### Backend layering
Standard layered Express app: `routes/` → `controllers/` → `services/` (business logic) → `models/` (Sequelize). `validations/` holds express-validator rule sets applied at the route level. `middleware/authMiddleware.js` verifies the JWT and attaches `req.user` (with `role`, `employee`, `customer` eager-loaded); `roleMiddleware.js` gates by role name; `branchContextMiddleware.js` resolves the active branch/tenant context; `requestContextMiddleware.js` sets up per-request context (used for activity logging); `errorHandler.js` is the centralized error middleware registered last in `server.js`.

All models are wired up in `models/index.js`, which is the single source of truth for associations (not each model file) — check it before adding a new relation.

Roles: `admin` (full access), `employee` (day-to-day operations: courts, bookings, checkout, customers), `customer` (own bookings only). Auth flow: `POST /api/v1/auth/login` issues a short-lived access token (15m) + refresh token (7d); `apiClient` on the frontend auto-refreshes on 401.

### Multi-tenancy migration in progress
The system is mid-migration from a flat 13-table schema to a multi-branch (tenant) model — see `backend/docs/architecture/README.md`, `TARGET_SCHEMA.md`, and `MIGRATION_ROADMAP.md` (stages M1–M7). A `Branch` model and `branchId` foreign keys have been added across most entities (`Court`, `Booking`, `CourtSession`, `Customer`, `Employee`, `Invoice`, `Payment`, `ActivityLog`) ahead of the README/docs catching up — `models/index.js` reflects current reality more reliably than `backend/README.md`'s relationship diagram. Migrations for this effort live under `backend/src/migrations/` prefixed `m1`/`m2`/`m3`; back up the DB before running them against real data.

### Core domain model
```
Branch ──< Court ──< Booking ──< CourtSession ──< SessionExtra >── Extra
                                          └── Invoice ── Payment
Role ──< User ──── Employee ──< ActivityLog
                └──── Customer
```
A `Booking` optionally becomes a `CourtSession` (the actual play session, opened/closed by staff); a session accrues `SessionExtra` (rented accessories) and settles into an `Invoice` + `Payment` at checkout.

### Frontend structure
Pages under `frontend/src/pages/<Feature>/` map roughly 1:1 to backend route groups (Courts, Bookings, Accessories, Customers, Employees, Reports, Settings). `contexts/AuthContext.jsx` and `contexts/ThemeContext.jsx` are the two global providers wrapping the router. `routes/ProtectedRoute.jsx` gates authenticated routes; `layouts/SidebarLayout.jsx` is the shared authenticated shell (desktop sidebar + mobile bottom nav). `services/apiClient.js` is the single Axios instance — it owns the auth header injection and the 401 → refresh-token → retry flow; new API calls should go through it rather than a fresh axios instance. Dark mode is the default theme, toggled via a `dark` class on `<html>` (Tailwind `darkMode: 'class'`).

### API convention
Base path `/api/v1`. Controllers return a consistent envelope: `{ success, data, message, errors }` (see `authMiddleware.js` for the shape used on auth failures — replicate it for new endpoints).
