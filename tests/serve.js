"use strict";
/**
 * Tiny zero-dependency static file server for the throwaway test site.
 * Serves <repo>/.test-site on http://127.0.0.1:4173 with no caching,
 * so mutations to .test-site/data/*.json are always picked up.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", ".test-site");

// Belt and braces: if globalSetup hasn't run yet, build the site copy now.
if (!fs.existsSync(path.join(ROOT, "index.html"))) {
  require("./setup-site")();
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

const server = http.createServer((req, res) => {
  // Strip query string (?v=... cache-busting) and decode.
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1:4173").pathname);
  } catch (e) {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }
  if (pathname === "/") pathname = "/index.html";

  // Resolve inside ROOT only (no path traversal).
  const filePath = path.join(ROOT, pathname);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, { "Cache-Control": "no-store" });
      res.end("Not found");
      return;
    }
    const type = TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(buf);
  });
});

server.listen(4173, "127.0.0.1", () => {
  console.log("Scribbler test server on http://127.0.0.1:4173 serving " + ROOT);
});
