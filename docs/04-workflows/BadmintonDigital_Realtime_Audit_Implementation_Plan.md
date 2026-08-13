# Realtime Logic Audit & Implementation Plan
## Badminton Digital — Court Operation + Booking + POS

**Purpose:**  
Tài liệu này dùng làm checklist để Codex **kiểm tra codebase hiện tại trước khi implement realtime**. Codex KHÔNG được giả định rằng kiến trúc đề xuất trong tài liệu đã tồn tại. Phải audit implementation hiện tại, xác định gap, dependency, inconsistency và chỉ sau đó mới đề xuất/triển khai thay đổi.

**Scope:**
- Court Operation realtime
- Booking realtime
- POS / Checkout realtime
- Concurrency & transaction safety
- Branch isolation
- WebSocket / Socket.IO
- Reconnection & state resync
- Audit logging

---

# 1. Quy tắc bắt buộc trước khi code

Codex phải thực hiện theo thứ tự:

1. Inspect toàn bộ backend liên quan.
2. Inspect models, migrations, services, controllers/routes.
3. Inspect frontend state management và các màn hình liên quan.
4. Inspect authentication/authorization và branch context.
5. Inspect transaction/concurrency handling hiện tại.
6. Inspect API hiện tại.
7. Inspect realtime/WebSocket infrastructure nếu đã tồn tại.
8. Đối chiếu implementation thực tế với tài liệu này.
9. Xuất audit report trước khi thay đổi code.
10. Chỉ implement sau khi xác định rõ các thay đổi cần thiết.

**Không được:**
- tự giả định model/service đã có.
- tạo duplicate state chỉ để phục vụ UI realtime.
- thêm Redis/Kafka nếu chưa có nhu cầu thực tế.
- emit WebSocket event trước khi transaction commit.
- dùng WebSocket làm source of truth.
- bỏ qua branch isolation.
- chỉ sửa frontend mà không đảm bảo backend/database consistency.

---

# 2. Source of Truth

Database là source of truth.

Realtime layer chỉ có nhiệm vụ phân phối state changes.

```text
Database
   ↓
Transaction
   ↓
Commit
   ↓
Domain Event
   ↓
WebSocket
   ↓
Connected Clients
```

Nếu WebSocket disconnect:

```text
Reconnect
   ↓
Fetch current snapshot
   ↓
Replace local state
```

Không được coi client state hoặc WebSocket event history là authoritative state.

---

# 3. Court State Model

## 3.1 Court operational state

Kiểm tra implementation hiện tại của `Court.status`.

Target semantics:

```text
ACTIVE
MAINTENANCE
INACTIVE
```

Không dùng `Court.status` để biểu diễn:

```text
AVAILABLE
PLAYING
```

## 3.2 CourtSession state

Target:

```text
PLAYING
COMPLETED
CANCELLED
```

Recommended fields:

```text
started_at
ended_at
opened_by_employee_id
closed_by_employee_id
```

Nếu codebase hiện tại đang dùng:

```text
start_time
end_time
employee_id
```

Codex phải audit impact trước khi rename/migrate.

## 3.3 Derived current court state

Current state phải được derive:

```text
IF court.status = MAINTENANCE
    → MAINTENANCE

ELSE IF court.status = INACTIVE
    → INACTIVE

ELSE IF active PLAYING session exists
    → PLAYING

ELSE
    → AVAILABLE
```

Target API representation:

```json
{
  "courtId": 1,
  "state": "PLAYING",
  "session": {
    "id": 100,
    "customerId": 20,
    "startedAt": "2026-08-11T19:30:00+07:00"
  }
}
```

---

# 4. Active Court Session Concurrency

Invariant bắt buộc:

> Một court chỉ được có tối đa một active `PLAYING` session.

Audit:

- Có transaction khi mở sân không?
- Có row lock không?
- Có check active session không?
- Có database-level protection phù hợp không?
- Hai request đồng thời có thể tạo 2 active sessions không?

Target flow:

```text
BEGIN
  ↓
SELECT court FOR UPDATE
  ↓
Validate court
  ↓
Check active PLAYING session
  ↓
Create session
  ↓
Write audit log
  ↓
COMMIT
  ↓
Emit event
```

Expected concurrent behavior:

```text
Employee A → Open Court 1 → SUCCESS
Employee B → Open Court 1 → CONFLICT
```

Không được tạo:

```text
Court 1
├── Session A PLAYING
└── Session B PLAYING
```

