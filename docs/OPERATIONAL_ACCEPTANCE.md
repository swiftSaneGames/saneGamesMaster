# Operational acceptance — make the studio real

This is the acceptance path from a deployed dashboard to one real game pipeline. It intentionally distinguishes source readiness from actual machine/device/store acceptance.

## Current production topology

- Cloudflare Worker: `sanegamesmasterdashboard`
- Dashboard: `https://dashboard.sanegames.swiftsane.com`
- Master: `swiftSaneGames/saneGamesMaster`
- Execution: three dedicated macOS worker identities
- Game source: one private GitHub repository per game
- Human authority: exact-build final review only
- Store signing/publishing: separate restricted operator, not an ordinary Claude worker

## Three-Mac assignment

| Machine | Profile | Authority |
|---|---|---|
| Mac 1 | `mac-1-build` | Research, design, architecture, implementation. No integration. |
| Mac 2 | `mac-2-qa` | Independent QA/device/performance/security/compliance. No integration. |
| Mac 3 | `mac-3-integration` | Serialized Git integration and release preparation. GitHub write allowed only here. No owner approval or signing. |

Use `config/worker-profiles.json` as the canonical capability split.

## Prepare each Mac

Use a dedicated macOS account. Clone the master with normal least-privilege GitHub access, then:

```bash
python3 scripts/prepare_mac_worker.py --profile mac-1-build
python3 scripts/studio_worker.py --config "$HOME/Library/Application Support/SaneGames/mac-1-build.json" --doctor
```

Use the corresponding profile on Mac 2 and Mac 3.

The setup helper never stores a token. Each machine needs a distinct `STUDIO_WORKER_TOKEN` supplied privately at runtime and the matching server-side worker mapping. Do not paste worker tokens into GitHub, Claude prompts, logs or chat.

Before changing `included_plan_verified` or `permissions_verified` to true, actually verify the installed Claude Code version/model/effort and the unattended tool rules described in `docs/WORKER_SETUP.md`.

## Acceptance A — worker identity

All three dashboard worker rows must simultaneously show:
- distinct worker IDs;
- expected capabilities;
- fresh heartbeat;
- no duplicated token/identity;
- correct machine/runtime version evidence.

Stopping one worker must make only that worker stale.

## Acceptance B — fenced queue

Create a disposable fixture project. Prove:
1. Mac 1 claims a development fixture.
2. Lease renewal is visible.
3. Kill Mac 1 during a disposable job.
4. Wait for lease expiry and reclaim.
5. Restart the stale process.
6. The stale fence cannot complete the reclaimed job.

Keep the fixture explicitly labelled synthetic.

## Acceptance C — cross-machine evidence

Mac 1 produces a harmless artifact. Mac 2 consumes it through the configured private artifact arrangement. Verify the recorded SHA-256 matches the bytes Mac 2 reads. Local directories with the same name are not evidence of sharing.

## Acceptance D — independent QA and integration

Use a disposable private repository. Mac 1 produces a candidate. Mac 2 independently fails one seeded defect, then passes the repaired candidate. Mac 3 must reject the failed candidate and integrate only the exact passing candidate after its configured checks. Verify remote `main` equals the reported source commit.

## Acceptance E — owner boundary

Prepare a synthetic candidate with both platform artifact placeholders and all eight **synthetic** fixture gates. Verify:
- worker credentials cannot approve;
- an outsider Google account is rejected;
- an allowed owner can reach review;
- changing the manifest invalidates prior approval.

Do not label placeholder artifacts as mobile-build evidence.

## Acceptance F — first real pilot

Only after A-E pass, start one private pilot. Recommended first concept: **Neighborhood Pizza Routes**. Run:

`reference-intelligence -> opportunity-entrepreneur -> studio-plan -> design -> architecture -> implementation -> independent QA -> integration -> release-evidence`

A real candidate requires actual Android and iOS builds and the eight evidence categories. Physical-device, signing and store steps remain `not_run` until performed.

## Operational definition

The studio is **operational for development** when A-D pass with real Macs.

It is **operational for release preparation** when a real pilot also has reproducible Android/iOS builds and exact-build evidence.

It is **operational for publishing** only after issue #3's restricted signing/store adapter has been accepted against sandbox/internal tracks.

Do not collapse these three states into one green badge.
