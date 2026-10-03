# Research pack — 2026-10-03

This pack adds the missing research records to the existing dashboard checkpoint. It is a **source-linked research baseline**, not a list of proven best sellers or a finished autonomous game studio.

## Files

| File | What it contains |
|---|---|
| [Requirements interview](../docs/REQUIREMENTS_INTERVIEW.md) | All 29 numbered questions and final answers, including corrections. |
| [20 studios](studios_20.csv) | 10 primary publishers/studios and 10 backup references, with official links. |
| [100 game references](games_100.csv) | Exactly 10 titles per primary publisher, 100 unique research records. |
| [Download observations](download_observations.csv) | Two sourced lifetime Google Play install bands; not monthly or country downloads. |
| [Original shortlist](GAME_SHORTLIST.md) | Twelve proposed original concepts and reasons to prototype them. |
| [Prioritization](PRIORITIZATION.md) | Evidence rules, missing data, and how demand differs from build suitability. |
| [Store enrollment](STORE_ENROLLMENT.md) | Initial India-focused checklist, fees and explicitly unresolved verification items. |
| [Studio blueprint](../docs/STUDIO_BLUEPRINT.md) | Proposed stack, repository architecture, QA and release roadmap. |
| [Agent organization](../docs/AGENT_ORGANIZATION.md) | Role contracts and handoff rules; not an implemented scheduler. |
| [Research prompt](../scraper/RESEARCH_PROMPT.md) | Evidence-first instructions for the reference researcher. |
| [Sources](SOURCES.md) | Technical and process sources; catalog URLs also appear directly in the CSVs. |

## What was actually verified

The titles were observed in official publisher catalogs, publisher case-study links, or official Google Play developer catalogs. Catalog inclusion establishes an association, not current installation availability in every country, ownership of every asset, or sales leadership. Some publishers release partner studios' games. The 20 entries are a research watchlist, not 20 verified independent corporate groups.

Nobody played these 100 games in this research session. `playtest_status=not_played` is deliberate. Catalog display names may omit localized marketing suffixes. `research_family_proposed` is an editorial research tag, not a verified feature specification.

## Important limitations

The original request asked for each publisher's top ten selling or downloaded games. **That ranking has not been established.** These are ten relevant catalog references per publisher. Every `market_priority` remains `PENDING_DATA`. Monthly downloads and target countries remain blank, not zero. Do not tell another agent these are the top 100 or create 100 production repositories automatically.

The two install-band observations provide a limited demand signal only. A publisher-wide lifetime milestone and a historical hit article cannot rank a current individual title. iOS downloads are not inferred from Android data.

The first three owner examples are retained: Pizza Ready (G001), Idle Bank Tycoon (G021), and BitLife (Candywriter, backup S11). BitLife is discussed in the shortlist even though Candywriter is not one of the ten publishers used for the 100-row sample.

## Validation

From the repository root:

```bash
python3 scripts/validate_research.py
```

This validates record counts, identifiers, URLs, publisher joins and explicit missing-data fields. It does not re-open websites, measure downloads, test games or prove commercial viability.

The native dashboard imports this catalog through `scripts/build_hosted.mjs` and serves it through authenticated research APIs. Catalog integration does not prove the rankings, direct gameplay, worker orchestration or store publishing exists. The 29 detailed role contracts live in `agents/`; research agents must preserve the missing-data distinctions above.
