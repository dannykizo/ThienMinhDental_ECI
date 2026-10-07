# Android push — readiness and customer acceptance

## Scope of the 2026-10-07 correction

- Android creates the `announcements` high-importance channel before requesting an FCM token; default FCM channel and monochrome notification icon are declared in the manifest.
- Foreground FCM notifications are posted through the existing Android platform bridge, in addition to inbox refresh. No additional Flutter notification framework is introduced.
- Background notifications use the FCM notification payload. Tapping a notification opens the authenticated inbox item; withdrawn/out-of-scope items show an unavailable state. A push payload never authorizes content or marks a message read by itself.
- Session end clears displayed app notifications and pending navigation. Sender excludes inactive accounts/employees and devices without a matching unrevoked, unexpired Mobile session. Registration requires that live device session and serializes against login replacement.
- Android settings remain user-controlled. The app reports disabled permission/channel, non-heads-up channel, missing Firebase config/token, failed registration and Backend push configuration separately. It provides retry, notification-settings and **local notification check** controls.
- Registration retries on resume/network recovery; Firebase initialization no longer blocks the branded bootstrap or login. Repeated initialization does not duplicate FCM subscriptions.
- FCM preview is bounded to 400 Unicode code points (title 200) to fit the provider payload limit. Full text remains unchanged in the inbox. Announcement ID is the notification tag, so retry updates the same notification rather than creating additional tray items.
- `SENT` means FCM accepted the transport request, not proof of display/read. Read and acknowledgement still require the existing authenticated API actions. Notifications already in transit at session revocation cannot be recalled; Android settings may expose previews. Private visibility is requested, not a guarantee against user settings.

## Required environment inputs

1. One Firebase project with an Android app matching `vn.thienminh.thien_minh_dental_workforce` and Firebase Cloud Messaging API enabled.
2. Android public options: `FIREBASE_ANDROID_API_KEY`, `FIREBASE_ANDROID_APP_ID`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_PROJECT_ID`. Supply through `--dart-define` or an ignored local `--dart-define-from-file` JSON file. Do not put the Backend service-account private key in the app.
3. Backend: `FIREBASE_PUSH_ENABLED=true`, matching `FIREBASE_PROJECT_ID`, and `GOOGLE_APPLICATION_CREDENTIALS` pointing to the environment-owned service-account JSON. Keep credentials outside Git. Docker production uses `deploy/compose.firebase.yaml` per `DEPLOYMENT.md`.
4. User opens the installed build at least once, logs in, permits notifications and completes device registration. Check Backend's push diagnostics; a local notification check is **not** proof of Firebase delivery.
5. Backend/database and HTTPS API must remain online during the trial. Cloudflare Pages alone does not run NestJS/PostgreSQL. Local Quick Tunnel trials depend on an awake developer machine and the correct tunnel origin; they are not production uptime guarantees.

Restart Backend after environment changes; rebuild/re-run the app after changing Dart defines. No Play Store publication is required for internal APK push, but the installed build must have the matching Firebase options.

## Acceptance matrix — record evidence, do not assume PASS

Use a dedicated development/trial employee, not real staff data. Admin publishes an individual test announcement through the existing flow; withdraw the disposable test message through its audited lifecycle after verification.

| Check | Required observation | Current evidence |
|---|---|---|
| Foreground | One system notification, inbox refresh, tap opens correct message | Pending Firebase/device verification |
| Background / screen locked | System notification appears; tap opens message after session verification | Pending Firebase/device verification |
| Cold process (not force-stop) | Tap restores session and opens authorized message | Pending Firebase/device verification |
| Admin announcement | Correct individual/department/company recipients, Unicode text | Existing inbox flow; real push pending |
| Leave/explanation decision | Correct result and actual reviewer name in inbox and notification | Existing workflow sender; real push pending |
| Permission/channel disabled | Clear warning; inbox works; no false readiness claim | Diagnostics implemented; device verification pending |
| Network/Backend outage | Session retained, registration failure shown, retry recovers | Code correction; end-to-end recovery pending |
| Revoked/replaced session | Old device excluded on next send; registration rejected | Added regression source; controlled verification pending |
| Long Unicode message | Bounded transport preview; full inbox body preserved | Compiled payload diagnostic: 2,787 UTF-8 bytes for 10,000 emoji body / 200 emoji title; regression suite not run |
| Local notification check | Explicitly labelled local test, no Firebase success claim/read receipt | Implemented; device verification pending |
| Force-stop / DND / vendor battery restrictions | Document platform limits; do not promise immediate delivery | Not bypassed |

Do not repeatedly publish company-wide test messages or change real requests merely to verify push. A provider acceptance receipt is not a device delivery guarantee.

## Checkout reminders

`NOT_IMPLEMENTED`: timing, enablement and per-shift policy await Tech Lead confirmation. Proposed option sent for approval: Admin-configurable delay after the scheduled end, notify only checked-in/not-checked-out employees, at most once per shift. Do not introduce a hard-coded reminder or continuous GPS tracking while waiting.

## Verification / handoff

- No database schema change or migration in this correction.
- Backend typecheck/lint and Flutter analyze are the static verification gates. Android debug compilation/installation is separate from customer acceptance; no release/distribution APK is produced.
- Regression sources cover UTF-8 payload size, recipient identity and registration refusal without a live Mobile session; test suites are not executed without Tech Lead request.
- Repository has no registered GitNexus index/local runner; source call-site and diff review are used as fallback.
- Preserve the user-owned modifications to `mobile/lib/features/leave/leave_request_screen.dart`; do not include them in this task's commits.

### Actual checks on 2026-10-07

- Backend `typecheck`, `lint`, `build`: PASS. Public local health remains OK after build.
- Flutter analyze: PASS, including the added regression sources. No automated test suite executed.
- Initial Android `assembleDebug`: PASS. Final native `:app:compileDebugKotlin`: PASS after platform changes. Existing Firebase Core / Kotlin Gradle compatibility warning remains; no dependency upgrade outside scope.
- ADB sees the attached RMX5555. Debug installation is waiting at the phone's Realme/Oplus `InstallGuideActivity`; the agent does not approve/bypass this device protection. No real-device notification acceptance claimed.
- Installed app's `POST_NOTIFICATIONS` permission was not granted at inspection. The user must choose this permission themselves.
- Local Backend logs say FCM disabled; no Firebase credential configuration supplied. Read-only eligibility query succeeds and finds zero current eligible FCM devices. No provider send or new test announcement performed.
- A compiled pure payload diagnostic returns 2,787 UTF-8 bytes / 401 body code points (400 + ellipsis); full source body is not modified.
- Next: receive environment-owned Firebase configuration and checkout-policy confirmation, finish debug installation, then run the acceptance matrix through the actual Admin → Backend → FCM → employee phone path. Until then this is a code/readiness correction, **not** completed customer push acceptance.
