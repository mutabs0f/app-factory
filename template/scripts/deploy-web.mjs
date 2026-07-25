#!/usr/bin/env node
// deploy-web.mjs — turn the app into a LIVE URL Basim can open on any phone.
//
// This is the PWA delivery path and the fast preview path: no Expo Go, no QR, no
// same-Wi-Fi, no 7-day re-sign. Export the static web build and put it on Vercel.
//
//   node scripts/deploy-web.mjs           export + deploy + PROVE the URL responds
//   node scripts/deploy-web.mjs --check   prerequisites only (exit 0/1), deploys nothing
//   node scripts/deploy-web.mjs --preview deploy a preview URL instead of production
//
// Honesty rules baked in:
//   • Never prints a URL it has not fetched. A deploy command exiting 0 is NOT proof
//     the site is up — we GET the URL and require a 2xx before calling it deployed.
//   • Refuses to deploy a build whose .env points at localhost (the malaki mistake:
//     an app shipped pointing at a LAN address, unusable anywhere else).
//   • A missing Vercel login is a HALT with the exact command to run, never a silent skip.
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const CHECK_ONLY = args.includes('--check');
const PROD = !args.includes('--preview');

const say = (s) => console.log(s);
const die = (s) => {
  console.error(`\n✗ ${s}`);
  process.exit(1);
};

function run(cmd, opts = {}) {
  try {
    return { ok: true, out: execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }) };
  } catch (e) {
    return { ok: false, out: ((e.stdout || '') + (e.stderr || '')).trim() || e.message };
  }
}

// ---------------------------------------------------------------- prerequisites
function vercelReady() {
  const v = run('npx --yes vercel --version');
  if (!v.ok) return { ok: false, why: 'the Vercel CLI could not be installed/run', out: v.out };
  const who = run('npx --yes vercel whoami');
  if (!who.ok)
    return {
      ok: false,
      why: 'you are not logged in to Vercel',
      out: who.out,
      fix: 'npx vercel login',
    };
  return { ok: true, user: who.out.trim() };
}

// The app must talk to CLOUD Supabase. A localhost/LAN URL in the bundle produces a
// site that works only on this machine — exactly the failure that made malaki useless.
function envPointsAtCloud() {
  const f = join(ROOT, '.env');
  if (!existsSync(f)) return { ok: false, why: '.env is missing — run `node scripts/collect-keys.mjs`' };
  const txt = readFileSync(f, 'utf8');
  const url = (txt.match(/^\s*EXPO_PUBLIC_SUPABASE_URL\s*=\s*(.+)$/m) || [])[1] || '';
  if (!url.trim()) return { ok: false, why: 'EXPO_PUBLIC_SUPABASE_URL is not set in .env' };
  if (/localhost|127\.0\.0\.1|192\.168\.|10\.\d+\./.test(url))
    return { ok: false, why: `EXPO_PUBLIC_SUPABASE_URL points at a local address (${url.trim()}) — a deployed site cannot reach it` };
  return { ok: true, url: url.trim() };
}

const ready = vercelReady();
const env = envPointsAtCloud();

if (CHECK_ONLY) {
  say(`  vercel:  ${ready.ok ? `OK (${ready.user})` : `NOT READY — ${ready.why}`}`);
  say(`  env:     ${env.ok ? `OK (${env.url})` : `NOT READY — ${env.why}`}`);
  process.exit(ready.ok && env.ok ? 0 : 1);
}

if (!ready.ok)
  die(
    `${ready.why}.\n` +
      (ready.fix
        ? `  Run this ONCE, in your own terminal (it opens a browser to sign in):\n\n    ${ready.fix}\n\n` +
          `  Then re-run this command. Nothing else is needed — the login is remembered.`
        : `  ${ready.out}`),
  );
if (!env.ok) die(env.why);

// ---------------------------------------------------------------- build
say('\n  Building the web app…');
const exported = run('npx expo export --platform web');
if (!exported.ok) die(`web export failed:\n${exported.out.split('\n').slice(-20).join('\n')}`);
if (!existsSync(join(ROOT, 'dist', 'index.html')))
  die('web export produced no dist/index.html — nothing to deploy');
say('  ✓ dist/ built');

// Security headers. A PWA is a real website on a real origin: without these it ships with no
// clickjacking protection, no MIME-sniffing protection, no HSTS, and a referrer that leaks
// URLs to third parties. Written into dist/ at deploy time so it always matches what ships.
// NOTE: no Content-Security-Policy here — Expo's web runtime needs inline/eval and a wrong
// CSP silently white-screens the app. A CSP that breaks the app would get deleted in anger;
// better to ship the headers that are safe to apply unconditionally and be honest about it.
writeFileSync(
  join(ROOT, 'dist', 'vercel.json'),
  JSON.stringify(
    {
      headers: [
        {
          source: '/(.*)',
          headers: [
            { key: 'X-Content-Type-Options', value: 'nosniff' },
            { key: 'X-Frame-Options', value: 'DENY' },
            { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
            { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
            { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=()' },
          ],
        },
      ],
    },
    null,
    2,
  ),
);
say('  ✓ security headers written');

// ---------------------------------------------------------------- deploy
say(`  Deploying to Vercel (${PROD ? 'production' : 'preview'})…`);
const deploy = spawnSync(
  'npx',
  ['--yes', 'vercel', 'deploy', 'dist', '--yes', ...(PROD ? ['--prod'] : [])],
  { cwd: ROOT, encoding: 'utf8', shell: true },
);
const deployOut = (deploy.stdout || '') + (deploy.stderr || '');
if (deploy.status !== 0) die(`vercel deploy failed:\n${deployOut.split('\n').slice(-20).join('\n')}`);

const url = (deployOut.match(/https:\/\/[^\s]+\.vercel\.app/g) || []).pop();
if (!url) die(`deploy reported success but printed no URL:\n${deployOut.slice(-500)}`);

// ---------------------------------------------------------------- PROVE it is live
say(`  Checking ${url} actually responds…`);
let status = 0;
for (let i = 0; i < 5; i++) {
  try {
    const r = await fetch(url, { redirect: 'follow' });
    status = r.status;
    if (r.ok) break;
  } catch {
    /* propagation delay — retry */
  }
  await new Promise((r) => setTimeout(r, 3000));
}
if (status < 200 || status >= 300)
  die(`deployed, but ${url} returned HTTP ${status || 'no response'} — NOT reporting this as live.`);

say(`\n  ✓ LIVE: ${url}   (HTTP ${status})`);
say(`\n  On the iPhone: open that link in Safari → Share → Add to Home Screen.`);
say(`  It runs as a home-screen app: no Expo Go, no 7-day expiry, works anywhere.`);
