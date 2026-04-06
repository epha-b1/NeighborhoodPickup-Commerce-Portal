# Design Document

## System Overview

Neighborhood Pickup Portal is a fullstack role-based web application with:

- Frontend: Vue 3 + Vite + Vue Router + Pinia
- Backend: Express 5 + TypeScript
- Database: MySQL 8

Primary domains:

- Commerce and order checkout
- Discussion threads and notifications
- Appeals intake and review timeline
- Finance commissions, withdrawals, and reconciliation export
- Audit logging with tamper-evident hash chain
- Behavior event ingestion with retention policies

## Backend Architecture

The backend uses feature-based vertical slices under `backend/src/features/*`.

Each feature generally follows:

- `routes`: transport layer and request validation
- `services`: business logic and orchestration
- `repositories` or `data`: SQL persistence layer

Cross-cutting modules:

- `auth/*`: password policy, hash, session token, auth service
- `middleware/*`: session auth and RBAC checks
- `security/*`: AES-256-GCM encryption helpers
- `config/env.ts`: validated runtime configuration

This layering keeps HTTP details out of core business logic and supports unit testing with mocked repositories.

## Frontend Architecture

Frontend is organized by pages/components with shared API clients.

- Router-level role gates enforce access boundaries before navigation.
- Page modules map to business areas (checkout, appeals, discussions, notifications, finance views).
- API modules isolate HTTP calls and response shaping.

TypeScript and Vue SFC files are the source of truth; generated JS mirrors are excluded from source control.

## Security Design

Authentication and authorization:

- Local username/password login
- Argon2id password hashing
- Lockout after repeated failures
- Session cookie (`httpOnly`, `sameSite=lax`, `secure` in production)
- Route and role checks via middleware

Data protection:

- Sensitive text fields encrypted at rest with AES-256-GCM
- Audit records hash-chained to detect tampering

Operational hardening:

- Unhandled error stack logging can be disabled via env
- Behavior retention jobs can run automatically on interval

## Key Runtime Flows

### Checkout

1. Member requests quote.
2. Pricing engine calculates discounts/tax/subsidy and trace.
3. Checkout validates capacity and inventory.
4. On success, order and ledger effects are persisted.

### Appeals

1. Member submits appeal referencing comment/order source.
2. Files are validated and checksummed.
3. Status transitions are recorded as timeline events.
4. Reviewer/admin resolves according to workflow state machine.

### Finance Withdrawal

1. Eligibility evaluated (approved leader, blacklist, limits).
2. Request creates withdrawal record.
3. Tracking counters updated for daily/weekly controls.
4. Audit event recorded.

## Non-Functional Concerns

Reliability:

- Automated tests for backend services/routes and frontend API behavior.
- Extended backend test timeout to reduce Argon2 timing flakes in CI-like environments.

Maintainability:

- Feature module boundaries and typed schemas.
- Environment-driven settings for production behaviors.

Observability:

- Structured error logging in app middleware.
- Audit log search/export/verify endpoints.

## Behavior Event Durability

Behavior events flow through a two-stage pipeline:

1. **In-memory buffer** — accepted events are first stored in a bounded in-memory
   array with a local dedup set.  This avoids per-event synchronous DB writes on the
   request path, keeping ingest latency low.

2. **Durable MySQL queue** — the buffer is flushed to the `behavior_ingestion_queue`
   table (with DB-level idempotency key dedup) under three conditions:
   - **Prompt micro-flush**: a non-blocking `setImmediate` flush fires after every
     successful ingest call, so events typically become durable within milliseconds
     of the HTTP 202 response.
   - **Capacity flush**: when the buffer reaches `BEHAVIOR_BUFFER_CAPACITY` (default 100).
   - **Timer flush**: a periodic interval (`BEHAVIOR_BUFFER_FLUSH_INTERVAL_MS`,
     default 5 000 ms) flushes any remaining items.

**RPO (Recovery Point Objective) boundary**: if the process crashes between the
`setImmediate` scheduling and the flush completing, events that are still in the
in-memory buffer are lost.  In practice this window is sub-millisecond because the
micro-flush runs on the next event-loop tick.  Clients may safely retry using the
same idempotency key without creating duplicates.

Configuration environment variables:
- `BEHAVIOR_BUFFER_CAPACITY` — max items before forced flush (default 100).
- `BEHAVIOR_BUFFER_FLUSH_INTERVAL_MS` — timer-based flush interval (default 5 000 ms).

## Pickup Window Invariant

All pickup windows use fixed **1-hour slots** expressed in the pickup point's local
time.  The schema stores `window_date DATE`, `start_time TIME`, and `end_time TIME`
without timezone offset; the convention is that these values represent the point's
physical-location local time.

The `assertValidPickupWindowDuration` helper enforces that `end_time - start_time`
equals exactly 60 minutes and must be called on any creation or update path.

## Deployment Notes

- Local development and test execution are standardized on Docker Compose.
- Avoid host-level runtime dependencies; use the provided Docker scripts.
- Production deployment should terminate TLS before the backend and set `NODE_ENV=production`.
