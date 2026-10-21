# Verification

Verified locally on 21 October 2026 against `docs/design.md`, after the rebuild, the review
fixes and the hero, team and document-naming changes.

- `npm test`: 16 passing cases.
  - Room model: the three layouts pass every check. Each rule (wall, overlap, 3D wall-art
    overlap, door, window, covered window, 60 cm path) reports the piece that breaks it. A
    blocked door doesn't cascade into path failures. Published furniture sizes, projection
    matching the photo camera, and capture step order are also checked.
  - Documents: titles, including run-together names; ordering by number, then by the PDF
    creation date; reading that date; escaping and encoding; the empty state.
  - Build: pdf.js comes from its legacy build; `$` in file names stays literal; the build
    refuses to clear the project or its sources.
- `python3 tests/browser.py`: 11 groups pass in Chrome with no console errors.
  - The site is built with `tests/fixtures/documents` plus a generated 6 MB PDF into a
    temporary folder, which is removed afterwards.
  - It is served with the `site/_headers` security headers and with byte ranges, as on
    Cloudflare Pages.

## Browser coverage

- **Copy and hero.** One "senior project" and one "subsystem" mention, both in the footer. No
  system/team numbering. The hero holds only the title and the summary.
- **Meet the Team.** Advisor, jury and team cards in that order, after the features, with
  photos. A missing photo shows initials.
- **Room capture.** Keyboard to completion (hidden corner, kept furniture, camera). Restart by
  keyboard keeps focus. A pointer tap on the target places a point; taps away from it are
  ignored.
- **Arrangements.** The layout switch by keyboard keeps focus and changes the photo. Selecting
  in the photo highlights the plan and the reverse. The selected piece's size and the unplaced
  floor lamp are shown.
- **Placement checks.**
  - A door conflict by keyboard, and rotation.
  - "Update photo" and "Reset" by keyboard keep focus; the update produces a new render.
  - A pointer drag into the window.
  - Wall art above the sofa is allowed; lowered into it, it is flagged.
  - Read-only plans let the page scroll by touch; the editable plan keeps drags.
- **Tablet and phone widths.** At 1024 and 768 px each figure stays side by side. The rotate
  handle is at least 24 px wide on a 390 px phone.
- **Documents.**
  - Titles come from file names, with four previews and one failed card. Previews read under
    40 % of a 6 MB PDF.
  - Page counts show. A Turkish/ampersand file name is encoded and served as `application/pdf`.
  - Viewer: paging (last-page focus kept), zoom, the download link, and Escape returning focus
    to the card.
  - While scrolling a 30-page PDF at 200 % and device pixel ratio 2, at most 8 pages stay
    rendered and no canvas exceeds 12 MP.
  - A damaged PDF shows a message with a download link.
- **Overflow and phones.** No horizontal overflow at 1440, 1024, 768, 390 and 320 px on both
  pages. The phone viewer fits the screen and keeps download and zoom. Reduced motion turns off
  smooth scrolling and the capture pulse.
- **Without JavaScript.** The figures show their photos and every card links to its PDF.
- **Without WebGL.** "Update photo" becomes a disabled "Photo unavailable" button.
- **Other.** A build with an empty documents folder shows "No documents yet."; `404.html` is
  published.

Screenshots from the last run are in `/tmp/dizoda-preview/`.

## Not covered

- Only Chromium was tested, with software WebGL. Other browsers, hardware GPUs and real phones
  have not been tried. Safari, iOS and Samsung Internet in particular should be checked before
  sharing the link.
- Deployed to Cloudflare Pages on 21 October 2026 (production deployment `904db7ea`). From
  this network every `*.pages.dev` address, including the existing `dizoda-web.pages.dev`,
  times out, while dizoda.com answers from the same Cloudflare address; the live page was
  confirmed through an external reader instead. Headers, MIME types and byte ranges on the live
  site still need a check from an unblocked network or a dizoda.com subdomain.
- `site/team/tunahan_balci.jpg` is not in the repository yet, so that card shows initials.
