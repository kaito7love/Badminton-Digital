# Badminton Digital — Architecture Docs

| Document | Purpose |
|----------|---------|
| [TARGET_SCHEMA.md](./TARGET_SCHEMA.md) | Canonical ERD, tables, indexes, constraints, API/module layout |
| [MIGRATION_ROADMAP.md](./MIGRATION_ROADMAP.md) | M1–M7 sequence from current 13-table schema to target |

## Sequelize migrations (target path)

| Migration | File | Status |
|-----------|------|--------|
| **M1** | `20260805000001-m1-organizations-branches.js` | Tenancy + `branch_id` backfill |
| **M2** | `20260805000002-m2-catalog-sales-orders.js` | Catalog + sales orders + data from `extras` / `session_extras` |
| **M3** | `20260805000003-m3-invoice-lines-payments.js` | Invoice lines, numbering, payment idempotency |

Run after existing `20260723*` migrations:

```bash
npm run migrate
```

**Note:** M2–M3 migrate live data. Back up the database before running in production.
