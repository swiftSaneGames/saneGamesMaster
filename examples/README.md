# Candidate examples

See the `Manifest` model in `dashboard/models.py` for the canonical validation schema and `dashboard/demo.py` for explicitly fictional demo data.

Do not convert the demo into a production candidate. Create real candidate manifests in private storage, using a real source commit, artifact hashes, installation links and independently verified reports. Production link validation rejects query-string tokens and hosts outside the allowlist. Create the dashboard project before submitting its candidate.

`scripts/submit_candidate.py` accepts a private JSON file and a locally configured intake credential. It can submit a candidate only; it cannot approve, upload or publish the release.
