# Feb 22 Code Review (Pre-Launch MVP)

## Scope
Reviewed API routes, auth/session handling, service-layer access controls, invite lifecycle, and deployment-risk areas for a public launch.

## Findings (ordered by severity)

1. **[P0] Public endpoint leaks full user directory (including emails)**
- **Evidence:** `/Users/adilislam/Desktop/Bible App/app/api/bootstrap/route.ts:4`, `/Users/adilislam/Desktop/Bible App/lib/service.ts:1706`
- **What happens:** `GET /api/bootstrap` is unauthenticated and returns all users (`id`, `name`, `email`, `language`).
- **Risk:** Immediate user enumeration and PII exposure in production.
- **Fix:** Require auth for this route or remove it entirely. If the frontend only needs a session check, return minimal current-user metadata only.

2. **[P0] Cancelled/accepted invites can still be redeemed**
- **Evidence:** `/Users/adilislam/Desktop/Bible App/lib/service.ts:1468`, `/Users/adilislam/Desktop/Bible App/lib/service.ts:1490`
- **What happens:** `cancelInvite` sets `status='cancelled'`, but `joinGroupByInvite` only checks token + expiry (no `status` filter). Accepted personal invites are also reusable.
- **Risk:** Revoked invites remain valid; personal invite links can be reused by unintended users.
- **Fix:** Enforce invite status in join query (`status='pending'`), make personal invites one-time (`accepted_by IS NULL`), and perform join+status update atomically in a transaction.

3. **[P1] Pending invite token + recipient contact data is exposed to all group members**
- **Evidence:** `/Users/adilislam/Desktop/Bible App/lib/service.ts:1415`, `/Users/adilislam/Desktop/Bible App/lib/service.ts:743`, `/Users/adilislam/Desktop/Bible App/lib/service.ts:866`, `/Users/adilislam/Desktop/Bible App/app/api/groups/[groupId]/invites/route.ts:44`
- **What happens:** Any member can fetch pending invites, including `token` and `recipientContact`.
- **Risk:** Unnecessary exposure of private invite metadata and contacts to users who may not need it.
- **Fix:** Restrict pending invite details to inviter/admin, or redact `recipientContact` and `token` for non-admin members.

4. **[P1] Internal server errors are returned directly to clients**
- **Evidence:** `/Users/adilislam/Desktop/Bible App/lib/api.ts:21`
- **What happens:** Unknown errors return `error.message` in HTTP 500 responses.
- **Risk:** Leaks internals (query failures, implementation details), increasing attack surface and reducing operational safety.
- **Fix:** Return a generic 500 message to clients and log detailed errors server-side with request IDs.

5. **[P1] Group timezone is not validated, and invalid values can break weekly lifecycle logic**
- **Evidence:** `/Users/adilislam/Desktop/Bible App/lib/service.ts:1333`, `/Users/adilislam/Desktop/Bible App/lib/service.ts:163`
- **What happens:** Arbitrary timezone strings are persisted; lifecycle SQL depends on `AT TIME ZONE g.timezone`.
- **Risk:** A bad timezone can cause recurring failures for snapshot/rollover for that group.
- **Fix:** Validate timezone against IANA names on create/update and reject invalid values.

6. **[P1] Unbounded in-memory Bible cache enables memory abuse**
- **Evidence:** `/Users/adilislam/Desktop/Bible App/app/api/bible/route.ts:4`, `/Users/adilislam/Desktop/Bible App/app/api/bible/route.ts:62`
- **What happens:** Public route caches arbitrary reference keys with no size cap or eviction policy.
- **Risk:** Memory growth / noisy-neighbor behavior under abuse.
- **Fix:** Add bounded LRU cache with max entries, normalize stricter input, and apply rate limiting.

7. **[P2] Admin credential verification uses unsalted SHA-256 hash comparison**
- **Evidence:** `/Users/adilislam/Desktop/Bible App/lib/auth.ts:29`
- **What happens:** Admin password is verified via direct SHA-256 hash match.
- **Risk:** Weaker resistance to offline brute force if env hash is exposed.
- **Fix:** Use Argon2id or bcrypt with per-password salt and work factor.

## Testing and Verification Gaps

1. Missing invite-lifecycle tests for:
- cancelled invite cannot join
- accepted personal invite cannot be reused
- personal invite token visibility/permissions by role

2. Missing security regression tests for auth on sensitive routes:
- `/api/bootstrap` should not expose user directory publicly

3. Dependency risk status remains unresolved:
- `npm install` previously reported vulnerabilities; `npm audit` could not complete in this environment due DNS resolution failure.

## Open Questions

1. Should **all members** see pending invite recipient info, or only inviter/admin?
2. Should generic invite links be reusable forever, or should they also be single-use/limited-use?
3. Is `/api/bootstrap` still needed now that user/group/profile are loaded via authenticated routes?

## Launch Recommendation

Do not launch publicly until P0 items are fixed (bootstrap data exposure and invite status bypass). P1 items should be addressed in the same hardening pass before broad rollout.
