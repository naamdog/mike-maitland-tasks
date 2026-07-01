// GET /api/remind — daily push reminder, hit by Vercel Cron at 00:00 UTC (07:00 Bangkok).
const { neon } = require("@neondatabase/serverless");
const webpush = require("web-push");

const sql = neon(process.env.DATABASE_URL);

function authed(req) {
  const cronSecret = String(process.env.CRON_SECRET || "").trim();
  if (cronSecret && req.headers.authorization === "Bearer " + cronSecret) {
    return true;
  }
  const key = String(req.headers["x-sync-key"] || "").trim();
  const syncSecret = String(process.env.SYNC_SECRET || "").trim();
  return syncSecret.length > 0 && key === syncSecret;
}

function buildPayload(frogTitle) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date());

  if (weekday === "Fri") {
    let body = "5 calm minutes: choose next week's frog.";
    if (frogTitle) body += " Today's frog: " + frogTitle;
    return { title: "Weekly Check-in \u{1F9ED}", body, url: "/" };
  }
  if (frogTitle) {
    return {
      title: "Today's frog \u{1F438}",
      body: frogTitle.slice(0, 120),
      url: "/",
    };
  }
  return { title: "Scribbler", body: "Pick your one thing for today.", url: "/" };
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "method not allowed" });
    }
    if (!authed(req)) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const dry =
      req.query && (req.query.dry === "1" || req.query.dry === "true");

    const stateRows = await sql`
      select state from scribbler_state where id = 'mike'
    `;
    const state = stateRows[0] ? stateRows[0].state : null;
    const rawFrog = state && state.frogTitle;
    const frogTitle =
      typeof rawFrog === "string" && rawFrog.trim() ? rawFrog.trim() : null;

    const payload = buildPayload(frogTitle);

    const subs = await sql`
      select endpoint, sub from scribbler_push_subs
    `;

    if (dry) {
      return res
        .status(200)
        .json({ ok: true, dry: true, payload, subCount: subs.length });
    }

    if (subs.length === 0) {
      return res
        .status(200)
        .json({ ok: true, sent: 0, reason: "no subscriptions" });
    }

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const body = JSON.stringify(payload);
    const results = await Promise.allSettled(
      subs.map((row) => webpush.sendNotification(row.sub, body))
    );

    let sent = 0;
    const expired = [];
    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        sent += 1;
        return;
      }
      const code = result.reason && result.reason.statusCode;
      if (code === 404 || code === 410) {
        expired.push(subs[i].endpoint);
      } else {
        console.error(
          "api/remind push failed (status " + code + ")",
          result.reason && result.reason.message
        );
      }
    });

    for (const endpoint of expired) {
      await sql`delete from scribbler_push_subs where endpoint = ${endpoint}`;
    }

    return res.status(200).json({ ok: true, sent, pruned: expired.length });
  } catch (err) {
    console.error("api/remind error:", err);
    return res.status(500).json({ error: "server" });
  }
};
