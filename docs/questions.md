# Questions and Clarifications

1. The Gap: Role permissions are implied but not defined (Member, Group Leader, Reviewer, Finance, Admin).
   The Interpretation: Use a role-based access control matrix with least-privilege defaults and explicit allow lists per route and UI section.
   Proposed Implementation: Add a `roles` table and a `user_roles` join table, plus a `permissions` mapping in the backend middleware. Gate APIs with a `requireRole` guard and mirror it in the Vue route meta.

2. The Gap: Buying cycle lifecycle is not specified (start/end, states, what happens when a cycle closes).
   The Interpretation: Define a fixed lifecycle: draft -> active -> closed -> fulfilled -> archived.
   Proposed Implementation: Add `buying_cycles` with `status`, `starts_at`, `ends_at`, and `closed_at`. Enforce state transitions in a service layer and block new orders after `ends_at`.

3. The Gap: Pickup capacity and windowing rules are not defined (window length, capacity per window, timezone).
   The Interpretation: Pickup windows are fixed 1-hour slots in the pickup point's local timezone with a per-window capacity.
   Proposed Implementation: Store `pickup_windows` with `start_at`, `end_at`, `capacity`, `reserved_count`. Reserve capacity at checkout using a transaction and reject when `reserved_count >= capacity`.

4. The Gap: Threaded discussion sorting options are listed, but the actual criteria are undefined.
   The Interpretation: Provide sort modes: newest, oldest, most liked, and most replied.
   Proposed Implementation: Add `comment_stats` fields (`like_count`, `reply_count`) updated via triggers or service updates. Implement query ordering based on requested sort.

5. The Gap: Content flagging thresholds and who can hide/unhide content are not defined.
   The Interpretation: Content is auto-hidden after 3 unique flags from Members, and can be unhidden only by Reviewers or Admins.
   Proposed Implementation: Add `content_flags` with `flagger_id`, `reason`, and `created_at`. A moderation service toggles `hidden_at` on content when the threshold is met.

6. The Gap: Appeal workflow ownership and final authority are not defined.
   The Interpretation: Reviewers perform investigation and recommend outcomes; Admins make the final ruling.
   Proposed Implementation: Use `appeals` with `status` (intake, investigation, ruling) and `assigned_reviewer_id`. Add `appeal_actions` for auditability and an admin-only `finalize` endpoint.

7. The Gap: Pricing rule precedence is not specified (tiered discounts vs caps vs subsidies).
   The Interpretation: Apply tiered discounts first, then subsidies, then caps, then tax.
   Proposed Implementation: Implement a deterministic rules pipeline with a priority order in the pricing engine, storing each step as a line-item adjustment for traceability.

8. The Gap: Behavior event queue implementation is unspecified (tech, retry, failure handling).
   The Interpretation: Use an in-memory queue with durable fallback to MySQL when the queue is full or on shutdown.
   Proposed Implementation: Add `behavior_event_queue` table for overflow and a worker that retries with exponential backoff and marks events as `failed` after N attempts.

9. The Gap: Audit log retention and export scope are not specified.
   The Interpretation: Retain audit logs for 7 years and export supports CSV filtered by time range and resource type.
   Proposed Implementation: Add retention policy config and a scheduled cleanup job (disabled in dev). Provide an export endpoint that streams CSV with server-side filtering.

10. The Gap: Password complexity rules are not defined beyond length.
    The Interpretation: Require 12+ chars, at least 1 uppercase, 1 lowercase, 1 digit, and 1 symbol.
    Proposed Implementation: Enforce regex validation in both frontend and backend, with consistent error messaging and lockout on repeated failures.
