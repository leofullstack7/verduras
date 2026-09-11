const { getClient } = require('../lib/db-bridge');
const { validateLogin, parseJsonBody } = require('../lib/login');

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
    const body = parseJsonBody(req);
    const result = await validateLogin(getClient(), body.username, body.password);
    if (result.error) {
      return res.status(result.status || 401).json({ ok: false, error: result.error });
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error('api/auth', err);
    return res.status(500).json({ error: err.message || 'Error del servidor' });
  }
};
