const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto');
const sql = neon(process.env.DATABASE_URL);
const sign = e => crypto.createHmac('sha256', process.env.SESSION_SECRET).update(String(e)).digest('hex');
const eq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const passwordEq = (a, b) => eq(
  crypto.createHash('sha256').update(String(a)).digest(),
  crypto.createHash('sha256').update(String(b)).digest()
);
function authed(req) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)kws=(\d+)\.([a-f0-9]{64})(?:;|$)/);
  return !!m && +m[1] > Date.now() && eq(m[2], sign(m[1]));
}
module.exports = async (req, res) => {
  const a = req.query.a;
  try {
    if (a === 'login' && req.method === 'POST') {
      const ok = !!process.env.APP_PASSWORD && passwordEq((req.body || {}).password || '', process.env.APP_PASSWORD);
      if (!ok) return res.status(401).json({ error: 'bad password' });
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
  } catch (e) { console.error(e); res.status(500).json({ error: 'server error' }); }
};
