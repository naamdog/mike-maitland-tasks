# Scribbler — instructions for Claude

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

## If you change the app UI or logic (`index.html`, `sw.js`)
Bump `appVersion` in **both** `version.json` and the `APP_VERSION` constant at the top of
`sw.js` (they must match) so the service worker purges the old cached shell.

## Re-seeding the big task list
`data/seed.json` holds the ~90 pre-organized tasks + daily practices. You may improve titles
or add tasks here. **Keep every existing `id` stable** — an id is the permanent handle for a
task's saved progress. Changing an id orphans that task's state. New tasks use `seed-<slug>`.

## Files
- `index.html` — the whole app (inline CSS + JS).
- `data/seed.json` — pre-organized tasks + practices (initial defaults only; user's localStorage wins after any edit).
- `data/inbox.json` — the capture queue you append to.
- `version.json` — `{ appVersion, dataVersion }`.
- `sw.js` — service worker (shell cache-first, data network-first).
- `manifest.json`, `icons/*` — PWA install assets.
- `vercel.json` — no-cache headers on data + service worker.
