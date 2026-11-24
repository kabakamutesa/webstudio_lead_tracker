let neon = null, driverError = null;
try { ({ neon } = require('@neondatabase/serverless')); } catch (e) { driverError = 'package @neondatabase/serverless not installed (is package.json in the repo root?)'; }
const crypto = require('crypto');
const URL_ = process.env.DATABASE_URL || process.env.POSTGRES_URL, SECRET = process.env.SESSION_SECRET, PASS = process.env.APP_PASSWORD;
const sql = neon && URL_ ? neon(URL_) : null;
const sign = e => crypto.createHmac('sha256', SECRET).update(String(e)).digest('hex');
const eq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
function authed(req) {
  if (!SECRET) return false;
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)kws=(\d+)\.([a-f0-9]{64})(?:;|$)/);
  return !!m && +m[1] > Date.now() && eq(m[2], sign(m[1]));
}
module.exports = async (req, res) => {
  const a = req.query.a;
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (a === 'health') {  // public, but reveals no secrets and no lead data unless signed in
      const out = { DATABASE_URL_set: !!URL_, APP_PASSWORD_set: !!PASS, SESSION_SECRET_set: !!SECRET, driver: driverError || 'ok', signed_in: authed(req),
        deployment: process.env.VERCEL_ENV || 'not running on Vercel', branch: process.env.VERCEL_GIT_COMMIT_REF || null,
        commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null,
        similar_variable_names_seen: Object.keys(process.env).filter(k => /DATA|POSTGRES|NEON|SECRET|PASS|SESSION/i.test(k)).sort() };
      if (sql) {
        try { const r = await sql`SELECT count(*)::int AS n FROM leads WHERE deleted_at IS NULL`; out.database = 'connected, leads table ok'; if (out.signed_in) out.live_leads = r[0].n; }
        catch (e) { out.database = 'FAILED'; out.error = String(e.message || e).slice(0, 200); }
      } else out.database = 'not attempted (driver or DATABASE_URL missing)';
      return res.json(out);
    }
    if (!sql) return res.status(500).json({ error: driverError || 'DATABASE_URL is not set in Vercel' });
    if (a === 'login' && req.method === 'POST') {
      if (!SECRET || !PASS) return res.status(500).json({ error: 'APP_PASSWORD or SESSION_SECRET is not set in Vercel' });
      if (!eq(String((req.body || {}).password || ''), PASS)) return res.status(401).json({ error: 'bad password' });
      const e = Date.now() + 30 * 864e5;
      res.setHeader('Set-Cookie', `kws=${e}.${sign(e)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`);
      return res.json({ ok: 1 });
    }
    if (!authed(req)) return res.status(401).json({ error: 'login required' });
    if (a === 'load') {
      const rows = await sql`SELECT * FROM leads WHERE deleted_at IS NULL ORDER BY created`;
      const st = await sql`SELECT key, value FROM settings`;
      return res.json({
        leads: rows.map(r => ({ id: r.id, name: r.name, niche: r.niche, phone: r.phone, email: r.email, website: r.website,
          location: r.location, source: r.source, status: r.status, next: r.next_followup, notes: r.notes,
          last: r.last_contact == null ? undefined : Number(r.last_contact), created: Number(r.created), log: r.log })),
        settings: Object.fromEntries(st.map(s => [s.key, JSON.parse(s.value)]))
      });
    }
    if (a === 'save' && req.method === 'POST') {
      const { up = [], del = [], st = {} } = req.body || {};
      const q = [];
      for (const l of up) {
        if (!l.id || !l.name) continue;
        q.push(sql`INSERT INTO leads (id,name,niche,phone,email,website,location,source,status,next_followup,notes,last_contact,created,log,deleted_at)
          VALUES (${l.id},${l.name},${l.niche || ''},${l.phone || ''},${l.email || ''},${l.website || ''},${l.location || ''},${l.source || ''},${l.status || 'new'},${l.next || ''},${l.notes || ''},${l.last || null},${l.created || Date.now()},${JSON.stringify(l.log || [])}::jsonb,NULL)
          ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,niche=EXCLUDED.niche,phone=EXCLUDED.phone,email=EXCLUDED.email,website=EXCLUDED.website,
          location=EXCLUDED.location,source=EXCLUDED.source,status=EXCLUDED.status,next_followup=EXCLUDED.next_followup,notes=EXCLUDED.notes,
          last_contact=EXCLUDED.last_contact,log=EXCLUDED.log,deleted_at=NULL,updated_at=now()`);
      }
      if (del.length) q.push(sql`UPDATE leads SET deleted_at = now() WHERE id = ANY(${del})`);
      for (const [k, v] of Object.entries(st)) q.push(sql`INSERT INTO settings (key,value) VALUES (${k},${JSON.stringify(v)}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
      if (q.length) await sql.transaction(q);
      return res.json({ ok: 1 });
    }
    res.status(404).json({ error: 'not found' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'server error: ' + String(e.message || e).slice(0, 160) }); }
};