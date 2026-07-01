"use strict";
/**
 * Scribbler end-to-end suite.
 *
 * Runs against a throwaway copy of the site in <repo>/.test-site (built by
 * globalSetup, served by tests/serve.js). Tests that mutate the data files
 * get pristine copies restored in beforeEach. Service workers are blocked
 * in playwright.config.js so caching never interferes.
 */
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..");
const TS_INBOX = path.join(REPO_ROOT, ".test-site", "data", "inbox.json");
const TS_VERSION = path.join(REPO_ROOT, ".test-site", "version.json");

// Pristine copies captured from the real (never-mutated) source files.
const PRISTINE_INBOX = fs.readFileSync(path.join(REPO_ROOT, "data", "inbox.json"), "utf8");
const PRISTINE_VERSION = fs.readFileSync(path.join(REPO_ROOT, "version.json"), "utf8");
// Every shipped inbox.json item lands in the "inbox" stage on first load, so
// this is the expected Inbox row count / nav badge for a fresh device.
const PRISTINE_INBOX_COUNT = JSON.parse(PRISTINE_INBOX).items.length;

const STORE_KEY = "scribbler.state.v1";

// Known ids from the shipped data (verified against data/seed.json + data/inbox.json).
const CAP_FROG_ID = "cap-2026-07-01-red-dot-docs"; // focus:true -> auto-frog on first load
const NEXT_1 = "seed-google-indexing"; // first row in the Next section
const NEXT_2 = "seed-salary-guide";
const NEXT_3 = "seed-weekly-webinar";
const NEXT_4 = "seed-byu-ads";
const PRACTICE_1 = "hab-guitar";

/* ---------------- helpers ---------------- */

const readState = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORE_KEY);

// The app has finished fetching + merging + rendering once #board-count has
// text (renderAll runs only after buildModel/saveState complete).
async function boot(page) {
  await page.waitForFunction((key) => {
    const bc = document.getElementById("board-count");
    return !!localStorage.getItem(key) && !!bc && bc.textContent.trim() !== "";
  }, STORE_KEY);
}

async function go(page, screen) {
  await page.click(`.nav [data-nav="${screen}"]`);
  await expect(page.locator(`#screen-${screen}`)).toHaveClass(/active/);
}

// The single-slot toast has pointer-events when shown and can sit over other
// controls for 5s; dismiss it deterministically when a test doesn't need it.
const dismissToast = (page) =>
  page.evaluate(() => {
    const t = document.getElementById("toast");
    if (t) t.classList.remove("show");
  });

async function openSection(page, stage) {
  const sec = page.locator(`details.section[data-sec="board.${stage}"]`);
  const isOpen = await sec.evaluate((el) => el.open);
  if (!isOpen) {
    await sec.locator("summary").click();
    await expect(sec).toHaveJSProperty("open", true);
  }
  return sec;
}

// Put a task on Focus via its detail sheet ([data-open] row -> [data-act="focus"]).
async function focusViaSheet(page, id) {
  await dismissToast(page);
  await page.click(`#board-sections [data-open="${id}"]`);
  await expect(page.locator("#sheet")).toHaveClass(/show/);
  await page.click('#sheet [data-act="focus"]');
}

function restorePristineData() {
  fs.writeFileSync(TS_INBOX, PRISTINE_INBOX);
  fs.writeFileSync(TS_VERSION, PRISTINE_VERSION);
}

/* ---------------- suite ---------------- */

test.beforeEach(async ({ page }) => {
  restorePristineData();
  await page.goto("/");
  await boot(page);
});

test("1. first-load calm: frog card shows the Red Dot task, Inbox badge matches shipped captures", async ({ page }) => {
  const frog = page.locator(".frog");
  await expect(frog).toBeVisible();
  await expect(frog.locator(".frog-title")).toContainText("Go through all the documents");

  const dot = page.locator("#nav-dot");
  await expect(dot).toBeVisible();
  await expect(dot).toHaveText(String(PRISTINE_INBOX_COUNT));

  const state = await readState(page);
  expect(state.focusId).toBe(CAP_FROG_ID);
  expect(state.focusIds).toContain(CAP_FROG_ID);
});

test("2. merge is idempotent across reloads: seenIds stable, unique, no duplicate inbox rows", async ({ page }) => {
  const s0 = await readState(page);
  const len0 = s0.seenIds.length;
  expect(len0).toBeGreaterThan(0);

  await page.reload();
  await boot(page);
  const s1 = await readState(page);
  expect(s1.seenIds.length).toBe(len0);
  expect(new Set(s1.seenIds).size).toBe(s1.seenIds.length);

  await page.reload();
  await boot(page);
  const s2 = await readState(page);
  expect(s2.seenIds.length).toBe(len0);
  expect(new Set(s2.seenIds).size).toBe(s2.seenIds.length);

  // Exactly one row per shipped capture item — reloading must never duplicate.
  await go(page, "inbox");
  await expect(page.locator("#inbox-list .row")).toHaveCount(PRISTINE_INBOX_COUNT);
});

