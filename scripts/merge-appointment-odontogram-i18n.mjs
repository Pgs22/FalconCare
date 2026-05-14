/**
 * Fusiona appointment + odontogram + appExtra en src/assets/i18n/*.json
 * Ejecutar desde la raíz del proyecto: node scripts/merge-appointment-odontogram-i18n.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const bundlesPath = path.join(__dirname, 'i18n-bundles.json');

const bundles = JSON.parse(fs.readFileSync(bundlesPath, 'utf8'));
const langs = ['es', 'ca', 'en', 'fr'];

for (const lang of langs) {
  const fp = path.join(root, 'src', 'assets', 'i18n', `${lang}.json`);
  const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const b = bundles[lang];
  if (!b) throw new Error(`Missing bundle for ${lang}`);
  data.app = { ...data.app, ...b.appExtra };
  data.appointment = b.appointment;
  data.odontogram = b.odontogram;
  fs.writeFileSync(fp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log('updated', fp);
}
