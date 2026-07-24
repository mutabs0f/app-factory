---
name: preview
description: Serve the app over an Expo tunnel and get the exp:// URL to Basim so he walks every screen on his own phone. Use for stage S2 (PREVIEW) — human gate #1, the first review that matters. His verbatim reaction is the output, never a self-checked list.
---

# /preview — S2 PREVIEW (human gate #1)

Put the real app in Basim's hand over Expo Go. This is the review that matters — it replaces the old pipeline's checklist approvals. **The output is his verbatim reaction, not your assessment.**

## Before you start
- Read `docs/SPEC.md` (the screens he should see) and `LESSONS.md`.

## 0. Prefer a LINK when the app can be previewed on the web

Basim opening a link beats Basim opening Expo Go — no app to install, no QR, no tunnel, no "Could not connect", and he can look at it later, on any device, without the PC on. **If the app has no native-only dependency, do this first:**

    node scripts/deploy-web.mjs --preview

It exports the web build, deploys it, and **fetches the URL to prove it responds** before reporting it. Send him the link. Requires a one-time `npx vercel login` in his own terminal — the script tells him exactly that if he hasn't.

Use the Expo tunnel below **instead** when the app depends on native modules that don't run on web (camera, secure enclave, HealthKit…), or when he specifically wants the native feel. When in doubt, do both — the link costs ~2 minutes.

## 1. Serve over the tunnel
Run in the background (tunnel works over cellular — no shared Wi-Fi needed):

    npx expo start --tunnel

First bundle over the tunnel takes ~30-60s. Expo Go may show "Could not connect" during that first build — that's expected.

## 2. Get the URL to his phone
Get the `exp://` URL Expo serves the app on — use whichever source yields it:
- **Primary:** the URL `npx expo start` prints (a line like `Metro waiting on exp://…`), if visible in its output/logs.
- **Fallback (piped / non-TTY, where the QR + URL often aren't printed):** read it from the tunnel agent's local API — `curl -s http://127.0.0.1:4040/api/tunnels` → take `public_url` (an `https://<host>`, typically a `…exp.direct` host on SDK 54) and swap the scheme: `exp://<host>`. (This depends on the bundled `@expo/ngrok` agent exposing 4040 — verify the host resolves before sending it.)

Give Basim **BOTH** the `exp://` URL (to paste into Expo Go → "Enter URL manually") and a QR code if you can render one.

## 3. The on-phone checklist (give him this, verbatim)
1. Open Expo Go → paste the `exp://` URL (or scan the QR).
2. First load builds for ~30-60s; if it says "Could not connect," wait, then tap **Reload** once it's built.
3. Walk **every** screen in the app.
4. Note anything wrong — wording, layout, a tap that does nothing, anything that feels off.

## 4. Record his reaction
Capture his feedback **VERBATIM** in `docs/REVIEW-LOG.md` (his words, not your paraphrase). That log is the gate record and feeds the next `/build` turn.

## Never
- Never substitute your own screen-walk or a generated checklist for his. The gate is Basim looking at his own phone — real machine evidence, nothing else.
- Never mark PREVIEW passed without his verbatim words in `docs/REVIEW-LOG.md`.
