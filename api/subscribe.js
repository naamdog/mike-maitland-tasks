// GET/POST/DELETE /api/subscribe — VAPID public key + push subscription management.
const { neon } = require("@neondatabase/serverless");

const sql = neon(process.env.DATABASE_URL);

function authed(req) {
  const key = String(req.headers["x-sync-key"] || "").trim();
  const secret = String(process.env.SYNC_SECRET || "").trim();
  return secret.length > 0 && key === secret;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      // Public: the browser needs this key before it can subscribe.
      return res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY });
    }

    if (!authed(req)) {
      return res.status(401).json({ error: "bad sync key" });
    }

    if (req.method === "POST") {
      const body = req.body || {};
      const subscription = body.subscription;
      const endpoint =
        subscription && typeof subscription === "object"
          ? subscription.endpoint
          : null;
      const keys =
        subscription && typeof subscription === "object"
          ? subscription.keys
          : null;
      const valid =
        typeof endpoint === "string" &&
        endpoint.startsWith("https://") &&
        keys &&
        typeof keys === "object" &&
        typeof keys.p256dh === "string" &&
        typeof keys.auth === "string";
      if (!valid) {
        return res.status(400).json({ error: "invalid subscription" });
      }

      await sql`
        insert into scribbler_push_subs (endpoint, sub)
        values (${endpoint}, ${JSON.stringify(subscription)}::jsonb)
        on conflict (endpoint) do update set sub = excluded.sub
      `;
      return res.status(200).json({ ok: true });
    }

    if (req.method === "DELETE") {
      const body = req.body || {};
      const endpoint = body.endpoint;
      if (typeof endpoint !== "string" || endpoint.length === 0) {
        return res.status(400).json({ error: "endpoint required" });
      }
      await sql`delete from scribbler_push_subs where endpoint = ${endpoint}`;
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "method not allowed" });
  } catch (err) {
    console.error("api/subscribe error:", err);
    return res.status(500).json({ error: "server" });
  }
};
