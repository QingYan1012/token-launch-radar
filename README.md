# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/QingYan1012/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/QingYan1012/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: pre-token DeFi protocols ranked by implied value, each with a farm plan. It reads a sealed DefiLlama snapshot (758 protocols, 40 on the watchlist), scores every pre-token protocol, and renders a dashboard a reader can sort, filter and open per protocol.

The model (radar-2) prices each sector at its own multiple: the median market-cap-per-dollar-of-TVL of the snapshot's own live-token protocols in that sector, falling back to the global median where a sector has too few live protocols to measure. Growth, age with no token, and chain breadth adjust it from there. No protocol name is special-cased; the multiples are recomputed from the snapshot on every run.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path/to/snapshot.json>
```

Node 22.18 or later, standard library only. It writes `out/board.json` (226 rows: the 40 watchlist protocols plus 186 early ones below the floor), `out/data.js`, `out/dashboard/` and `out/screenshots/`, and `out/dossier.json` for the judge.

## The dashboard

Open `out/dashboard/index.html` after a run. It shows the ranked board with a highlights strip (top three, fastest seven-day mover, newest protocol), search, category and chain filters, a watchlist-only toggle, a live-token view set apart with market caps, a per-protocol detail view with the model's full breakdown and an eight-step farm plan, and a sector table listing every sector's multiple and sample count. No network: every byte it shows comes from the snapshot.

---

<sub>Entered on [make.fun](https://make.fun/?ref=cqd53j9d&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
