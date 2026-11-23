// PPTX export smoke test: builds the real deck with the vendored PptxGenJS
// 4.0.1 bundle and checks the output is a valid .pptx with 8 slides.
// Run: node --test tests/pptx.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const core = require("../core");

// Load the vendored browser bundle the same way a <script> tag does: in a
// sandbox with `window` as the global, no CommonJS `module`/`exports`, so
// the bundled JSZip UMD lands on window.JSZip and PptxGenJS on window.
const bundleSrc = fs.readFileSync(path.join(__dirname, "..", "vendor", "pptxgen.bundle.js"), "utf8");
const sandbox = { console, setTimeout, clearTimeout, setImmediate, clearImmediate, Promise, Date, JSON, Math };
sandbox.window = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(bundleSrc, sandbox);
const PptxGenJS = sandbox.PptxGenJS;
assert.equal(typeof PptxGenJS, "function", "PptxGenJS global missing after loading the bundle");
assert.equal(typeof sandbox.JSZip, "function", "JSZip global missing after loading the bundle");

const deck = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "outputs", "cached-deck.json"), "utf8"));

test("pptx export produces a valid zip with 8 slides", async () => {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
  pptx.layout = "WIDE";
  pptx.author = "Hackathon Teammate";
  pptx.title = deck.project + " — pitch deck";
  deck.slides.forEach((slide, i) => {
    const s = pptx.addSlide();
    if (i === 0) {
      s.background = { color: "1D4ED8" };
      s.addText(deck.project, { x: 0.7, y: 2.4, w: 11.9, h: 1.0, fontSize: 44, bold: true, color: "FFFFFF", fontFace: "Arial" });
      s.addText(slide.title, { x: 0.7, y: 3.5, w: 11.9, h: 0.6, fontSize: 24, color: "BFDBFE", fontFace: "Arial" });
    } else {
      s.background = { color: "FFFFFF" };
      s.addText(slide.title, { x: 0.7, y: 0.85, w: 11.9, h: 0.8, fontSize: 32, bold: true, color: "111827", fontFace: "Arial" });
      s.addText(slide.points.map((p) => "•  " + p).join("\n"), { x: 0.7, y: 1.9, w: 11.9, h: 4.6, fontSize: 18, color: "374151", fontFace: "Arial", valign: "top" });
    }
  });
  // write() with an explicit output type: the vm sandbox has no `process`,
  // so writeFile() would take the browser path. The slide building and zip
  // generation under test are identical either way.
  const b64 = await pptx.write({ outputType: "base64" });
  const buf = Buffer.from(b64, "base64");
  assert.equal(buf.subarray(0, 2).toString("ascii"), "PK", "pptx is not a zip");
  assert.ok(buf.length > 10000, "pptx suspiciously small: " + buf.length);
  const text = buf.toString("latin1");
  assert.ok(text.includes("Problem"), "title slide text missing from pptx");
  assert.ok(text.includes("campus-queue"), "project name missing from pptx");
  assert.ok(text.includes("Tech stack"), "slide 5 missing from pptx");
  assert.ok(text.includes("Ask"), "slide 8 missing from pptx");
  const slideCount = (text.match(/ppt\/slides\/slide\d+\.xml/g) || []).length;
  assert.ok(slideCount >= 8, "expected 8 slide parts, found " + slideCount);
});

test("deck used for export has exactly the 8 fixed slides", () => {
  assert.deepEqual(deck.slides.map((s) => s.title), core.DECK_SLIDES);
});
