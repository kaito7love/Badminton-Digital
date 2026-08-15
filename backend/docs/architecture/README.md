# Badminton Digital — Architecture Docs

| Document | Purpose |
|----------|---------|
| [TARGET_SCHEMA.md](./TARGET_SCHEMA.md) | Canonical ERD, tables, indexes, constraints, API/module layout |
| [MIGRATION_ROADMAP.md](./MIGRATION_ROADMAP.md) | M1–M7 sequence from current 13-table schema to target |

## Sequelize migrations (target path)

| Migration | File | Status |
|-----------|------|--------|
| **M1** | `20260805000001-m1-organizations-branches.js` | Tenancy + `branch_id` backfill |
| **M2** | `20260805000002-m2-catalog-sales-orders.js` | Catalog + sales orders tables created; **not adopted at the app layer** — no `SalesOrder`/`ProductVariant` models exist, `extras`/`session_extras` remains the live sales path |
| **M3** | `20260805000003-m3-invoice-lines-payments.js` | Invoice lines, numbering, payment idempotency |
| **M4** | `20260815000002-inventory-foundation.js` | `suppliers`, `extra_stocks`, `stock_movements`, `goods_receipts`/`goods_receipt_items`; drops `extras.stock_quantity`. Built on the legacy `extras` catalog, not M2's `product_variants` — see `MIGRATION_ROADMAP.md` for how the shipped scope differs from the original M4 plan |

Plus a parallel identity/auth track (not part of the M1–M7 numbering — see `MIGRATION_ROADMAP.md`): phone-number login (`20260815000001-users-login-by-phone.js`), chain-wide customer unification (`20260815300001-unify-customers-chain-wide.js`), and the `branch_manager` role (`20260815300002-add-branch-manager-role.js`).

Run after existing `20260723*` migrations:

```bash
npm run migrate
```

**Note:** M2–M4 and the identity/auth migrations transform or migrate live data (M4 zeroes out existing stock; the customer-unification migration merges/deletes duplicate profiles). Back up the database before running any of them in production.
