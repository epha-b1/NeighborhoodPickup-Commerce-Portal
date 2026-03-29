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

## Deployment Notes

- Local development can run without Docker using workspace scripts.
- Docker Compose remains available for integrated local environments.
- Production deployment should terminate TLS before the backend and set `NODE_ENV=production`.
