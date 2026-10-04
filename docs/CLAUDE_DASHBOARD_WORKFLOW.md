# How Claude works with the dashboard

The dashboard stores work, progress and review decisions. Claude Code runs on a configured Mac through `scripts/studio_worker.py`. Opening the website does not start a model, and giving Claude a repository URL alone does not connect that session to the queue. One initial worker setup connects the systems; ordinary assignments then run without repeated owner sign-in.

## What Claude receives

A worker authenticates with its own machine credential, advertises its supported roles, and claims an eligible assignment. The claim contains the game title and brief, category, intended audience, connectivity, repository identity, assigned role and instructions, and relevant predecessor results/artifact references. The runner prepares the isolated checkout and puts this context into Claude's prompt together with the shared contract and full role instructions. This is how the model sees its scoped studio work. It does not receive your Google session, approval authority, worker secret or unrestricted workspace administration.

The assignment context is a snapshot. A changed brief does not silently change a running assignment. Save the change, resolve/cancel affected work where necessary, and queue a new scoped assignment. Do not edit a running worktree to make the dashboard appear current.

## Where you follow progress

| Dashboard location | What you can see |
|---|---|
| Overview | Attention items, games in production and latest agent updates. |
| Games → selected game | Its brief/repository, recorded work, recent progress, exact builds and review state. |
| Work queue → assignment | Current phase, chronological recent reports, completed steps, blocker/next step and final checks/artifacts. |
| Workers | Last contact and role capabilities of each registered Mac, plus its claimed jobs. |
| Builds & reviews | Android/iOS installation links, exact source/hash identity, eight evidence gates and your final decision. |

The interface refreshes operational views while visible and idle. Refresh manually when needed; active forms and reading position must be preserved. A heartbeat only proves recent contact. An agent saying it completed a step is a progress report; the final result and independent evidence are separate. There is no invented percentage, token spend or delivery ETA.

## How updates reach you

The runner publishes factual lifecycle steps: preparing the assignment, executing Claude, validating outputs and reporting the result. A writable role can also write the assignment's dedicated `.studio/progress.json` file after a meaningful milestone, before a long check, or when blocked. The runner polls that file every ten seconds and sends validated changes through the leased worker API. It keeps its credential outside Claude's subprocess. Read-only roles retain their existing permissions: they get runner lifecycle updates and a final structured report, without being granted source-write access just for telemetry.

Example of model-authored progress content (illustrative, not evidence):

```json
{
  "update_id": "save-recovery-check-1",
  "phase": "validating",
  "summary": "Implemented the interrupted-save recovery path; running the recovery checks.",
  "completed": ["Added atomic save replacement", "Added recovery fixtures"],
  "next_step": "Run the interruption checks and inspect their results.",
  "blocker": ""
}
```

Allowed phases are `preparing`, `executing`, `validating`, `reporting` and `blocked`. These are reported descriptions, not queue-state transitions. Never report a check as passed before observing its result. Never include secrets, raw logs, private user data or unsupported forecasts. Give each changed report a new ID and replace the file completely; incomplete JSON is not a valid update. The prompt supplies the exact output path and limits.

The server adds the timestamp, worker identity and lease fence. It accepts updates only from the worker holding that assignment's current lease, rejects stale/cross-worker writes, and does not let progress approve or complete a job. Reports are size/rate bounded and identical reports do not create repeated events. The recent history retains at most 40 reports per job and 400 across the studio; full continuity belongs in private checkpoints/artifacts. Retention can remove older dashboard reports.

## Connecting your studio once

1. Deploy the current native Worker and dashboard source, preserving the existing database and Google access configuration. The server advertises progress support as `job_queue.progress_updates`.
2. Follow [worker setup](WORKER_SETUP.md): install/authenticate the included-plan Claude Code client on a dedicated Mac account, verify the configured model/effort and permissions, configure private repositories/artifacts, and supply its machine token through the worker environment. Keep credentials out of Git and chat.
3. Run the worker's non-mutating doctor, then explicitly start the runner:

   ```bash
   python3 scripts/studio_worker.py --config /absolute/private/worker.json --doctor
   python3 scripts/studio_worker.py --config /absolute/private/worker.json --execute
   ```

4. In Games, create an original game and link its existing private repository. Start production once, or use [game-name kickoff](START_A_GAME.md) for configured private-repository bootstrap and intake.
5. Confirm the Mac appears in Workers, the assignment moves from queued to running, and a dated update appears. Open the saved result before considering the assignment complete.

Use the exact supported model selection verified in your installed Claude client and subscription. The framework does not turn a product name into an available model or create additional allowance. The runner is bounded by configured jobs/idle polls/timeouts; it is not an automatically installed 24-hour service. Existing machines need a deliberately configured service/restart policy if continuous operation is wanted.

## Your feedback and final review

You can open an exact Android/iOS candidate, test it, and request changes with a concrete note. The decision and feedback stay with that candidate. Use its scoped follow-up assignment to send that feedback, version and source identity back to a role. A saved request for changes by itself does not start repair work. The agent must produce fresh evidence and a new candidate after changes; an earlier approval cannot carry over to changed builds.

Updates are delivered inside the dashboard. This source does not configure email, push notifications, Slack messages or store publishing. Worker results never approve releases, impersonate you, or upload a game. Live Claude execution, machine connectivity and device tests must be verified in the configured environment; local fixtures establish software behavior only.
