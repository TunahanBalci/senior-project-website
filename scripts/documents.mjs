// Document cards for documents/index.html. A file's name is its title; a leading number sets the order,
// and unnumbered files follow the creation date stored in the PDF.
import { readFile } from "node:fs/promises";

const escape = text => text.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function documentTitle(file) {
  const name = file.replace(/\.pdf$/i, ""), stripped = name.replace(/^\d+[\s._-]*/, "") || name;
  // Names without spaces are split at "-", "_" and case changes: "DBU_HighLevelDesign" → "DBU High Level Design".
  const words = stripped.includes(" ") ? stripped
    : stripped.replace(/[-_]+/g, " ").replace(/(\p{Ll}|\d)(\p{Lu})/gu, "$1 $2").replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, "$1 $2");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function sortDocuments(files, dates = {}) {
  const key = file => {
    const number = file.match(/^\d+/);
    return number ? [0, Number(number[0])] : [1, dates[file]?.getTime() ?? Infinity];
  };
  return [...files].sort((a, b) => {
    const [groupA, valueA] = key(a), [groupB, valueB] = key(b);
    return groupA - groupB || valueA - valueB || a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
  });
}

export async function readCreationDate(path) {
  const { getDocument, PDFDateString, VerbosityLevel } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(await readFile(path)), verbosity: VerbosityLevel.ERRORS });
  try {
    const { info } = await (await task.promise).getMetadata();
    return (info?.CreationDate && PDFDateString.toDateObject(info.CreationDate)) || null;
  } catch {
    return null;
  } finally {
    await task.destroy();
  }
}

export function documentCards(files, dates = {}) {
  if (!files.length) return '<p class="docs-empty">No documents yet.</p>';
  const cards = sortDocuments(files, dates).map(file => `<li><a class="doc" href="${encodeURIComponent(file)}"><span class="doc-face" aria-hidden="true"></span>`
    + `<span class="doc-title">${escape(documentTitle(file))}</span><span class="doc-meta">PDF</span></a></li>`);
  return `<ul class="docs">\n${cards.join("\n")}\n</ul>`;
}
