// Tests for core.js — the grounded pipeline (analyse -> README -> script -> deck).
// Run: node --test tests/core.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../core");

function readSampleRepo() {
  const root = path.join(__dirname, "..", "sample-repo", "campus-queue");
  const files = [];
  (function walk(dir, rel) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const p = path.join(dir, entry.name);
      const r = rel ? rel + "/" + entry.name : entry.name;
      if (entry.isDirectory()) walk(p, r);
      else files.push({ path: r, content: fs.readFileSync(p, "utf8") });
    }
  })(root, "");
  return files;
}

const sampleFiles = readSampleRepo();

test("sample repo fixture has the files the analysis depends on", () => {
  const paths = sampleFiles.map((f) => f.path);
  for (const want of ["package.json", "server.js", "src/queue.js", "public/index.html", "public/app.js", "public/style.css", "test/queue.test.js", "README.md"]) {
    assert.ok(paths.includes(want), "missing fixture file " + want);
  }
});

test("analyseRepo reads name, description, deps and entry point from package.json", () => {
  const facts = core.analyseRepo(sampleFiles, "sivasai/campus-queue");
  assert.equal(facts.name, "campus-queue");
  assert.match(facts.description, /queue board/);
  assert.equal(facts.entryPoint, "server.js");
  assert.ok(facts.dependencies.includes("express"));
  assert.equal(facts.version, "1.0.0");
});

test("analyseRepo extracts every HTTP route from server.js and only real ones", () => {
  const facts = core.analyseRepo(sampleFiles, "sivasai/campus-queue");
  const found = facts.routes.map((r) => r.method + " " + r.path).sort();
  const expected = [
    "GET /api/counters",
    "GET /api/counters/:id",
    "POST /api/counters/:id/join",
    "POST /api/counters/:id/next",
    "POST /api/counters/:id/done/:tokenId",
    "POST /api/counters/:id/leave/:tokenId",
  ].sort();
  assert.deepEqual(found, expected);
  assert.deepEqual(facts.routeSources, ["server.js"]);
});

test("analyseRepo counts languages and finds tests", () => {
  const facts = core.analyseRepo(sampleFiles, "sivasai/campus-queue");
  assert.equal(facts.languages.JavaScript, 4); // server.js, src/queue.js, public/app.js, test/queue.test.js
  assert.equal(facts.languages.HTML, 1);
  assert.equal(facts.languages.CSS, 1);
  assert.equal(facts.hasTests, true);
  assert.deepEqual(facts.testFiles, ["test/queue.test.js"]);
  assert.equal(facts.hasReadme, true);
  assert.equal(facts.readmeLength, 3); // the messy original README
});

test("analyseRepo reports the old README as nearly empty", () => {
  const facts = core.analyseRepo(sampleFiles, "sivasai/campus-queue");
  assert.ok(facts.readmeLength <= 3);
});

