import { spawn } from 'node:child_process';
import { prepareLocal } from './prepare-local.mjs';
const local = await prepareLocal();
function wrangler(args, input, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', ...args], { stdio: [input ? 'pipe' : 'inherit', capture ? 'pipe' : 'inherit', 'inherit'] });
    let stdout = '';
    if (capture) child.stdout.on('data', bytes => { stdout += bytes; });
    if (input) child.stdin.end(input);
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve(stdout) : reject(new Error('Cloudflare operation failed; deployment stopped.')));
  });
}
await wrangler(['deploy']);
const existing = JSON.parse(await wrangler(['secret', 'list'], null, true));
const additions = {};
for (const name of ['VAULT_ENCRYPTION_KEY', 'ANALYSIS_TOKEN']) if (!existing.some(item => item.name === name)) additions[name] = local[name];
if (Object.keys(additions).length) await wrangler(['secret', 'bulk'], JSON.stringify(additions));
console.log('Worker deployed; existing encryption/admin secrets were preserved. Gemini Key is entered only in the settings page.');
