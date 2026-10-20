import { h, captureStore, designStore, capturePhoto, capturePlan, captureChips, photoView, designPlan, segmented, unplaced, selectedInfo, updateButton, resetButton, rulesList } from "./figures.js";

// Each figure replaces its fallback photo; without JavaScript the photos stay.
const mount = (id, ...nodes) => document.getElementById(id).replaceChildren(...nodes);
const capture = captureStore(), arrangement = designStore(0), checks = designStore(2);

mount("capture-figure",
  h("div", { class: "pair" }, capturePhoto(capture, { scale: 1.2 }), capturePlan(capture, { scale: 1.3 })),
  captureChips(capture));
mount("arrangement-figure",
  h("div", { class: "bar" }, segmented(arrangement), unplaced(), h("span", { class: "grow" }), selectedInfo(arrangement)),
  h("div", { class: "pair" }, photoView(arrangement, { scale: 1.2, update: false }), designPlan(arrangement, { scale: 1.3 })));
mount("checks-figure",
  h("div", { class: "checks" }, designPlan(checks, { scale: 1.3, editable: true, tags: false }),
    h("div", { class: "side" }, rulesList(checks), photoView(checks, { scale: 1.6, update: false }),
      h("div", { class: "actions" }, updateButton(checks, "button primary"), resetButton(checks, "text-button")))));

// A team photo that is not in place yet shows the person's initials instead of a broken image.
for (const img of document.querySelectorAll(".person img")) {
  const missing = () => img.closest(".person").classList.add("no-photo");
  if (img.complete && !img.naturalWidth) missing();
  else img.addEventListener("error", missing);
}
