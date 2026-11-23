# Hackathon Teammate Agent — Plan (deepened to SaaS level)

## 1. One sentence

Paste a messy repo URL and, in under a minute, get a clean README, a 90-second demo
script, and an 8-slide pitch deck — every line traced to a file in the repo.

## 2. Who it is for

Hackathon teams in the last hours before judging. They have working code and no docs.
The person using it is usually the teammate who drew the short straw on the pitch.
They need a first draft they can trust enough to edit, not a polished lie.

## 3. The problem, stated plainly

- Judges read the README before they watch the demo. A repo with a two-line README
  looks unfinished even when the code works.
- Writing docs at 3 a.m. means guessing: teams describe features they meant to build
  instead of the ones they shipped.
- A deck built from memory invents a database, an auth flow, or a traction number
  that is not in the code. Judges ask one question and the story falls apart.

## 4. Product promise

A strong first draft of all three judging artefacts, grounded in the repo, in under a
minute — with the source of every claim visible, so the team can check it and fix it
before they present.

## 5. Feature set

### 5.1 Repo intake
- Paste a public GitHub repo URL (`owner/repo`, with or without `.git`, with or
  without a `/tree/...` tail). Parsed and validated before anything runs.
- One-click "Use the sample repo" — a bundled, real, working repo
  (`sample-repo/campus-queue`, a small Express queue board) so the app works with
  no network and no key.
- Online mode: fetch the repo tree through the GitHub REST API
  (`GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1`, unauthenticated,
  60 requests/hour) and fetch the key files raw. Private repos are out of scope
  for v1 and the UI says so.
- File cap: at most 200 files listed, at most 12 key files read in full
  (manifests, entry points, route files, tests). Anything past the cap is listed
  by name only and the UI says the analysis stopped there.

### 5.2 Repo analysis (Repo Summariser stage)
- File tree viewer with counts by language and a filter box.
- Facts extracted, never guessed: project name, description, version, entry point,
  scripts, dependencies, HTTP routes (method + path, with the file they came from),
  top-level function names, test files, existing README length.
- A "Facts" panel: name, file count, languages, routes, tests, and whether the old
  README was nearly empty. Each fact names its source file.
- Grounding rule, enforced in code and in tests: a generated claim may only mention
  a feature found in the files. The test suite asserts the generated README never
  claims a database, auth, or payments for the sample repo, and that every cited
  source file exists.

### 5.3 README (README Writer stage)
- Generated Markdown with sections: What it does, Install, Run, API table (only if
  routes were found), Project layout (full file list), Tests (only if tests exist),
  Notes (including the honest line that this is a draft to check).
- Live rendered preview (marked 18.2.1) side by side with an editable Markdown box.
  Edits re-render immediately.
- Per-section source chips: each section shows the files it was built from.
- Copy button and Download `.md`.

### 5.4 Demo script (Demo Script Writer stage)
- 90-second script, five timed cues (0:00 hook, 0:20 repo, 0:45 README, 1:05 deck,
  1:20 close), totalling exactly 90 seconds. A progress bar shows the running total
  and the script fails its own test if the cues do not add to 90.
- Each cue is editable; editing a cue's seconds updates the total live and warns
  if the total leaves the 75–105 second band.
- Copy and Download `.md`.

### 5.5 Pitch deck (Deck Writer stage)
- Exactly 8 slides, fixed order: Problem, Solution, Live demo, How it works,
  Tech stack, What is next, Team, Ask.
- Slide viewer with prev/next, keyboard arrows, and a slide list. Each slide is
  editable (title + bullet lines) and shows its source files.
- "Team" and "Ask" are honest placeholders: the app cannot know your team or your
  ask, and it says so on the slide instead of inventing names.
- Export a real `.pptx` (PptxGenJS 4.0.1, vendored, works offline) in the app's
  colour system — cobalt title slide, white content slides, one accent only.
  The exported file is generated from the edited slides, not from a template copy.

### 5.6 Live AI (optional, key required)
- No API key exists in this build and none is needed. Without a key the app runs
  fully on its local, deterministic generator plus the pre-made cached outputs for
  the sample repo, labelled "Pre-made sample".
- Settings panel: paste a free Gemini API key (Google AI Studio), stored in
  `localStorage` only, never sent anywhere except Google's API. "Forget key"
  clears it. A model picker defaults to `gemini-2.5-flash` (free tier,
  `generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`).
