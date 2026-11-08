# Attendance security review — 2026-10-09

> Historical review dưới đây mô tả trước R4/R6. R6 ngày 2026-10-10 đã thay rule: một cặp/ngày, accuracy/mock bắt buộc, chặn mock/low accuracy và office check-in ngoài geofence; thêm thiết bị Admin duyệt, signed challenge/ảnh và durable account budgets 10/20/60. Chi tiết kiểm tra thật, migration/rollout và giới hạn còn lại tại [R6 acceptance](R6_ATTENDANCE_ACCEPTANCE.md). GPS/app/key attestation vẫn chưa có; không coi các mục cũ đã tự đạt nghiệm thu production.

Scope: source review and controlled local diagnostics while retiring Admin PIN. Not a full penetration test, production audit or guarantee against spoofed GPS. No new attendance policy/continuous tracking/automatic penalty was approved or introduced.

## Controls found in the repository

- `auth/presentation/jwt-auth.guard.ts` verifies signed access tokens and requires `sub` + `sid`; `AuthService.getAuthenticatedUser` loads a live session for that user and current account/roles. Role guards do not trust a client-supplied role. `TypeOrmAuthSessionRepository` enforces active employee/account and session/channel policy.
- `attendance.controller.ts` requires JWT/session for attendance. Office identity comes from authenticated `user.employeeId`, not the request body. Global validation rejects unknown fields. Server time drives work date/schedule/reporting; device time is stored separately.
- `attendance.service.ts` resolves active locations by current organization/branch and calculates distance/radius/accuracy flags at Backend. Radius remains configurable up to 100 m; accuracy threshold is independent (currently 50 m by configured policy).
- Business-trip start/complete checks assigned employee, trip/member state and locks rows within transactions. Employee evidence access/ownership and explanation workflow permissions are separate protected paths; this review is not exhaustive validation of all of them.
- Login/refresh rate limits, production cookie-origin checks, safe headers, hash-only passwords and audit remain after PIN removal. Keeping an Admin-only physical device does not replace these controls.

## Fixed in this task

1. Office duplicate-event race: previously state was read then saved without a transaction lock. Now office check-and-save is atomic under `attendance-event:<employeeId>` transaction advisory lock. Trip writers take the same lock so they cannot insert between an office state check and save. No rule forbidding repeated in/out cycles was added.
2. Malformed GPS: required numeric latitude/longitude validation rejects missing/null/string/out-of-range values. Service also checks finite/range values; geofence Domain now rejects non-finite centers and points. This closes null-to-zero and NaN bypass paths, not intentional fabrication of valid coordinates.

No schema changes for these attendance fixes. PIN retirement has its own forward migration; see [Admin access](ADMIN_SECURITY.md).

## Remaining limitations / approval required

| Priority | Source evidence / limit | Proposed next scope, not yet implemented |
| --- | --- | --- |
| High | Valid latitude/longitude, accuracy and `mockLocationSignal` come from the client. No app/device attestation verdict is required by attendance DTO/controller. Client may omit mock-location signal or manufacture valid-looking coordinates. | Choose risk handling and approved proof strategy separately for APK and browser employees. Do not claim geofence proves physical presence. |
| High | Outside-geofence/mock/low-accuracy events are recorded with flags, not universally rejected. Missing accuracy currently is permitted without a distinct risk flag. | Decide whether to retain flagged evidence pending review or reject particular conditions; decide missing-accuracy treatment before changing Backend/app/UI/report contracts. |
| Medium | Office event input has no stable event idempotency key. Concurrent duplicates are serialized now, but ambiguous network retry after a later state change is not an authenticated, exactly-once receipt. | Approved API/mobile/web idempotency contract, payload binding and duplicate-response semantics; do not auto-retry attendance writes today. |
| Medium | Existing limiter in `main.ts` applies to login/refresh, not attendance or evidence. It is process-local. Repeated valid in/out cycles and excessive uploads need explicit abuse controls. | Per-user/event/upload budgets and bounded audit/alerts, preserving normal network retries and shared-office traffic. |
| Medium | `createAdjustment` checks period openness before save, without locking the period and mutation together. Office/trip writers also do not lock attendance periods. | Review period-lock invariants and writer/close transaction ordering; do not silently redefine current-day/month close rules. |
| Deployment | Device IDs are identifiers, not hardware proof; session tokens remain bearer credentials. This local change does not configure production HTTPS, secrets, backup or observability. | Review deployment, credential handling and restoration; no real employee data/demo credentials in production. |

Android attestation is a possible additional signal, not a GPS oracle and not a drop-in requirement for the current sideloaded APK. Assess distribution/device compatibility first. Google's [Play Integrity overview](https://developer.android.com/google/play/integrity/overview) describes app/device verdicts, request binding and layered enforcement; it recommends combining signals rather than using attestation alone. Not integrated in this task.

Authorization, resource budgets and sensitive-flow abuse are review categories drawn from the official [OWASP API Security Top 10](https://api-security.owasp.org/editions/2023/en/0x11-t10/). Applying these categories does not mean this repository has passed a full OWASP assessment.

## Validation and next acceptance

- Regression source added: `admin-access-without-pin.spec.ts`, `attendance-event-security.spec.ts`. Typecheck includes these sources. Automated test suites were not run per Tech Lead instruction.
- Local migration verification confirms zero stored PIN hashes, live unlocks, unused live recovery authority and pending handovers. Normal sessions/audit were not deleted.
- Local API checks: health 200, old PIN/recovery endpoints 404, unauthenticated employee/session endpoints 401. Authenticated malformed-coordinate/unknown-identity payload checks and UI observations are recorded in the handoff; no real attendance write was generated for these diagnostics.
- Real concurrent PostgreSQL office check-in verification, cross-trip contention, interrupted-network/replay scenarios and a dedicated adversarial role/device review remain acceptance work; test sources/mocks alone are not evidence those scenarios passed.
- No Mobile/APK changes or production/Cloudflare publication in this task. Prior user-edited Mobile changes are preserved.
