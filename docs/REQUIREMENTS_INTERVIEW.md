# Owner interview: complete decision register

Recorded from this conversation. Consolidated on 2026-10-03. There were **29 numbered questions**, plus clarifications. The answers below summarize the owner; they are not a verbatim transcript. Later corrections override earlier assistant recommendations. Secrets are deliberately omitted.

## 01 — Budget and resources
**Answer:** Existing hardware and Claude subscription, plus payment for store enrollment. No additional spending on asset packs, cloud services, AI APIs, contractors or advertising. Agents create original materials or use suitably licensed free resources. Open-source does not automatically mean license-free. The exact engine/tool licenses still require review. Official platform tools and ad SDKs may be proprietary; assess those necessities explicitly.

## 02 — Owner availability
**Answer C:** 3–4 hours per day for product decisions, physical playtesting and final release review. Do not treat this as unlimited review capacity.

## 03 — Quantity and deadline
**Answer C, clarified:** 100 finished games is the portfolio ambition. Sixty days is aspirational. Extend the timeline rather than ship untested or low-quality games. Prototypes do not count as finished releases.

## 04 — Primary game family
**Answer:** Casual simulation and business-management games first: pizza restaurants, petrol stations and pet-care businesses. Puzzles, arcade and other approachable genres remain possible. Large multiplayer shooters such as PUBG/Free Fire are out of scope.

## 05 — Controls and interaction
**Answer:** Choose per game. Character movement, steering, tapping, hands-on tasks and decision-driven interactions are all allowed. The supplied references include Pizza Ready, Idle Bank Tycoon and BitLife. No universal joystick-only decision was made.

## 06 — Audience
**Answer D:** Define age group and content boundaries per game. Do not assume every game targets adults or children. Complete a per-game advertising/privacy assessment before implementation.

## 07 — Connectivity
**Answer D:** Choose offline/online features per game. Evaluate hosting, synchronization, account management and ongoing costs before approving online features. No permission to buy infrastructure follows from this answer.

## 08 — Physical devices
**Answer C:** Android and iOS devices are available. Exact models, OS versions, performance tiers and tablet coverage remain to be inventoried. Macs and simulators do not replace touch-device testing.

## 09 — Store publishing identity
**Answer D:** Individual versus organization enrollment is undecided. Research eligibility, documents, public seller identity, ongoing business obligations and fees. Do not enroll or form a company automatically.

## 10 — Human testers
**Answer B:** The owner can recruit at least 12 people. This is a recruitment commitment, not evidence that testing has occurred. Keep participation and feedback records private. Store-specific requirements must be rechecked before launch.

## 11 — Advertising
**Answer C with some B:** Optional rewarded ads and banners, with limited interstitials at natural breaks. Never cover controls or interrupt active tasks. Ad frequency requires testing. Ads are the primary revenue plan, not a revenue guarantee.

## 12 — Platform sequence
**Answer C:** Prepare and test Android and iOS together before launching either. Include phones/tablets and iPhone/iPad. Store approvals can arrive separately. Web is optional where economically feasible; parity is not assumed.

## 13 — Repository visibility
**Answer B:** Public master processes/templates; private per-game repositories. The actual master is `swiftSaneGames/saneGamesMaster`, which currently remains private. Do not change visibility without an explicit action request and a sensitive-content review.

## 14 — Human approval checkpoints
**Clarified answer:** Only one scheduled human checkpoint: final release review. Agents review concepts, prototypes, architecture and QA. The owner approves the exact tested Android/iOS candidate and launch pack. Do not stop for routine concept/prototype approvals. Rejected candidates return for fixes. Each materially changed candidate and each update needs fresh approval. Identity verification, missing information, legal agreements or unexpected spending still require appropriate owner involvement.

## 15 — Markets
**Answer:** Select markets based on supported download demand, by category. Do not silently substitute India-first or English-first. Global install bands do not identify country demand. Language decisions remain per game, informed by evidence.

## 16 — Subscription count
**Answer A:** One Claude subscription across three Macs. Do not interpret this as three separate AI allowances.

## 17 — Subscription tier
**Answer C:** Claude Max 20x. No paid API fallback or extra usage purchases. Save progress and wait when the included allowance is unavailable. Resolve supported model names in the installed tool; do not assume the initially mentioned model/feature names exist.

## 18 — Visual style
**Answer D:** Agents choose per game. Define a style guide and performance budget. Original or appropriately licensed assets only; no extracted competitor artwork. Design tools may assist with UI prototypes and documents, not certify finished gameplay.

## 19 — Existing game code
**Clarification:** No owned game projects exist. The owner meant Claude would receive tested builds to publish, not preexisting source to clone. Reference games are research inputs, not authorized source-code assets.

## 20 — Mac availability
**Answer B:** All three Macs may run studio jobs around the clock. Availability does not promise continuous Claude capacity or authorize unsafe unattended releases.

## 21 — Reference research fallback
**Answer B+C:** Use accessible gameplay videos, official listings and reviews. Request a focused owner recording when key mechanics remain unclear. Mark direct play, recording observations and inferences separately. A recording request is information gathering, not another product-approval checkpoint.

## 22 — Git workflow
**Answer C:** Direct to `main`, no PRs. Use one writer per game repository, isolated work areas, independent review and pre-push checks. Never force-push over other work. A code push must not trigger store publication.

## 23 — Organic launch marketing
**Answer D:** Store pages, gameplay videos and appropriate community content. Agents choose the mix per game. No paid acquisition, spam or fake reviews. Include launch materials in the final approval pack.

## 24 — First-release depth
**Answer B+C:** Multiple locations, staff/equipment unlocks, deeper economies and substantial progression. Validate small slices internally, then build enough distinct content for a complete release. Do not use repetitive waiting or cosmetic reskins to inflate scope.

## 25 — Post-launch updates
**Answer A+B, clarified:** Aim for a meaningful update every 30 days per released game. Invest larger expansions in games with stronger player demand. Urgent fixes come earlier. Treat 30 days as a planning target, not permission to bypass QA. At 100 live games this implies roughly 100 update candidates each month, before new releases.

## 26 — Maintenance capacity
**Answer B:** Reserve development and testing capacity for maintenance. Determine the allocation using measured work from early releases. New-game work must not consume the entire maintenance reserve.

## 27 — Approval interface
**Answer A:** Private studio dashboard with exact builds, test evidence, known issues and approval/request-fixes actions. No agent may impersonate the owner. GitHub comments are not the chosen approval interface.

## 28 — Dashboard access
**Answer C:** Internet-accessible website login, with private operations and owner-only approvals. Two-step authentication, audit records and secure hosting are requirements, not proof of a completed deployment.

## 29 — Domain and build responsibility
**Custom answer:** The owner controls `swiftsane.com`; the target is `prod.sanegames.swiftsane.com`. Build the dashboard, not merely recommend hosting. DNS/TLS/hosting and production identity setup still require implementation and verification.

## Additional repository correction
Use the existing `swiftSaneGames/saneGamesMaster`. Do not create a competing master named `studio-control`. Preserve existing code and history. The owner requested ongoing code commits, but no unscheduled background execution is implied.

## Open decisions and missing evidence
Exact mobile-device inventory; legal publishing entity; validated engine/ad-plugin versions; production DNS/hosting access; final original-code license; per-game age/markets/network policy; trustworthy monthly/country download data. These are not answered by the catalog. Record agent proposals separately from owner decisions.
