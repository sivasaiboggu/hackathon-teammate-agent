# Hackathon Teammate

Paste a repo URL and, in under a minute, get a clean README, a 90-second demo
script, and an 8-slide pitch deck — every line traced to a file in the repo.

Open `index.html` in a browser. No build step, no server, no sign-in, no key
needed. The bundled sample repo works with no network at all.

## What it does

1. **Analyse repo** — paste a public GitHub URL, or press **Use the sample repo**.
   The analyser reads the manifests, entry points, routes, and tests, and shows
   a file tree plus a facts panel (project name, file count, languages,
   endpoints, tests, how long the old README was).
2. **README** — generated Markdown with a live rendered preview beside an
   editor. Each section shows the files it was built from. Copy or download
   the `.md`.
3. **Demo script** — five timed cues totalling exactly 90 seconds. Edit the
   words or the timings; the total updates live and warns outside the
   75–105 second band. Copy or download the `.md`.
4. **Deck** — exactly 8 slides (Problem, Solution, Live demo, How it works,
   Tech stack, What is next, Team, Ask). Step through them, edit any slide,
   download a real `.pptx`.

## Grounding: nothing invented

Every generated claim comes from a file the analyser actually read. The test
suite asserts the sample repo's README never claims a database, auth, or
payments (the repo has none), and that every cited source file exists.
Sections that have no file behind them — the Team and Ask slides — say so on
the slide instead of inventing names.

## Without a key vs with a key

- **No key:** everything works. Drafts are written by the local generator in
  `core.js` from the extracted facts, and the sample repo's outputs are shown
  as pre-made samples, labelled as such.
- **With a free Gemini key:** open Settings, paste a key from Google AI Studio
  (stored in `localStorage` on your device only, never sent anywhere except
  Google's API). The **Polish with Gemini** buttons rewrite each artefact
  using only the extracted facts; polished text is labelled, and the local
  draft is one click away (**Restore local draft**). If the call fails, the
  app says so and keeps the local draft.

Default model: `gemini-2.5-flash` (free tier,
`generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`).

## The sample repo

`sample-repo/campus-queue/` is a real, small, working app: an Express queue
board for campus food counters (join a counter's queue, watch your position,
staff call the next token). It has 9 files, 6 HTTP endpoints, and 4 passing
tests — and a 3-line README that says almost nothing, which is the point.

## Online repos

Pasting a GitHub URL fetches the repo tree through the GitHub REST API
(unauthenticated, 60 requests/hour) and reads up to 12 key files. Public
repos only — private repos are not supported in this version, and the app
says so instead of failing quietly. Repos over 200 files are listed in full
but only the key files are read.

## Run the tests

```bash
node --test tests/core.test.js tests/pptx.test.js
node --test sample-repo/campus-queue/test/queue.test.js
```

22 tests, 0 failures. The suite covers: route extraction, README contents and
grounding, the script totalling exactly 90 seconds, the deck being exactly
the 8 fixed slides in order, URL parsing, empty-repo behaviour, and a real
`.pptx` build with the vendored PptxGenJS bundle.

## Screenshots

```bash
node scripts/shots.mjs
```

Writes desktop (1280px) and mobile (390px) renders to `screenshots/`, and
reports horizontal overflow and console errors. Headless Chrome on this VM
needs the Hatch WebGL policy flags the script already passes, and cannot
reach external HTTPS — everything the page needs is vendored locally.

## Stack

- Plain HTML/CSS/JS, no build step — the demo has to work with no key and no
  network, so there is no server. The pipeline stages from the plan
  (Summariser → README Writer → Demo Script + Deck Writer) run in `core.js`,
  shared between the browser and the Node tests.
- Markdown rendering: [marked](https://github.com/markedjs/marked) **18.2.1**
  (vendored).
- `.pptx` export: [PptxGenJS](https://github.com/gitbrent/pptxgenjs) **4.0.1**
  (vendored).
- Type: Libre Franklin (self-hosted variable woff2). Colour: cobalt `#1D4ED8`.
- Design references: Linear (dense left rail), Raycast (command bar), Notion
  (doc surface with source chips). See `PLAN.md` for the full deepened plan.

## Honest limits

- The local generator writes from templates filled with extracted facts. It is
  a strong first draft, not a finished README — the app says this on the
  README tab.
- Without a key there is no free-form prose: descriptions come from the repo's
  own description or from file evidence. If the repo has no description, the
  README says so.
- The `.pptx` is a clean, simple deck — title, bullets, slide numbers — not a
  designed template with images.
- Runs are saved in `localStorage` in one browser only. There is no account,
  no sharing, and no server.
- The Gemini polish prompt includes only the extracted facts JSON, never the
  whole repo, and instructs the model to use only the listed files. Keep the
  local draft one click away and check polished text before presenting it.

## Files

```
index.html            app shell
styles.css            cobalt + Libre Franklin design system
app.js                UI: tabs, editing, export, Gemini polish, history
core.js               pure pipeline (analyse -> README -> script -> deck)
sample-data.js        generated from the real sample repo (scripts/build-sample-data.js)
sample-repo/          bundled demo repo (campus-queue, a real Express app)
outputs/              pre-made cached artefacts for the sample repo
vendor/               marked 18.2.1 + PptxGenJS 4.0.1 (offline)
tests/                core + pptx tests (node --test)
scripts/              shots.mjs (screenshots), build-sample-data.js
PLAN.md               deepened SaaS-level plan
```

## License

MIT — see `LICENSE`.
