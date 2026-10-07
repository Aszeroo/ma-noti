# Issue tracker: GitHub Issues

Issues and specs for this repo live on **GitHub Issues**: https://github.com/Aszeroo/ma-noti/issues

## Conventions

- The spec for a feature is published as a **parent issue**; its editable source of truth stays as markdown under `.scratch/<feature-slug>/spec.md`
- Implementation tickets are one GitHub issue per ticket, titled `NN — <title>`, published in dependency order (blockers first)
- Blocking edges go in a `## Blocked by` section of each ticket body, listing the blocking issue numbers (`#N`) — GitHub has no native blocking relation
- Triage state is recorded as GitHub labels (see `triage-labels.md` for the label strings)
- Discussion, progress, and status changes happen in the issue itself

## When a skill says "publish to the issue tracker"

Create issues on `Aszeroo/ma-noti` with `gh` — spec as parent first, then tickets in dependency order, each labelled `ready-for-agent`.

## When a skill says "fetch the relevant ticket"

Read the GitHub issue by number (`gh issue view <n> -R Aszeroo/ma-noti`) — the user will normally pass the number or URL directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** ticket per question.

- **Map**: `.scratch/<effort>/map.md` — the Notes / Decisions-so-far / Fog body.
- **Child ticket**: a GitHub issue whose body starts with a `Type:` line (`research`/`prototype`/`grilling`/`task`); blocking via a `Blocked by: #N, #N` section; state via a `Status:` line (`claimed`/`resolved`) edited in the body.
- **Frontier**: open issues that are unblocked (every `Blocked by` issue resolved) and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` in the issue body before any work.
- **Resolve**: post the answer as an issue comment, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.
