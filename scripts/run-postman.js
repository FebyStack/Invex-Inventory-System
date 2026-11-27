#!/usr/bin/env node
/**
 * Run postman/Invex_Collection.json from the terminal, with no extra packages, and report every check.
 *
 *   INVEX_URL=http://localhost:3100/api INVEX_USER=<super admin> INVEX_PASS=<password> node scripts/run-postman.js
 *
 * Optional: --json <file> writes the results (no credentials) for the test sheet or the proposal.
 * Supports the parts of Postman the collection uses: {{variables}}, bearer auth, raw JSON and file uploads,
 * and test scripts using pm.test, pm.expect(...).to.be.oneOf / .to.eql / .to.be.ok, pm.response and pm.environment.
 * Run it against a test copy of the database: the collection creates and then soft-deletes its own data.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const collection = JSON.parse(fs.readFileSync(path.join(root, 'postman/Invex_Collection.json'), 'utf8'));
const envFile = JSON.parse(fs.readFileSync(path.join(root, 'postman/Invex_Environment.json'), 'utf8'));
const env = Object.fromEntries(envFile.values.map((v) => [v.key, v.value]));
if (process.env.INVEX_URL) env.baseUrl = process.env.INVEX_URL;
env.adminUsername = process.env.INVEX_USER || env.adminUsername;
env.adminPassword = process.env.INVEX_PASS || env.adminPassword;
if (!env.adminUsername || !env.adminPassword) {
  console.error('Set INVEX_USER and INVEX_PASS (a super admin account).');
  process.exit(2);
}
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;

const fill = (s) => String(s).replace(/\{\{(\w+)\}\}/g, (_, k) => (env[k] !== undefined ? env[k] : `{{${k}}}`));

function expect(actual) {
  const fail = (msg) => { throw new Error(msg); };
  const api = {
    oneOf: (list) => list.includes(actual) || fail(`expected one of ${JSON.stringify(list)}, got ${actual}`),
    eql: (v) => JSON.stringify(v) === JSON.stringify(actual) || fail(`expected ${JSON.stringify(v)}, got ${JSON.stringify(actual)}`),
  };
  return { to: { be: { oneOf: api.oneOf, get ok() { return actual || fail(`expected a truthy value, got ${actual}`); } }, eql: api.eql } };
}

function flatten(items, folder = '') {
  return items.flatMap((it) => (it.item ? flatten(it.item, it.name) : [{ folder, ...it }]));
}

async function run() {
  const results = [];
  for (const item of flatten(collection.item)) {
    const r = item.request;
    const url = fill(r.url);
    const headers = {};
    for (const h of r.header || []) headers[h.key] = fill(h.value);
    if (r.auth && r.auth.type === 'bearer') headers.Authorization = `Bearer ${fill(r.auth.bearer[0].value)}`;
    let body;
    if (r.body && r.body.mode === 'raw') body = fill(r.body.raw);
    if (r.body && r.body.mode === 'formdata') {
      body = new FormData();
      for (const f of r.body.formdata) {
        if (f.type === 'file') {
          const file = path.join(root, 'postman', f.src);
          body.append(f.key, new Blob([fs.readFileSync(file)]), path.basename(file));
        } else body.append(f.key, fill(f.value));
      }
    }
    let res; let text = ''; let error = null;
    try {
      res = await fetch(url, { method: r.method, headers, body });
      text = await res.text();
    } catch (e) { error = e.message; }
    let parsed;
    const response = {
      code: res ? res.status : 0,
      json: () => { if (parsed === undefined) parsed = JSON.parse(text); return parsed; },
      text: () => text,
    };
    const checks = [];
    const pm = {
      response, expect,
      environment: { get: (k) => env[k], set: (k, v) => { env[k] = v; } },
      test: (name, fn) => { try { fn(); checks.push({ name, ok: true }); } catch (e) { checks.push({ name, ok: false, why: e.message }); } },
    };
    for (const ev of item.event || []) {
      if (ev.listen !== 'test') continue;
      // Runs the test scripts stored in this repo's own collection, exactly as Postman would; response data is never
      // inserted into the script text.
      try { new Function('pm', ev.script.exec.join('\n'))(pm); } catch (e) { checks.push({ name: 'script', ok: false, why: e.message }); }
    }
    let message = '';
    try { message = (JSON.parse(text) || {}).message || ''; } catch { /* not JSON (exports) */ }
    const ok = !error && checks.length > 0 && checks.every((c) => c.ok);
    results.push({ folder: item.folder, name: item.name, method: r.method, path: r.url.replace('{{baseUrl}}', '/api'),
      status: response.code, ok, why: error || checks.filter((c) => !c.ok).map((c) => c.why).join('; '), message });
    const mark = ok ? 'PASS' : 'FAIL';
    console.log(`${mark}  ${String(response.code).padEnd(3)} ${r.method.padEnd(6)} ${item.folder} / ${item.name}${ok ? '' : `  -> ${results.at(-1).why}${message ? ` (${message})` : ''}`}`);
  }
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed, ${results.length} requests`);
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2));
  process.exit(failed ? 1 : 0);
}

run();
