# Start-an-app prompt (Basim's fill-in template)

Three steps: (1) Docker Desktop whale steady, (2) new Claude Code session in
`C:\Users\Thinkpad\Agents`, (3) fill the brackets, paste, send.
Optional second screen: `node app-factory\office\serve.mjs ..\<slug> 4180 --lan`
then open http://<pc-ip>:4180/3d on the iPhone.

```
/new-app-project [slug-in-english-lowercase-with-dashes] "[App name — the idea in a few words]"

THE IDEA
[2-3 sentences: what the app does and why I want it. Plain words.]

WHO USES IT
[e.g. "just me" / "me and my family" / "people who ..."]

MUST-HAVE IN V1 (keep it short — this is version 1, not the dream)
- [feature 1]
- [feature 2]
- [feature 3]

NOT IN V1 (so nobody builds it)
- [things that sound nice but I don't need yet]

MY ANSWERS TO YOUR USUAL QUESTIONS
- Notifications when the app is closed: [yes / no]
- Shared with other people or private to me: [private / shared]
- On my phone as: [installed app / a link I add to my home screen / you decide and tell me why]

LOOK & FEEL (for the design brief you'll hand me)
- Language: [Arabic-first with English / English-first with Arabic]
- Mood & colors: [e.g. "calm, dark green, feels premium" — or "you decide"]
- Apps I like the feel of: [optional]

SERVICES
Only the defaults — show me the integrations table before adding anything.

WHILE YOU WORK
Follow the factory stages exactly (/new-app onward). Stop for my approval at the
integrations table, open the key form for me, hand me the Claude Design brief,
and give me the Expo Go QR at preview. Never report done without a green verify.
```

Notes for the reader (any session picking this up): the answers above pre-fill
/new-app's five questions — do not re-ask what is already answered; still show
the integrations table and stop; unanswered brackets mean "ask or use the
documented default".
