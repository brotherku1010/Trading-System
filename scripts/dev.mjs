import { spawn } from 'node:child_process';
import { prepareLocal } from './prepare-local.mjs';
await prepareLocal();
const child = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--ip', '127.0.0.1', '--port', '8787'], { stdio: 'inherit' });
child.on('exit', code => { process.exitCode = code ?? 1; });
process.on('SIGINT', () => child.kill('SIGINT'));
