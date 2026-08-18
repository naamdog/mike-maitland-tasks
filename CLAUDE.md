# Scribbler — instructions for Claude

> **Start with [`HANDOFF.md`](HANDOFF.md)** for current state, gotchas, and roadmap.
> Two rules that bite immediately: **`git pull` first**, and **run `npx playwright test`**
> before shipping app changes. (The Visions app used to push here autonomously; that was
> removed on 2026-08-19, so the repo is no longer written to behind your back.)

Scribbler is Mike Maitland's personal, calm, mobile-first task PWA. It is a static site
(HTML/CSS/JS, no backend) deployed on Vercel from this GitHub repo. All user progress lives
in the browser's `localStorage` on Mike's device — **there is no user data in this repo**, which
is exactly what makes it safe for you to edit these files without ever wiping his progress.

## How to push a task to Mike's Inbox (the main thing you'll be asked to do)

When Mike says something like *"add to my inbox: …"* or *"put this on my mind: …"*:

1. **Edit ONE file: `data/inbox.json`.** APPEND one object to the `items` array.
   **Never** rewrite, reorder, or delete existing items. Never change an existing `id`.

   ```json
   {
     "id": "cap-2026-07-01-red-dot-docs",
     "createdAt": "2026-07-01T09:12:00Z",
     "title": "Cleaned-up task text",
     "note": "",
     "suggestedStage": "inbox",
     "suggestedGroup": null,
     "suggestedType": null,
     "suggestedValue": null,
     "suggestedHorizon": null,
     "suggestedOwner": null,
     "focus": false,
     "source": "claude"
   }
   ```

   - `id`: `"cap-" + YYYY-MM-DD + "-" + short-slug-of-title`. Must be globally unique forever
     (it is the merge key). If that id already exists, add a `-2` suffix.
   - `createdAt`: current ISO timestamp.
   - `title`: the cleaned-up task.
   - `suggested*`: fill ONLY the tags you can confidently infer; leave the rest `null`.
     Enums — `suggestedType`: `project|quick`; `suggestedValue`: `money|infra`;
     `suggestedHorizon`: `short|mid|long`; `suggestedOwner`: `delegate|you`.
   - `focus`: `true` ONLY if Mike says it's what's on his mind *right now*. It will surface as
     his "frog" — but only if he has fewer than 3 focus items and no frog already set.
   - `source`: always `"claude"`.

2. **Edit `version.json`:** increment `dataVersion` by 1 (this busts the cache so the app
   refetches). Leave `appVersion` alone unless you changed app code.

3. `git add data/inbox.json version.json && git commit && git push`. Vercel auto-deploys.
   On Mike's next open (or when he re-focuses the app), the new item appears in his Inbox,
   badged **new**, without touching any of his existing progress.

**Guardrails:** append-only to `items`; never change existing ids; always bump `dataVersion`;
one task = one object.

## Scribbler Portal — the task board (v1.2.0)

There is now a **desktop task board** at https://scribbler-portal.vercel.app
(repo: `../Scribbler Portal`, Vercel project `scribbler-portal`). It is a
four-column kanban with its own MCP server, and it can hand cards on to the ABC
CRM and TEFL Heaven boards.

**Use the board's MCP for new tasks.** `data/inbox.json` still works and still
holds 18 historical Visions captures, but nothing writes to it automatically any
more — for "add this to my board", call the portal's `add_card` tool. No commit,
no `dataVersion` bump, no deploy.

How the two fit together:

- The **board owns its own cards.** This app mirrors them (`syncPortal()` in
  `index.html`, talking to the portal's `/api/scribbler` with the same
  `x-sync-key` the PWA already uses — no second credential).
- A board card this app **has never seen lands in the Inbox badged "new"**,
  exactly like a Claude capture. Nothing arrives pre-sorted.
- After that, **newest `updatedAt` wins per card** — the same merge rule two
  phones already use. Neither surface can silently undo the other.
