# Quote Generator v2 — self-serve clinics, app-drawn PDFs

Branch `v2`. Same app for agents, three changes underneath:

1. **The app draws everything.** Clinic name, location, doctor name, credentials, clinic photo,
   before/after photo and doctor headshot are painted onto the PDF by the app (`src/lib/pdfOverlay.ts`).
   Nothing per clinic is typed into Canva any more.
2. **One template per brand.** `public/templates/{dd,md}_{doctor,nodoctor}.pdf` — exported once from
   the Canva designs *DD/MD QUOTE v2 — app template (doctor / no doctor)*. The old per-clinic
   `template_pdf_url` still works as an override (the app paints over its header), so existing rows keep working.
3. **Add-clinic screen.** An agent pastes the clinic's DD/MD profile URL; the app reads name, location,
   doctors and photos from the page (plain HTML parsing, no AI), the agent ticks the photos, and the app
   creates the Drive folder, copies the images there and appends the rows to the Clinic App tab as Active.
   The clinic is usable immediately.

Also: UTMs on the "View Clinic Page" link, a quote ID (`DD-20261002-K7Q2`) in the filename, PDF metadata,
tracker column I and `utm_term`; the link hotspot now matches the button; exclusions stop above
"IMPORTANT NOTES"; the browser never sends an Anthropic key in production.

## One-time setup for the test site

### 1. Spreadsheet (copy of *Quote Automs Links/Files Storage*)
Make a copy of the sheet for testing. On the **Clinic App** tab, keep the existing headers and add these
columns anywhere (header names matter, order does not):

| header | what goes in it |
| --- | --- |
| `clinic_image_url` | Drive link of the page-1 photo (filled by Add-clinic) |
| `before_after_image_url` | Drive link of the page-2 photo (optional) |
| `doctor_image_url` | Drive link of the headshot, per doctor row |
| `added_by` | agent who added the clinic |
| `added_at` | timestamp |

For existing rows nothing is required: no `*_image_url` → no photo on that slot; `template_pdf_url`
still set → the old per-clinic template is used and painted over.

On the **Quotes Tracker** tab add header `quote_id` in column I (H stays "Comments (for Yana)";
the app writes an upload error there only when the Drive save failed).

Share the copy with `quote-generator@quote-generator-495310.iam.gserviceaccount.com` as **Editor**.

### 2. Drive
Share the **DD Quote PDFs** and **MD Quote PDFs** folders (or a test copy of them) with the service account
as **Editor**. New clinic folders are created inside them; the service account must also be able to read the
image files it uploads there (it owns them, so it can).

### 3. Netlify — new site from this branch
*Add new project → Import from Git → this repo → branch `v2`.* Build command and publish dir come from
`netlify.toml`. Environment variables (Production scope, Functions + Builds + Runtime):

| variable | value |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | same as the live site |
| `ANTHROPIC_API_KEY` | same as the live site |
| `CLINIC_APP_SPREADSHEET_ID` | ID of the **copied** spreadsheet |
| `TRACKER_SPREADSHEET_ID` | same ID (optional — defaults to `CLINIC_APP_SPREADSHEET_ID`) |
| `CLINIC_APP_TAB` | optional, default `Clinic App` |
| `TRACKER_TAB` | optional, default `Quotes Tracker` |
| `DD_QUOTES_FOLDER_ID` | Drive folder ID where new DD clinic folders are created (e.g. the DD Quote PDFs folder) |
| `MD_QUOTES_FOLDER_ID` | same for MD |
| `RESEND_API_KEY` | same as the live site (error e-mails) |

Deploy. The site URL is whatever Netlify assigns; rename it in *Site configuration* if you like.

### 4. Test
1. Open the site, DD tab → clinic dropdown → **Add a new clinic…** → paste
   `https://www.dentaldepartures.com/dentist/dental-brush` → read page → pick photos → save.
2. The clinic is now selected; paste raw quote text → extract → review → download.
3. Check: PDF header shows the clinic + city, page 2 shows the doctor card and photo, the button links to the
   clinic page with UTMs, the Drive folder has the PDF, the tracker has a row with the quote ID.
4. Repeat on the MD tab with `https://www.medicaldepartures.com/clinic/masterpiece-hospital`.

## Going live
Point the production Netlify site at `v2` (or merge to `main`), set the same env vars with the real
spreadsheet ID, add the five columns to the real Clinic App tab, and re-share nothing else — the service
account already has access.
