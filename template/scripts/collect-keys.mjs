#!/usr/bin/env node
// collect-keys.mjs — the API-key intake page (Basim never opens a .env by hand).
//
// Reads config/integrations.json (names only, never values), opens a ONE-PAGE local
// form in the browser, validates each pasted key, and routes it by destination:
//   app-env        → written to .env (public EXPO_PUBLIC_* config; secret shapes REFUSED)
//   supabase-secret → NEVER touched as a value here; the page shows the guided click-path
//                     and records only that Basim confirmed he set it up (name, not value).
//
// Security rails: server binds 127.0.0.1 only, on a random port, behind a one-time URL
// token (no other local page/process can post to it); the page ships a restrictive CSP and
// makes NO external request; a value is never logged or echoed back; the server accepts one
// SUCCESSFUL submission then shuts down. Pure Node, zero dependencies.
//
// Modes:  node scripts/collect-keys.mjs           interactive intake
//         node scripts/collect-keys.mjs --check    presence-only check (exit 0/1), no server
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const MANIFEST = join(ROOT, 'config', 'integrations.json');
const ENV_FILE = join(ROOT, '.env');
const ENV_EXAMPLE = join(ROOT, '.env.example');
const PROVISIONED = join(ROOT, 'config', '.keys-provisioned'); // gitignored, names only

function loadManifest() {
  if (!existsSync(MANIFEST)) {
    console.error(`No manifest at config/integrations.json — nothing to collect.`);
    process.exit(1);
  }
  try {
    const m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    if (!Array.isArray(m.keys)) throw new Error('manifest.keys must be an array');
    return m.keys;
  } catch (e) {
    console.error(`Bad config/integrations.json: ${e.message}`);
    process.exit(1);
  }
}

// A pasted value that is actually a SECRET key — must never land in the app bundle / .env.
// Denylist across common providers; combined with the app-env allowlist (EXPO_PUBLIC_ name +
// anchored format), a secret can't reach .env even if the manifest is authored wrong.
function looksSecret(v) {
  // NB: no AIza… here — Google/Firebase browser keys are PUBLIC by design and ship in EXPO_PUBLIC_*.
  if (/^(sb_secret_|sk[-_]|rk_|re_|ghp_|gho_|github_pat_|glpat-|xox[baprs]-|AKIA[0-9A-Z]{16})/.test(v)) return true;
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(v)) return true;
  const m = v.match(/^eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+$/); // JWT shape
  if (m) {
    try {
      const payload = JSON.parse(Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
      if (payload && payload.role === 'service_role') return true;
    } catch {
      return true; // a JWT-shaped value we can't decode, pasted into a KEY field → suspicious
    }
  }
  return false;
}

function envKeysPresent() {
  const set = new Set();
  const src = existsSync(ENV_FILE) ? ENV_FILE : null;
  if (!src) return set;
  for (const line of readFileSync(src, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m && m[2] && !/^(replace_me|sb_publishable_replace_me|https:\/\/YOUR-)/.test(m[2])) set.add(m[1]);
  }
  return set;
}

function provisionedSecrets() {
  const set = new Set();
  if (existsSync(PROVISIONED)) {
    for (const line of readFileSync(PROVISIONED, 'utf8').split(/\r?\n/)) {
      const name = line.trim();
      if (name && !name.startsWith('#')) set.add(name);
    }
  }
  return set;
}

// ---- --check mode: presence only, never values ----
function runCheck(keys) {
  const envSet = envKeysPresent();
  const secretSet = provisionedSecrets();
  const missing = [];
  for (const k of keys) {
    if (!k.required) continue;
    if (k.destination === 'app-env') {
      if (!envSet.has(k.env)) missing.push(k.env);
    } else if (!secretSet.has(k.env)) {
      missing.push(k.env);
    }
  }
  if (missing.length) {
    console.error(`env incomplete — missing required key(s): ${missing.join(', ')}\n` + `Run: node scripts/collect-keys.mjs`);
    process.exit(1);
  }
  console.log(`env complete — all required keys present (${keys.filter((k) => k.required).length} required).`);
  process.exit(0);
}

