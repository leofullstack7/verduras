const { getClient } = require('../lib/db-bridge');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const username = String(body?.username || '').trim().toLowerCase();
    const password = String(body?.password ?? '');
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    const supabase = getClient();

    const { data: admin, error: adminErr } = await supabase
      .from('admin_users')
      .select('username, password_hash, display_name')
      .eq('id', 'main')
      .maybeSingle();
    if (adminErr) throw adminErr;
    if (admin?.username?.toLowerCase() === username && admin.password_hash === password) {
      return res.status(200).json({ ok: true, role: 'admin', name: admin.display_name || 'Olga' });
    }

    const { data: workers, error: workerErr } = await supabase
      .from('workers')
      .select('id, name, username, password_hash, activo')
      .eq('username', username);
    if (workerErr) throw workerErr;
    const worker = (workers || []).find((w) => w.activo !== false && w.password_hash === password);
    if (worker) {
      return res.status(200).json({ ok: true, role: 'worker', id: worker.id, name: worker.name });
    }

    const { data: clients, error: clientErr } = await supabase
      .from('clients')
      .select('id, name, username, password_hash')
      .eq('username', username);
    if (clientErr) throw clientErr;
    const client = (clients || []).find((c) => c.password_hash === password);
    if (client) {
      return res.status(200).json({ ok: true, role: 'client', id: client.id, name: client.name });
    }

    return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
  } catch (err) {
    console.error('api/auth error', err);
    return res.status(500).json({ error: err.message || 'Error del servidor' });
  }
};
