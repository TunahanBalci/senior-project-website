import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { documentTitle, sortDocuments, documentCards, readCreationDate } from "../scripts/documents.mjs";

// A one-page PDF whose information dictionary carries the given creation date.
function minimalPdf(date) {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>", `<< /CreationDate (D:${date}) >>`];
  let body = "%PDF-1.4\n";
  const offsets = objects.map((object, i) => { const at = body.length; body += `${i + 1} 0 obj\n${object}\nendobj\n`; return at; });
  const xref = body.length;
  return body + `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map(at => `${String(at).padStart(10, "0")} 00000 n \n`).join("")
    + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}

test("titles drop the order number and the extension", () => {
  assert.equal(documentTitle("01 Project Proposal.pdf"), "Project Proposal");
  assert.equal(documentTitle("02-design_report.pdf"), "Design report");
  assert.equal(documentTitle("Poster.PDF"), "Poster");
  assert.equal(documentTitle("03 Öneri & Plan.pdf"), "Öneri & Plan");
  assert.equal(documentTitle("2026.pdf"), "2026", "a name that is only a number keeps it");
});

test("run-together names get spaces between words", () => {
  assert.equal(documentTitle("HighLevelDesignReport.pdf"), "High Level Design Report");
  assert.equal(documentTitle("DBU_DetailedDesignReport.pdf"), "DBU Detailed Design Report");
  assert.equal(documentTitle("SRSReport.pdf"), "SRS Report");
  assert.equal(documentTitle("DBU_FINAL_REPORT.pdf"), "DBU FINAL REPORT");
  assert.equal(documentTitle("ÖnTasarımRaporu.pdf"), "Ön Tasarım Raporu");
});

test("unnumbered documents follow their creation dates, after numbered ones", () => {
  const dates = { "A.pdf": new Date("2025-01-01"), "B.pdf": new Date("2024-01-01") };
  assert.deepEqual(sortDocuments(["C.pdf", "B.pdf", "A.pdf", "2 X.pdf"], dates), ["2 X.pdf", "B.pdf", "A.pdf", "C.pdf"]);
  assert.match(documentCards(["A.pdf", "B.pdf"], dates), /href="B\.pdf"[\s\S]*href="A\.pdf"/);
});

test("the creation date is read from the PDF", async () => {
  const folder = mkdtempSync(join(tmpdir(), "dizoda-date-")), file = join(folder, "dated.pdf");
  writeFileSync(file, minimalPdf("20241101123820+03'00'"));
  const date = await readCreationDate(file);
  assert.equal(date.toISOString(), "2024-11-01T09:38:20.000Z");
  writeFileSync(file, "not a pdf");
  assert.equal(await readCreationDate(file), null, "unreadable files have no date");
  rmSync(folder, { recursive: true, force: true });
});

test("documents sort by their leading number", () => {
  assert.deepEqual(sortDocuments(["10 B.pdf", "a.pdf", "2 A.pdf"]), ["2 A.pdf", "10 B.pdf", "a.pdf"]);
});

test("cards encode file names and escape titles", () => {
  const html = documentCards(["03 R&D <draft>.pdf"]);
  assert.match(html, /href="03%20R%26D%20%3Cdraft%3E\.pdf"/);
  assert.match(html, />R&amp;D &lt;draft&gt;</);
  assert.equal((html.match(/class="doc"/g) || []).length, 1);
});

test("an empty folder shows the empty state", () => {
  assert.match(documentCards([]), /No documents yet\./);
});