test("buildReadme includes install, run, the real API table and the full file list", () => {
  const facts = core.analyseRepo(sampleFiles, "sivasai/campus-queue");
  const { markdown } = core.buildReadme(facts);
  assert.match(markdown, /^# campus-queue/m);
  assert.match(markdown, /npm install/);
  assert.match(markdown, /npm start/);
  for (const route of facts.routes) {
    assert.ok(markdown.includes("`" + route.path + "`"), "README missing route " + route.path);
  }
  for (const p of facts.files) {
    assert.ok(markdown.includes(p), "README file list missing " + p);
  }
  // No invented features: the README must not claim a database, auth, or payments.
  assert.doesNotMatch(markdown, /database|Postgres|MongoDB|login|auth|payment|Stripe/i);
});

test("buildReadme sections each name source files that exist in the repo", () => {
  const facts = core.analyseRepo(sampleFiles, "sivasai/campus-queue");
  const { sections } = core.buildReadme(facts);
  assert.ok(sections.length >= 4);
  for (const s of sections) {
    for (const src of s.sources) assert.ok(facts.files.includes(src), `section ${s.name} cites missing ${src}`);
  }
});

test("buildScript is a 90-second script with timed cues in order", () => {
  const facts = core.analyseRepo(sampleFiles, "sivasai/campus-queue");
  const script = core.buildScript(facts);
  assert.equal(script.totalSeconds, 90);
  assert.equal(script.expectedSeconds, 90);
  assert.equal(script.cues.length, 5);
  let at = 0;
  for (const cue of script.cues) {
    assert.equal(cue.at, at);
    assert.ok(cue.seconds > 0);
    assert.ok(cue.line.length > 10);
    at += cue.seconds;
  }
  assert.equal(at, 90);
});

test("buildDeck returns exactly the 8 fixed slides in order", () => {
  const facts = core.analyseRepo(sampleFiles, "sivasai/campus-queue");
  const deck = core.buildDeck(facts);
  assert.deepEqual(deck.slides.map((s) => s.title), core.DECK_SLIDES);
  assert.equal(deck.slides.length, 8);
  for (const slide of deck.slides) {
    assert.ok(slide.points.length >= 2, "slide " + slide.title + " needs at least 2 points");
    for (const p of slide.points) assert.ok(p.length > 5);
  }
});

test("buildDeck tech slide names the real languages and dependencies", () => {
  const facts = core.analyseRepo(sampleFiles, "sivasai/campus-queue");
  const deck = core.buildDeck(facts);
  const tech = deck.slides.find((s) => s.title === "Tech stack");
  assert.match(tech.points.join(" "), /JavaScript/);
  assert.match(tech.points.join(" "), /express/);
  assert.match(tech.points.join(" "), /test\/queue\.test\.js/);
});

test("checkGrounding finds no invented sources in the generated deck", () => {
  const facts = core.analyseRepo(sampleFiles, "sivasai/campus-queue");
  const deck = core.buildDeck(facts);
  assert.deepEqual(core.checkGrounding(facts, deck), []);
});

test("checkGrounding catches a slide citing a file that is not in the repo", () => {
  const facts = core.analyseRepo(sampleFiles, "sivasai/campus-queue");
  const deck = core.buildDeck(facts);
  deck.slides[0].sources = ["src/does-not-exist.js"];
  const problems = core.checkGrounding(facts, deck);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /does-not-exist/);
});

test("parseGitHubUrl accepts normal and .git URLs and rejects the rest", () => {
  assert.deepEqual(core.parseGitHubUrl("https://github.com/sivasaiboggu/ai-sdr-agent"), { owner: "sivasaiboggu", repo: "ai-sdr-agent" });
  assert.deepEqual(core.parseGitHubUrl("https://github.com/sivasaiboggu/ai-sdr-agent.git"), { owner: "sivasaiboggu", repo: "ai-sdr-agent" });
  assert.deepEqual(core.parseGitHubUrl("https://github.com/sivasaiboggu/ai-sdr-agent/tree/main"), { owner: "sivasaiboggu", repo: "ai-sdr-agent" });
  assert.equal(core.parseGitHubUrl("https://gitlab.com/foo/bar"), null);
  assert.equal(core.parseGitHubUrl("not a url"), null);
  assert.equal(core.parseGitHubUrl(""), null);
});

test("extractRoutes finds routes and extractFunctions finds function names", () => {
  const src = 'app.get("/a", h); router.post("/b", h); app.delete("/c", h);';
  assert.deepEqual(core.extractRoutes(src), [
    { method: "GET", path: "/a" },
    { method: "POST", path: "/b" },
    { method: "DELETE", path: "/c" },
  ]);
  assert.deepEqual(core.extractFunctions("function join(q, n) {} function callNext(q) {}"), ["join", "callNext"]);
});

test("analyseRepo on an empty repo does not crash and says so in the README", () => {
  const facts = core.analyseRepo([], "someone/empty");
  assert.equal(facts.fileCount, 0);
  assert.equal(facts.routes.length, 0);
  const { markdown } = core.buildReadme(facts);
  assert.match(markdown, /no feature claims could be verified/i);
  const deck = core.buildDeck(facts);
  assert.equal(deck.slides.length, 8);
  assert.deepEqual(core.checkGrounding(facts, deck), []);
});

test("parsePackageJson tolerates broken JSON", () => {
  const parsed = core.parsePackageJson("{not json");
  assert.equal(parsed.name, null);
  assert.equal(parsed.parseError, true);
});
