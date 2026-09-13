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
npm run migrate     # sequelize-cli db:migrate (also creates the admin/employee/customer/branch_manager roles)
npm run seed         # sequelize-cli db:seed:all — demo data with public passwords; refuses under NODE_ENV=production unless ALLOW_DEMO_SEED=true
npm run create-admin # first admin for a real install, from ADMIN_EMAIL / ADMIN_PASSWORD (>= 12 chars) / ADMIN_FULL_NAME env vars
```
Requires MySQL >= 8.0 and a `.env` (copy from `.env.example`) with `DB_*`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — two different random strings of 32+ chars; the server refuses to boot on the old placeholder values or identical secrets.

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

Roles: `admin` (full access, all branches, can switch active branch via `X-Branch-Id`), `branch_manager` (same operational scope as `admin` — courts, employees, reports, inventory — but locked to their own branch; added in migration `20260815300002-add-branch-manager-role.js` and already gated on most routes and frontend routes/nav, not just a DB stub), `employee` (day-to-day operations within their branch: courts, bookings, checkout, customers, inventory), `customer` (own bookings only, can self-register). Auth flow: `POST /api/v1/auth/login` takes an `identifier` (phone number or email) + password and issues a short-lived access token (15m) + refresh token (7d); `apiClient` on the frontend auto-refreshes on 401. Refresh tokens are stored as sha256 only.

Secrets and staff accounts: the `User` model's `defaultScope` excludes `passwordHash`/`refreshToken` (Sequelize applies it to includes too) — only `AuthService` loads them, via `User.scope('withSecrets')`. `errorHandler.js` must never return raw `err.errors`: Sequelize error items carry the whole record in `instance`, so it only emits `[{ field, message }]`. Editing/deleting staff accounts goes through `EmployeeService.assertCanManage` (branch_manager may touch only `employee` accounts; nobody deletes an admin or themselves), mirrored for the UI in `frontend/src/utils/roles.js#canManageStaff`.

Money flows: bank transfer is off unless `PAYMENT_BANK_ID`/`PAYMENT_BANK_ACCOUNT_NO`/`PAYMENT_BANK_ACCOUNT_NAME` and a 32+ char `PAYMENT_WEBHOOK_SECRET` are all set (`utils/paymentConfig.js`) — `generateVietQRUrl` returns null otherwise, and court checkout, POS and online orders reject `transfer` with 400. `POST /payments/webhook` is fail-closed (`middleware/paymentWebhookAuth.js`: 503 unconfigured, 401 bad secret) and requires an `amount` matching the payment; rejections are audited as `payment.webhook_rejected`. Court fees use interval overlap with the branch-local peak window (`priceCalculator.calculateCourtFee`), and a court transfer accrues the finished segment into `court_sessions.accrued_court_fee`/`billed_from` — anything that bills a session must go through `calculateSessionCourtFee`, never recompute from `startTime`. Manual discounts need a reason and are capped for `employee` by setting `discount_policy` (`utils/discountPolicy.js`). Open online transfer orders hold a voucher use (`VoucherService.countUsage`).

### Multi-tenancy migration in progress
The system is mid-migration from a flat 13-table schema to a multi-branch (tenant) model — see `backend/docs/architecture/README.md`, `TARGET_SCHEMA.md`, and `MIGRATION_ROADMAP.md` (stages M1–M7). A `Branch` model and `branchId` foreign keys have been added across most entities (`Court`, `Booking`, `CourtSession`, `Employee`, `Invoice`, `Payment`, `ActivityLog`, and the newer inventory models `ExtraStock`/`StockMovement`/`GoodsReceipt`) — but deliberately *not* `Customer`: migration `20260815300001-unify-customers-chain-wide.js` dropped `branch_id` from `customers` so one customer identity (matched by phone) spans every branch in the chain, rather than being re-created per branch. `models/index.js` is still the source to check before trusting any relationship diagram elsewhere. Migrations for this effort live under `backend/src/migrations/` prefixed `m1`/`m2`/`m3` plus later dated ones; back up the DB before running them against real data.

### Core domain model
```
Branch ──< Court ──< Booking ──< CourtSession ──< SessionExtra >── Extra
                                          └── Invoice ── Payment
Role ──< User ──── Employee ──< ActivityLog
                └──── Customer
```
A `Booking` optionally becomes a `CourtSession` (the actual play session, opened/closed by staff); a session accrues `SessionExtra` (rented accessories) and settles into an `Invoice` + `Payment` at checkout.

### Frontend structure
Pages under `frontend/src/pages/<Feature>/` map roughly 1:1 to backend route groups (Courts, Bookings, Accessories, Customers, Employees, Reports, Settings). `contexts/AuthContext.jsx`, `contexts/ThemeContext.jsx`, and `contexts/BranchContext.jsx` (admin's active-branch switcher) are the global providers wrapping the router. `routes/ProtectedRoute.jsx` gates authenticated routes; `layouts/SidebarLayout.jsx` is the shared authenticated shell (desktop sidebar + mobile bottom nav). `services/apiClient.js` is the single Axios instance — it owns the auth header injection and the 401 → refresh-token → retry flow; new API calls should go through it rather than a fresh axios instance. Dark mode is the default theme, toggled via a `dark` class on `<html>` (Tailwind `darkMode: 'class'`).

### API convention
Base path `/api/v1`. Controllers return a consistent envelope: `{ success, data, message, errors }` (see `authMiddleware.js` for the shape used on auth failures — replicate it for new endpoints).
