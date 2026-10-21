# Dizoda Furniture Engine — senior project site

## Current design: 21 October 2026

Approved from mockup v2 (direction B, "Figures"). Supersedes the white/navy single-column
site with the interactive 3D room.

### Intent

A site for the people assessing the senior project (jury, advisor, department). They open it
from a link and explore it alone. It shows every feature of the furniture engine through one
interaction each, with short factual text. It is not a product page; dizoda.com covers the
product.

### Rules

- Never write "system 1", "team 1" or similar. The footer reads "A senior project · Furniture Engine is a
  subsystem of Dizoda."; neither phrase appears elsewhere.
- Concise, non-promotional copy. Noun headings. No slogans, badges or calls to action.
- Each feature has exactly one interaction, and no two interactions show the same thing.
- Explanatory text only where it explains a feature; interactions carry no instructions.
- No app screens.

### Pages

Both pages share a top bar: "Dizoda Furniture Engine" (serif, links to `/`) on the left;
"Features", "Documents", "dizoda.com ↗" on the right, and the footer above.

**Features (`/`)** — the centered title alone, a summary paragraph that explains the project
(what Dizoda does, why image-only design tools fall short, what the engine adds) without
listing the features, then three numbered sections and "Meet the Team". Each feature section
has a heading, one paragraph and one figure. Copy is fixed in `site/index.html`.

1. **Room capture.** Photo of the empty room (kept armchair only) with a pulsing tap target.
   Each tap places the next point: two per wall for the back, left and right walls (the front
   wall closes with them), ceiling height, two window corners, two door corners, the armchair
   to keep, then the shutter. Wall lines extend until a neighbouring wall meets them; corners
   appear at intersections, the one behind the armchair dashed. A to-scale plan builds
   alongside. Step chips: Walls, Height, Window, Door, Furniture, Photo, plus a restart button.
2. **Arrangements.** Layout switch 1–3, the unplaced "Floor lamp · Size missing" chip and the
   selected piece's name and size. Photo with numbered pins beside a read-only plan; selecting
   a piece in either highlights it in both.
3. **Placement checks.** Editable plan (drag to move, handle to rotate, keyboard too) beside a
   list of the five rules, a photo and "Update photo"/"Reset". A broken rule turns its list item
   and the offending pieces amber. Moving a piece greys the photo and outlines the new
   positions; "Update photo" renders a new one from the 3D room.

**Meet the Team** — sub-sections "Project advisor", "Jury members" and "Team members", each a
row of cards: a 4:5 photo, the name and, for faculty, the department. Advisor: Asst. Prof. Dr.
Mehmet Evren Coşkun (Computer Engineering); jury: Dr. Ayşenur Birtürk (Software Engineering)
and Dr. Eren Ulu (Computer Engineering), with photos from their TED University profiles in
`site/team/`; team: Tunahan Balcı and Berre Yazgı, photos `site/team/tunahan_balci.jpg` and
`site/team/berre_yazgi.jpg`. A card whose photo is missing shows initials.

**Documents (`/documents/`)** — heading and a card grid of every PDF in `site/documents/`.
A card's face is a preview of the first page; below it, the title and "N pages · Mon YYYY"
(from the PDF). The title is the file name without the extension and a leading order number
(`01 Project Proposal.pdf` → "Project Proposal"); names without spaces split at "-", "_" and
case changes (`HighLevelDesignReport.pdf` → "High Level Design Report"). Numbered files come
first, by number; the rest follow the creation date stored in the PDF, oldest first. Clicking a card
opens a viewer over the page: all pages in one scroll, previous/next, zoom 50–200 %, download,
close (✕ or Esc). Without JavaScript the cards are plain links to the PDFs. With no PDFs the
page reads "No documents yet."

### Room and furniture

4.20 × 3.60 × 2.65 m room; 124 × 127 cm window with a 103.5 cm sill on the photographed wall;
90 cm door on the right wall. Pieces: KLIPPAN sofa 180 × 88 × 66, LISABO coffee table
118 × 50 × 50, BILLY bookcase 80 × 28 × 202, wall art 60 × 80, and a kept POÄNG armchair
68 × 82 × 100 in the back-left corner. Three fixed layouts pass every check. The browser checks
are an illustration; they do not run the project's layout search.

### Implementation

Static HTML/CSS and native ES modules, built by `scripts/build.mjs` into `dist/`. Photos are
stills rendered from the Three.js room by `scripts/render-photos.py` and stored in
`site/photos/`; Three.js loads only for "Update photo". PDFs render with pdf.js (`pdfjs-dist`),
hosted locally under `/vendor/pdfjs/`. Strict CSP: everything from `'self'`; `blob:` images for
updated photos; `'wasm-unsafe-eval'` for pdf.js image decoders. Hosted on Cloudflare Pages
(`dizoda-furniture-engine`); GitHub Actions tests every push and deploys `main`.
