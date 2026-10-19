import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, relative, sep } from "node:path";
import { documentCards, readCreationDate } from "./documents.mjs";
import { safeOutput } from "./output.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = resolve(root, "site");
const output = safeOutput(resolve(root, process.env.OUT_DIR || "dist"), root);
const documents = resolve(root, process.env.DOCS_DIR || "site/documents");
const modules = resolve(root, "node_modules");

await rm(output, { recursive: true, force: true });
// Only site/ is published; .local and credentials stay out. PDFs come from the documents folder below.
await cp(source, output, { recursive: true, filter: path => !/\.pdf$/i.test(path) || !relative(source, path).startsWith(`documents${sep}`) });
const pdfs = (await readdir(documents).catch(() => [])).filter(file => /\.pdf$/i.test(file));
for (const file of pdfs) await cp(resolve(documents, file), resolve(output, "documents", file));
const page = resolve(output, "documents/index.html");
const dates = Object.fromEntries(await Promise.all(pdfs.map(async file => [file, await readCreationDate(resolve(documents, file))])));
await writeFile(page, (await readFile(page, "utf8")).replace("<!-- documents -->", () => documentCards(pdfs, dates)));

const vendor = resolve(output, "vendor");
await mkdir(resolve(vendor, "pdfjs"), { recursive: true });
for (const file of ["three.module.js", "three.core.js"]) await cp(resolve(modules, "three/build", file), resolve(vendor, file));
const roundedBox = await readFile(resolve(modules, "three/examples/jsm/geometries/RoundedBoxGeometry.js"), "utf8");
await writeFile(resolve(vendor, "RoundedBoxGeometry.js"), roundedBox.replace("from 'three'", "from './three.module.js'"));
await cp(resolve(modules, "three/LICENSE"), resolve(vendor, "three-LICENSE.txt"));
// The legacy build polyfills the newest JavaScript APIs that the modern build assumes, for older phone browsers.
for (const file of ["legacy/build/pdf.min.mjs", "legacy/build/pdf.worker.min.mjs", "standard_fonts", "wasm", "LICENSE"]) {
  await cp(resolve(modules, "pdfjs-dist", file), resolve(vendor, "pdfjs", file.replace("legacy/build/", "")), { recursive: true });
}
console.log(`Built ${relative(root, output) || "."}: ${pdfs.length} document${pdfs.length === 1 ? "" : "s"}; Three.js and pdf.js hosted locally.`);