function writeEnv(appEnvValues) {
  // Belt-and-suspenders (validate() already enforces these): never write a non-EXPO_PUBLIC_
  // name or a newline-bearing value into .env.
  for (const [k, v] of Object.entries(appEnvValues))
    if (!/^EXPO_PUBLIC_[A-Z0-9_]+$/.test(k) || /[\r\n]/.test(v))
      throw new Error(`refusing to write unsafe app-env entry: ${k}`);
  let lines = [];
  if (existsSync(ENV_FILE)) lines = readFileSync(ENV_FILE, 'utf8').split(/\r?\n/);
  else if (existsSync(ENV_EXAMPLE)) lines = readFileSync(ENV_EXAMPLE, 'utf8').split(/\r?\n/);
  for (const [k, v] of Object.entries(appEnvValues)) {
    const re = new RegExp('^\\s*' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=');
    const idx = lines.findIndex((l) => re.test(l));
    const line = `${k}=${v}`;
    if (idx >= 0) lines[idx] = line;
    else lines.push(line);
  }
  writeFileSync(ENV_FILE, lines.join('\n').replace(/\n*$/, '\n'));
}

function recordProvisioned(names) {
  const have = provisionedSecrets();
  for (const n of names) have.add(n);
  const header = '# Names (never values) of secret keys you confirmed you set up. Gitignored.\n';
  writeFileSync(PROVISIONED, header + [...have].sort().join('\n') + '\n');
}

// Authoritative server-side validation (the page also validates, but never trust the client).
function validate(keys, values) {
  const errors = {};
  const appEnv = {};
  const confirmedSecrets = [];
  for (const k of keys) {
    if (k.destination === 'app-env') {
      // Allowlist-first, independent of the pasted value: an app-env key MUST be a public
      // EXPO_PUBLIC_* var with an anchored format. This closes the mis-authored-manifest path
      // (a secret routed to app-env) even before we look at what was pasted.
      if (!/^EXPO_PUBLIC_[A-Z0-9_]+$/.test(k.env)) {
        errors[k.env] = 'Config error: app-env keys must be named EXPO_PUBLIC_* (public config only). Route secrets via a supabase-secret entry.';
        continue;
      }
      if (!k.format || !/^\^/.test(k.format) || !/\$$/.test(k.format)) {
        errors[k.env] = 'Config error: this app-env key needs a FULLY anchored (^…$) format in the manifest; refusing to validate blindly.';
        continue;
      }
      const v = String(values[k.env] ?? '').trim();
      if (!v) {
        if (k.required) errors[k.env] = 'This key is required.';
        continue;
      }
      if ([...v].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)) {
        errors[k.env] = 'That value contains control characters — paste just the key, nothing else.';
        continue;
      }
      if (looksSecret(v)) {
        errors[k.env] = 'That looks like a SECRET key — this field needs the PUBLIC one. Do not paste secret keys into the app.';
        continue;
      }
      if (!new RegExp(k.format).test(v)) {
        errors[k.env] = 'That does not match the expected format for this key.';
        continue;
      }
      appEnv[k.env] = v;
    } else {
      // supabase-secret: confirm-only, no value ever captured here.
      const confirmed = values['__confirm__' + k.env] === true;
      if (k.required && !confirmed) errors[k.env] = 'Please confirm you set this up in the dashboard.';
      if (confirmed) confirmedSecrets.push(k.env);
    }
  }
  return { errors, appEnv, confirmedSecrets };
}

const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

