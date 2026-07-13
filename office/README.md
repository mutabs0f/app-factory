# AI Office — watch the factory work, like a reality show 🏢

A live top-down office view of the app factory. Every AI "employee" has a desk;
when Claude works on your app, the avatars walk to their stations, speech
bubbles show what they're doing, the verify Gate lights up green or red, and a
ticker narrates the day. Shipping triggers confetti.

| Employee | Desk | What lights them up |
|---|---|---|
| Rakan · Spec | Spec Office | `/new-app`, SPEC/DECISIONS edits, key intake |
| Layla · Design | Design Studio | `/design-import`, `/preview`, design/ edits |
| Omar · Builder | Build Bay | `/build`, src/ edits, gate runs |
| Huda · Database | Database Room | migrations, supabase commands |
| Sara · Reviewer | Review Room | `/review`, code-reviewer subagent |
| Faisal · Security | Security | security scans/subagents |
| Nasser · Shipping | Ship Dock | git commit/push, CI |

## Try the demo (no setup)

```
node office/serve.mjs . & then open http://127.0.0.1:4180/?demo=1
```

Demo mode plays a scripted "day at the office": idea → spec → keys → design →
build → red gate → fix → green gate → review → ship → confetti.

## Watch a real app being built

1. One-time, per app repo (writes personal hooks to `.claude/settings.local.json`
   — the guarded `settings.json` is never touched; events land in `.office/`,
   gitignored):

   ```
   node office/install.mjs C:\Users\Thinkpad\Agents\<your-app>
   ```

2. Start the viewer and leave it open on a second screen:

   ```
   node office/serve.mjs C:\Users\Thinkpad\Agents\<your-app>
   ```

3. Work in Claude Code inside the app repo as usual (restart the session once
   after installing so the hooks load). The office comes alive.

## Watch from your iPhone (broadcast mode) 📱

Start the server with `--lan` and open the printed iPhone URL in Safari (same Wi-Fi):

```
node office/serve.mjs C:\Users\Thinkpad\Agents\<your-app> 4180 --lan
```

On the phone, `/3d` runs in **director-cam mode**: the camera automatically follows
whoever is working — walks with them to the Gate, holds on the drama, cuts back wide.
A 🎥 button toggles following; dragging the screen takes manual control for 12 s.
Add to Home Screen in Safari for a full-screen show. `--lan` exposes a read-only
view to your Wi-Fi network only — omit it for PC-only viewing.

## How it works (and what it never does)

- Claude Code hooks (`PostToolUse`, `UserPromptSubmit`, …) pipe each event to
  `office/log-event.mjs`, which appends one compact line to
  `<app>/.office/events.jsonl` — tool name + file path + short summary only.
  No file contents, no key values, ever.
- `office/serve.mjs` (127.0.0.1 only, read-only) serves `index.html`, which
  polls the tail of that file every 1.5 s and animates the floor.
- The office is a **window, not a gate**: hooks always exit 0 and can never
  block or slow a build decision. Uninstall = delete the hook entries from
  `.claude/settings.local.json`.
