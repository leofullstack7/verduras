const fs = require('fs');
const path = require('path');

const key = process.env.OPENAI_API_KEY || '';
const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const out = path.join(__dirname, '..', 'config.local.js');

fs.writeFileSync(
  out,
  `window.FRUVER_CONFIG = {\n  openaiApiKey: ${JSON.stringify(key)},\n  openaiModel: ${JSON.stringify(model)},\n};\n`
);

console.log(`Generated ${path.basename(out)}${key ? '' : ' (sin OPENAI_API_KEY)'}`);
