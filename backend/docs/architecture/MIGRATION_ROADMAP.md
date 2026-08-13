# Database Migration Roadmap

From the current **13-table** MVP schema to the [target model](./TARGET_SCHEMA.md).

## PK strategy

- **M1–M3:** New and existing tables keep `INTEGER` auto-increment PKs (matches Sequelize models today).
- **Phase 4:** Optional `BIGINT` migration for high-volume tables (`payments`, `stock_movement_lines`, `audit_logs`) before franchise scale.

## Sequence

| Step | Migration | Scope | App code required before prod use |
|------|-----------|--------|-----------------------------------|
| **M1** | `20260805000001` | `organizations`, `branches`, `branch_settings`; `branch_id` on operational tables | `branchContext` middleware; default branch `1` |
| **M2** | `20260805000002` | Catalog + `sales_orders` / `sales_order_lines`; backfill from `extras` | Sales module reads/writes orders; dual-read `extras` optional |
| **M3** | `20260805000003` | `invoice_lines`, invoice metadata, payment idempotency; backfill lines | Billing uses lines; checkout sets idempotency key |
| **M4** | (planned) | Warehouses, `stock_levels`, `stock_movements` | Inventory service; stop direct `stock_quantity` updates |
| **M5** | (planned) | `permissions`, `role_permissions`, `audit_logs` writers | Authorization by permission code |
| **M6** | (planned) | `court_price_rules`, booking deposits | Pricing engine; online deposit |
| **M7+** | (planned) | Procurement, loyalty, rental, expenses | Phase 2–3 modules |

## Rollback policy

- **Development:** `npx sequelize-cli db:migrate:undo` per step.
- **Production:** Prefer forward-fix migrations; M2/M3 data transforms are not always reversible without backup.

## Dual-write window (recommended)

After **M2**, for 1–2 sprints:

1. Write new sales to `sales_order_lines`.
2. Optionally mirror to `session_extras` for old API clients.
3. Remove mirror when frontend/API only use sales orders.
