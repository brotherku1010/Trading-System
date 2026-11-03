import { build } from 'esbuild';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';

await mkdir('public', { recursive: true });
const apiBase = process.env.PAW_API_BASE_URL || '';
if (apiBase && (new URL(apiBase).protocol !== 'https:' || new URL(apiBase).username || new URL(apiBase).password || new URL(apiBase).pathname !== '/')) throw new Error('PAW_API_BASE_URL must be an HTTPS origin without a path or credentials.');
await writeFile('public/runtime-config.json', JSON.stringify({ apiBase: apiBase ? new URL(apiBase).origin : '' }));
await writeFile('public/.nojekyll', '');
for (const file of ['index.html', 'app.css', 'manifest.json', 'sw.js', 'icon-192.png', 'icon-512.png']) {
  await copyFile(file, `public/${file}`);
}
await build({ entryPoints: ['app.js'], outfile: 'public/app.js', bundle: true, minify: true, format: 'esm', target: 'es2022' });
console.log('Built public/');
