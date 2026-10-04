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
Make a copy of the sheet for testing and share it with
`quote-generator@quote-generator-495310.iam.gserviceaccount.com` as **Editor**. That is all —
the app adds any column it needs on first use (`clinic_image_url`, `before_after_image_url`,
`doctor_image_url`, `added_by`, `added_at` on **Clinic App**; `quote_id` on **Quotes Tracker**).
Header names matter, order does not.

For existing rows nothing is required: no `*_image_url` → no photo on that slot; `template_pdf_url`
still set → the old per-clinic template is used and painted over.

### 2. Drive
Two folders where new clinic folders (and quotes for rows without a `google_folder`) go — one per brand —
inside a folder the service account can edit. Subfolders of the *Quote Generator* folder inherit its sharing,
so nothing extra to share.

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

## Two sites, one codebase (`VITE_APP_MODE`)

| site | `VITE_APP_MODE` | who | what |
| --- | --- | --- | --- |
| dental-medical-departures-quote-gen | `agent` (default) | sales agents | quote generator; clinic list only, no onboarding UI |
| quote-gen-clinic-admin | `admin` | Yana | Add-clinic screen only, behind the admin password |

`ADMIN_PASSWORD` (set on **both** sites) is checked server-side by `/api/scrape-clinic` and `/api/add-clinic`,
so onboarding cannot be triggered from the agents' site even by calling the API directly. The admin site asks
for the password once and keeps it in the browser.

## Going live
`main` is deployed to the agents' site; the admin site deploys from the same branch with `VITE_APP_MODE=admin`.
Both use the real spreadsheet ID and the real DD/MD Quote PDFs folder IDs. The columns are created automatically
on first use; the service account already has access.