function pageHtml(keys, token) {
  // manifest for the client — names/labels only, NEVER values. Escape </ for safe embedding.
  const clientKeys = JSON.stringify(
    // Display fields are HTML-escaped (they go into innerHTML); env/format stay verbatim
    // (env is [A-Z0-9_]-safe; format must remain a valid RegExp).
    keys.map((k) => ({ env: k.env, service: esc(k.service), destination: k.destination, why: esc(k.why || ''), howToGet: esc(k.howToGet || ''), format: k.format || '', required: !!k.required })),
  ).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; base-uri 'none'">
<title>App keys — one-page setup</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, system-ui, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px; line-height: 1.5; }
  h1 { font-size: 1.3rem; } .sub { opacity: .7; margin-top: -6px; }
  .card { border: 1px solid #8884; border-radius: 12px; padding: 16px; margin: 14px 0; }
  .svc { font-weight: 600; } .env { font-family: ui-monospace, monospace; font-size: .8rem; opacity: .7; }
  .why { margin: 6px 0; } .how { font-size: .9rem; opacity: .85; margin: 6px 0; }
  .ar { direction: rtl; text-align: right; font-size: .9rem; opacity: .8; }
  input[type=text] { width: 100%; padding: 12px; font-size: 1rem; border: 1.5px solid #8886; border-radius: 8px; font-family: ui-monospace, monospace; }
  input.ok { border-color: #16a34a; } input.bad { border-color: #dc2626; }
  .msg { font-size: .85rem; margin-top: 6px; min-height: 1.1em; } .msg.ok { color: #16a34a; } .msg.bad { color: #dc2626; }
  label.confirm { display: flex; gap: 10px; align-items: flex-start; margin-top: 8px; }
  button { width: 100%; padding: 14px; font-size: 1.05rem; border: 0; border-radius: 10px; background: #2563eb; color: #fff; font-weight: 600; margin-top: 10px; }
  button:disabled { background: #8888; }
  #done { display: none; padding: 16px; border-radius: 12px; background: #16a34a22; border: 1px solid #16a34a; }
</style>
</head>
<body>
<h1>Set up your app's keys</h1>
<p class="sub">إعداد مفاتيح التطبيق — one box per key. Paste, check the green tick, then Save.</p>
<form id="f" autocomplete="off"></form>
<div id="done"></div>
<script>
const KEYS = ${clientKeys};
const TOKEN = ${JSON.stringify(token)};
function looksSecret(v){
  if(/^(sb_secret_|sk[-_]|rk_|re_|ghp_|gho_|github_pat_|glpat-|xox[baprs]-|AKIA[0-9A-Z]{16})/.test(v))return true;
  if(/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(v))return true;
  const m=v.match(/^eyJ[A-Za-z0-9_-]+\\.([A-Za-z0-9_-]+)\\.[A-Za-z0-9_-]+$/);
  if(m){try{const p=JSON.parse(atob(m[1].replace(/-/g,'+').replace(/_/g,'/')));if(p&&p.role==='service_role')return true;}catch(e){return true;}}
  return false;
}
const state = {};
const f = document.getElementById('f');
for (const k of KEYS){
  const card = document.createElement('div'); card.className='card';
  const req = k.required ? ' *' : '';
  let inner = '<div class="svc">'+k.service+req+'</div><div class="env">'+k.env+'</div>'+
    (k.why?'<div class="why">'+k.why+'</div>':'')+
    (k.howToGet?'<div class="how">🔑 '+k.howToGet+'</div>':'');
  if (k.destination==='app-env'){
    inner += '<input type="text" id="i_'+k.env+'" placeholder="paste the key here" spellcheck="false" autocapitalize="off">'+
             '<div class="msg" id="m_'+k.env+'"></div>';
  } else {
    inner += '<label class="confirm"><input type="checkbox" id="c_'+k.env+'"><span>This key is <b>secret</b> — set it in the dashboard using the steps above (it is never stored in the app). Tick when done.</span></label>';
  }
  card.innerHTML = inner; f.appendChild(card);
}
const btn = document.createElement('button'); btn.textContent='Save keys'; btn.type='button'; btn.disabled=true; f.appendChild(btn);

function validateField(k){
  if (k.destination!=='app-env'){ state[k.env]=document.getElementById('c_'+k.env).checked || !k.required; return; }
  const el=document.getElementById('i_'+k.env), msg=document.getElementById('m_'+k.env);
  const v=el.value.trim();
  let ok=false, text='';
  if(!v){ ok=!k.required; text=k.required?'Required.':''; }
  else if(looksSecret(v)){ ok=false; text='⚠ That looks like a SECRET key — paste the PUBLIC one instead.'; }
  else if(k.format && !new RegExp(k.format).test(v)){ ok=false; text='Doesn\\'t match the expected format.'; }
  else { ok=true; text='✓ looks right'; }
  el.className = v? (ok?'ok':'bad') : '';
  msg.textContent=text; msg.className='msg '+(ok&&v?'ok':(v?'bad':''));
  state[k.env]= ok && (v!=='' || !k.required);
}
function refresh(){ let all=true; for(const k of KEYS){ if(state[k.env]!==true) all=false; } btn.disabled=!all; }
for (const k of KEYS){
  if(k.destination==='app-env') document.getElementById('i_'+k.env).addEventListener('input',()=>{validateField(k);refresh();});
  else document.getElementById('c_'+k.env).addEventListener('change',()=>{validateField(k);refresh();});
  validateField(k);
}
refresh();
btn.addEventListener('click', async ()=>{
  btn.disabled=true; btn.textContent='Saving…';
  const body={};
  for(const k of KEYS){
    if(k.destination==='app-env') body[k.env]=document.getElementById('i_'+k.env).value.trim();
    else body['__confirm__'+k.env]=document.getElementById('c_'+k.env).checked;
  }
  try{
    const r=await fetch('/submit?token='+encodeURIComponent(TOKEN),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    const j=await r.json();
    if(j.ok){
      f.style.display='none';
      const d=document.getElementById('done'); d.style.display='block';
      d.innerHTML='<b>✓ Saved.</b> Your keys are set. You can close this tab and return to the app.';
    } else {
      btn.disabled=false; btn.textContent='Save keys';
      for(const [env,err] of Object.entries(j.errors||{})){ const m=document.getElementById('m_'+env); if(m){ m.textContent='✗ '+err; m.className='msg bad'; } }
    }
  }catch(e){ btn.disabled=false; btn.textContent='Save keys'; alert('Could not save — is the setup script still running?'); }
});
</script>
</body>
</html>`;
}

function openBrowser(url) {
  if (process.env.COLLECT_KEYS_NO_OPEN) return;
  try {
    if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    else if (process.platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  } catch {
    /* the URL is printed regardless */
  }
}

function runIntake(keys) {
  const token = randomBytes(18).toString('hex');
  const required = keys.filter((k) => k.required).length;
  const server = createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    if (u.searchParams.get('token') !== token) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('forbidden');
      return;
    }
    if (req.method === 'GET' && u.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(pageHtml(keys, token));
      return;
    }
    if (req.method === 'POST' && u.pathname === '/submit') {
      // Defense-in-depth beyond the token: reject a cross-origin poster. Our own page fetches
      // same-origin (sends this Origin); a different local page would not match.
      const origin = req.headers.origin;
      if (origin && !/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(origin)) {
        res.writeHead(403, { 'content-type': 'text/plain' });
        res.end('bad origin');
        return;
      }
      let raw = '';
      req.on('data', (c) => {
        raw += c;
        if (raw.length > 1e6) req.destroy(); // no huge payloads
      });
      req.on('end', () => {
        let values;
        try {
          values = JSON.parse(raw);
        } catch {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: false, errors: { _: 'bad request' } }));
          return;
        }
        const { errors, appEnv, confirmedSecrets } = validate(keys, values);
        if (Object.keys(errors).length) {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: false, errors })); // error TEXT only, never the pasted value
          return;
        }
        // success: persist (values written, never logged), then one-shot shutdown
        if (Object.keys(appEnv).length) writeEnv(appEnv);
        if (confirmedSecrets.length) recordProvisioned(confirmedSecrets);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, saved: Object.keys(appEnv), confirmed: confirmedSecrets }));
        const savedMsg = [...Object.keys(appEnv), ...confirmedSecrets].join(', ');
        console.log(`\n✓ Keys captured (${savedMsg}). .env written; no values logged.`);
        server.close();
        setTimeout(() => process.exit(0), 100);
      });
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    const url = `http://127.0.0.1:${port}/?token=${token}`;
    console.log(`\nOpening the key-setup page in your browser…`);
    console.log(`If it doesn't open, paste this into a browser on THIS machine:\n  ${url}\n`);
    console.log(`Waiting for ${required} required key(s). The page runs only on your PC and sends nothing anywhere.`);
    openBrowser(url);
  });
  // If the user never submits, the process stays up until killed → non-zero via SIGINT.
  process.on('SIGINT', () => {
    console.error('\nCancelled — keys not collected.');
    process.exit(130);
  });
}

const keys = loadManifest();
if (process.argv.includes('--check')) runCheck(keys);
else if (keys.length === 0) {
  console.log('No integrations in the manifest — nothing to collect.');
  process.exit(0);
} else runIntake(keys);
