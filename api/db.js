const { getClient, fetchDB, persistDB } = require('../lib/db-bridge');
const { validateLogin, parseJsonBody } = require('../lib/login');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function isLoginAction(req) {
  const q = req.query || {};
  if (q.action === 'login') return true;
  const url = req.url || '';
  return url.includes('action=login');
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const supabase = getClient();

    if (req.method === 'POST' && isLoginAction(req)) {
      const body = parseJsonBody(req);
      const result = await validateLogin(supabase, body.username, body.password);
      if (result.error) {
        return res.status(result.status || 401).json({ ok: false, error: result.error });
      }
      return res.status(200).json(result);
    }

    if (req.method === 'GET') {
      const data = await fetchDB(supabase);
      if (!data) return res.status(200).json({ data: null, updatedAt: null });
      const { data: cfg } = await supabase.from('app_config').select('updated_at').eq('id', 'main').maybeSingle();
      return res.status(200).json({ data, updatedAt: cfg?.updated_at || null });
    }

    if (req.method === 'PUT') {
      const body = parseJsonBody(req);
      if (!body || typeof body !== 'object') {
        return res.status(400).json({ error: 'Cuerpo JSON inválido' });
      }
      const updatedAt = await persistDB(supabase, body);
      return res.status(200).json({ ok: true, updatedAt });
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error('api/db error', err);
    return res.status(500).json({ error: err.message || 'Error de base de datos' });
  }
};
