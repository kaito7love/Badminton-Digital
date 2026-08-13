# Target Schema — Badminton Digital

CTO target data model for a **branch-aware** badminton center OS: courts, booking, session POS, catalog, inventory ledger, billing, and growth modules.

See [MIGRATION_ROADMAP.md](./MIGRATION_ROADMAP.md) for how to get there from the current schema.

---

## 1. Design principles

1. **`branch_id` on operational data** — Every court, sale, and stock movement belongs to a site (required for multi-branch and franchise).
2. **Ledgers for money and stock** — Balances are derived from `payments` and `stock_movements`, not silent column updates.
3. **Orders before payments** — `sales_orders` → `invoices` → `payments`; court time is an invoice line, not a orphan total.
4. **Session is a sales channel** — `sales_orders.channel = 'session'` replaces `session_extras` as the long-term model.

---

## 2. Entity catalog (by bounded context)

### Organization

| Table | Purpose |
|-------|---------|
| `organizations` | Legal entity (tax id, name) |
| `branches` | Physical center (timezone, address) |
| `branch_settings` | Key/value JSON per branch (branding, VietQR, hours) |

### Identity & access

| Table | Purpose |
|-------|---------|
| `roles`, `permissions`, `role_permissions` | RBAC beyond admin/employee/customer |
| `users` | Login identity |
| `user_branch_assignments` | Which branches a staff user may access |
| `employees`, `customers` | Staff and CRM profiles |

### Court & booking

| Table | Purpose |
|-------|---------|
| `court_types` | Standard vs premium courts |
| `courts` | Play surfaces per branch |
| `court_price_rules` | Peak/off-peak by day and effective dates |
| `court_blocks` | Manual closures (events, holidays) |
| `court_maintenance_logs` | Repair history |
| `bookings` | Reserved slots |
| `court_sessions` | Live play |
| `booking_deposits` | (M6) Prepay linked to payments |

### Catalog & sales

| Table | Purpose |
|-------|---------|
| `product_categories` | Drinks, shuttles, grips, … |
| `products`, `product_variants` | Sellable/rentable SKUs |
| `product_barcodes`, `product_images` | POS scan & storefront |
| `sales_orders`, `sales_order_lines` | POS / session / online carts |

**Legacy:** `extras`, `session_extras` — retired after M2 backfill (keep read-only during dual-write).

### Inventory & procurement (M4+)

| Table | Purpose |
|-------|---------|
| `warehouses`, `warehouse_locations` | Main store vs counter |
| `stock_levels` | On-hand and reserved per variant |
| `stock_movements`, `stock_movement_lines` | Audit trail (sale, receipt, adjust, …) |
| `suppliers`, `purchase_orders`, `goods_receipts` | Restock shuttlecocks |

### Billing

| Table | Purpose |
|-------|---------|
| `invoices`, `invoice_lines` | Legal/tax-friendly bills |
| `payments` | Idempotent settlement |
| `refunds` | Returns and corrections |

### Growth (Phase 3+)

| Table | Purpose |
|-------|---------|
| `membership_plans`, `memberships` | Member court pricing |
| `vouchers`, `voucher_redemptions` | Campaigns |
| `loyalty_accounts`, `loyalty_transactions` | Points |
| `rental_agreements`, … | Racket rental |
| `expense_categories`, `expenses` | Profit reporting |

### Platform

| Table | Purpose |
|-------|---------|
| `audit_logs` | Who changed money/stock |
| `domain_outbox` | Async notifications and integrations |

---

## 3. Core ERD (M1–M3 scope)

```mermaid
erDiagram
  organizations ||--o{ branches : has
  branches ||--o{ branch_settings : config
  branches ||--o{ courts : has
  branches ||--o{ sales_orders : sells
  branches ||--o{ invoices : issues

  courts ||--o{ bookings : reserves
  bookings ||--o| court_sessions : may_start
  court_sessions ||--o| sales_orders : session_channel
  sales_orders ||--o{ sales_order_lines : contains
  product_variants ||--o{ sales_order_lines : sku

  court_sessions ||--o| invoices : bills
  sales_orders ||--o| invoices : optional_merge
  invoices ||--o{ invoice_lines : detail
  invoices ||--o{ payments : paid_by

  products ||--o{ product_variants : has
  product_categories ||--o{ products : groups
```

---

## 4. Indexes (M1–M3 minimum)

| Table | Index |
|-------|--------|
| `branches` | UNIQUE `(organization_id, code)` |
| `courts` | `(branch_id, status)` |
| `bookings` | `(branch_id, court_id, booking_date, start_time, end_time)` |
| `court_sessions` | `(branch_id, court_id, status)` |
| `product_variants` | UNIQUE `(sku)` |
| `sales_orders` | `(branch_id, session_id, status)` |
| `sales_order_lines` | `(sales_order_id)` |
| `invoices` | UNIQUE `(branch_id, invoice_no)` |
| `invoice_lines` | `(invoice_id)` |
| `payments` | UNIQUE `(idempotency_key)` where not null |
| `payments` | `(branch_id, confirmed_at, status)` — use `paid_at` until M3 adds `confirmed_at` |

---

## 5. Constraints & rules

| Rule | Enforcement |
|------|-------------|
| One active session per court | Transaction + unique partial logic in `OpenSession` (app); optional generated column in MySQL 8+ later |
| No overlapping confirmed bookings | Serializable transaction or lock row per `(branch_id, court_id, booking_date)` |
| Invoice total = sum(lines) | Application service; reconcile job in Phase 2 |
| Payment idempotency | UNIQUE `idempotency_key` on `payments` |
| Stock changes | M4+: only via `stock_movements` |

---

## 6. Module & folder layout

```
src/modules/
  organization/   # branches, settings
  identity/       # auth, RBAC
  court/          # courts, pricing, maintenance
  booking/
  session/
  catalog/        # products, variants
  sales/          # sales_orders
  billing/        # invoices, payments
  inventory/      # M4+
  reporting/      # read-only
  audit/
```

Cross-module calls go through **application services** or **outbox events**, not direct cross-table updates from random services.

---

## 7. API surface (target)

- Header **`X-Branch-Id`**: required for staff operations (default branch `1` until UI exists).
- Header **`Idempotency-Key`**: required on `POST .../payments` and checkout.
- Resources: `/branches`, `/courts`, `/bookings`, `/sessions`, `/products`, `/sales-orders`, `/invoices`, `/payments`.

Full endpoint list lives in the root [README](../../README.md); expand as modules land.

---

## 8. Phase mapping

| Phase | Schema focus |
|-------|----------------|
| **1 MVP** | M1–M3 + app fixes (idempotent checkout, audit stub) |
| **2 Production** | M4–M6, refunds, deposits, full RBAC |
| **3 Growth** | Membership, vouchers, rental, expenses |
| **4 Enterprise** | Franchise org billing, BIGINT PKs, read replicas, asset module |
