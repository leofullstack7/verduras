const { neon } = require('@neondatabase/serverless');

const ROW_ID = 'main';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const url = process.env.DATABASE_URL;
  if (!url) return res.status(500).json({ error: 'DATABASE_URL no configurada' });

  const sql = neon(url);

  try {
    if (req.method === 'GET') {
      const rows = await sql`SELECT data, updated_at FROM app_data WHERE id = ${ROW_ID}`;
      if (!rows.length) return res.status(200).json({ data: null, updatedAt: null });
      return res.status(200).json({ data: rows[0].data, updatedAt: rows[0].updated_at });
    }

    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!body || typeof body !== 'object') {
        return res.status(400).json({ error: 'Cuerpo JSON inválido' });
      }
      const payload = JSON.stringify(body);
      const rows = await sql`
        INSERT INTO app_data (id, data, updated_at)
        VALUES (${ROW_ID}, ${payload}::jsonb, NOW())
        ON CONFLICT (id) DO UPDATE
        SET data = EXCLUDED.data, updated_at = NOW()
        RETURNING updated_at
      `;
      return res.status(200).json({ ok: true, updatedAt: rows[0].updated_at });
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error('api/db error', err);
    return res.status(500).json({ error: 'Error de base de datos' });
  }
};
