# Studio technology and operating decisions

This is the framework's technical direction, selected under the owner's 2026-10-03 authorization to complete the studio architecture. Exact game engine/SDK versions remain gated by export, license and device evidence. Do not infer deployed services from this table.

| Layer | Selected direction | Required evidence / boundary |
|---|---|---|
| Coordination/dashboard | Existing Cloudflare Workers, SQLite Durable Objects, static HTML/CSS/JavaScript | Preserve current store identity/migrations; test real runtime and authentication. |
| Job execution | Python 3.12+ standard-library Mac runner calling installed Claude Code | Doctor checks CLI, local repository identity, model-plan setup and capabilities. |
| Models | Opus 5.5 as preferred included-plan profile; optional Fable 5.1 | Verify installed aliases/access and included allowance; Fable can require usage credits. No paid fallback. |
| Advanced coding mode | Optional supported Ultracode setting | Runtime feature, not a model ID; enable only after installed-version/resource verification. |
| Visual design | Claude Design primary; portable design handoffs into the game engine | Verify available Design integration/exports; retain editable source, screen states and asset provenance. |
| Game engine standard | Godot 4 with typed GDScript, subject to project feasibility spike | Pin a proven stable version per game after Android/iOS export, ad-adapter and save tests. |
| Family architecture | Service-business simulation, idle economy, branching decisions; add other casual families when justified | Share versioned infrastructure, preserve distinct mechanics and progression. |
| Art/audio | Original work or commercially compatible free assets; scripted low-complexity assets and approved local tools | License/attribution, source files, export parameters and measured device budgets. |
| Native platforms | Official Android toolchain; Xcode/iOS tooling on Macs | Real phones/tablets, signing separation and current store requirements. |
| Repository operations | Git/GitHub, one private repository per original game, one integration writer | Independent review and non-force direct-to-main; verify identity/privacy before bootstrap. |
| Testing | Deterministic game tests, independent QA, device/performance tests, genuine human UAT | Exact source/build/device evidence; no substitute of mocked tests for physical evidence. |
| Advertising | Explicit platform adapter interface; test ads while developing | Select licensed supported SDK only after audience/privacy/export spike. No live-ad clicking by testers. |
| Artifacts | Configured private shared artifact root or future validated artifact adapter | Cross-machine paths must actually resolve; hash candidate patches/builds and control access. |
| Release | Manifest-bound owner review; restricted signing/publisher adapter separately validated | Queue success cannot approve/upload; final human review remains required. |

## Subscription efficiency

Start with one game production lane and bounded independent research. Expand from measured throughput, QA capacity and the owner's review time. Three Macs share one subscription allocation. Prefer cached research, concise checkpoints, narrow diffs and deterministic scripts to rereading the entire studio context.

Use the smallest useful role set for a task. Use deeper reasoning for architecture, difficult debugging and risky migrations when it improves outcomes. Do not set maximum effort on every job or launch every agent simultaneously. Stop on unavailable included allowance; preserve work instead of buying capacity.

Claude Design and Code availability depend on the actual account. Model names alone do not establish entitlement. Initial environment/account setup is an operational prerequisite, not an intermediate product approval gate.

## Game architecture contract

Keep simulation/economy deterministic, presentation/input separate, save data versioned and platform services behind adapters. Use injectable clocks, randomness and ad responses in tests. Specify content as validated data where useful. Keep cloud accounts/multiplayer optional; do not introduce ongoing infrastructure costs for a simple offline loop.

A successful vertical slice must install on both mobile platforms, preserve saves, demonstrate the real control loop and meet documented device budgets. After that evidence, the architect records exact engine/dependency versions in the private game's README and decision log. Web export requires its own feasibility/performance check.

## Sources and verification

- [Claude model configuration](https://code.claude.com/docs/en/model-config): supported model selection and effort/workflow settings; recheck installed-version support.
- [Opus 5.5 announcement](https://www.anthropic.com/claude-opus-5-5): model identity and positioning, not a guarantee of studio output.
- [Claude Design](https://www.anthropic.com/news/claude-design-anthropic-labs): primary design product direction.
- [Godot license](https://godotengine.org/license/), [Android export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_android.html), [iOS export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_ios.html): verify exact version and native dependencies before adoption.
- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/): current coordination/storage architecture.

Sources checked or identified on 2026-10-03. Version pinning, runtime installation and commercial-policy decisions require current evidence when used.
