# Cloudflare deployment entry point

Read [the Cloudflare setup guide](docs/CLOUDFLARE.md).

The root `wrangler.jsonc` now declares the existing `sanegamesmasterdashboard` Worker and its entrypoint. The Worker is an HTTPS gateway, not a static export or a Python hosting environment. FastAPI and the persistent SQLite database remain on a dedicated Mac, connected by Cloudflare Tunnel.

Build from the updated `main` with root `/`, build command `npm test`, and deploy command `npm run cf:deploy`. Add `SKIP_DEPENDENCY_INSTALL=1` as a build variable. Runtime origin and secret setup, Mac instructions and the custom-domain checks are in the guide.

A successful Worker deployment is **not** a completed dashboard deployment. An unconfigured gateway intentionally returns a 503 setup page. Never use demo mode as a public workaround.
