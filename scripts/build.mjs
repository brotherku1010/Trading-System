import { build } from 'esbuild';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

await mkdir('public', { recursive: true });
const apiBase = process.env.PAW_API_BASE_URL || '';
if (apiBase && (new URL(apiBase).protocol !== 'https:' || new URL(apiBase).username || new URL(apiBase).password || new URL(apiBase).pathname !== '/')) throw new Error('PAW_API_BASE_URL must be an HTTPS origin without a path or credentials.');
await writeFile('public/runtime-config.json', JSON.stringify({ apiBase: apiBase ? new URL(apiBase).origin : '' }));
await writeFile('public/.nojekyll', '');
for (const file of ['index.html', 'app.css', 'manifest.json', 'sw.js']) {
  await copyFile(file, `public/${file}`);
}
for (const size of [192, 512]) {
  await sharp(`icon-${size}.png`).resize(size, size, { fit: 'contain', background: '#202522' }).png().toFile(`public/icon-${size}.png`);
  const metadata = await sharp(`public/icon-${size}.png`).metadata();
  if (metadata.width !== size || metadata.height !== size || metadata.format !== 'png') throw new Error('PWA icon format/size validation failed');
}
await build({ entryPoints: ['app.js'], outfile: 'public/app.js', bundle: true, minify: true, format: 'esm', target: 'es2022' });
console.log('Built public/');
