# Database Migration Roadmap

From the current **13-table** MVP schema to the [target model](./TARGET_SCHEMA.md).

## PK strategy

- **M1–M3:** New and existing tables keep `INTEGER` auto-increment PKs (matches Sequelize models today).
- **Phase 4:** Optional `BIGINT` migration for high-volume tables (`payments`, `stock_movements`, `activity_logs`) before franchise scale.

## Sequence

| Step | Migration | Scope | App code required before prod use | Status |
|------|-----------|--------|-----------------------------------|--------|
| **M1** | `20260805000001` | `organizations`, `branches`, `branch_settings`; `branch_id` on operational tables | `branchContext` middleware; default branch `1` | Done |
| **M2** | `20260805000002` | Catalog + `sales_orders` / `sales_order_lines`; backfill from `extras` | Sales module reads/writes orders; dual-read `extras` optional | Schema-only — see note below |
| **M3** | `20260805000003` | `invoice_lines`, invoice metadata, payment idempotency; backfill lines | Billing uses lines; checkout sets idempotency key | Done |
| **M4** | `20260815000002-inventory-foundation.js` | `suppliers`, `extra_stocks`, `stock_movements`, `goods_receipts`, `goods_receipt_items`; drops `extras.stock_quantity` | `InventoryService`/`SupplierService`/`GoodsReceiptService`; `POST /api/v1/inventory/adjustments`, `/api/v1/goods-receipts`, `/api/v1/suppliers` | Done — scope diverged from the original plan, see note below |
| **M5** | (planned) | `permissions`, `role_permissions`, `audit_logs` writers | Authorization by permission code | Planned. Partial step landed outside this track — see "Identity/auth track" below |
| **M6** | (planned) | `court_price_rules`, booking deposits | Pricing engine; online deposit | Planned |
| **M7+** | (planned) | Procurement, loyalty, rental, expenses | Phase 2–3 modules | Planned |

**M2 note:** the `sales_orders`/`sales_order_lines`/`products`/`product_variants` tables from `20260805000002-m2-catalog-sales-orders.js` exist in the database but were never wired up at the application layer — there are no `SalesOrder`/`ProductVariant` Sequelize models in `models/index.js` and no service/controller references them. The "dual-write window" described below never started; `extras`/`session_extras` has remained the only live sales path.

**M4 note — actual scope vs. plan:** M4 shipped as `20260815000002-inventory-foundation.js` (merged in `2ca2672`), but it does not match the `warehouses` / `stock_levels` design this roadmap had sketched, and it was built directly on top of the legacy `extras` catalog rather than the M2 `product_variants` catalog (consistent with the M2 note above — M2's catalog was never adopted, so M4 couldn't build on it):

- No `warehouses` / `warehouse_locations` tables — stock is tracked per `(extra_id, branch_id)` directly in `extra_stocks` (one row per product per branch, with `quantity` and a running weighted-average `average_cost`). There is no separate "location" concept.
- `stock_movements` matches the planned name and role (immutable ledger of every stock change — `opening_balance`, `purchase_receipt`, `sale`, `sale_return`, `adjustment_in`, `adjustment_out`, `damaged`, `lost`), but there is no `stock_movement_lines` split — each movement row already represents one line.
- `suppliers` and `goods_receipts`/`goods_receipt_items` match the planned procurement tables (originally slated for M7 "Procurement"), so procurement landed early, bundled with M4, and without a `purchase_orders` table — a `GoodsReceipt` is created directly (no PO-to-receipt matching step).
- `InventoryService.postMovement` is the sole write path to `extra_stocks.quantity` (see `backend/src/services/InventoryService.js`), matching this roadmap's original "Stock changes: M4+ only via `stock_movements`" constraint (§5 of `TARGET_SCHEMA.md`).
- Application code has fully cut over: `AccessoryService` (session extras add/return) and `accessoryController`/`AccessoryService` (`extras` CRUD) now read stock through `ExtraStock`/`InventoryService`, and `extras.stock_quantity` no longer exists as a column.

## Identity / auth track (parallel, not part of the M1–M7 inventory/sales sequence)

Three migrations landed in the same merge (`2ca2672`) that don't fit the M1–M7 numbering — they're identity/access changes, not warehouse/pricing/procurement schema. Tracked here as their own sequence:

| Migration | Scope | App code required before prod use | Status |
|-----------|-------|-------------------------------------|--------|
| `20260815000001-users-login-by-phone.js` | `users.phone` becomes unique + login identity; `users.email` becomes nullable; `CHECK (email IS NOT NULL OR phone IS NOT NULL)` | `AuthService.login` accepts `identifier` (phone-or-email); `POST /api/v1/auth/register` for customer self-signup | Done |
| `20260815300001-unify-customers-chain-wide.js` | Drops `customers.branch_id`; merges duplicate per-branch customer profiles that share a phone number (auto-merge when at most one has a linked `user_id`, otherwise logged to `customer_merge_audit` for manual review); unique index moves from `(branch_id, phone)` to `(phone)` | `AuthService.register` looks up existing walk-in `Customer` by phone (chain-wide) before creating a new profile | Done |
| `20260815300002-add-branch-manager-role.js` + seed `20260815300003-seed-branch-managers.js` | New `branch_manager` row in `roles` | `roleMiddleware(['admin', 'branch_manager', ...])` used across most branch-scoped routes (courts, employees, reports, inventory, suppliers, goods receipts, sessions) | Done — role exists and is authorized on routes, but there is no dedicated permission table (`permissions`/`role_permissions` from planned M5) behind it; it's a hardcoded role name, same mechanism as `admin`/`employee`/`customer`. `branchContextMiddleware` treats `branch_manager` like `employee` for branch-locking (only `role.name === 'admin'` may switch branches via `X-Branch-Id`) |

`docs/APIDesign.md` §1.7 documents `branch_manager` as a fourth role alongside `Admin`/`Employee`/`Customer`.

## Rollback policy

- **Development:** `npx sequelize-cli db:migrate:undo` per step.
- **Production:** Prefer forward-fix migrations; M2/M3 data transforms are not always reversible without backup.

## Dual-write window (recommended, not yet started)

After **M2**, for 1–2 sprints:

1. Write new sales to `sales_order_lines`.
2. Optionally mirror to `session_extras` for old API clients.
3. Remove mirror when frontend/API only use sales orders.

As of this writing this window has not started — see the M2 note above. M4's inventory ledger (`stock_movements`) was instead built directly against `extras`/`session_extras`, so a future cutover to `sales_orders` would additionally need to reconcile or replace the M4 stock ledger's `extra_id` foreign key with `product_variant_id`.
