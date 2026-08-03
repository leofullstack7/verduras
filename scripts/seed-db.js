#!/usr/bin/env node
/** Siembra Neon. Uso: DATABASE_URL=... node scripts/seed-db.js [--force] */
const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

const ROW_ID = 'main';
const url = process.env.DATABASE_URL;
if (!url) { console.error('Falta DATABASE_URL'); process.exit(1); }

const colors = { fruta: { t: '#FFF6D9', e: '#DDA400' }, verdura: { t: '#E8F8EE', e: '#1FA84D' }, hierba: { t: '#E8F8EE', e: '#1FA84D' }, tuberculo: { t: '#FFF6D9', e: '#DDA400' }, default: { t: '#E8F8EE', e: '#1FA84D' } };
const unitMap = { kg: 'kilo', atado: 'unidad', unidad: 'unidad' };
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../claude/productos_distribuidora_lyo.json'), 'utf8'));
const products = catalog.productos.map((p) => {
  const c = colors[p.categoria] || colors.default;
  return {
    id: p.id,
    name: p.nombre,
    categoria: p.categoria,
    unidad_sugerida: unitMap[p.unidad_sugerida] || p.unidad_sugerida,
    emoji: p.emoji_temporal,
    tint: c.t,
    edge: c.e,
    active: true,
    img: `assets/productos/${p.id}.png`,
  };
});

const seed = {
  products,
  clients: [
    { id: 'c1', name: 'Restaurante La Terraza', type: 'restaurante', phone: '3001112233', address: 'Cra 45 #10-20', emoji: '🍽️', username: 'terraza', password: 'terraza1' },
    { id: 'c2', name: 'Hotel Carretero', type: 'hotel', phone: '3014445566', address: 'Calle 70 #22-15', emoji: '🏨', username: 'carretero', password: 'carretero1' },
    { id: 'c3', name: 'Gastrobar El Solar', type: 'gastrobar', phone: '3027778899', address: 'Av. Nutibara #33-08', emoji: '🍸', username: 'solar', password: 'solar1' },
  ],
  workers: [
    { id: 'w1', name: 'Carlos', username: 'carlos', password: 'carlos1', avatarEmoji: '👨‍🌾', activo: true },
    { id: 'w2', name: 'María', username: 'maria', password: 'maria1', avatarEmoji: '👩‍🌾', activo: true },
  ],
  orders: [],
  purchases: [],
  audit: [],
  invitations: [],
  notifications: [],
  remisiones: [],
  config: { cutoff: '16:00', remisionNext: 12588 },
  admin: { username: 'olga', password: '1234', name: 'Olga' },
};

(async () => {
  const sql = neon(url);
  const force = process.argv.includes('--force');
  const rows = await sql`SELECT id FROM app_data WHERE id = ${ROW_ID}`;
  if (rows.length && !force) {
    console.log('DB ya tiene datos. Usa --force para sobrescribir.');
    return;
  }
  if (rows.length) await sql`DELETE FROM app_data WHERE id = ${ROW_ID}`;
  await sql`INSERT INTO app_data (id, data, updated_at) VALUES (${ROW_ID}, ${JSON.stringify(seed)}::jsonb, NOW())`;
  console.log(`Base de datos sembrada con ${products.length} productos.`);
})();
