# Dashboard verification record

> Historical reference: this document describes the legacy Python/Mac-origin application or its test checkpoint. The active entrypoint is `cloudflare/native/entry.mjs`. Use [the current hosted guide](HOSTED_DASHBOARD.md) and `docs/HOSTED_TESTING.md` for current operations. Do not apply old Wrangler, hostname, OAuth or process settings to the native deployment.

## Backend

Command: `python -m pytest -q`.

Result at this checkpoint: **36 passed**. Tests use temporary SQLite databases and synthetic accounts/manifests. The application does not include the test session-injection helper in its HTTP API.

Coverage includes demo/production isolation; host and HTTPS enforcement; empty private production state; rejection of unauthorized intake and approval; CSRF/origin checks; blocked QA gates; mandatory attestations; manifest hash binding; duplicate decisions; requested-fix handling; immutable manifest/audit rows; complete mobile artifacts and evidence gates; dangerous link rejection; candidate supersession; expiring sessions; input bounds; OAuth state/profile logic; and backup behavior where represented in the test file. Read `tests/test_dashboard.py` for exact assertions, rather than treating this list as an independent security audit.

## Browser evidence already obtained

An offline Chromium check exercised desktop rendering, mobile layout overflow, the mobile review dialog, failed-QA blocking, requests for changes, approvals, project creation, search and view switching. It recorded no JavaScript errors. The test used an in-process FastAPI TestClient bridge.

This does **not** validate real network transport, cookies over HTTPS, GitHub OAuth, a production Content Security Policy in the browser, TLS, store publishing, or running on the owner's actual phones/tablets. Screenshots use fictional demonstration records.

`tests/browser_smoke.py` provides a separate real-HTTP browser path. Run it on the target Mac and record its result. Never rename an offline result as an end-to-end pass.

## Before any public deployment

Validate real owner sign-in and unauthorized accounts; account two-factor behavior; OAuth redirect/state handling; cookie and CSRF behavior in a real browser; the trusted reverse proxy; DNS/TLS for the exact hostname; dependency vulnerability review; internet-facing rate limits; host/service permissions; backups and restoration; worker isolation; and log redaction. Obtain an independent security review. The current test count is not a production-certification claim.

## Before store automation

Implement a publisher that rechecks current owner approval and recomputes artifact hashes. Test revoked/superseded approvals, concurrent submissions, network retries, store rejection, post-approval artifact replacement and signing identity. Store publishing is currently absent, not mocked as successful.

