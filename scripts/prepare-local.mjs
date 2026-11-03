import { readFile, appendFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';

export async function prepareLocal() {
  let text = '';
  try { text = await readFile('.dev.vars', 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const env = parseEnv(text);
  const additions = {};
  if (!env.VAULT_ENCRYPTION_KEY) additions.VAULT_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  if (!env.ANALYSIS_TOKEN) additions.ANALYSIS_TOKEN = randomBytes(24).toString('base64url');
  if (env.ALLOW_LOCAL_ADMIN === undefined) additions.ALLOW_LOCAL_ADMIN = 'true';
  if (Object.keys(additions).length) await appendFile('.dev.vars', '\n' + Object.entries(additions).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { mode: 0o600 });
  return { ...env, ...additions };
}

if (process.argv[1]?.endsWith('prepare-local.mjs')) { await prepareLocal(); console.log('Local encrypted vault prepared. Secrets are in ignored .dev.vars, not in this output.'); }
