import { grammarRoEn } from '../src/translate/grammar-ro.mjs';
for (const t of process.argv.slice(2)) { const r = grammarRoEn(t); console.log(JSON.stringify(t), '=>', JSON.stringify(r.text), r.ok ? '' : r.notes.join()); }
