// GET/PUT /api/state — read and upsert Mike's synced Scribbler state.
const { neon } = require("@neondatabase/serverless");

const sql = neon(process.env.DATABASE_URL);
const MAX_STATE_BYTES = 900000;

function authed(req) {
  const key = String(req.headers["x-sync-key"] || "").trim();
  const secret = String(process.env.SYNC_SECRET || "").trim();
  return secret.length > 0 && key === secret;
}

module.exports = async function handler(req, res) {
  try {
    if (!authed(req)) {
      return res.status(401).json({ error: "bad sync key" });
    }

    if (req.method === "GET") {
      const rows = await sql`
        select state, updated_at from scribbler_state where id = 'mike'
      `;
      const row = rows[0];
      return res.status(200).json({
        state: row ? row.state : null,
        updatedAt: row ? new Date(row.updated_at).toISOString() : null,
      });
    }

    if (req.method === "PUT" || req.method === "POST") {
      const body = req.body || {};
      const state = body.state;
      const isPlainObject =
        state !== null && typeof state === "object" && !Array.isArray(state);
      if (!isPlainObject) {
        return res.status(400).json({ error: "state must be an object" });
      }
      if (JSON.stringify(state).length >= MAX_STATE_BYTES) {
        return res.status(400).json({ error: "state too large" });
      }

      const rows = await sql`
        insert into scribbler_state (id, state, updated_at)
        values ('mike', ${JSON.stringify(state)}::jsonb, now())
        on conflict (id) do update
          set state = excluded.state, updated_at = now()
        returning updated_at
      `;
      return res.status(200).json({
        ok: true,
        updatedAt: new Date(rows[0].updated_at).toISOString(),
      });
    }

    res.setHeader("Allow", "GET, PUT, POST");
    return res.status(405).json({ error: "method not allowed" });
  } catch (err) {
    console.error("api/state error:", err);
    return res.status(500).json({ error: "server" });
  }
};