---

# 5. Court Open / Close Lifecycle

## 5.1 Open Court

Audit hiện tại:

- endpoint
- controller
- service
- transaction
- employee attribution
- booking validation
- active session validation
- activity log
- event emission

Target:

```text
POST /court-sessions
        ↓
transaction
        ↓
create PLAYING session
        ↓
commit
        ↓
court.session.started
```

## 5.2 Close Court

Target:

```text
POST /court-sessions/:id/close
        ↓
BEGIN
        ↓
lock session
        ↓
validate PLAYING
        ↓
calculate duration
        ↓
calculate court fee
        ↓
mark COMPLETED
        ↓
COMMIT
        ↓
emit court.session.completed
```

Important:

> Closing a session is NOT automatically identical to payment completion.

---

# 6. Booking Logic

Audit:

- booking creation
- confirmation
- cancellation
- completion
- overlap detection
- branch isolation
- concurrency protection
- realtime events

Overlap rule:

```text
existing.start < requested.end
AND
existing.end > requested.start
```

Only active booking states should participate in overlap validation:

```text
PENDING
CONFIRMED
```

Cancelled bookings should not block availability.

Target lifecycle:

```text
PENDING
   ↓
CONFIRMED
   ↓
COMPLETED

or

PENDING / CONFIRMED
   ↓
CANCELLED
```

If the system requires `NO_SHOW`, audit whether it already exists before introducing it.

---

# 7. Booking vs CourtSession

These are different concepts.

```text
Booking
→ planned/scheduled reservation

CourtSession
→ actual physical usage
```

Example:

```text
Booking:
20:00 → 21:00

Actual session:
20:07 → 21:13
```

Do not overwrite booking schedule with actual usage time.

Target session fields:

```text
started_at
ended_at
duration_seconds
```

---

# 8. POS Lifecycle

Required separation:

```text
CourtSession
    ↓
END SESSION
    ↓
Calculate charges
    ↓
Invoice
    ↓
Payment
```

Do not assume:

```text
close court = paid
```

Invoice lifecycle:

```text
DRAFT
  ↓
ISSUED
  ↓
PAID

ISSUED
  ↓
VOID
```

Payment lifecycle must be audited against the existing implementation.

Target principle:

```text
Payment success
    ↓
Invoice PAID
    ↓
Customer financial aggregate update
    ↓
Audit log
```

All financial mutations must be transactional.

---

# 9. Payment Concurrency & Idempotency

Audit:

- `idempotency_key`
- unique constraint
- payment retry
- duplicate payment handling
- invoice locking
- payment amount validation

Payment amount should not allow an invalid successful payment with `NULL` amount.

If the current implementation supports only:

```text
1 Invoice → 1 Payment
```

document this explicitly.

Do NOT silently change it to 1:N without auditing the existing payment flow.

If future requirements need partial/multiple payments:

```text
Invoice 1
   ↓
Payments N
```

then migration impact must be documented separately.

---

# 10. Inventory / Extras

Audit:

- stock decrement
- session extras
- duplicate extra lines
- checkout transaction
- stock race condition

Required atomic flow:

```text
BEGIN
  ↓
SELECT extra FOR UPDATE
  ↓
Check stock >= quantity
  ↓
Decrement stock
  ↓
Create/update session extra
  ↓
COMMIT
```

Concurrent case:

```text
stock = 1

Employee A buys 1
Employee B buys 1
```

Expected:

```text
A → SUCCESS
B → OUT_OF_STOCK
```

Never allow:

```text
stock = -1
```

---

# 11. Invoice Items

Audit whether current POS needs detailed invoice line items.

Current summary fields may include:

```text
court_fee
extras_fee
discount_amount
total_amount
```

If detailed POS receipts are required, consider:

```text
invoice_items
----------------
id
invoice_id
item_type
reference_id
name_snapshot
quantity
unit_price
subtotal
```

Example:

```text
COURT
Sân 01
2 hours
150,000

EXTRA
Nước suối
2
10,000
```

Codex must inspect the current frontend receipt/invoice requirements before implementing this.

---

# 12. Branch Isolation

Every realtime operation must be scoped to branch.

Expected:

```text
branch:1
branch:2
```

A client connected to Branch 1 must not receive Branch 2 events.

Audit:

- `X-Branch-Id`
- branch middleware
- authenticated user's branch authorization
- service-level branch filtering
- websocket branch authorization
- model relationships

