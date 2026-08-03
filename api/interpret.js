function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return res.status(503).json({ error: 'OPENAI_API_KEY no configurada en el servidor' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { messages, maxTokens = 2500 } = body || {};
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Se requiere messages[]' });
    }

    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages,
        temperature: 0.1,
      }),
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      const msg = data.error?.message || `OpenAI HTTP ${upstream.status}`;
      return res.status(upstream.status >= 500 ? 502 : 400).json({ error: msg });
    }

    const content = data.choices?.[0]?.message?.content?.trim() || '';
    return res.status(200).json({ content, model });
  } catch (err) {
    console.error('api/interpret error', err);
    return res.status(500).json({ error: 'Error al interpretar con IA' });
  }
};
