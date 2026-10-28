# Quote Generator v3 — TEST version

**Try it:** https://dentaldepartures.github.io/quote-generator-v3-test/

This is a test copy of the Dental Departures / Medical Departures Quote Generator with the new **v3 quote design**.
It is published on GitHub Pages only — the live Netlify apps are not changed by anything in this repo.

## What is the same as the live app

Ops Agent box, sales agent dropdown, brand tabs, clinic and doctor dropdowns ("✎ Doctor not listed"),
paste the clinic's text or **Upload clinic PDF**, one quote per patient (or "Separate quote for each treatment"),
all currencies including IDR and VND, and the review screen.

## What is different

- **The quote PDF uses the v3 design**: curved clinic photo, personalised proposal title, doctor or clinic card,
  treatment/option tiles, price box, clickable WhatsApp and clinic buttons, coordinator with headshot, and detail pages
  that grow with the quote (a longer quote shrinks in up to two steps to stay on 2 pages; only a long one flows onto page 3).
- **Nothing is saved.** Quotes are only downloaded — no copy in Drive, no row in the Quotes Tracker, no error emails.
  A yellow banner at the top says so.
- Clinics, agents and the AI come from the live app's API, read-only.

## Notes

- Every clinic gets 2 photos. Clinics without photo links in the Clinic App sheet (mostly the older ones) use 2 photos
  picked from their DD/MD profile pages, kept in `public/clinic-photos.json` (keyed by profile URL).
- All 6 sales agents have headshots in `public/agents/<email name>.jpg` for this test; the real app
  would take them from a Photo column in the Agents tab.
- The last page carries the in-person examination terms (dental or medical wording); the footer repeats them in short.
- The v3 layout code is in `src/lib/v3/`. Build switches are in `src/lib/env.ts`.

## Rebuilding the test site

```
VITE_BASE=/quote-generator-v3-test/ VITE_API_BASE=https://dental-medical-departures-quote-gen.netlify.app \
VITE_PDF_DESIGN=v3 VITE_TEST_MODE=1 npx vite build --outDir dist-pages
```

Then publish the contents of `dist-pages` (plus `.nojekyll`) to the `gh-pages` branch.