Important invariant:

```text
entity.branch_id
must match
request/context branch
```

Also verify cross-branch relationships:

```text
booking.branch_id == court.branch_id
session.branch_id == court.branch_id
invoice.branch_id == session.branch_id
payment.branch_id == invoice.branch_id
```

Do not rely only on frontend filtering.

---

# 13. Realtime Infrastructure

Audit whether the project already uses:

- Socket.IO
- native WebSocket
- SSE
- polling
- another realtime mechanism

If no realtime infrastructure exists, preferred MVP implementation:

```text
Node.js
+
Socket.IO
+
MySQL
```

Do NOT add Redis for a single-branch MVP unless the existing architecture or deployment requires it.

---

# 14. Authentication & WebSocket Authorization

WebSocket connections must authenticate the user.

Audit:

- JWT validation
- refresh token behavior
- user role
- employee/branch relationship
- branch subscription authorization

Do not allow:

```text
client → join branch:999
```

without authorization.

---

# 15. Branch Rooms

Target model:

```text
User connects
    ↓
authenticate
    ↓
resolve authorized branch
    ↓
join branch:{branchId}
```

Events are emitted only to:

```text
branch:{branchId}
```

Example:

```text
io.to(`branch:${branchId}`).emit(...)
```

Do not broadcast all branch events globally.

---

# 16. Event Contract

All realtime events should use a consistent envelope:

```json
{
  "event": "court.session.started",
  "branchId": 1,
  "occurredAt": "2026-08-11T19:30:02+07:00",
  "requestId": "req-123",
  "data": {}
}
```

Recommended events:

### Court

```text
court.updated
court.maintenance_started
court.maintenance_ended
```

### Session

```text
court.session.started
court.session.updated
court.session.completed
court.session.cancelled
```

### Booking

```text
booking.created
booking.updated
booking.confirmed
booking.cancelled
booking.completed
```

### POS

```text
session.extra_added
session.extra_removed
invoice.created
invoice.updated
payment.created
payment.processing
payment.paid
payment.failed
payment.refunded
```

Do not invent additional event types until the existing use cases are audited.

---

# 17. Event Timing

Critical rule:

> Emit realtime events ONLY AFTER the database transaction commits successfully.

Correct:

```text
BEGIN
 ↓
DB mutations
 ↓
COMMIT
 ↓
emit event
```

Incorrect:

```text
BEGIN
 ↓
emit event
 ↓
DB mutation
 ↓
ROLLBACK
```

The second approach can create UI state that never actually existed in the database.

---

# 18. Court Snapshot API

Realtime must have a REST fallback/resync mechanism.

Target:

```text
GET /api/v1/courts/state
```

Response should contain enough information to reconstruct the current branch dashboard:

```json
{
  "branchId": 1,
  "courts": [
    {
      "id": 1,
      "name": "Court 01",
      "state": "AVAILABLE",
      "session": null,
      "nextBooking": {
        "id": 200,
        "startTime": "20:00",
        "endTime": "21:00"
      }
    }
  ]
}
```

The exact endpoint/path must be aligned with the project's existing API conventions.

---

# 19. Reconnection & Resync

Required behavior:

```text
WebSocket connected
       ↓
receive events

connection lost
       ↓
state may become stale

connection restored
       ↓
request current snapshot
       ↓
replace local state
```

Do not assume no events were missed.

MVP does not need an event replay system unless the current architecture already has one.

---

# 20. Live Timer

Do NOT send a WebSocket event every second.

Database stores:

```text
started_at
```

Frontend calculates:

```text
elapsed = now - started_at
```

Frontend updates the timer locally.

WebSocket only informs the client:

```text
SESSION_STARTED
SESSION_COMPLETED
```

---

# 21. Audit Logging

Existing `activity_logs` should remain the long-term audit source.

Actions to audit where applicable:

```text
OPEN_COURT
CLOSE_COURT
START_SESSION
CANCEL_SESSION

CREATE_BOOKING
CONFIRM_BOOKING
CANCEL_BOOKING

ADD_EXTRA
REMOVE_EXTRA

CREATE_INVOICE
VOID_INVOICE

CREATE_PAYMENT
CONFIRM_PAYMENT
REFUND_PAYMENT
```

Realtime events are NOT audit logs.

Audit log:

```text
long-term history
```

WebSocket event:

```text
temporary client notification
```

---

# 22. Client State Strategy

Frontend should have:

