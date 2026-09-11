/** Validación de credenciales contra Supabase (compartido api/db y api/auth). */
async function validateLogin(supabase, username, password) {
  const user = String(username || '').trim().toLowerCase();
  const pass = String(password ?? '');
  if (!user || !pass) return { error: 'Usuario y contraseña requeridos', status: 400 };

  const { data: admin, error: e1 } = await supabase
    .from('admin_users')
    .select('username, password_hash, display_name')
    .eq('id', 'main')
    .maybeSingle();
  if (e1) throw e1;
  if (admin?.username?.toLowerCase() === user && admin.password_hash === pass) {
    return { ok: true, role: 'admin', name: admin.display_name || 'Olga' };
  }

  const { data: workers, error: e2 } = await supabase
    .from('workers')
    .select('id, name, username, password_hash, activo')
    .eq('username', user)
    .limit(1);
  if (e2) throw e2;
  const worker = workers?.[0];
  if (worker && worker.activo !== false && worker.password_hash === pass) {
    return { ok: true, role: 'worker', id: worker.id, name: worker.name };
  }

  const { data: clients, error: e3 } = await supabase
    .from('clients')
    .select('id, name, username, password_hash')
    .eq('username', user)
    .limit(1);
  if (e3) throw e3;
  const client = clients?.[0];
  if (client && client.password_hash === pass) {
    return { ok: true, role: 'client', id: client.id, name: client.name };
  }

  return { error: 'Usuario o contraseña incorrectos', status: 401 };
}

function parseJsonBody(req) {
  const raw = req.body;
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object' && !Buffer.isBuffer(raw)) return raw;
  const str = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

module.exports = { validateLogin, parseJsonBody };
