# 500 Google Play game references

**Research date: 2026-10-03. This is a curated, unranked reference catalog—not a verified worldwide “top 500” chart.**

[`games_500.csv`](games_500.csv) contains **500 distinct, directly verified Google Play package identities from 282 developers**. The catalog supports sanGames' discovery process: identify a small, enjoyable mechanic, build an original prototype, and test whether players find it fun. Every row links to its official listing.

Listing verification establishes the displayed title, developer, package identity, and store category at retrieval. It does **not** establish popularity, commercial success, play quality, absence of competitive features, child suitability, worldwide availability, or the effort to reproduce a whole product. **No entry is an automatic production greenlight.**

## Coverage

| Studio category | References | Useful starting questions |
|---|---:|---|
| Adventure | 20 | Can one small exploration or interaction loop work without a large world or story campaign? |
| Arcade | 30 | Can a short interaction remain enjoyable with forgiving timing and no opponent ranking? |
| Board & Card | 50 | Can a solo card, tile, or matching activity work without gambling or mandatory opponents? |
| Casual | 55 | Does a clear action create satisfying feedback within a short session? |
| Educational | 65 | Is there one demonstrable learning objective and an appropriate child experience? |
| Music & Rhythm | 20 | Can original or licensed audio support an accessible, forgiving timing loop? |
| Puzzle | 193 | Can rules, generated levels, hints, and fair progression create a small original game? |
| Simulation | 65 | Can one shop, garden, pet, or production loop work before adding a whole economy? |
| Strategy | 2 | Can solo resource allocation work without armies, guild wars, or competitive pressure? |
| **Total** | **500** | **Research inputs, not 500 approved production commitments.** |

Categories follow the listing's `applicationCategory`, with Card and Board combined, Music renamed Music & Rhythm, and Word included in Puzzle. Store categories occasionally look surprising: a coloring or puzzle title may identify itself as Board. Each row preserves the original category in `notes`; these labels are not independently certified genre classifications.

**Hyper-casual is a scope and interaction style, not a separate category asserted here.** Suitable short-loop candidates occur across Arcade, Casual, Puzzle, and Simulation. An agent should apply that label after assessing controls, session length, content demands, and prototype scope.

## How the catalog was assembled

1. Retrieve official Google Play category pages for Adventure, Arcade, Board, Card, Casual, Educational, Music, Puzzle, Simulation, Strategy, and Word. Discovery used the US and India storefront parameters, with English display language.
2. Supplement those category pages with official Play developer catalogs and targeted Play searches for relaxing puzzles, cozy games, coloring, educational games, music, farming, word games, solitaire, Sudoku, nonograms, mahjong, and similar mechanics.
3. Deduplicate the discovered Play package links. The research pass found **1,769 unique candidates**.
4. Retrieve individual public Play listing pages with `hl=en_US&gl=US`. **1,766 listings returned usable identity metadata; three failed verification and never entered the final catalog.** Read the listing's JSON-LD identity data and displayed description for screening.
5. Screen out unrelated app categories, obvious shooters, battle royale, military combat, casino or gambling titles, competitive-first board games, major multiplayer descriptions, large combat RPGs, and unsuitable themes. Also screen descriptions for competition signals, while recognizing that marketing descriptions can omit optional game systems.
6. Review the surviving names and descriptions, exclude additional obvious mismatches, remove demo/lite variants and same-developer title duplicates, and balance the reference set across the requested genres. Limit each developer to at most twelve entries. Generic names can repeat across different developers and package IDs; those are distinct listings.
7. Select 500 references. Alphabetical grouping and `REF-0001` identifiers help navigation; **neither is a rank or quality score**.
8. Validate the checked-in CSV's schema, identifiers, URLs, count, uniqueness, verification labels, and exclusions.

Discovery pages help find candidates; the **individual listing URL in each CSV row is the identity source**. No third-party estimated downloads, revenue, ratings, or chart positions appear in this dataset. Publisher descriptions can change, and an accessible web listing does not prove installation eligibility on an Indian account or device.

### Representative primary discovery sources