test("3. Claude push preserves progress: new inbox item lands, done/moved tasks untouched", async ({ page }) => {
  // Make progress: complete NEXT_1 and move NEXT_2 (next -> soon) on the Board.
  await go(page, "board");
  await page.click(`#board-sections [data-toggle="${NEXT_1}"]`);
  await expect
    .poll(async () => (await readState(page)).tasks[NEXT_1]?.done)
    .toBe(true);
  await dismissToast(page);
  await page.click(`#board-sections [data-move="${NEXT_2}"]`);
  await expect
    .poll(async () => (await readState(page)).tasks[NEXT_2]?.stage)
    .toBe("soon");
  await dismissToast(page);

  // Simulate a Claude push: append one item, bump dataVersion.
  const newId = "cap-2026-07-01-e2e-claude-push";
  const inbox = JSON.parse(fs.readFileSync(TS_INBOX, "utf8"));
  inbox.items.push({
    id: newId,
    createdAt: new Date().toISOString(),
    title: "E2E claude push item",
    note: "",
    suggestedStage: "inbox",
    suggestedGroup: null,
    suggestedType: null,
    suggestedValue: null,
    suggestedHorizon: null,
    suggestedOwner: null,
    focus: false,
    source: "claude",
  });
  fs.writeFileSync(TS_INBOX, JSON.stringify(inbox, null, 2));
  const ver = JSON.parse(fs.readFileSync(TS_VERSION, "utf8"));
  ver.dataVersion += 1;
  fs.writeFileSync(TS_VERSION, JSON.stringify(ver, null, 2));

  await page.reload();
  await boot(page);
  // Wait until the merge has actually seen the pushed item.
  await page.waitForFunction(
    ({ key, id }) => {
      const s = JSON.parse(localStorage.getItem(key) || "{}");
      return Array.isArray(s.seenIds) && s.seenIds.includes(id);
    },
    { key: STORE_KEY, id: newId }
  );

  // New item is in the Inbox with the "new" badge.
  await go(page, "inbox");
  const newRow = page.locator(`#inbox-list .row[data-id="${newId}"]`);
  await expect(newRow).toBeVisible();
  await expect(newRow).toContainText("E2E claude push item");
  await expect(newRow.locator(".tag.new")).toBeVisible();

  // Progress survived the push + reload.
  const state = await readState(page);
  expect(state.tasks[NEXT_1].done).toBe(true);
  expect(state.tasks[NEXT_1].stage).toBe("done");
  expect(state.tasks[NEXT_2].stage).toBe("soon");
});

test("4. WIP limit of 3 enforced with the trade-off sheet", async ({ page }) => {
  // The cap item ships with focus:true, so Focus already holds 1.
  await go(page, "board");
  await focusViaSheet(page, NEXT_1);
  await expect(page.locator("#sheet")).not.toHaveClass(/show/);
  await focusViaSheet(page, NEXT_2);
  await expect(page.locator("#sheet")).not.toHaveClass(/show/);
  await expect.poll(async () => (await readState(page)).focusIds.length).toBe(3);

  // Attempt a 4th: the trade-off sheet must appear instead.
  await focusViaSheet(page, NEXT_3);
  const sheet = page.locator("#sheet");
  await expect(sheet).toHaveClass(/show/);
  await expect(sheet).toContainText("Something's got to give");

  // Complete the swap: take the frog off, the new one comes on.
  await sheet.locator(`[data-swap="${CAP_FROG_ID}"]`).click();
  await expect(sheet).not.toHaveClass(/show/);

  const state = await readState(page);
  expect(state.focusIds.length).toBe(3);
  expect(state.focusIds).toContain(NEXT_3);
  expect(state.focusIds).not.toContain(CAP_FROG_ID);
});

test("5. one-tap move shows Undo toast, and Undo puts the task back", async ({ page }) => {
  await go(page, "board");
  await page.click(`#board-sections [data-move="${NEXT_1}"]`);

  const toast = page.locator("#toast");
  await expect(toast).toHaveClass(/show/);
  await expect(toast).toContainText("Moved to Soon");
  const undo = page.locator("#toast-act");
  await expect(undo).toHaveText("Undo");

  await undo.click();
  await expect.poll(async () => (await readState(page)).tasks[NEXT_1]?.stage).toBe("next");
  await expect(
    page.locator(`details.section[data-sec="board.next"] .row[data-id="${NEXT_1}"]`)
  ).toBeVisible();
});