- With a key: "Polish with Gemini" buttons on each artefact, plus "Generate all
  with Gemini". The prompt includes only the extracted facts JSON — never the
  whole repo — and instructs the model to use only the listed files. AI-polished
  text is labelled "Polished with Gemini" with the time; the local draft stays
  one click away ("Restore local draft").
- If the Gemini call fails (bad key, quota, no network), the app says so in plain
  words and keeps the local draft. It never shows a fake "AI generated" state.

### 5.7 History (local only)
- Every run is saved in `localStorage` (repo label, facts, and the three artefacts
  as edited). A run list lets you reopen a past run or delete it. Nothing leaves
  the browser. No account, no server, no database in v1.

## 6. Data model

No server database. Two stores, both local:

**Run (localStorage `htm-runs`, array, newest first, max 20):**
```json
{
  "id": "run-20261123-1030",
  "createdAt": "2026-11-23T10:30:00Z",
  "repo": "sivasai/campus-queue",
  "source": "sample | github | cached",
  "facts": { "name": "...", "files": ["..."], "routes": [{"method": "GET", "path": "/api/counters"}], "languages": {"JavaScript": 4}, "hasTests": true, "testFiles": ["test/queue.test.js"], "features": [{"text": "...", "sources": ["server.js"]}] },
  "readme": "# ...",
  "script": {"cues": [{"at": 0, "seconds": 20, "cue": "Hook", "line": "..."}]},
  "deck": {"slides": [{"title": "Problem", "points": ["..."], "sources": []}]},
  "polished": {"readme": false, "script": false, "deck": false}
}
```

**Settings (localStorage `htm-settings`):** `{ "geminiKey": "…", "model": "gemini-2.5-flash" }`
— the key is stored only here and is never written to a run.

**Cached pre-made outputs (`outputs/`):** `cached-facts.json`, `cached-readme.md`,
`cached-script.md`, `cached-deck.json` — generated from the sample repo by the same
`core.js` the app runs, so the cached version and a fresh local run agree.

## 7. User flow, end to end

1. Land on the app. The header says what it does in one sentence. The sample repo
   is already loaded: its file tree, facts, and the pre-made README, script, and
   deck are visible, each labelled "Pre-made sample".
2. Paste a GitHub URL (or keep the sample) and press **Analyse repo**.
   - Sample: instant, local, no network.
   - GitHub URL: the app fetches the tree, reads the key files, and runs the same
     analyser. A progress line names each stage (Fetch tree → Read files →
     Summarise → Write README → Write script → Write deck). If the repo is
     missing, private, or the rate limit is hit, the error names the cause and
     offers the sample repo.
3. Read the facts panel. If a fact looks wrong, it names the file it came from,
   so you can check it in the tree.
4. Open the **README** tab. Read the rendered preview, fix a line in the editor,
   see the sources for each section. Copy or download the `.md`.
5. Open the **Demo script** tab. Read the five cues with their timings. Adjust a
   line or a timing; the total updates. Download the `.md`.
6. Open the **Deck** tab. Step through the 8 slides. Edit the Team slide with
   real names. Download the `.pptx` and open it in PowerPoint, Keynote, or Slides
   to check it.
7. Optional: open Settings, paste a Gemini key, press "Polish with Gemini" on any
   artefact. The polished text is labelled; the local draft can be restored.
8. The run is saved automatically. Reopen it later from the run list.

Demo path (the 2-minute version) is in §9.

## 8. Architecture

A static single-page app — no build step, no server — because the brief requires
the demo to work with no key and no network, and a server would add a failure
mode the demo cannot afford. The plan's Next.js + FastAPI + LangGraph shape is
kept as a pipeline, not as processes:

```
index.html + styles.css + app.js        (UI, tabs, editing, export)
  └─ core.js                            (pure pipeline: analyse → README → script → deck)
        ├─ sample-repo/campus-queue/    (bundled demo repo, real files)
        ├─ outputs/cached-*             (pre-made artefacts for the sample repo)
        └─ vendor/ marked 18.2.1, PptxGenJS 4.0.1 (vendored, offline)
  └─ GitHub REST API (online only, public repos)
  └─ Gemini REST API (only with a user-pasted key)
```

- `core.js` is dependency-free and shared between the browser and the Node test
  suite, so the tested code is the shipped code.