- [Google Play puzzle category](https://play.google.com/store/apps/category/GAME_PUZZLE?hl=en_US&gl=US)
- [Google Play casual category](https://play.google.com/store/apps/category/GAME_CASUAL?hl=en_US&gl=IN)
- [Google Play educational category](https://play.google.com/store/apps/category/GAME_EDUCATIONAL?hl=en_US&gl=US)
- [Google Play music category](https://play.google.com/store/apps/category/GAME_MUSIC?hl=en_US&gl=US)
- [Google Play simulation category](https://play.google.com/store/apps/category/GAME_SIMULATION?hl=en_US&gl=US)
- [HyperBeard on Google Play](https://play.google.com/store/apps/developer?id=HyperBeard&hl=en_US&gl=US)
- [Dr. Panda on Google Play](https://play.google.com/store/apps/developer?id=Dr.%20Panda&hl=en_US&gl=US)
- [Rainbow Train on Google Play](https://play.google.com/store/apps/developer?id=Rainbow%20Train&hl=en_US&gl=US)
- [PlaySimple Games on Google Play](https://play.google.com/store/apps/developer?id=PlaySimple%20Games&hl=en_US&gl=US)
- [Infinity Games on Google Play](https://play.google.com/store/apps/developer?id=Infinity%20Games%2C%20Lda&hl=en_US&gl=US)

## Read the fields accurately

| Field | Meaning |
|---|---|
| `game_id` | Stable reference identifier within this initial catalog; never a market rank. Preserve it when updating an existing row. |
| `title`, `developer`, `package_id` | Identity displayed by the directly retrieved Play listing. |
| `play_url` | Canonical package link for opening the game listing. |
| `category` | Studio grouping derived from the listing's store category. |
| `studio_fit` | Always `candidate_requires_playtest`; a shortlist input with unresolved suitability. |
| `complexity` | **Planning inference**, not a source claim. `small_loop_estimate` suggests a narrow puzzle/card/timing interaction. `vertical_slice_estimate` suggests extracting one interaction from a larger adventure/management product. Neither estimates the effort to recreate the complete listed game. |
| `competitive_mode` | Always `not_established_from_listing`. Description screening removes evident competition; it cannot certify that every mode is noncompetitive. |
| `source_url` | The specific official listing retrieved with language and country parameters. |
| `verification_status` | `direct_play_listing_verified` verifies metadata identity only. |
| `verified_at` | Actual retrieval timestamp in UTC, in ISO 8601 format. |
| `ranking_status` | Always `unranked_reference`. |
| `notes` | Original store category, scope guidance, and unresolved checks; no fabricated playtest observations. |

**Why no global top-500 claim?** A useful ranking needs a named metric, country, store, chart type, and observation time. None was specified, and no authoritative single worldwide 500-game chart was established during this research. Do not relabel this file “top 500,” sort its IDs as rankings, or infer install counts from inclusion. A future chart-enrichment task should add independently sourced observations without silently changing the meaning of these references.

## Turn a reference into an original sanGames concept

For each serious candidate, create a game brief containing:

1. **Reference evidence:** exact `game_id`, fresh official URL, retrieval date, and the single mechanic worth studying.
2. **Original concept:** a different name, visual identity, assets, characters, progression, levels, and expressive details. Reference research never grants permission to copy code, brands, music, artwork, or proprietary content.
3. **Tiny playable scope:** one core verb, one session, one scene or board, one win/finish condition, and a measurable completion criterion. Remove backend multiplayer, guild systems, live events, and expansive content requirements from the first prototype.
4. **Feel-good fit:** explain how a player succeeds without opposing other players. Include forgiving timing, retry behavior, readable feedback, sound controls, and accessibility choices.
5. **Unknowns to resolve:** actual device availability, ads and purchases, optional competitive modes, content/age fit, offline behavior, session pressure, asset licenses, and performance.
6. **Evidence-based decision:** test the original prototype, record results in the dashboard, and choose iterate, archive, or advance. A marketing description is never a substitute for the studio's final game review.

The listed rhythm and cooking games can involve timing pressure. Their presence means their mechanics may be worth studying—not that their difficulty already satisfies sanGames' comfort goals. Educational titles need age, learning, parental-control, and child-privacy review before development decisions. Larger simulations and adventures are interaction references; their complete production scope is deliberately outside a small prototype commitment.

Free Fire, PUBG, first-person shooters, competitive war/base-building products, casino games, and major online combat titles are not suitable greenlight targets. The owner's examples of strategy or simulation genres do not override the studio's small, cheerful, noncompetitive scope. A reference such as Wobbly Life should not be labeled a verified Android release without checking a specific official package listing.

## Validation and maintenance

From the repository root:

```bash
python3 scripts/validate_catalog_500.py
```

The validator uses only Python's standard library and does not require network access. It checks exactly 500 unique package IDs, required columns, official matching listing URLs, category labels, timestamps, conservative verification language, and obvious excluded title terms. It **does not** automatically reverify store pages or gameplay suitability. A passing validation result is a data-integrity check, not a release approval.

When updating:

- Reopen the row's official listing; confirm that its current package, title, and developer still match.
- Preserve `game_id` for the same reference. Record redirects, removals, and region restrictions instead of inventing replacements.
- Change `verified_at` only after a successful fresh retrieval.
- Keep failed or unavailable candidates out of the verified 500; document replacements and their evidence in the change description.
- Add independently collected playtest or ranking evidence as a separate artifact. Never overwrite an unknown field with an assumption.
- Run the validator after changes. Review the final diff for accidental competitor assets, copied descriptions, unsupported market claims, and duplicate editions.

The older [`games_100.csv`](games_100.csv) retains its existing publisher-research purpose and was not overwritten. These datasets can overlap; do not combine their row counts and claim 600 distinct games without deduplicating package identities.
