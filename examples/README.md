# Candidate examples

For the current native dashboard, use `manifestInput` and `GATES` in `cloudflare/native/models.mjs` as the canonical schema. `dashboard/models.py` and `dashboard/demo.py` belong to the legacy Python application and are not compatible native candidate examples.

The native payload uses `project_id`, `version`, `source_commit`, `artifacts.android` and `artifacts.ios` (each with `url` and `sha256`), `evidence` entries with `key`, `status`, `report_url` and `summary`, plus `blocking_issues` and `launch_summary`. Gate keys are `automated_tests`, `android_device`, `ios_device`, `save_migration`, `performance`, `privacy_ads`, `licenses`, and `launch_materials`. Status is `pass`, `fail` or `not_run`. Verify these against the current code before submission.

Do not convert the demo into a production candidate. Create real candidate manifests in private storage, using a real source commit, artifact hashes, installation links and independently verified reports. Production link validation rejects query-string tokens and hosts outside the allowlist. Create the dashboard project before submitting its candidate.

`scripts/submit_candidate.py` accepts a private JSON file and a locally configured intake credential. It can submit a candidate only; it cannot approve, upload or publish the release.

Pass `--base-url` explicitly using the verified `APP_ORIGIN` from the target configuration. The helper's historical default points to the earlier hostname; do not rely on it. Do not send a credential to a guessed environment. Never turn example hashes or fabricated reports into a production candidate.
