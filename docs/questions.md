# Questions and Clarifications

1. Role permission boundaries
   - Question: What specific permissions does each role (Member, Group Leader, Reviewer, Finance Clerk, Administrator) have, and how are they enforced across routes and UI sections?
   - My Understanding: Use a role-based access control matrix with least-privilege defaults. Each route and API endpoint declares which roles are allowed; all others are denied.
   - Solution: Add a `roles` table and a `user_roles` join table, plus a `requireRoles` middleware guard on every protected backend route. Mirror role checks in Vue route `meta.roles` and front-end navigation guards. Each role only sees the pages and actions assigned to it.

2. Buying cycle lifecycle states
   - Question: What states does a buying cycle go through, and what happens to orders when a cycle closes?
   - My Understanding: A buying cycle follows a fixed lifecycle: draft, active, closed, fulfilled, archived. New orders are blocked after the cycle's `ends_at` timestamp.
   - Solution: Store `buying_cycles` with `status`, `starts_at`, `ends_at`, and `closed_at`. Enforce state transitions in a service layer and reject new checkout attempts once the cycle is no longer active.

3. Pickup capacity and windowing rules
   - Question: How are pickup windows structured (duration, capacity per window, timezone handling)?
   - My Understanding: Pickup windows are fixed 1-hour slots in the pickup point's local timezone. Each window has a maximum capacity and tracks reserved slots.
   - Solution: Store `pickup_windows` with `start_at`, `end_at`, `capacity`, and `reserved_count`. Reserve capacity at checkout within a database transaction; reject when `reserved_count >= capacity` and offer the next available window.

4. Threaded discussion sort criteria
   - Question: What exactly do the sortable reply ordering options sort by?
   - My Understanding: Three sort modes: newest (created_at DESC), oldest (created_at ASC), and most replies (reply_count DESC). Threads paginate at 20 replies per page.
   - Solution: Maintain `reply_count` on comments updated on insert. Implement query ordering via a sort-mode-to-SQL mapping and paginate with LIMIT/OFFSET.

5. Content flagging thresholds and moderation
   - Question: How many flags trigger auto-hide, and which roles can unhide content?
   - My Understanding: Content is auto-hidden after 3 unique flags. Only Reviewers or Administrators can unhide. Users cannot flag their own comments.
   - Solution: Store flags in `comment_flags` with `flagger_id` and `reason`. A repository function counts flags per comment and sets `is_hidden = 1` when the threshold is reached. Self-flagging is blocked at the service layer.

6. Appeal workflow ownership and authority
   - Question: Who performs investigation vs. who makes the final ruling on appeals?
   - My Understanding: Reviewers and Administrators can transition appeal status. The workflow proceeds: intake, investigation, ruling. Only users with elevated roles can perform transitions.
   - Solution: Use `appeals` with `status` and `appeal_events` for auditability. Enforce valid status transitions (intake->investigation->ruling) in the service layer with role checks.

7. Pricing rule precedence
   - Question: In what order are tiered discounts, caps, subsidies, and tax applied?
   - My Understanding: Apply member pricing adjustment first, then tiered discounts, then capped discounts, then subsidies, then compute tax on the remaining taxable base.
   - Solution: Implement a deterministic rules pipeline in the pricing engine. Each step produces a line-item adjustment stored in a tracing structure for full auditability.

8. Behavior event queue implementation
   - Question: What technology handles the event queue, and how are failures handled?
   - My Understanding: Use an in-memory queue with durable fallback to MySQL. Events use idempotency keys for deduplication and follow retention policies (90 days hot, 365 days archived).
   - Solution: Buffer events in-memory and flush to `behavior_events` table asynchronously. Deduplicate on `idempotency_key`. A background retention job purges events beyond the configured retention window.

9. Audit log retention and export scope
   - Question: How long are audit logs retained, and what export formats are supported?
   - My Understanding: Retain audit logs indefinitely (7-year minimum for compliance). Export supports CSV filtered by user, time range, and resource type.
   - Solution: Hash-chain audit entries for tamper evidence. Provide a streaming CSV export endpoint with server-side filtering. Retention cleanup is configurable but disabled by default.

10. Password complexity rules beyond length
    - Question: What specific complexity rules apply beyond the 12-character minimum?
    - My Understanding: Require at least 1 uppercase letter, 1 lowercase letter, 1 digit, and 1 special character. Accounts lock for 15 minutes after 5 failed attempts.
    - Solution: Enforce regex validation on both frontend and backend with consistent error messaging. Store `failed_attempts` and `locked_until` on the user record, checked at login time.
