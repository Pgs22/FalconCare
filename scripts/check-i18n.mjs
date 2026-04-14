import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const i18nDir = join(process.cwd(), 'src', 'assets', 'i18n');
const baseLang = 'es';
const strictMode = process.argv.includes('--strict');

function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function flattenEntries(obj, prefix = '', out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (isObject(value)) {
      flattenEntries(value, fullKey, out);
    } else {
      out.set(fullKey, value);
    }
  }
  return out;
}

function readJson(path) {
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw);
}

const files = readdirSync(i18nDir).filter((name) => name.endsWith('.json')).sort();
if (files.length === 0) {
  console.error('No i18n JSON files found in src/assets/i18n');
  process.exit(1);
}

const baseFile = `${baseLang}.json`;
if (!files.includes(baseFile)) {
  console.error(`Base language file missing: ${baseFile}`);
  process.exit(1);
}

const baseEntries = flattenEntries(readJson(join(i18nDir, baseFile)));
const baseKeys = new Set(baseEntries.keys());
let hasErrors = false;

for (const file of files) {
  const lang = file.replace('.json', '');
  const currentEntries = flattenEntries(readJson(join(i18nDir, file)));
  const currentKeys = new Set(currentEntries.keys());

  const missing = [...baseKeys].filter((key) => !currentKeys.has(key));
  const extra = [...currentKeys].filter((key) => !baseKeys.has(key));
  const emptyValues = strictMode
    ? [...currentEntries.entries()]
        .filter(([, value]) => typeof value === 'string' && value.trim().length === 0)
        .map(([key]) => key)
    : [];

  if (missing.length || extra.length || emptyValues.length) {
    hasErrors = true;
    console.error(
      `\n[${lang}] missing:${missing.length} extra:${extra.length} empty:${emptyValues.length}`
    );
    if (missing.length) {
      console.error(`Missing keys in ${file}:`);
      for (const key of missing) console.error(`  - ${key}`);
    }
    if (extra.length) {
      console.error(`Extra keys in ${file}:`);
      for (const key of extra) console.error(`  - ${key}`);
    }
    if (emptyValues.length) {
      console.error(`Empty translation values in ${file}:`);
      for (const key of emptyValues) console.error(`  - ${key}`);
    }
  } else {
    console.log(`[${lang}] OK`);
  }
}

if (hasErrors) {
  console.error('\ni18n key consistency check failed.');
  process.exit(1);
}

console.log('\ni18n key consistency check passed.');