test("6. un-completing a task restores its prior stage (soon, not next)", async ({ page }) => {
  await go(page, "board");
  // Move NEXT_1 from Next to Soon.
  await page.click(`#board-sections [data-move="${NEXT_1}"]`);
  await expect.poll(async () => (await readState(page)).tasks[NEXT_1]?.stage).toBe("soon");
  await dismissToast(page);

  // Complete it from the Soon section (it sorts first there: order 1010).
  await openSection(page, "soon");
  await page.click(
    `details.section[data-sec="board.soon"] [data-toggle="${NEXT_1}"]`
  );
  await expect.poll(async () => (await readState(page)).tasks[NEXT_1]?.done).toBe(true);
  await dismissToast(page);

  // Un-complete it from the Done section.
  await openSection(page, "done");
  await page.click(
    `details.section[data-sec="board.done"] [data-toggle="${NEXT_1}"]`
  );
  await expect.poll(async () => (await readState(page)).tasks[NEXT_1]?.done).toBe(false);

  const state = await readState(page);
  expect(state.tasks[NEXT_1].stage).toBe("soon");
  await expect(
    page.locator(`details.section[data-sec="board.soon"] .row[data-id="${NEXT_1}"]`)
  ).toBeVisible();
});

test("7. local capture lands in Inbox and survives a reload", async ({ page }) => {
  const title = "Buy new strings for the guitar";
  await page.click("#add-btn");
  await expect(page.locator("#sheet")).toHaveClass(/show/);
  await page.fill("#add-title", title);
  await page.click("#add-save");

  await expect(page.locator("#screen-inbox")).toHaveClass(/active/);
  await expect(page.locator("#inbox-list .row", { hasText: title })).toBeVisible();

  await page.reload();
  await boot(page);
  await go(page, "inbox");
  await expect(page.locator("#inbox-list .row", { hasText: title })).toBeVisible();

  const state = await readState(page);
  const local = Object.values(state.tasks).find(
    (u) => u.local && u.materialized && u.materialized.title === title
  );
  expect(local).toBeTruthy();
  expect(local.stage).toBe("inbox");
});

test("8. board section collapse state persists across reloads", async ({ page }) => {
  await go(page, "board");
  const soon = page.locator('details.section[data-sec="board.soon"]');
  await expect(soon).toHaveJSProperty("open", false); // collapsed by default

  await soon.locator("summary").click();
  await expect(soon).toHaveJSProperty("open", true);
  await expect.poll(async () => (await readState(page)).collapsed["board.soon"]).toBe(false);

  await page.reload();
  await boot(page);
  await go(page, "board");
  await expect(
    page.locator('details.section[data-sec="board.soon"]')
  ).toHaveJSProperty("open", true);
});

test("9. practices: check persists same-day, clears on day rollover", async ({ page }) => {
  const details = page.locator("#practices-details");
  await details.locator("summary").click();
  await expect(details).toHaveJSProperty("open", true);

  await page.click(`[data-prac="${PRACTICE_1}"]`);
  await expect(page.locator("#prac-summary")).toContainText("1/");
  await expect(page.locator(`[data-prac="${PRACTICE_1}"]`)).toHaveClass(/(^|\s)on(\s|$)/);

  // Same day: still checked after reload.
  await page.reload();
  await boot(page);
  await expect(page.locator("#prac-summary")).toContainText("1/");
  await expect(page.locator(`[data-prac="${PRACTICE_1}"]`)).toHaveClass(/(^|\s)on(\s|$)/);

  const state = await readState(page);
  expect(state.practices.today[PRACTICE_1]).toBe(true);

  // Simulate a day rollover: pretend the checks were saved yesterday.
  await page.evaluate((key) => {
    const s = JSON.parse(localStorage.getItem(key));
    const d = new Date();
    d.setDate(d.getDate() - 1);
    s.practices.date =
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0");
    localStorage.setItem(key, JSON.stringify(s));
  }, STORE_KEY);

  await page.reload();
  await boot(page);
  await expect(page.locator("#prac-summary")).toContainText("0/");
  const rolled = await readState(page);
  expect(rolled.practices.today[PRACTICE_1]).toBeFalsy();
});

test("10. export backup downloads valid JSON with tasks and seenIds", async ({ page }) => {
  await page.click("#menu-btn");
  await expect(page.locator("#sheet")).toHaveClass(/show/);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click('#sheet [data-m="export"]'),
  ]);
  expect(download.suggestedFilename()).toMatch(/^scribbler-backup-.*\.json$/);

  const file = await download.path();
  const backup = JSON.parse(fs.readFileSync(file, "utf8"));
  expect(backup.tasks).toBeDefined();
  expect(typeof backup.tasks).toBe("object");
  expect(Array.isArray(backup.seenIds)).toBe(true);
  expect(backup.seenIds.length).toBeGreaterThan(0);
});
