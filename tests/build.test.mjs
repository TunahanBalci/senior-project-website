import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { safeOutput } from "../scripts/output.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixtures = join(root, "tests/fixtures/documents");
function build(docs, run) {
  const out = mkdtempSync(join(tmpdir(), "dizoda-build-"));
  try {
    execFileSync("node", ["scripts/build.mjs"], { cwd: root, env: { ...process.env, OUT_DIR: out, DOCS_DIR: docs }, stdio: "pipe" });
    run(out);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

test("pdf.js comes from the legacy build, which supports older phone browsers", () => {
  build(fixtures, out => {
    for (const file of ["pdf.min.mjs", "pdf.worker.min.mjs"]) {
      assert.ok(readFileSync(join(out, "vendor/pdfjs", file)).equals(readFileSync(join(root, "node_modules/pdfjs-dist/legacy/build", file))), file);
    }
  });
});

test("dollar signs in file names stay literal on the documents page", () => {
  const docs = mkdtempSync(join(tmpdir(), "dizoda-docs-"));
  for (const name of ["05 Budget $$ plan.pdf", "06 Costs $' notes.pdf", "07 A $` B.pdf"]) copyFileSync(join(fixtures, "01 Sample Report.pdf"), join(docs, name));
  build(docs, out => {
    const html = readFileSync(join(out, "documents/index.html"), "utf8");
    assert.equal(html.match(/<\/main>/g).length, 1);
    assert.equal(html.match(/<html/g).length, 1);
    assert.match(html, />Budget \$\$ plan</);
  });
  rmSync(docs, { recursive: true, force: true });
});

test("the build refuses to clear the project or its sources", () => {
  for (const path of [root, dirname(root), join(root, "site"), join(root, "site/documents"), join(root, "tests")]) {
    assert.throws(() => safeOutput(path, root), /Refusing/, path);
  }
  assert.equal(safeOutput(join(root, "dist"), root), join(root, "dist"));
  assert.equal(safeOutput(join(tmpdir(), "dizoda-out"), root), join(tmpdir(), "dizoda-out"));
});

test("every image the pages reference is in the build", () => {
  build(fixtures, out => {
    for (const page of ["index.html", "documents/index.html", "404.html"]) {
      const html = readFileSync(join(out, page), "utf8");
      for (const [, src] of html.matchAll(/<img[^>]+src="\/([^"]+)"/g)) assert.ok(existsSync(join(out, src)), `${page} → /${src}`);
    }
  });
});
