# Dizoda Furniture Engine

The senior project site of **Tunahan Balcı** and **Berre Yazgı**. It has two pages:

- `/`: room capture, furniture arrangements and placement checks, each with an interactive figure.
- `/documents/`: the project's documents, with in-page previews and a PDF viewer.

## Local use

Requires Node.js 22+ and Python 3.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:4173. `npm run build` writes `dist/` and `npm run preview` serves it.
Three.js and pdf.js are copied into `dist/vendor/`; nothing loads from a CDN. Only `site/`
is published.

## Adding documents

Put PDFs in `site/documents/` and rebuild. Each file becomes a card:

- The title is the file name without `.pdf` and without a leading number:
  `01 Project Proposal.pdf` → "Project Proposal".
- Names without spaces are split at `-`, `_` and case changes:
  `HighLevelDesignReport.pdf` → "High Level Design Report".
- Numbered files come first, in number order (`2 …` before `10 …`). The others follow the
  creation date stored in the PDF, oldest first.
- The page count and date on each card are read from the PDF.

Clicking a card opens the PDF on the page. Without JavaScript the card links to the file.
Character maps for Chinese, Japanese and Korean fonts are not bundled, so such PDFs may not
render; add `node_modules/pdfjs-dist/cmaps` to the build if one is needed.

## Team photos

`site/team/` holds the portraits for "Meet the Team". The advisor and jury photos come from
their TED University profile pages. The team members' photos are
`site/team/tunahan_balci.jpg` and `site/team/berre_yazgi.jpg`; a card whose photo is missing
shows initials. Photos are shown at 4:5, cropped from the centre; 400 × 500 px JPEGs keep the
page light.

## Room photos

`site/photos/` holds renders of the 3D room (`site/room-scene.js`) for the layouts in
`site/room.js`. After changing either file, run `npm run photos` (needs Python Playwright and
Google Chrome) so the photos match the plan numbers again.

## Tests

```sh
npm test
npm run test:browser
```

`npm test` covers the room rules, the photo projection and the document cards.
`npm run test:browser` builds the site with `tests/fixtures/documents`, serves it with the
production headers and checks both pages in Chrome. See `docs/verification.md`.

## Hosting

The site is the Cloudflare Pages project `dizoda-furniture-engine`:
https://dizoda-furniture-engine.pages.dev. Wrangler, Cloudflare's command-line tool, is a dev
dependency, so `npm install` installs it.

### Automatic deploys

Every push and pull request runs the unit and browser tests in GitHub Actions
(`.github/workflows/deploy.yml`). When the tests pass on `main`, the workflow runs
`npm run deploy`, so pushing to `main` updates the live site in a few minutes. Follow a run under
the repository's **Actions** tab.

The workflow needs two repository secrets (**Settings → Secrets and variables → Actions**):

- `CLOUDFLARE_ACCOUNT_ID`: the account ID from the Cloudflare dashboard.
- `CLOUDFLARE_API_TOKEN`: create it in the Cloudflare dashboard under **My Profile → API Tokens
  → Create Token → Create Custom Token**, with the permission **Account · Cloudflare Pages ·
  Edit**. Set it from a terminal with `gh secret set CLOUDFLARE_API_TOKEN`, which asks for
  the value.

### Deploying by hand

1. Log in once per machine: `npx wrangler login`. It opens the browser; click **Allow**.
2. From this folder, run `npm test`, then `npm run deploy`.

`npm run deploy` builds `dist/` and uploads it as the production deployment. Each deployment
also keeps its own address (`https://<id>.dizoda-furniture-engine.pages.dev`), shown at the end
of the command.

### Custom domain

`*.pages.dev` addresses are blocked on some networks in Turkey; dizoda.com is not. To serve the
site from a subdomain of dizoda.com, such as `engine.dizoda.com`:

1. Open the Cloudflare dashboard → **Workers & Pages** → **dizoda-furniture-engine** →
   **Custom domains** → **Set up a custom domain**.
2. Enter the name, then choose **Activate domain**. dizoda.com is in the same account, so
   Cloudflare adds the DNS record itself; the address works within a few minutes.

### Other tasks

- **Preview without touching production:**
  `npx wrangler pages deploy dist --project-name dizoda-furniture-engine --branch preview`
- **Roll back:** dashboard → the project → **Deployments** → **⋯** beside an earlier
  deployment → **Rollback to this deployment**.
- **Deploy by hand without a browser login:** set the same two variables,
  `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, in the shell.
- **New projects:** Wrangler 4.151 creates new projects on Cloudflare Workers unless
  `--force` is given. This project was created on Pages with `--force`; later commands need no
  flag.

`site/_headers` sets the security headers, and Pages serves `404.html` for unknown paths.
