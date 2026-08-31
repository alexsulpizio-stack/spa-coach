import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Match Android org.json JSONObject.quote so v0.9.0+ phones can verify CI signatures.
export function quoteAndroid(data) {
  let out = '"';
  for (const character of data) {
    switch (character) {
      case '"':
      case '\\':
      case '/':
        out += `\\${character}`;
        break;
      case '\t':
        out += '\\t';
        break;
      case '\b':
        out += '\\b';
        break;
      case '\n':
        out += '\\n';
        break;
      case '\r':
        out += '\\r';
        break;
      case '\f':
        out += '\\f';
        break;
      default: {
        const code = character.charCodeAt(0);
        out += code < 32 ? `\\u${code.toString(16).padStart(4, '0')}` : character;
      }
    }
  }
  return `${out}"`;
}

export function canonical(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${quoteAndroid(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  if (typeof value === 'string') return quoteAndroid(value);
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  throw new Error('Unsupported manifest value');
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  const input = process.argv[2];
  if (!input) throw new Error('Usage: node canonicalize-update-manifest.mjs <manifest.json>');
  const parsed = JSON.parse(await readFile(input, 'utf8'));
  delete parsed.signature;
  process.stdout.write(canonical(parsed));
}