- The pipeline stages run in the same order as the plan's LangGraph sequence
  (Summariser → README Writer → Demo Script + Deck Writer) and the summary is
  cached per run, so regenerating one artefact does not re-read the repo.
- Verified versions (23 Nov 2026, web search): Gemini `gemini-2.5-flash`
  (free tier, REST `v1beta …:generateContent`), PptxGenJS **4.0.1** (25 Jun 2025,
  latest stable), marked **18.2.1** (16 Nov 2026). GitHub REST API v3 tree
  endpoint, unauthenticated.

## 9. Two-minute demo script (for presenting this app)

- **0:00–0:20** — "Every hackathon team wastes the last two hours on docs."
  Show campus-queue's old README: three lines, says nothing.
- **0:20–0:50** — Paste the repo URL (or press "Use the sample repo"). Watch the
  file tree and the facts panel appear: 9 files, 6 endpoints, tests found.
- **0:50–1:20** — README renders live. Point at the API table and the source
  chips: every section names the files it came from.
- **1:20–1:45** — Switch to the deck. Flip through the 8 slides; stop on the
  Team slide and say out loud that it is a placeholder until the team fills it in.
- **1:45–2:00** — Edit one line live, download the `.pptx`, close:
  "Docs done — back to building."

## 10. Design

- Identity: cobalt `#1D4ED8` + Libre Franklin (self-hosted variable woff2).
  One accent, used for the active tab, the primary button, and the slide
  numbers — under 10% of any screen.
- References (from the playbook): **Linear** — dense left rail with pipeline
  stages and a facts panel, not a hero; **Raycast** — a single command-style
  input bar for the repo URL with one primary action; **Notion** — the doc
  surface: rendered preview beside a plain editor, source chips under each
  section like page properties.
- Signature idea: the **source rail** — every generated section carries its
  source files as chips. Grounding is the visual identity, not a footnote.
- No gradients, no glows, no emoji decoration, no cliché copy. Plain human
  words. Numbers are real numbers from the repo, or the UI says a value is a
  sample or a placeholder.

## 11. Honest limits

- The local generator writes from templates filled with extracted facts. It is a
  strong first draft, not a finished README. The app says this on the README tab.
- Without a Gemini key there is no free-form prose: descriptions come from the
  repo's own description or from the file evidence. If the repo has no description,
  the README says so instead of inventing one.
- GitHub fetching needs network and is limited to public repos, 60 unauthenticated
  requests/hour. Private repos, very large repos (over 200 files listed), and
  non-code repos (docs-only) get a thinner analysis and the UI says so.
- The `.pptx` export is a clean, simple deck — title, bullets, slide numbers —
  not a designed template with images. The Team and Ask slides are placeholders
  by design.
- Gemini output, when used, is only as grounded as its prompt. The app keeps the
  local draft one click away and labels polished text.
- There is no server, no account, and no sharing: runs live in one browser's
  `localStorage`.

## 12. Quality bar

- Tests: Node `node --test` over `core.js` (grounding, routes, README contents,
  script totalling exactly 90 seconds, deck exactly 8 slides in order, URL
  parsing, empty-repo behaviour) plus the sample repo's own 4 tests. 0 failures.
- Screenshots: headless Chrome at 1280px and 390px, zero horizontal overflow,
  read and fixed by hand.
- Every button does something; no dead controls; no fake data presented as real.

## 13. Launch checklist

- [ ] Sample repo loads with no network and no key; cached artefacts labelled.
- [ ] GitHub URL flow works online for a public repo; errors name the cause.
- [ ] README/script/deck edit, copy, and download all work; `.pptx` opens.
- [ ] Gemini polish works with a pasted key; fails honestly without one.
- [ ] 1280px + 390px screenshots read clean, zero overflow.
- [ ] Tests green, 0 failures.

## 14. V2 ideas

1. Private repos via a pasted GitHub token (stored like the Gemini key, local only).
2. `git clone` support in an optional tiny server, for repos the API truncates.
3. Repo diff mode: re-analyse after a push and show what changed in the docs.
4. Judge questions: generate three likely questions from the deck, with file-backed answers.
5. Deck themes (two more colour systems) and speaker notes export.
6. Share a run as a single link (facts + artefacts encoded, no server).
7. Multi-language repo support: Python `pyproject.toml` parsing is in the analyser; add Go, Rust, and Java manifests.
8. A "present" mode: full-screen deck with a timer that follows the script cues.