```text
Initial REST snapshot
        ↓
Subscribe WebSocket
        ↓
Apply events
        ↓
Reconnect
        ↓
REST snapshot again
```

Avoid maintaining multiple conflicting state sources.

Example:

```text
Court Store
├── courts
├── activeSessions
├── bookings
└── invoices
```

The exact implementation must follow the existing frontend architecture after audit.

---

# 23. Testing Requirements

Codex must inspect existing tests first.

Required test scenarios:

## Court

```text
[ ] Open available court
[ ] Open already playing court
[ ] Close playing court
[ ] Close already completed session
[ ] Maintenance court cannot be opened
[ ] Concurrent open
```

## Booking

```text
[ ] Create booking
[ ] Overlapping booking rejected
[ ] Cancel booking frees availability
[ ] Concurrent booking requests
[ ] Cross-branch booking rejected
```

## POS

```text
[ ] Add extra
[ ] Remove extra
[ ] Insufficient stock
[ ] Concurrent stock decrement
[ ] Close session creates invoice
[ ] Payment success
[ ] Duplicate payment request
```

## Realtime

```text
[ ] Two clients receive same branch event
[ ] Other branch does not receive event
[ ] Event is not emitted after rollback
[ ] Client reconnects and resyncs
[ ] Unauthorized branch subscription rejected
```

---

# 24. Load / Reliability Tests

After functional correctness:

```text
[ ] concurrent court operations
[ ] concurrent booking creation
[ ] concurrent inventory decrement
[ ] multiple websocket clients
[ ] reconnect storm
[ ] event ordering
[ ] API + websocket simultaneously
```

Do not optimize prematurely.

For MVP one branch:

```text
Node.js + Socket.IO + MySQL
```

is the default target unless the current deployment architecture proves otherwise.

---

# 25. Required Codex Audit Output

Before implementation, Codex must produce:

## A. Current Architecture

```text
Backend:
Frontend:
Database:
Realtime:
Authentication:
Branch context:
Transaction handling:
```

## B. Existing Implementation

For each:

```text
Court Operation
Booking
CourtSession
Invoice
Payment
Inventory
Realtime
```

report:

```text
Implemented
Partially implemented
Missing
Broken
```

## C. Gap Analysis

Table:

| Area | Current | Target | Gap | Priority |
|---|---|---|---|---|
| Court state | | | | |
| Active session | | | | |
| Booking overlap | | | | |
| POS | | | | |
| Inventory | | | | |
| WebSocket | | | | |
| Branch isolation | | | | |
| Reconnect | | | | |
| Audit | | | | |

Priority:

```text
P0 = correctness/data corruption/security
P1 = required functionality
P2 = scalability/optimization
```

## D. Files Affected

Codex must list exact files before modification:

```text
Models:
Migrations:
Services:
Controllers:
Routes:
Socket:
Middleware:
Frontend:
Tests:
Docs:
```

## E. Implementation Order

Codex must provide an ordered implementation plan and explain dependencies.

---

# 26. Definition of Done

Realtime implementation is NOT complete until:

```text
[ ] Court state has one clear source of truth
[ ] One court cannot have two active sessions
[ ] Booking overlap is concurrency-safe
[ ] Court open/close is transactional
[ ] POS inventory update is transactional
[ ] Invoice/payment lifecycle is consistent
[ ] Branch isolation is enforced
[ ] WebSocket authentication exists
[ ] WebSocket rooms are branch-scoped
[ ] Events use a consistent contract
[ ] Events emit only after commit
[ ] Dashboard receives cross-client updates
[ ] Reconnect triggers state resync
[ ] Live timer is client-side
[ ] Audit logs remain persistent
[ ] Concurrent operations are tested
[ ] Existing tests still pass
[ ] New realtime tests pass
[ ] No duplicate state was introduced unnecessarily
```

---

# 27. Important Instruction to Codex

**DO NOT START IMPLEMENTATION IMMEDIATELY.**

First:

```text
AUDIT → REPORT → PLAN → IMPLEMENT → TEST → WALKTHROUGH
```

The first deliverable must be an **audit of the existing Badminton Digital codebase against this document**.

If the existing implementation conflicts with this plan, Codex must:

1. Show the conflict.
2. Explain the risk.
3. Identify affected files/data.
4. Propose the minimal safe migration.
5. Wait for implementation only after the audit/plan is complete, unless the execution workflow explicitly authorizes autonomous implementation.
