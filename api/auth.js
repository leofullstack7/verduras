const { createClient } = require('@supabase/supabase-js');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseBody(req) {
  const raw = req.body;
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object' && !Buffer.isBuffer(raw)) return raw;
  const str = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
  try { return JSON.parse(str); } catch { return {}; }
}

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase no configurado');
  return createClient(url, key, { auth: { persistSession: false } });
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const body = parseBody(req);
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password ?? '');
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    const supabase = getClient();

    const { data: admin, error: e1 } = await supabase
      .from('admin_users')
      .select('username, password_hash, display_name')
      .eq('id', 'main')
      .maybeSingle();
    if (e1) throw e1;
    if (admin?.username?.toLowerCase() === username && admin.password_hash === password) {
      return res.status(200).json({ ok: true, role: 'admin', name: admin.display_name || 'Olga' });
    }

    const { data: workers, error: e2 } = await supabase
      .from('workers')
      .select('id, name, username, password_hash, activo')
      .eq('username', username)
      .limit(1);
    if (e2) throw e2;
    const worker = workers?.[0];
    if (worker && worker.activo !== false && worker.password_hash === password) {
      return res.status(200).json({ ok: true, role: 'worker', id: worker.id, name: worker.name });
    }

    const { data: clients, error: e3 } = await supabase
      .from('clients')
      .select('id, name, username, password_hash')
      .eq('username', username)
      .limit(1);
    if (e3) throw e3;
    const client = clients?.[0];
    if (client && client.password_hash === password) {
      return res.status(200).json({ ok: true, role: 'client', id: client.id, name: client.name });
    }

    return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
  } catch (err) {
    console.error('api/auth', err);
    return res.status(500).json({ error: err.message || 'Error del servidor' });
  }
};
