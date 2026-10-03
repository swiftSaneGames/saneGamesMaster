# Confirmed studio decisions

These are requirements from the owner's planning session, not claims that all systems exist.

| Area | Decision |
|---|---|
| Organization | swiftSaneGames; working studio identity SaneGames |
| Master repository | `swiftSaneGames/saneGamesMaster`; public-master design, currently private; visibility unchanged |
| Game repositories | One private repository per game |
| Hardware | Three Macs; available around the clock |
| AI allocation | One Claude Max 20x subscription; no paid API fallback |
| Spending | Store enrollment plus existing resources; no additional paid assets, infrastructure or services |
| Owner availability | 3–4 hours daily |
| Testing devices | Access to Android and iOS devices; exact device inventory still to collect |
| External testers | Owner can recruit at least 12 people |
| Quantity | 100 games as an ambition; quality overrides the 60-day aspiration |
| Content depth | Multiple locations and deeper progression, not disposable prototypes |
| Genres | Business simulations and idle management first; decisions, puzzle and arcade also allowed |
| References | Pizza Ready, Idle Bank Tycoon and BitLife; no existing owned game code |
| Game experience | Easy-to-play, enjoyable original games; no large multiplayer shooters |
| Audience / network / graphics | Decide per game |
| Markets | Use supported download-demand research; do not substitute global totals for country estimates |
| Monetization | Optional rewarded ads and banners; occasional full-screen ads only at natural breaks |
| Launch platforms | Android and iOS readiness together; phones and tablets; optional web compatibility |
| Publishing identity | Individual versus organization still undecided |
| Git flow | Direct-to-main, with one writer and review/testing checks; no pull requests |
| Human checkpoint | Final release review only; also covers launch materials |
| Research fallback | Available evidence plus targeted owner recordings when necessary |
| Marketing | Store listings, short videos and appropriate community posts; no paid acquisition |
| Updates | Target meaningful updates every 30 days; bigger expansions follow demand |
| Capacity | Reserve maintenance capacity, size it using observed workload |
| Review interface | Private operational dashboard on an internet-accessible hostname |
| Domain | Owner-supplied swiftsane.com; target prod.sanegames.swiftsane.com |

A domain name is not a deployment. No DNS, hosting, repository or store action is confirmed by this requirements file.


## Implementation update — 2026-10-03

The historical hostname answer above records the planning session. Current `wrangler.jsonc` selects the native Cloudflare dashboard and `https://dashboard.sanegames.swiftsane.com` as `APP_ORIGIN`. Use the verified target configuration for operations; do not rewrite old answers as if the later implementation were the original choice. The expanded framework adds executable queue/worker code but still needs configured machine access and deployment acceptance.
