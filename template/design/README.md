# design/input/ — the design source for `/design-import` (S2)

Drop the interface design here before running `/design-import`:

- Screenshots or exported frames (PNG/JPG), one per screen.
- Any design tokens / spec (colors, spacing, type) as text or JSON.
- A short note on flows if the screens don't make order obvious.

`/design-import` reads everything in this folder and translates it **faithfully**
into Expo screens (mock data first — no backend wiring until BUILD). Keep it to the
v1 screens in `docs/SPEC.md`; anything not represented here won't get built.