- Board columns map down as `done → done`, `in_review → soon`, everything else
  → `next`. Upward, only `done` is meaningful; the phone can't demote an
  In Progress card by moving a row. `focus` (Mike's frog) syncs **both** ways.
- Local changes queue in `STATE.portalOutbox` and flush on the next sync, so it
  works offline.
- Board cards sort **above** the seeded backlog (`order: -1000+i`) — otherwise a
  card spoken onto the board lands under ninety legacy items and reads as broken.
- A locally captured task can be pushed up via the detail sheet
  (**Send to the task board**); it keeps its id, so it becomes the same task on
  both sides rather than a duplicate.

## If you change the app UI or logic (`index.html`, `sw.js`)
Bump `appVersion` in **both** `version.json` and the `APP_VERSION` constant at the top of
`sw.js` (they must match) so the service worker purges the old cached shell.

## Re-seeding the big task list
`data/seed.json` holds the ~90 pre-organized tasks + daily practices. You may improve titles
or add tasks here. **Keep every existing `id` stable** — an id is the permanent handle for a
task's saved progress. Changing an id orphans that task's state. New tasks use `seed-<slug>`.

## Cloud sync + push reminders (v1.1.0)
The app now has a tiny backend: Vercel serverless functions in `api/` + two Neon
Postgres tables (`scribbler_state`, `scribbler_push_subs` — shared Neon instance
with the Visions app). Env vars live in the Vercel project `scribbler-tasks`
(production): `DATABASE_URL`, `SYNC_SECRET`, `CRON_SECRET`, `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. **Never commit any of these.**

- `api/state.js` — GET/PUT the whole localStorage state blob (row id `mike`),
  auth via `x-sync-key: <SYNC_SECRET>`. The client merges task-by-task using
  per-task `updatedAt`, so devices never clobber each other.
- `api/subscribe.js` — GET returns the VAPID public key; POST/DELETE store or
  remove a Web-Push subscription (auth required).
- `api/remind.js` — hit daily by Vercel Cron (00:00 UTC = 07:00 Bangkok, see
  `crons` in vercel.json). Sends "Today's frog 🐸 <title>" (Fridays: Weekly
  Reset nudge). `?dry=1` previews without sending. Prunes dead subscriptions.
- Mike enables sync per device via ⋯ menu → Sync, entering his sync code
  (= SYNC_SECRET). Reminders require sync + (on iPhone) the installed PWA.

## Tests — run them before shipping app changes
`npm install && npx playwright test` runs a 16-test Playwright suite
(`tests/scribbler.spec.js`) against a throwaway copy of the site in
`.test-site/`. It covers: merge idempotency, Claude-push preserving progress,
WIP-3 focus limit, undo, un-done restoring stage, capture persistence,
collapse persistence, practice day-rollover, export, priority tags (16), and
(11–15) the portal board sync — new cards landing in the Inbox badged new, the phone reporting a
completion back to the board, and the board winning over a stale phone copy.
The portal is stubbed with `page.route`, so the suite stays offline. GitHub Actions
(`.github/workflows/tests.yml`) runs it on every push to main — **keep it
green**. If you change UI ids/flows in index.html, update the tests.

## Files
- `index.html` — the whole app (inline CSS + JS, including sync/push client).
- `data/seed.json` — pre-organized tasks + practices (initial defaults only; user's localStorage wins after any edit).
- `data/inbox.json` — the capture queue you append to. **Claude only now**: the Visions push was removed on 2026-08-19 (it committed a file per note and collided with live sessions). Prefer the portal's `add_card` MCP tool over editing this at all.
- `version.json` — `{ appVersion, dataVersion }`.
- `sw.js` — service worker (shell cache-first, data network-first, push handlers; never caches `/api/`).
- `api/` — serverless functions (sync + reminders), see above.
- `tests/`, `playwright.config.js`, `.github/workflows/tests.yml` — e2e suite + CI.
- `manifest.json`, `icons/*` — PWA install assets.
- `vercel.json` — no-cache headers on data + service worker; daily reminder cron.
- `package.json` — api deps (@neondatabase/serverless, web-push) + Playwright.
