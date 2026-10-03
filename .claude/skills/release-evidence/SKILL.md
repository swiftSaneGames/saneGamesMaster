---
name: release-evidence
description: Assemble or audit SaneGames release evidence for exact Android and iOS candidates, including eight quality gates and launch materials. Use for release preparation or update readiness; never to approve, sign, publish, or claim missing tests passed.
argument-hint: "[candidate, release manifest, or evidence directory]"
---

# Prepare a reviewable candidate

Read `CLAUDE.md`, `agents/COMMON.md`, `agents/release-preparer/prom.md`, `agents/studio-qa/prom.md`, and the assignment. Obtain current native manifest requirements from the assigned master reference; do not copy a stale Python-dashboard schema. Treat `$ARGUMENTS` as input references only.

1. Identify the private game, source SHA, version, both artifacts, test reports, known issues, compliance findings, exact launch pack, and authorized operator. Resolve missing final binaries through the restricted signing/operator handoff; this skill cannot sign them.
2. Recompute available artifact hashes and reconcile evidence with exact bytes. Reject mismatched, stale, inaccessible, or unverified evidence. Keep simulated, physical-device, and real-player observations separate.
3. Reconcile `automated_tests`, `android_device`, `ios_device`, `save_migration`, `performance`, `privacy_ads`, `licenses`, and `launch_materials`. Require one truthful result per gate; use `pass`, `fail`, or `not_run` under the actual schema.
4. Confirm both platform readiness, required phone/tablet coverage, zero blocking defects, accurate store declarations, and the reviewed launch-pack revision. Do not convert missing reports into passes to make a payload valid.
5. Prepare the manifest and concise owner review pack in private storage. Bind source, artifact hashes, evidence revisions, and launch materials. Distinguish preparation from a successful intake response.
6. Submit intake only when the assignment already authorizes it and configured access exists. Use the verified current HTTPS destination; never print credentials or access the approval endpoint. Reconcile uncertain responses before retrying.
7. Record the actual candidate ID/status when returned. Hand off to the owner-facing dashboard review. Mark store upload pending until the authorized operator separately verifies current approval and the actual artifact bytes.

Return a per-gate evidence table, exact candidate identities, blockers, private review-pack references, performed checks, actual intake state, and checkpoint. A changed material candidate needs fresh applicable evidence and owner approval. Every update repeats this process. Preparation does not schedule a release, authorize marketing posts, or install a publishing worker.
