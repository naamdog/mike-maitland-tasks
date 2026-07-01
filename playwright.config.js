"use strict";
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: require.resolve("./tests/global-setup.js"),
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 390, height: 844 },
    // CRITICAL: block service workers so sw.js caching never interferes with tests.
    serviceWorkers: "block",
  },
  webServer: {
    command: "node tests/serve.js",
    port: 4173,
    reuseExistingServer: true,
  },
});
