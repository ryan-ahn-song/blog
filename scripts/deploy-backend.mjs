import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const config = JSON.parse(await readFile(new URL('../apps/backend/wrangler.jsonc', import.meta.url), 'utf8'));
if (config.d1_databases.some(db => db.database_id === '00000000-0000-0000-0000-000000000000')) {
  console.error('Set the actual Cloudflare D1 database_id in apps/backend/wrangler.jsonc before deployment. See README.md.');
  process.exit(1);
}
const cli = new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url);
const { fileURLToPath } = await import('node:url');
const result = spawnSync(process.execPath, [fileURLToPath(cli), 'deploy'], { stdio: 'inherit', cwd: fileURLToPath(new URL('../apps/backend', import.meta.url)) });
process.exit(result.status ?? 1);
