Build "Makuran Trace" — a mobile-first web app for Makuran Cattle Farm to track livestock from birth through transfer, quarantine, and final movement, with full QR-code traceability. The app must support MULTIPLE SPECIES (cattle, goat, sheep, donkey, buffalo, camel) — species is a field on every animal, not a hardcoded assumption.

=== VISUAL DESIGN SYSTEM ===
Use this exact design system. Do not substitute default colors, fonts, or component styles.

Brand: navy authority + green optimism + blue trust. Premium, purposeful, warm — not corporate or cold.

Color tokens (CSS variables):
--background: #ffffff
--foreground: #182951
--card: #ffffff
--card-foreground: #182951
--primary: #182951        (navy — primary actions, headers, nav)
--primary-foreground: #ffffff
--secondary: #2FB572      (green — success, confirm actions, positive status)
--secondary-foreground: #ffffff
--muted: #E3F8EF          (tinted backgrounds, tags)
--muted-foreground: #9E9E9E
--accent: #2D7DD2         (blue — links, info states, interactive highlights)
--accent-foreground: #ffffff
--destructive: #d4183d
--destructive-foreground: #ffffff
--border: #D5D5D5
--input-background: #f3f3f5
--ring: #2FB572
--radius: 0.75rem (12px base; sm=8px, md=10px, lg=12px, xl=16px)

