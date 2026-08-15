# Phase 1 — Production Safety

## Business problem

The MVP could create duplicate bookings, sessions, inventory deductions and payments under concurrent requests. It also could not safely run after the existing M1/M3 migrations because the application did not populate branch or invoice-number fields.

## Solution

- `branch_id` is read from `X-Branch-Id` or the authenticated employee profile. Staff (`employee`, `branch_manager`) cannot select a different branch; `admin` can switch to any active branch by sending `X-Branch-Id`.
- Court, booking, session-extra and checkout write paths use database transactions and row locks.
- Booking create/update serializes work through the court row and uses `SERIALIZABLE` isolation for overlap checks.
- Invoices receive an atomic branch-scoped sequence number through `branch_document_sequences`.
- Checkout accepts `Idempotency-Key`; legacy clients receive a deterministic key based on the session.
- Cash is confirmed immediately. Transfer is `pending` until `POST /api/v1/payments/webhook` confirms it.
- Request context loads employee/customer profiles, generates `X-Request-Id`, and writes actor, branch, old/new values and entity metadata to `activity_logs`.
- `paranoid` models retain records through `deleted_at` instead of hard deleting them.

## API contract

### Branch context

Requests may send `X-Branch-Id: <id>`. If absent, the branch assigned to the logged-in employee is used. Requests that require a branch fail instead of falling back to a hard-coded branch.

This resolves differently by role (`branchContextMiddleware.js`):
- **`admin`** may send `X-Branch-Id` for any active branch to view/operate on it — admins have no `employees.branchId` of their own, so without the header no branch context is set at all (routes that don't require one, e.g. `GET /api/v1/branches`, still work; branch-scoped routes need the header).
- **`employee` / `branch_manager`** are locked to the branch on their `Employee` profile: sending `X-Branch-Id` for a *different* branch than their own is rejected with 403 ("Nhân viên không được phép thao tác tại chi nhánh này."), not silently ignored.

`GET /api/v1/branches` (admin-only) lists active branches for the branch switcher.

### Checkout

`POST /api/v1/payments/checkout` accepts the existing payload plus an optional `Idempotency-Key` header. Clients should persist and reuse the same key while retrying the same checkout.

### Webhook

`POST /api/v1/payments/webhook`

```json
{
  "provider": "vietqr",
  "providerReference": "provider-transaction-id",
  "invoiceNo": "BD-1-00000001",
  "status": "paid"
}
```

Set `PAYMENT_WEBHOOK_SECRET` and send it in `X-Webhook-Secret` in production. The endpoint only accepts a `paid` transition from `pending` or `processing`.

## Migration order

Run the existing migrations M1, M2 and M3, then `20260805000004-p1-production-safety.js`:

```bash
npm run migrate
```

Back up production data first. M1–M3 remain required dependencies because this migration extends their branch, invoice and idempotency schema.

## Affected areas

- Models and associations: branch context, document sequence, payment/invoice/audit fields, soft-delete/version metadata.
- Middleware: request ID, authenticated employee/customer profile, branch resolution.
- Services: courts, bookings, accessories, customers, employees and payments.
- Routes: all authenticated operational routes receive branch context; payment webhook remains public but is secret-protected when configured.
- Frontend: checkout submits an idempotency header.

## Verification

```bash
npm test -- --runInBand
node --check src/services/PaymentService.js
```
