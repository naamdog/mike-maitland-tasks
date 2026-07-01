"use strict";
/**
 * Creates a throwaway copy of the Scribbler static site into <repo>/.test-site.
 * Tests mutate .test-site/data/inbox.json and .test-site/version.json freely;
 * the real site files are never touched.
 */
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..");
const TEST_SITE = path.join(REPO_ROOT, ".test-site");

function setupSite() {
  fs.rmSync(TEST_SITE, { recursive: true, force: true });
  fs.mkdirSync(TEST_SITE, { recursive: true });

  const files = ["index.html", "sw.js", "manifest.json", "version.json"];
  for (const f of files) {
    fs.cpSync(path.join(REPO_ROOT, f), path.join(TEST_SITE, f));
  }

  const dirs = ["data", "icons"];
  for (const d of dirs) {
    const src = path.join(REPO_ROOT, d);
    if (fs.existsSync(src)) {
      fs.cpSync(src, path.join(TEST_SITE, d), { recursive: true });
    }
  }

  return TEST_SITE;
}

module.exports = setupSite;
module.exports.TEST_SITE = TEST_SITE;
module.exports.REPO_ROOT = REPO_ROOT;
