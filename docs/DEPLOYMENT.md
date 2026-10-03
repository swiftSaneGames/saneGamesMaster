# Deployment preparation: prod.sanegames.swiftsane.com

**Status: not deployed.** No DNS record, TLS certificate, public route, service account or OAuth application has been created by this checkpoint.

## Cloudflare deployment path

The owner has selected Cloudflare Workers for the public entrypoint. See [CLOUDFLARE.md](CLOUDFLARE.md) for the Worker gateway plus named Tunnel deployment on an existing Mac. Root `wrangler.jsonc` configures the edge gateway; it does not run Python or provide persistent local SQLite in Workers. Hostname, OAuth, tunnel and runtime secrets still require configuration and live validation.

The dedicated launcher `scripts/run_cloudflare_origin.sh` requires a gateway secret before starting the production backend. Do not publish the demo or solve the build failure by uploading only `dashboard/static`.

## Existing resources and unresolved infrastructure

The owner supplies the domain and three Macs. The DNS provider, network reachability and current domain configuration remain unknown. Select a no-additional-cost route only after checking those details. Do not modify unrelated DNS records or assume a router accepts inbound traffic. Do not expose the development server or demo mode.

## Service contract

The production launcher binds only to `127.0.0.1:8787`. A trusted local HTTPS reverse proxy must preserve the configured hostname and supply the forwarded scheme. The launcher trusts forwarded headers only from `127.0.0.1`. Adapt and test this exact trust boundary if a different proxy topology is chosen. Validate the loopback cloudflared topology described in the Cloudflare guide, or independently validate an alternative trusted proxy.

Use a dedicated service user, private state directory outside the checkout, encrypted local storage and protected backups. Set a restrictive file-creation mask. Do not run the service or its intake client under an account with unattended store-signing authority.

## Environment

Use `.env.production.example` as documentation. Set actual values through local secret/configuration facilities, never in the public repository. The application reads environment variables; it does not automatically source the example file.

- `APP_MODE=production`
- `BASE_URL=https://prod.sanegames.swiftsane.com`
- `STUDIO_DATA_DIR`: absolute private directory outside the checkout
- `OWNER_GITHUB_ID`: verified immutable numeric ID of the intended owner, not the username
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`: dedicated OAuth application
- `INTAKE_TOKEN`: locally generated random machine-intake credential of at least 40 characters
- `ARTIFACT_HOSTS`: explicit HTTPS host allowlist for private build/evidence references

The implemented OAuth callback is `https://prod.sanegames.swiftsane.com/auth/callback`. Code uses `read:user` for identity, not repository management. Review the provider's current permissions and real response behavior before enabling the login. The dashboard's OAuth application and the separate GitHub publishing integration serve different purposes.

## Bring-up gates

1. Confirm DNS ownership/provider and a feasible no-paid-hosting route. Review the infrastructure diff.
2. Isolate the service identity from development agents and signing workers.
3. Configure production secrets outside Git and install pinned dependencies in a virtual environment.
4. Validate the application locally with production configuration behind the intended proxy.
5. Establish HTTPS for the exact hostname, with protected proxy logs and resource limits.
6. Run real browser sign-in, negative access tests, owner review tests and backup/restore checks.
7. Only then expose the dashboard publicly. Keep store adapters disabled until independently implemented and tested.

Run `bash scripts/run_production.sh` only after the environment and reverse proxy are configured. The launcher is not a one-command public deployment.

## Rollback and recovery

Retain the previously tested source commit and a verified private database snapshot. Use `scripts/backup.py` for a consistent SQLite backup; it removes active sessions and OAuth state from the backup. Test restoration separately, reauthenticate after restoration, and reconcile outstanding candidates before enabling writes. Never commit a backup or share one in the public repository.
