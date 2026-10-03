# Login HTTP 503: Worker fetch redirect compatibility

## Observed failure

The live public smoke test on 2026-10-03 returned 200 for `/auth/status` and `/auth/google/prepare`, 401 for unauthenticated `/api/state`, but 503 for `/auth/google/credential`. No owner was authenticated by that probe; it submitted a deliberately invalid credential and never accessed project data.

The three Google fetch calls used `redirect: 'error'`. Cloudflare workerd's Request parser rejects this option with a TypeError before making the network request. The outer handler converted that exception to the generic 503 message. The earlier Node/injected-fetch tests accepted the option and missed the runtime incompatibility.

## Narrow correction

Both signing-key fetch paths and the optional authorization-code token exchange now use `redirect: 'manual'`. Existing response.ok checks reject every 3xx response. No redirect is followed, and no credentials are sent to a redirected address. Ten additional unit tests enforce this mode and cover successful verification plus redirect rejection. The runtime workflow exercises the actual production Durable Object lifecycle in workerd, not just a Node SQLite adapter.

No allowlist, Google signature validation, nonce/state binding, session TTL, private API authorization, database identity or release approval behavior was weakened. There is no public testing bypass and no owner secret in the test harness.

## Verification scope

Consult the Worker runtime regression workflow for results on the specific commit. Its isolated workerd test uses disposable RSA keys and fake owner accounts; its public live probe checks configuration, database state creation and invalid-identity rejection. Neither is a real Google-owner browser login. Cloudflare deployment success is reported separately by Workers Builds.

Production owner sign-in still needs to be exercised by the account owner. Do not label a deploy or unit-test pass as that end-to-end result.

## Primary implementation reference

Cloudflare workerd Request redirect parser:
https://github.com/cloudflare/workerd/blob/ba6fa289d69fbf1d72f4a5cc85bc9dea217d3d48/src/workerd/api/http.c++

Miniflare v5 options conversion, also used by Wrangler's platform integration:
https://github.com/cloudflare/workers-sdk/blob/main/packages/wrangler/src/api/integrations/platform/index.ts
