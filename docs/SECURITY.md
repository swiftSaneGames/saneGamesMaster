# Security boundaries and operational requirements

The active application is `cloudflare/native/entry.mjs`, with Google identity verification and SQLite Durable Object storage. The older Python/GitHub OAuth gateway remains historical code.

## Identities and capabilities

Owner browser sessions make release decisions. Intake credentials create permitted project/task/candidate records; they cannot approve releases. Configured worker credentials operate only the job API. Development Macs, the public dashboard, integration writer and future signing/publishing service need separate operational authority. Role prompts and tool allowlists cannot enforce that separation alone.

Cloudflare administrators can replace code or database contents. Native SQLite audit rows are not administrator-proof or externally anchored. Keep production/signing/owner identities outside development workers.

## Native controls

Google signatures, issuer, audience, expiry, nonce and verified-email claims are checked before the allowlist. Verified subjects are pinned per identity. Secure sessions expire; state/nonce consumption prevents replay. Mutations use exact-origin/CSRF checks. Release approval requires recent authentication, exact manifest confirmation and both owner attestations.

Native storage uses optimistic revisions, parameterized queries, persisted rate records, immutable candidate manifests and approval supersession. Evidence links require HTTPS and permitted hosts. Response headers constrain browser content access. Mocked provider tests do not demonstrate production sign-in.

The application does not independently attest an MFA event for each Google session. Configure and verify two-step authentication on permitted accounts. Historical GitHub numeric IDs, Python in-memory limits and hash-chained legacy logs are not native guarantees.

## Evidence and release limits

The dashboard validates supplied structure/status; it does not download artifacts to recompute hashes or prove device testing occurred. Independent QA and a future publisher must verify actual bytes, provenance and current approval. Metadata export is not a complete hosted backup or tested restore.

Store publication records are owner-reported. Worker task success is separate from QA acceptance and owner authorization. Machine credentials must never access approval endpoints.

## Worker and source hygiene

Use per-worker credentials and rotate through platform secrets. Do not log tokens, raw provider output or signing information. Limit workers to configured repositories, bounded jobs and valid leases. Fencing coordinates work but does not make compromised workers trustworthy.

Never commit environment secrets, keys, databases, private game evidence, production binaries or personal tester records. Ignore rules and edit hooks are workflow aids, not containment of Bash. Review diffs, dependencies and asset licenses before serialized direct-to-main integration. Never force-push or enable paid fallback.

## Operational acceptance

Verify real permitted Google accounts and rejection of outsiders, worker credential isolation, actual persistence/migrations, log redaction, hosted restore, deployment ownership and artifact access. Perform physical-device QA separately. Repository code does not establish live acceptance.
