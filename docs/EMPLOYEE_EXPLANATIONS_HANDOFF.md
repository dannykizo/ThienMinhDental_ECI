# Employee-initiated explanations — 2026-10-06

## Approved scope

Employee creates an explanation with date/type/content and one optional camera/gallery image. Admin receives and approves/rejects; rejection reason is optional. No automatic attendance changes, mandatory GPS, new Admin requests, multi-file upload or dedicated review push. Canonical flow: `FLOWS.md`.

## Modules touched

- Backend Attendance: authenticated self-submission API, optional evidence, image ownership/access, idempotent retries, submit/review audit and compatibility for legacy responses.
- Database: migration `1791417600000-employee-explanations`, registered in the datasource; old records retained. Applied locally. Direct rollback is blocked after employee submissions exist.
- Backend Reporting: minimal period-row locking/recheck to prevent concurrent submissions during monthly closing.
- Admin: `frontend/app/dashboard/attendance/page.tsx`, replaced request creation with an all-date review queue and optional review note.
- Mobile: explanation list/create form, API client, account-scoped serialized queue and SessionController queue wiring. Shared preview semantic label now covers both camera and attached images.
- Tests: explanation policy and employee submission/authorization regression cases updated/added. Test suites intentionally not executed per Tech Lead instruction.
- `mobile/lib/features/leave/leave_request_screen.dart` contains pre-existing Tech Lead edits; untouched and excluded from this commit.

## Verification

- Backend typecheck, lint and build passed.
- Admin Web typecheck, lint and build passed.
- Targeted Flutter analysis passed; Dart formatter applied only to changed Mobile files.
- Backend health endpoint passed. Anonymous image download rejected with HTTP 401; existing Chrome Admin session opened the uploaded image successfully.
- USB debug device `32a65649`: self-created text-only development explanation queued when ADB reverse was temporarily removed, then sent after connectivity restored. Admin rejected it without a reason; app showed Backend result.
- Self-created development explanation with an attached PNG reached Admin; gallery capture time/GPS remained null. Admin approved with a development-only note. Attendance remained unchanged.
- Database inspection: exactly two employee-origin development submissions, each with its own stable submission UUID, and SUBMIT/REVIEW audit entries. Existing requests retained.
- Flutter hot restart applied queue-constructor wiring. One stale-runtime null-cast exception appeared during native picker/activity recovery before restarting; after the final restart the nullable new-record model loads correctly. A repeat camera-capture/queue account-switch/concurrent period-closing runtime check has not been performed; regression tests cover relevant Backend cases but are unexecuted.

## Running / deployment

- Admin: `http://localhost:3000/dashboard/attendance`.
- API: `http://localhost:3001/api`; health `/api/health`.
- Phone uses ADB reverse `tcp:3001 -> tcp:3001`; existing Flutter debug session remains running. No distributable APK release/package prepared.
- Run `pnpm --dir backend migration:run` before starting this Backend revision in another environment; Web code alone is insufficient. Rebuild/deploy Backend and employee app together with the schema. No new production hosting configured.
- Evidence remains on local disk; backup/persistent volume remains a deployment requirement. A development-only image fixture was copied to `/sdcard/Download/tm-explanation-development-only.png`; it is not application or employee data.
- GitNexus has no index for this repository in the available graph. Direct imports/callers and diffs were used for scoped impact review.
