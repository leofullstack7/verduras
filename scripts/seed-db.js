#!/usr/bin/env node
/** Siembra la base de datos Neon si está vacía. Uso: DATABASE_URL=... node scripts/seed-db.js */
const { neon } = require('@neondatabase/serverless');

const ROW_ID = 'main';
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Falta DATABASE_URL');
  process.exit(1);
}

const seed = {
  products: [
    { id: 'p1', name: 'Papa pastusa', emoji: '🥔', tint: '#FFF6D9', edge: '#DDA400', active: true },
    { id: 'p2', name: 'Cebolla cabezona', emoji: '🧅', tint: '#F3E8FF', edge: '#9333EA', active: true },
    { id: 'p3', name: 'Tomate chonto', emoji: '🍅', tint: '#FDECEC', edge: '#E5484D', active: true },
    { id: 'p4', name: 'Zanahoria', emoji: '🥕', tint: '#FFEEDF', edge: '#FF7A1F', active: true },
    { id: 'p6', name: 'Limón Tahití', emoji: '🍋', tint: '#FFF6D9', edge: '#DDA400', active: true },
  ],
  clients: [
    { id: 'c1', name: 'Restaurante La Terraza', type: 'restaurante', phone: '3001112233', address: 'Cra 45 #10-20', emoji: '🍽️', username: 'terraza', password: 'terraza1' },
    { id: 'c2', name: 'Hotel Carretero', type: 'hotel', phone: '3014445566', address: 'Calle 70 #22-15', emoji: '🏨', username: 'carretero', password: 'carretero1' },
  ],
  workers: [
    { id: 'w1', name: 'Carlos', username: 'carlos', password: 'carlos1' },
  ],
  orders: [],
  purchases: [],
  audit: [],
  config: { cutoff: '16:00', remisionNext: 12588 },
  admin: { username: 'olga', password: '1234', name: 'Olga' },
};

(async () => {
  const sql = neon(url);
  const rows = await sql`SELECT id FROM app_data WHERE id = ${ROW_ID}`;
  if (rows.length) {
    console.log('DB ya tiene datos, no se sobrescribe.');
    return;
  }
  await sql`
    INSERT INTO app_data (id, data, updated_at)
    VALUES (${ROW_ID}, ${JSON.stringify(seed)}::jsonb, NOW())
  `;
  console.log('Base de datos sembrada.');
})();