Gradients:
--gradient-primary: linear-gradient(135deg, #182951 0%, #2D7DD2 100%)   — dashboard header / hero areas
--gradient-impact: linear-gradient(135deg, #2FB572 0%, #2D7DD2 100%)    — stat highlight cards
--gradient-brand: linear-gradient(135deg, #182951 0%, #2FB572 100%)     — badges, feature callouts

Typography:
- Display/UI font: Montserrat (weights 400–900) — all headings, buttons, nav labels, the app logo
- Body font: Manrope (weights 400–800) — body text, form labels, input text, descriptions
- Import: https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&family=Manrope:wght@400;500;600;700;800&display=swap
- h1/h2/h3 use Montserrat weight 500–700; labels and buttons use Montserrat 500–600; body/inputs use Manrope 400

Component look:
- Cards: white background, 1px border in --border, rounded-xl (12px+), hover:shadow-md transition
- Primary buttons: bg navy (--primary), white text, Montserrat semibold, rounded-lg, px-6 py-3, hover:opacity-90
- Secondary/confirm buttons: bg green (--secondary), same shape
- Outline buttons: border in --border, foreground text, hover:bg-muted
- Badges/tags: pill-shaped (rounded-full), text-xs font-medium, colored backgrounds at low opacity matching their semantic meaning (green=active/healthy, blue=info/transferred, amber equivalent only if truly needed for "in progress" states — otherwise stay within navy/green/blue/gray)
- Inputs: bg --input-background, border --border, rounded-lg, px-4 py-2.5, focus:ring-2 ring --ring
- Use subtle fadeInUp entry animation on card lists and section transitions (opacity 0→1, translateY 10px→0, 0.4s ease)
- Icons: lucide-react, default size 20px, stroke width 1.5

This is a FIELD TOOL for farm staff and rural breeders, not a marketing site — keep the gradients and animation restrained (use gradients only on the dashboard summary header and on impact/stat cards, not as full-page backgrounds; keep animation to subtle entry/hover transitions, no floating decorative elements).

=== APP STRUCTURE ===
Mobile-first single-page app (works in a phone-width frame) with five main sections reachable from a bottom navigation bar: Dashboard, Register, Record Event, Search/Scan, Reports.

--- 1. DASHBOARD ---
- Header: farm name "Makuran Cattle Farm", app name "Makuran Trace", a live/sync status indicator (green dot = synced, amber = offline/pending)
- Species breakdown strip: horizontally scrollable chips showing count per species currently tracked (e.g. "12 Cattle", "8 Goat") — only show species that have at least one animal
- Four stat cards in a 2x2 grid: Total Animals, In Quarantine, At Breeder Farms, Sent to Slaughter — each with an icon and a short supporting line
- Recent Activity list: last 4 events across all animals, each showing event type, animal ID, species icon, and date — tapping opens that animal's full record

--- 2. REGISTER NEW BIRTH ---
Form to register a newly born animal at a breeder's farm:
- Species selector: horizontally scrollable chips, one per species (Cattle, Goat, Sheep, Donkey, Buffalo, Camel) — selecting one updates the gender label options and ID format hint below
- Breeder name (text, required)
- Birth date (date picker, required, defaults to today)
- Breeder location/village (text, required) + a "Use GPS" button that captures device geolocation (latitude/longitude) and displays it once captured
- Gender (select: Male/Female — label adapts per species, e.g. Cattle shows "Male (Bull)/Female (Cow)", Donkey shows "Male (Jack)/Female (Jenny)", Goat shows "Male (Buck)/Female (Doe)", Sheep shows "Male (Ram)/Female (Ewe)")
- Color/markings (text, placeholder changes per species)
- Notes (textarea, optional)
- Submit button: "Register Animal & Generate QR"
- On submit: auto-generate a unique traceability ID in the format MCF-{SPECIES_CODE}-{YYYYMM}-{NNN} where SPECIES_CODE is CTL (cattle), GOT (goat), SHP (sheep), DON (donkey), BUF (buffalo), CAM (camel), YYYYMM is the current year+month, and NNN is a sequential counter scoped to that species and month. Show a confirmation, then immediately display a generated QR code (encoding the animal ID) with options to download as PNG or print as a label.

--- 3. RECORD EVENT ---
Form to log a lifecycle event for an existing animal:
- Select animal (dropdown showing ID, species, current status)
- Event type (select: Transfer to Central Farm, Quarantine Start, Quarantine End, Movement to Slaughter, Health/Veterinary Check, Other)
- When "Transfer to Central Farm" is selected, show extra fields: Previous Owner/Breeder, Animal Condition on Transfer (select: Healthy-Good condition / Healthy-Minor injuries / Requires attention / Underweight)
- Event date (date picker, defaults to today)
- Location (text) + "Use GPS" button
- Notes/observations (textarea)
- Submit button: "Record Event & Update History"
- On submit: append to the animal's event history (never overwrite — history is append-only/immutable) and update the animal's current status accordingly (Transfer → "Transferred, Pending Quarantine"; Quarantine Start → "In Quarantine"; Quarantine End → "Active at Farm"; Movement to Slaughter → "Sent to Slaughterhouse"). After Transfer or Quarantine Start, offer to generate a fresh QR code.

--- 4. SEARCH / SCAN ---
- Search bar (search by animal ID, breeder name, or species)
- Species filter chips ("All" plus one chip per species present in the data)
- Scrollable list of animal cards, each showing: species icon, animal ID (monospace), breeder name, status badge (color-coded: blue=at breeder, green=active, navy/blue=transferred, gray=in quarantine — use the brand palette consistently rather than ad hoc colors), gender + color, event count, and most recent event with date
- Tapping a card opens a detail modal/sheet showing: species, birth date, gender/color, original breeder, birth location, and a full vertical timeline of every event (icon per event type, date, location, GPS coordinates if captured, notes) — newest first. Include a "Simulate QR Scan" button that re-displays this same history (placeholder for camera-based QR scanning in the real mobile app) and a button to view/regenerate the QR code for this animal.

--- 5. REPORTS & ANALYTICS ---
- Donut chart: current status distribution across all animals (At Breeder / In Quarantine / Active / Transferred-Pending / Slaughtered)
- Bar chart: animal count by species
- Two summary cards: Species Tracked (count), Traceability Coverage (should read 100% — every animal has QR + history)
- Export buttons: "Export All Data (CSV)" and "Backup Data (JSON)"

=== DATA MODEL ===
Two related entities:

ANIMAL
- id (text, primary key) — the generated traceability code, e.g. MCF-CTL-202606-005
- species (text) — cattle | goat | sheep | donkey | buffalo | camel
- birth_date (date)
- breeder_name (text)
- birth_location (text)
- birth_lat, birth_lng (decimal, nullable)
- gender (text) — Male | Female
- color (text)
- status (text) — Registered at Breeder's Farm | Transferred, Pending Quarantine | In Quarantine | Active at Farm | Sent to Slaughterhouse
- created_at (timestamp)

EVENT (many-to-one with Animal, append-only — never edited or deleted, only inserted)
- id (auto)
- animal_id (foreign key → Animal.id)
- event_type (text) — Birth Registered | Transfer to MCF Farm | Quarantine Start | Quarantine End | Movement to Slaughter | Health Check | Other
- event_date (date)
- location (text)
- lat, lng (decimal, nullable)
- notes (text)
- recorded_at (timestamp)

=== KEY BEHAVIORS ===
- The app must work usably even with intermittent connectivity (rural Pakistan field conditions) — show a clear sync status indicator and don't block data entry if a save fails; queue it and retry.
- Event history is immutable: corrections must be entered as a new event, never as an edit to a past one.
- QR codes must encode the animal's ID only (so scanning resolves to a lookup, not embedded data).
- Keep text minimal, icons large and clear, touch targets generous — this will be used by people with varying literacy levels in the field, often on small phone screens in bright sunlight.
- Seed the app with a handful of realistic demo animals across at least three different species so the UI doesn't look empty on first load.

Start by building this as a fully working frontend with realistic mock/seed data. I will follow up with a prompt to wire it to a relational Supabase backend — set up the data layer (state management / data fetching functions) in a way that's easy to swap from local mock data to real database calls without restructuring the UI.