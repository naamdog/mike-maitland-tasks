# Scribbler — session handoff

State of play for whoever picks this up next (Claude or Mike).
**Architecture, data shapes, and the "push a task to the Inbox" procedure live in [`CLAUDE.md`](CLAUDE.md) — read that first.** This file is *current state, gotchas, and what's next*, so it doesn't duplicate them.

Last verified: app v1.1.2 / `dataVersion` 20 / commit `15cd526`.

---

## 1. Read this before you touch anything

**Always `git pull` first.** The Visions notes app pushes commits to this repo *on its own*, whenever Mike flags a note "To Do". A local checkout goes stale within days. (Last session started 14 commits behind.)

**Never hand-edit `data/inbox.json` without pulling** — you'll clobber Visions captures. Append only; never reuse or reorder ids.

**Version bumps are load-bearing:**
- Changed `data/*.json` → bump `dataVersion` in `version.json`
- Changed `index.html` or `sw.js` → bump `appVersion` in **both** `version.json` **and** `APP_VERSION` in `sw.js` (they must match, or installed phones keep serving a stale cached app)

**Run the tests before pushing app changes:** `npx playwright test` (10 specs, ~10s). CI runs them on every push to main — keep it green.

**Secrets are never in this repo.** Mike's sync code and all env values live in the Vercel project `scribbler-tasks` (production) and in Claude's local memory file. Don't paste them into any tracked file — this repo is **public**.

---

## 2. What's live and confirmed working

| Thing | Status | Evidence |
|---|---|---|
| App | https://scribbler-tasks.vercel.app | 200, v1.1.2 |
| Auto-deploy | Vercel↔GitHub connected; push to `main` ships | verified |
| CI | GitHub Actions, 10 Playwright specs | green on latest runs |
| Cloud sync | Mike's phone is synced | cloud state: 13 tasks, 90 seenIds, frog set |
| Push reminders | armed, 1 device subscribed | `/api/remind?dry=1` → `subCount: 1` |
| Daily cron | `/api/remind` at `0 0 * * *` UTC (7am Bangkok) | `vercel crons ls` |
| Visions → Inbox | **live and actively used** | 16 `vis-*` captures, Jul 3→15 |

Env vars set in Vercel production (6): `DATABASE_URL`, `SYNC_SECRET`, `CRON_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.

---

## 3. What was built (chronological)

1. **Rebuilt** a dense dark task list into Scribbler: calm light mobile-first PWA, iOS-installable. Focus / Inbox / Board + Weekly Check-in, Eat-the-Frog with a hard WIP-3 limit, daily practices, one-tap "move along", collapsible everything.
2. **Visions integration** — flagging a note "To Do" in `naamdog/visions` commits it into this repo's inbox (`lib/scribbler-push.ts`, fired from the notes `PUT` route via `after()`). Idempotent by `vis-<noteId>`; hardened against concurrent flags (blob-sha reads + retry, no force-push). Merged to `master` there.
3. **v1.1.0 — sync + reminders + tests**: `api/state.js`, `api/subscribe.js`, `api/remind.js`; client sync engine (task-level merge by `updatedAt`, debounced push, pull on open/resume, keepalive flush); 10-spec Playwright suite + CI.
4. **v1.1.1** — removed the "Reset everything" button (Mike: *"dont have that incase i press it!!"*).
5. **v1.1.2** — renamed "Weekly Reset" → **"Weekly Check-in"** everywhere (the word *Reset* read as destructive; the flow deletes nothing). In-review "Remove" → "Let it go".

---

## 4. Mike-specific rules (learned the hard way)

- **Nothing destructive in the UI.** No delete-all, no scary words. He reacted strongly to both "Reset everything" and the word "Reset". Prefer reversible + soft language ("Let it go", "Someday").
- **Explain in plain English**, not jargon — he asked for "8th grade language" and it landed well.
- **He's ENTP and easily overwhelmed**: lead with one thing, hide the rest behind toggles, make autonomous calls instead of offering menus of options.
- **He builds fast** (~30 min/app) and correctly pushed back that cost estimates were inflated ~40x. On his Max plan the marginal cost of a well-scoped build is ≈ $1. Don't pad estimates.

---

## 5. Open observation worth acting on

**The Inbox is filling faster than it's being triaged** — 17 unsorted items, while the last recorded device sync (`2026-07-05`) predates the most recent captures (through `2026-07-15`). Capture is working; *processing* may not be happening.

If so, the highest-value next move isn't a new feature — it's making triage effortless: e.g. a "Sort 3 things" micro-prompt on the Focus screen, or having the daily reminder say *"12 things waiting — want to sort 3?"* instead of only naming the frog.

---

## 6. Roadmap — rated /10, gaps, and what a 10 looks like

Overall **~8/10**. The two structural gaps (durability, reminders) were closed in v1.1.0; what remains is polish and depth.

| Domain | Now | Gap → 10 |
|---|---|---|
| Calm / anti-overwhelm | 9.0 | money-maker frog nudge (spec'd, unbuilt); gentle inbox-triage nudge |
| Visual design | 8.5 | iOS splash screens; optional auto dark mode; real empty-state art |
| iOS PWA polish | 8.0 | manifest shortcuts (long-press → Add); Siri/Shortcut voice capture |
| GTD fidelity | 8.5 | projects holding a designated *next action*; snooze/tickler dates |
| Capture | 9.0 | voice capture; **two-way** Visions sync (completing here un-flags the note) |
| Data durability | 9.0 | nightly automated backup of cloud state to GitHub |
| Accessibility | 7.5 | focus-trap + Escape on sheets; move focus on tab change; VoiceOver pass |
| Performance | 9.0 | keyed per-section re-render (only matters past ~500 tasks) |
| Engineering safety | 9.0 | add API-layer tests (`api/*.js` are currently untested by CI) |
| Habit stickiness | 8.0 | "frogs eaten this week" insight card; inbox-count in the daily nudge |

**Best next three:** (1) inbox-triage nudge, (2) two-way Visions sync, (3) API tests.

---

## 7. Handy commands

```bash
git pull && npx playwright test
```

Manual reminder preview (needs the sync code from Claude's memory file):

```bash
curl -s "https://scribbler-tasks.vercel.app/api/remind?dry=1" -H "x-sync-key: YOUR_SYNC_CODE"
```
