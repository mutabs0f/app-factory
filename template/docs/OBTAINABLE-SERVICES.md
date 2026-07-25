# KSA Individual — Service Obtainability Knowledge Base

**Consult this BEFORE proposing any external service to Basim.**
Compiled 2026-07-25. Profile assumed: **Saudi national, individual, no Commercial Registration (CR),
no company, personal card, Windows 11, iPhone, no Apple Developer account.**

Confidence markers used below:
- `[VERIFIED]` — I fetched the primary source and read the claim. URL given.
- `[SEARCH]` — from search-result snippets only, not the primary doc. Treat as probable, re-check before relying.
- `[UNVERIFIED]` — model knowledge or conflicting sources. **Must be re-checked at signup time.**
- `[UNKNOWN]` — could not establish. Do not state a number.

---

## 0. THE GATE — run these five checks on EVERY service before naming it to Basim

1. **Card?** Does signup or the free tier require a credit card?
2. **CR/company?** Does it require a Commercial Registration, company entity, or business docs?
3. **KSA available at all?** Is Saudi Arabia in the supported-countries list?
4. **Reseller / regional gate?** Is there a country-specific middleman (the Google/CNTXT pattern)?
5. **⚠ THE UPGRADE TRAP — the check that actually matters.** If the free tier runs out or the app
   grows, *is the paid path reachable from a KSA billing address?* A free tier that upgrades into a
   blocked billing system is a **dead end with a delay fuse**, not a working option.

Check 5 is the one that killed `provider-scout`. It is not enough that the free tier works today.

### Known dead ends (do not propose, ever)

| Service | Why blocked | Evidence |
|---|---|---|
| **Google Maps Platform** (Places, Geocoding, Directions) | KSA billing address → must purchase via **CNTXT** reseller. Google's own FAQ names Maps Platform explicitly and makes **no individual-vs-business distinction** — it applies to "a billing address located in the Kingdom of Saudi Arabia". CNTXT individual onboarding unavailable since ~Feb 2025; business route needs a CR. | `[VERIFIED]` fetched https://support.google.com/cloud/answer/13567838 |
| **Any Google Cloud Platform product** | Same CNTXT gate — it is a *billing-address* rule, not a per-product rule. | `[VERIFIED]` same source |
| **Stripe** (as a KSA merchant) | Not available to Saudi-based merchants. Workarounds all require a foreign legal entity. | `[SEARCH]` |

> **A non-KSA billing address is NOT a workaround.** It violates Google's ToS and risks the whole
> Google account, including his personal Gmail. Never propose it, never imply it.

---

## 1. Maps / Places / Geocoding / POI with ratings

**This is the hardest category and the one where naive advice fails.** "Just use OpenStreetMap"
is wrong for POI-search apps — see the Nominatim policy below.

### ⚠ Read this before proposing any OSM-based option

The public **Nominatim** service is NOT a Google Places replacement. Its usage policy — `[VERIFIED]`,
fetched https://operations.osmfoundation.org/policies/nominatim/ — states:
- **"maximum of 1 request per second"** for all use;
- autocomplete: **"This is not yet supported by Nominatim and you must not implement"** client-side;
- systematic queries forbidden — "reverse queries in a grid, searching for complete lists of postcodes, towns";
- **"Applications and services whose primary function is related to geocoding must run their own service."**

That last clause means a *place-finder app is exactly the use case the public instance forbids.*
Bulk/recurring scripts are capped at **4 requests per minute** and results **must be cached**.

**Also: OSM has no ratings and no review counts.** If the app concept depends on "rated/reviewed
places", OSM cannot supply it at any price. That is a **product** constraint — surface it during
DISCUSS, not after the schema is written.

### Ranked options for him

