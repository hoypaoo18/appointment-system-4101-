import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { webHandler } from '../server/web-handler.mjs';

const root = new URL('../', import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));

test('Hostinger production build dependencies are explicitly installed', async () => {
  const pkg = await json('package.json');
  const lock = await json('package-lock.json');
  assert.equal(pkg.scripts.build, 'vite build');
  assert.equal(pkg.scripts.start.includes('server/start.mjs'), true);
  assert.deepEqual(lock.packages[''].dependencies, pkg.dependencies);
  for (const name of ['vite', '@vitejs/plugin-react', '@tailwindcss/vite', 'tailwindcss', 'react', 'react-dom', 'mysql2']) {
    assert.ok(pkg.dependencies[name], `missing production dependency ${name}`);
    assert.ok(lock.packages['node_modules/' + name], `missing locked package ${name}`);
    assert.notEqual(lock.packages['node_modules/' + name].dev, true, `production package marked dev-only: ${name}`);
  }
});

test('Compiled React assets are present for static delivery', async () => {
  const html = await readFile(new URL('dist/index.html', root), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)) {
    const asset = new URL('dist' + match[1], root);
    assert.ok((await stat(asset)).isFile(), `missing asset: ${match[1]}`);
  }
  assert.ok(html.includes('id="root"'));
});

test('Node handler serves the compiled SPA, health, and denies paths', async () => {
  const dist = fileURLToPath(new URL('../dist/', import.meta.url));
  const server = createServer(webHandler({}, dist));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const health = await fetch(base + '/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ready' });
    const rootRes = await fetch(base + '/');
    assert.equal(rootRes.status, 200);
    assert.match(await rootRes.text(), /id="root"/);
    assert.equal((await fetch(base + '/.env.production')).status, 404);
    assert.equal((await fetch(base + '/assets/no-such-script.js')).status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
