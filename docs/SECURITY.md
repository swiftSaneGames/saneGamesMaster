# Security boundaries and remaining work

## Separate identities

The internet-facing dashboard should run as an unprivileged service identity, separate from coding agents and the store-signing worker. Store credentials and signing keys do not belong on the dashboard host. Owner review happens in an owner-controlled browser session.

An intake token only authorizes project/candidate creation. Approval endpoints require the configured owner's session, exact-origin CSRF checks and an exact manifest confirmation. This separation holds at the application boundary. A machine administrator or an agent allowed to alter the database, runtime or owner session can bypass it. Do not claim role prompts alone provide security isolation.

## Public repository

Keep databases, build files, private game data, production secrets and signed URLs outside this tree. `.gitignore` is a convenience, not a security scanner. Inspect each staged diff and use secret scanning before pushing. Never reuse credentials exposed in chat. GitHub authorization should use configured tooling and scoped access.

## Evidence limitations

The application validates the manifest schema and declared statuses. It does not fetch linked artifacts or verify that an uploaded hash matches their bytes. It does not prove reported device tests happened. Independent QA and a future publisher must verify evidence and recompute hashes. An append-only hash chain detects ordinary application-level tampering; it is not an externally anchored or administrator-proof audit log.

## Current application controls

Secure production cookies; one-hour sessions; OAuth state and PKCE implementation; owner numeric-ID and two-factor checks; CSRF/origin checks; trusted-host validation; request-body limits; a bounded single-process rate limiter; HTTPS-only evidence-link allowlisting without tokenized queries; SQLite parameterized queries; and restrictive response headers.

None of these removes the need for real OAuth, browser, proxy and deployment testing. Production currently requires one process because its in-memory limiter is not shared across processes. Request/proxy logs must not record OAuth codes, cookies, bearer tokens or private manifests. Configure outer rate limits and access-log redaction before public use.

## Additional release hardening

The existing owner session is not a fresh hardware-backed signature for each approval. Evaluate reauthentication or passkey step-up for high-impact actions. Add session revocation, intake credential rotation, host hardening, dependency scanning and externally stored audit anchors before enabling valuable publication credentials. Keep a tested recovery procedure.
