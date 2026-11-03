import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('test-results', { recursive: true });
let gold = 1000, dollar = 100;
const rows = ['date,asset,close'];
for (let i = 0; i < 180; i++) {
  const date = new Date(Date.UTC(2020, 0, i + 1)).toISOString().slice(0, 10);
  gold *= i % 2 ? 1.01 : 0.99;
  dollar *= i % 2 ? 0.99 : 1.01;
  rows.push(`${date},GOLD,${gold}`, `${date},DXY,${dollar}`);
}
await writeFile('test-results/synthetic-qa-only.csv', rows.join('\n'));
console.log('Synthetic QA fixture generated; not a market dataset.');