| Rank | Option | Card? | CR? | KSA? | Free tier | Gate risk | Confidence |
|---|---|---|---|---|---|---|---|
| 1 | **MapLibre GL** (map *rendering* only, open source) | No | No | Yes | Free, unlimited — it is a library, not a service | None. Needs a tile source (below) | `[SEARCH]` widely used FOSS renderer |
| 2 | **Geoapify** (geocoding, places, tiles — OSM-based) | `[UNKNOWN]` | No | Yes | ~3,000 credits/**day** | Low | `[SEARCH]` |
| 3 | **LocationIQ** (geocoding/tiles — OSM-based, commercial Nominatim) | `[UNKNOWN]` | No | Yes | ~5,000 requests/**day** | Low | `[SEARCH]` |
| 4 | **TomTom** | No card for free tier | No | Yes | ~50,000 tile + ~2,500 non-tile req/**day** | Card needed only to exceed free tier. **Pricing changed 2026-07-01 — re-check.** | `[SEARCH]` |
| 5 | **Foursquare Places** (the only realistic *ratings/POI* source) | `[UNKNOWN]` | No | `[UNKNOWN]` | Conflicting: "500 free Pro calls/mo from 2026-06-01" vs "$200 free credits/mo". **Do not quote a number.** Premium endpoints (tips, photos) have **no free tier**. | Unknown | `[SEARCH]`, self-contradictory |
| — | **Mapbox** | **CONFLICTING** — sources disagree on whether a card is required to start | No | Yes | Commonly cited 50k web loads / 25k mobile MAU / 100k geocoding per month | Unknown | `[UNVERIFIED]` — could not fetch docs.mapbox.com (connection reset). **Verify the card question manually before proposing.** |
| — | **HERE** | Free "Limited" ~1,000 req/day without payment info; higher tier **requires payment info** | No | Yes | see left | Card gate to scale | `[SEARCH]` |

**Practical recipe for a map-bearing app:** MapLibre GL for rendering + a keyed OSM-based geocoder
(Geoapify or LocationIQ) for search + **cache every result in Postgres**. Never call a public
community endpoint (Nominatim/Photon/Overpass) directly from the app at runtime.

`Photon` (photon.komoot.io) is free and keyless but explicitly "availability is not guaranteed"
and heavy use is "throttled or completely banned" `[SEARCH]` — acceptable for a personal one-user
tool, unacceptable as a dependency for anything he shares.

### Unresolved and important
**KSA POI coverage quality is not established.** I could not verify how well Foursquare or OSM
cover Riyadh/Jeddah businesses versus Google. `[UNKNOWN]` — for any place-discovery app, the
research step must **sample 10–20 real Saudi POIs against the candidate API before committing.**

---

## 2. Email sending

Already the factory default (Resend → Supabase custom SMTP). Nothing here is blocked for him.

| Rank | Option | Card? | CR? | Free tier | Confidence |
|---|---|---|---|---|---|
| 1 | **Resend** (current default — keep) | No card | No | ~3,000/month, ~100/day, 1 custom domain, 1 day data retention | `[SEARCH]` |
| 2 | **Brevo** | No card | No | ~300/day (~9,000/mo), no expiry | `[SEARCH]` |
| 3 | **Mailgun** | `[UNKNOWN]` | No | ~100/day — testing volumes only | `[SEARCH]` |
| ✗ | **SendGrid** | — | — | **Free tier discontinued** — 60-day trial then paid (~$19.95/mo) | `[SEARCH]` |

**No reseller/regional gate found in this category.** Email is his safest integration class.
Note: a custom sending domain needs DNS access — fine if he owns a domain, a blocker if he does not.

---

## 3. SMS / OTP delivery — **default answer: DO NOT USE**

This is a structurally hostile category for a Saudi individual. Treat SMS OTP as **blocked** unless
Basim personally insists and accepts a multi-week business process.

- **Alphanumeric sender ID registration is mandatory** for all A2P messaging in KSA, governed by
  **CST** (formerly CITC). Requires **Company Registration Certificate + Delegation Letter in Arabic**,
  ~2 weeks approval. An individual with no CR cannot satisfy this. `[SEARCH]`
- **Twilio reportedly cannot register sender IDs for domestic Saudi brands at all**, due to rules
  prohibiting resale of domestic traffic. `[SEARCH]` — I could not confirm at source; Twilio's
  support page returned HTTP 403 to automated fetch. **Flagged as probable, not certain.**
- **Unifonic** (local KSA provider): reportedly a **299 SAR annual registration fee** for local Saudi
  companies, and API access requires emailing them to be provisioned an AppSid. Individual eligibility
  `[UNKNOWN]`. `[SEARCH]`

**→ Guidance: keep Email OTP.** The factory template already mandates Email OTP + Resend SMTP
(`template/.claude/skills/new-app/SKILL.md:39`). That is the correct call and should not be revisited.
If an app "needs phone verification", challenge the requirement during DISCUSS — for a personal or
handful-of-users app it is almost always ceremony, not security.

---

## 4. Push notifications — **coupled to the delivery decision; get this right in DISCUSS**

| Delivery method | Remote push (app closed)? | Notes |
|---|---|---|
| **Sideloaded IPA (free Apple ID)** | ❌ **NO — impossible** | Free Apple ID gives: 7-day expiry, ~3 device UDIDs/7 days, ~10 app IDs (resets ~4 days), **no push notifications, no in-app purchase**. The `aps-environment` entitlement is not issued. `[SEARCH]` |
| **PWA added to Home Screen** | ✅ **Yes**, iOS 16.4+ | **Home-Screen-installed only** — an open Safari tab has no `PushManager` access. Requires the user to do Share → Add to Home Screen. Safari 18.4 added Declarative Web Push; iOS 26 opens Home Screen sites as web apps by default. `[SEARCH]` |
| **Expo / EAS push** | ⚠ Android yes, **iOS needs a paid Apple Developer account** for the APNs key | $99/yr Apple Developer — he does not have one. `[SEARCH]` |
| **Local/scheduled notifications** | ✅ Works everywhere, no entitlement, no service | **Underused answer.** Reminders, streaks, scheduled nudges need no server and no push at all. |

**Decision rule to enforce:**
> If the app genuinely needs to notify the user while closed → **PWA**, and the notification service
> is a Supabase Edge Function sending Web Push with self-generated **VAPID keys** (free, no third
> party, no card).
> If the "notification" is really a scheduled reminder → **local notifications**, and push is a non-issue.
> Never let a sideload-IPA app promise remote push. It cannot deliver it.

This matches the existing ordered delivery list at `template/.claude/skills/new-app/SKILL.md:41-45`.

---

## 5. AI / LLM APIs

| Rank | Option | KSA? | Card? | CR? | ⚠ Upgrade trap | Confidence |
|---|---|---|---|---|---|---|
| 1 | **Anthropic (Claude API)** | ✅ **Saudi Arabia explicitly listed** in supported countries, API section | Yes, prepaid credits, personal card | No | **None found** — direct billing, no KSA reseller gate | `[VERIFIED]` fetched https://www.anthropic.com/supported-countries |
| 2 | **OpenAI** | ✅ Available | Yes — prepaid credit deposit, **min $5, USD only**; needs a card supporting cross-border payments (most KSA bank Visa/MC work; some prepaid/restricted debit cards fail) | No | None found | `[SEARCH]` |
| 3 | **Google Gemini / AI Studio** | ✅ Saudi Arabia **is** a listed available region (18+) | Free tier: no | No | 🚨 **YES — THIS IS THE CNTXT TRAP AGAIN.** The Gemini API paid tier bills through **Cloud Billing accounts**. A KSA billing address on Cloud Billing lands back in the CNTXT gate. Free tier as of ~May 2026 covers **only Flash / Flash-Lite**; Pro models moved behind billing. Prepay/Postpay plans replaced pay-as-you-go 2026-03-23. | region `[VERIFIED]` (fetched ai.google.dev/gemini-api/docs/available-regions); billing mechanics `[SEARCH]` |

**→ Guidance: prefer Anthropic.** It is the only one of the three with a verified KSA listing *and*
no identified regional billing gate. **Gemini's free tier is usable but is a delay-fuse dead end** —
if an app's core feature depends on Gemini, it dies the day it outgrows Flash. Say this out loud
when proposing it; do not let it onto a required path.

---

## 6. Payments — **the CR question, and a real path he may not know about**

**Confirmed: he cannot use Stripe as a Saudi merchant.** `[SEARCH]`

But the blanket assumption "payments need a CR" is **not quite true**, and this matters:

> **Moyasar accepts a freelance license as an alternative to a Commercial Registration.**
> Their FAQ states you need *"a valid Saudi commercial registration (CR) **or freelance license**,
> and a Saudi commercial bank account linked to it."*
> `[VERIFIED]` — fetched https://moyasar.com/en/resources/faqs/

**The freelance work document (وثيقة العمل الحر)** is issued by HRSD via **freelance.sa**, is
**available to Saudi citizens** (which Basim is), covers 120+ professions including IT, and requires
Saudi ID + bank details. `[SEARCH]`

**Two things I could NOT verify and must not be stated as fact:**
- Whether the freelance document currently carries a **fee** — one source mentions "paying the license
  fee", historically it has been free. `[UNKNOWN]`
- Whether Moyasar's *"Saudi commercial bank account"* requirement accepts a **personal** account held
  by a freelance-document holder, or demands a true business account. **This is the load-bearing
  unknown for the whole category.** `[UNKNOWN]`

| Option | CR required? | Notes | Confidence |
|---|---|---|---|
| **Moyasar** | CR **or freelance license** + linked Saudi bank account | Fees not published — sales contact only | `[VERIFIED]` requirements |
| **Tap Payments** | Reportedly **may not require CR**; "no Saudi entity required", 2–4 week onboarding, hosted checkout | Most accessible per one source, but this is a single unverified claim | `[SEARCH]` |
| **HyperPay** | `[UNKNOWN]` | Enterprise-leaning | `[UNKNOWN]` |
| **Stripe** | ✗ not available to KSA merchants | — | `[SEARCH]` |

**→ Guidance:** Do not tell him "you can't build anything transactional." Tell him: *"taking money
needs a freelance document from freelance.sa plus a payment gateway (Moyasar or Tap) — that's a
real process measured in weeks, not an afternoon. Want to do it, or should v1 be free-to-use?"*
That is a **product decision surfaced during DISCUSS**, not a discovery made at the key-collection step.

---

## 7. File / image storage & CDN

**Supabase Storage covers essentially every app he builds.** Free plan, `[VERIFIED]` fetched
https://supabase.com/pricing:
- 500 MB database, **1 GB file storage**, **5 GB egress** (+5 GB cached egress)
- 50,000 monthly active users, unlimited API requests, 500,000 edge function invocations/mo
- **Limit of 2 active projects**
- ⚠ **"Free projects are paused after 1 week of inactivity"** — the exact condition that produces the
  vacuous-green `get_advisors` result already documented at `template/.claude/skills/new-app/SKILL.md:84-91`.
  Card requirement for the free plan: not stated on the pricing page `[UNKNOWN]`.

Alternatives only if he exceeds 1 GB — **Cloudflare R2** is the usual next step (no egress fees) but
I did **not** verify its free-tier limits or card requirement this session `[UNKNOWN]`.

**→ Guidance: don't propose a second storage vendor.** One backend, one bill, one dashboard is worth
far more to him than saving a hypothetical dollar. Note the 2-project cap when he has several apps live.

---

## 8. Analytics / error tracking

| Rank | Option | Card? | CR? | Free tier | Confidence |
|---|---|---|---|---|---|
| 1 | **PostHog** (analytics + error tracking + session replay in one) | **No card** for free tier | No | 1M analytics events, 5k session recordings, 1M feature-flag requests, 100k error-tracking exceptions, 50 GB logs, 1.5k survey responses — monthly reset | `[SEARCH]` |
| 2 | **Sentry** (error tracking) | `[UNKNOWN]` | No | `[UNKNOWN]` — did not verify limits | `[UNKNOWN]` |

No regional gate identified in this category. For a personal app, PostHog's free tier is
orders of magnitude beyond what he will use.

**→ Guidance:** analytics is almost always a **non-goal for v1** of a one-user app. Propose it only
if he asked for it. Every added service is another key, another dashboard, another thing to break.

---

## 9. Security notes that belong with these choices

- **Never put a third-party API key in the Expo app.** `EXPO_PUBLIC_*` values ship inside the binary
  and are trivially extractable. Any keyed service (Geoapify, LocationIQ, Foursquare, Anthropic,
  Resend) must be called from a **Supabase Edge Function** with the key stored as a
  `supabase-secret` — never `app-env`. The existing manifest already encodes this destination
  split (`template/.claude/skills/new-app/SKILL.md:58`); this file is the reason it matters.
- **Rate-limit and cache every external call server-side.** A leaked or abused key on a free tier
  does not just cost money — it burns the free quota and takes the app down. Cache POI/geocoding
  results in Postgres both to obey OSM policy and to contain blast radius.
- **The publishable Supabase key is safe to ship; it is only as safe as RLS.** Nothing in this file
  changes that RLS + matching GRANTs remain the actual authorization boundary.

---

## 10. What the research step must DO with this file

1. Map each proposed feature to a category above.
2. Run **the five-point GATE** on every candidate — especially **check 5, the upgrade trap.**
3. For any `[UNVERIFIED]` / `[UNKNOWN]` / `[SEARCH]` cell that would sit on a **required** path:
   **go verify it live before proposing.** Do not quote a free-tier number from this file as fact —
   quote it with its marker.
4. If the ideal service is blocked, present the **honest trade-off** (e.g. "OSM has no ratings"),
   not a silent substitution. A downgraded feature Basim didn't agree to is a spec failure.
5. Anything still unobtainable becomes a **SPEC non-goal** or a `required: false` key —
   per `template/.claude/skills/new-app/SKILL.md:60`, never a frozen pipeline.
