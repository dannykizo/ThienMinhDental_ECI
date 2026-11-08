# Admin access — PIN retired (2026-10-09)

Supersedes the PIN/recovery/handover design approved on 2026-10-07. Tech Lead/customer requested removal of the extra PIN step, not removal of Backend authentication or authorization.

## Current behavior

- No PIN setup/unlock/change prompts, security workspace or public handover page.
- Employee detail/history and account/profile/lifecycle mutations, session management and management-grant mutations still require JWT, a live session and current ADMIN role in Backend.
- Shared employee directory remains a basic-field whitelist. Full detail is fetched through ADMIN-only `GET /api/employees/:id`. Global audit snapshots are available to ADMIN again; original audits are unchanged.
- Hash-only passwords, login/refresh rate limits, cookie-origin production protections and Head/Leader scopes remain. No employee password viewer. Password policy/session durations are unchanged by retirement.
- All old `/api/auth/admin-security` endpoints, including public acceptance and emergency recovery, are unregistered (404).
- PIN-free self-service Admin ownership transfer: `NOT_IMPLEMENTED`. No implicit replacement or developer bypass was introduced. A future transfer procedure requires separate approved scope.

## Forward migration / rollout

1. Identify the target environment, take an operational backup before production deployment and pause old API processes during the migration. Do not run the old PIN runtime concurrently: it could create fresh recovery authority after retirement.
2. Retain applied migration `1791936000000-admin-security` unchanged. Apply `1792108800000-retire-admin-pin` with `pnpm --dir backend migration:run`.
3. Retirement clears PIN hashes, expires unlocks, revokes unused recovery codes and cancels pending handovers. It does not delete historical rows/audits or change accounts, roles, passwords or normal login sessions.
4. Deploy Backend without the PIN controller/guards, then deploy Web without the provider/pages. Existing old browser tabs should reload to receive the new Web.
5. Verify ADMIN can open detail/session/permission screens without PIN; unauthenticated requests return 401 and non-ADMIN users cannot access Admin detail/mutation endpoints. Old PIN/recovery endpoints must return 404.
6. Do not roll back to the old PIN application after this migration. Automatic down refuses to resurrect retired secrets; re-enabling needs an explicit new migration, new credentials and approved rollout. Application rollback must remain PIN-free.

Tables are deliberately retained for deployment compatibility/history. Their removal, if desired later, is a separate reviewed data migration. Recovery-code/invitation digests no longer confer authority.

## Verification scope

Regression source `backend/test/admin-access-without-pin.spec.ts` covers guard/role wiring, removal of recovery controller registration, directory minimization and retirement without audit/session deletion. Test suites are not automatically run per Tech Lead instruction; typecheck/lint/build and controlled local API checks are reported separately.

GitNexus has no workspace index/runner in this environment; direct source/route tracing is used, not an unrelated repository graph. This local task does not imply production/Cloudflare deployment. See [Attendance review](ATTENDANCE_SECURITY_REVIEW.md) for the separate fraud/security findings.

Local handoff results (2026-10-09): Backend/Web typecheck, lint and builds passed (Web static export included). Retirement migration applied to development PostgreSQL at localhost:5433; PIN hashes, live unlocks, live unused recovery codes and pending handovers are all zero. Health returns 200; old PIN/status/accept endpoints 404; unauthenticated directory/session reads 401. Authenticated malformed GPS/unknown employee-identity payloads return 400, mismatched session owner and expired token return 401. Diagnostic credentials stayed in process memory; no new account, real attendance write or session replacement was created. Chrome confirmed employee create form, detailed development-only profile and session list accessible without PIN, without saving profile changes. No live demo-employee session was available, so a real non-ADMIN 403 walkthrough was not performed; its guard regression source is present but not executed. Production/Cloudflare and APK unchanged.
