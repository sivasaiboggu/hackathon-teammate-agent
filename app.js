// Hackathon Teammate — app logic.
// Pipeline: analyse (core.analyseRepo) -> README -> script -> deck.
// Local drafts are deterministic and grounded; Gemini is optional polish only.
(function () {
  "use strict";

  var core = window.TeammateCore;
  var $ = function (id) { return document.getElementById(id); };

  var SETTINGS_KEY = "htm-settings";
  var RUNS_KEY = "htm-runs";
  var MAX_RUNS = 20;
  var MAX_TREE_FILES = 200;
  var MAX_READ_FILES = 12;

  var state = {
    run: null,          // {id, createdAt, repo, source, facts, readme, script, deck, polished:{}}
    slideIndex: 0,
    tab: "readme",
  };

  // ---------- settings ----------
  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); }
    catch (e) { return {}; }
  }
  function saveSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    renderKeyStatus();
  }
  function renderKeyStatus() {
    var s = loadSettings();
    var el = $("keyStatus");
    if (s.geminiKey) {
      el.textContent = "Gemini key saved — polish available";
      el.classList.add("has-key");
    } else {
      el.textContent = "No Gemini key — local drafts";
      el.classList.remove("has-key");
    }
    $("geminiKey").value = s.geminiKey || "";
    $("geminiModel").value = s.model || "gemini-2.5-flash";
  }

  // ---------- runs (localStorage) ----------
  function loadRuns() {
    try { return JSON.parse(localStorage.getItem(RUNS_KEY) || "[]"); }
    catch (e) { return []; }
  }
  function persistRun(run) {
    var runs = loadRuns().filter(function (r) { return r.id !== run.id; });
    runs.unshift(run);
    localStorage.setItem(RUNS_KEY, JSON.stringify(runs.slice(0, MAX_RUNS)));
    renderRunList();
  }
  function renderRunList() {
    var runs = loadRuns();
    var list = $("runList");
    list.innerHTML = "";
    $("noRuns").style.display = runs.length ? "none" : "";
    runs.forEach(function (r) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      var title = document.createElement("span");
      title.textContent = r.repo;
      var meta = document.createElement("small");
      meta.textContent = new Date(r.createdAt).toLocaleString() + " · " + r.source;
      btn.appendChild(title);
      btn.appendChild(meta);
      btn.addEventListener("click", function () { setRun(r, "Saved run — " + r.repo); });
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  // ---------- run construction ----------
  function makeRun(repoLabel, source, files) {
    var facts = core.analyseRepo(files, repoLabel);
    var readme = core.buildReadme(facts);
    return {
      id: "run-" + Date.now(),
      createdAt: new Date().toISOString(),
      repo: repoLabel,
      source: source,
      facts: facts,
      readme: readme.markdown,
      readmeSections: readme.sections,
      script: core.buildScript(facts),
      deck: core.buildDeck(facts),
      polished: { readme: false, script: false, deck: false },
      local: { readme: readme.markdown, script: core.buildScript(facts), deck: core.buildDeck(facts) },
    };
  }

  function setRun(run, bannerText) {
    state.run = run;
    state.slideIndex = 0;
    renderAll();
    if (bannerText) {
      $("sourceLabel").textContent = run.source === "cached" ? "Pre-made sample" : (run.source === "github" ? "Live run — GitHub repo" : "Sample repo");
      $("sourceText").textContent = bannerText;
      $("sourceBanner").classList.toggle("live", run.source === "github");
    }
    setPipeline(["analyse", "readme", "script", "deck"], "done");
    $("pipelineNote").textContent = run.source === "cached"
      ? "Sample repo loaded. Nothing here was generated live — these are the pre-made outputs."
      : "Generated from the repo files just now. Check each artefact before presenting it.";
  }

  function loadSample(persist) {
    var d = window.SAMPLE_DATA;
    var run = makeRun(d.repo, "cached", d.files);
    // Use the pre-made cached artefacts (identical inputs, same core.js).
    run.readme = d.readme;
    run.readmeSections = d.readmeSections;
    run.script = d.script;
    run.deck = d.deck;
    run.local = { readme: d.readme, script: d.script, deck: d.deck };
    setRun(run, "Showing the pre-made README, script, and deck for the bundled sample repo, campus-queue. Press “Analyse repo” to run it live.");
    if (persist !== false) persistRun(run);
  }

  // ---------- rendering ----------
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }

  function renderAll() {
    var run = state.run;
    if (!run) return;
    renderFacts(run.facts);
    renderTree(run.facts.files);
    renderReadme();
    renderScript();
    renderDeck();
    renderScriptTotal();
    $("scriptTotal").textContent = scriptTotalSeconds() + "s";
  }

  function renderFacts(facts) {
    var langs = Object.keys(facts.languages).map(function (l) { return l + " ×" + facts.languages[l]; }).join(", ") || "None detected";
    var rows = [
      ["Project", facts.name || "—"],
      ["Files", String(facts.fileCount)],
      ["Languages", langs],
      ["Endpoints", facts.routes.length ? facts.routes.length + " found" : "None found"],
      ["Tests", facts.hasTests ? facts.testFiles.join(", ") : "None found"],
      ["Old README", facts.hasReadme ? facts.readmeLength + " lines" : "None"],
    ];
    var dl = $("facts");
    dl.innerHTML = "";
    rows.forEach(function (row) {
      var dt = document.createElement("dt"); dt.textContent = row[0];
      var dd = document.createElement("dd"); dd.textContent = row[1];
      dl.appendChild(dt); dl.appendChild(dd);
    });
    $("fileCount").textContent = "· " + facts.fileCount + " files";
  }

  function renderTree(files) {
    var filter = ($("treeFilter").value || "").toLowerCase();
    var ul = $("fileTree");
    ul.innerHTML = "";
    var shown = files.filter(function (f) { return !filter || f.toLowerCase().indexOf(filter) !== -1; });
    var dirs = {};
    shown.forEach(function (f) {
      var parts = f.split("/");
      if (parts.length > 1) dirs[parts[0]] = true;
    });
    shown.slice(0, MAX_TREE_FILES).forEach(function (f) {
      var li = document.createElement("li");
      li.textContent = f;
      ul.appendChild(li);
    });
    if (shown.length > MAX_TREE_FILES) {
      var li = document.createElement("li");
      li.textContent = "… and " + (shown.length - MAX_TREE_FILES) + " more files (analysis capped at " + MAX_TREE_FILES + ")";
      ul.appendChild(li);
    }
    if (!shown.length) {
      var li = document.createElement("li");
      li.textContent = "No files match that filter.";
      ul.appendChild(li);
    }
  }

  function renderReadme() {
    var run = state.run;
    $("readmeEditor").value = run.readme;
    $("readmePreview").innerHTML = window.marked ? window.marked.parse(run.readme) : "<pre>" + esc(run.readme) + "</pre>";
    var list = $("readmeSources");
    list.innerHTML = "";
    (run.readmeSections || []).forEach(function (sec) {
      var li = document.createElement("li");
      var name = document.createElement("span");
      name.className = "sec-name";
      name.textContent = sec.name;
      li.appendChild(name);
      (sec.sources || []).forEach(function (src) {
        var chip = document.createElement("span");
        chip.className = "source-chip";
        chip.textContent = src;
        li.appendChild(chip);
      });
      if (!(sec.sources || []).length) {
        var none = document.createElement("span");
        none.className = "muted small";
        none.textContent = "No file source — written from the repo summary.";
        li.appendChild(none);
      }
      list.appendChild(li);
    });
    setOrigin("readme", run.polished.readme);
  }

  function scriptTotalSeconds() {
    return state.run.script.cues.reduce(function (s, c) { return s + (Number(c.seconds) || 0); }, 0);
  }

  function autogrow(ta) {
    ta.style.height = "auto";
    // scrollHeight is 0 while the panel is hidden — never shrink below 2 lines.
    ta.style.height = Math.max(ta.scrollHeight, 56) + "px";
  }

  function renderScript() {
    var run = state.run;
    var ol = $("scriptCues");
    ol.innerHTML = "";
    run.script.cues.forEach(function (cue, i) {
      var li = document.createElement("li");
      var time = document.createElement("div");
      time.className = "cue-time";
      time.innerHTML = esc(String(cue.at)) + "s <small>" + esc(cue.cue) + "</small>";
      var body = document.createElement("div");
      body.className = "cue-body";
      var label = document.createElement("label");
      label.textContent = "What you say";
      var line = document.createElement("textarea");
      line.className = "cue-line";
      line.rows = 2;
      line.value = cue.line;
      line.setAttribute("aria-label", "Cue " + (i + 1) + " line");
      line.addEventListener("input", function () {
        run.script.cues[i].line = line.value;
        autogrow(line);
        scheduleSave();
      });
      var secs = document.createElement("div");
      secs.className = "cue-secs";
      var secsLabel = document.createElement("span");
      secsLabel.textContent = "Seconds:";
      var secsInput = document.createElement("input");
      secsInput.type = "number";
      secsInput.min = "5";
      secsInput.max = "60";
      secsInput.value = cue.seconds;
      secsInput.setAttribute("aria-label", "Cue " + (i + 1) + " seconds");
      secsInput.addEventListener("input", function () {
        run.script.cues[i].seconds = Math.max(1, Number(secsInput.value) || 0);
        retimeScript();
        scheduleSave();
      });
      secs.appendChild(secsLabel);
      secs.appendChild(secsInput);
      body.appendChild(label);
      body.appendChild(line);
      body.appendChild(secs);
      li.appendChild(time);
      li.appendChild(body);
      ol.appendChild(li);
    });
    // Grow textareas to fit their text — only works once they are in the DOM.
    ol.querySelectorAll(".cue-line").forEach(autogrow);
    setOrigin("script", run.polished.script);
  }

  function retimeScript() {
    var at = 0;
    state.run.script.cues.forEach(function (c) {
      c.at = at;
      at += Number(c.seconds) || 0;
    });
    renderScriptTotal();
    // Re-render the "at" labels without rebuilding editors (keeps focus).
    var times = document.querySelectorAll("#scriptCues .cue-time");
    state.run.script.cues.forEach(function (c, i) {
      if (times[i]) times[i].innerHTML = esc(String(c.at)) + "s <small>" + esc(c.cue) + "</small>";
    });
  }

  function renderScriptTotal() {
    var total = scriptTotalSeconds();
    $("scriptTotal").textContent = total + "s";
    $("scriptTotalText").textContent = "Total: " + total + " seconds";
    var fill = $("scriptTotalFill");
    fill.style.width = Math.min(100, (total / 90) * 100) + "%";
    fill.classList.toggle("over", total > 105 || total < 75);
    $("scriptTotalWarn").textContent = (total > 105 || total < 75)
      ? " — outside the 75–105 second band for a 90-second demo."
      : " — in the 75–105 second band.";
  }

  function renderDeck() {
    var run = state.run;
    var list = $("slideList");
    list.innerHTML = "";
    run.deck.slides.forEach(function (slide, i) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = i === state.slideIndex ? "active" : "";
      var num = document.createElement("span");
      num.className = "num";
      num.textContent = String(i + 1).padStart(2, "0");
      var title = document.createElement("span");
      title.textContent = slide.title;
      btn.appendChild(num);
      btn.appendChild(title);
      btn.addEventListener("click", function () { state.slideIndex = i; renderSlide(); });
      li.appendChild(btn);
      list.appendChild(li);
    });
    renderSlide();
    setOrigin("deck", run.polished.deck);
  }

  function renderSlide() {
    var run = state.run;
    var slide = run.deck.slides[state.slideIndex];
    var canvas = $("slideCanvas");
    canvas.className = "slide-canvas" + (state.slideIndex === 0 ? " title-slide" : "");
    canvas.innerHTML = "";
    var kicker = document.createElement("div");
    kicker.className = "slide-kicker";
    kicker.textContent = run.deck.project + " — Slide " + (state.slideIndex + 1) + " of " + run.deck.slides.length;
    var h = document.createElement("h3");
    h.textContent = slide.title;
    var ul = document.createElement("ul");
    slide.points.forEach(function (p) {
      var li = document.createElement("li");
      li.textContent = p;
      ul.appendChild(li);
    });
    var foot = document.createElement("div");
    foot.className = "slide-foot";
    foot.textContent = state.slideIndex === 0 ? "Hackathon Teammate" : "Hackathon Teammate · " + run.repo;
    canvas.appendChild(kicker);
    canvas.appendChild(h);
    canvas.appendChild(ul);
    canvas.appendChild(foot);
    $("slideCounter").textContent = "Slide " + (state.slideIndex + 1) + " of " + run.deck.slides.length;
    $("slideTitleInput").value = slide.title;
    $("slidePointsInput").value = slide.points.join("\n");
    $("slideSources").textContent = (slide.sources && slide.sources.length)
      ? "Sources: " + slide.sources.join(", ")
      : "No file source — written from the repo summary, or a placeholder for you to fill in.";
    // Refresh active state in the list.
    var buttons = document.querySelectorAll("#slideList button");
    buttons.forEach(function (b, i) { b.classList.toggle("active", i === state.slideIndex); });
    $("prevSlideBtn").disabled = state.slideIndex === 0;
    $("nextSlideBtn").disabled = state.slideIndex === run.deck.slides.length - 1;
  }

  function setOrigin(kind, polished) {
    var map = { readme: "readmeOrigin", script: "scriptOrigin", deck: "deckOrigin" };
    var el = $(map[kind]);
    if (polished) {
      el.textContent = "Polished with Gemini — " + (state.run.polishedAt && state.run.polishedAt[kind] ? new Date(state.run.polishedAt[kind]).toLocaleTimeString() : "just now") + ". The local draft is one click away.";
      el.classList.add("polished");
    } else {
      el.textContent = "Local draft — built from the repo files, no AI call.";
      el.classList.remove("polished");
    }
    var restoreBtn = { readme: "restoreReadmeBtn", script: "restoreScriptBtn", deck: "restoreDeckBtn" }[kind];
    $(restoreBtn).hidden = !polished;
  }

  // ---------- pipeline UI ----------
  function setPipeline(stages, stateName) {
    document.querySelectorAll("#pipeline li").forEach(function (li) {
      var stage = li.getAttribute("data-stage");
      li.classList.toggle("done", stages.indexOf(stage) !== -1 && stateName === "done");
      li.classList.toggle("active", false);
      li.querySelector(".step-state").textContent = stages.indexOf(stage) !== -1 ? stateName : "waiting";
    });
  }
  function setPipelineActive(stage) {
    document.querySelectorAll("#pipeline li").forEach(function (li) {
      var isActive = li.getAttribute("data-stage") === stage;
      li.classList.toggle("active", isActive);
      if (isActive) li.querySelector(".step-state").textContent = "running…";
    });
  }

  // ---------- GitHub fetch (online only) ----------
  function showError(msg) {
    var box = $("errorBox");
    box.textContent = msg;
    box.hidden = !msg;
  }
  function setProgress(msg) { $("progressLine").textContent = msg || ""; }

  function pickKeyFiles(tree) {
    // Priority: manifests, entry points, route/server files, then tests.
    var score = function (p) {
      if (p === "package.json" || p === "pyproject.toml" || p === "README.md") return 0;
      if (/^(server|app|main|index)\.(js|ts|py)$/.test(p) || /src\/(server|app|main|index)\.(js|ts|py)$/.test(p)) return 1;
      if (/route|controller|api/i.test(p)) return 2;
      if (/^src\//.test(p)) return 3;
      if (/test|spec/i.test(p)) return 4;
      if (/\.md$/.test(p)) return 5;
      return 6;
    };
    var code = tree.filter(function (f) { return f.type === "blob" && f.size < 120000; });
    code.sort(function (a, b) { return score(a.path) - score(b.path) || a.path.localeCompare(b.path); });
    return code.slice(0, MAX_READ_FILES);
  }

  async function analyseGitHub(url) {
    var parsed = core.parseGitHubUrl(url);
    if (!parsed) throw new Error("That does not look like a GitHub repo URL. Use github.com/owner/repo.");
    showError("");
    setPipeline([], "");
    setPipelineActive("analyse");
    setProgress("Fetching repo info for " + parsed.owner + "/" + parsed.repo + "…");
    var repoRes = await fetch("https://api.github.com/repos/" + parsed.owner + "/" + parsed.repo);
    if (repoRes.status === 404) throw new Error("Repo not found on GitHub. Check the owner and repo name — or use the sample repo.");
    if (repoRes.status === 403) throw new Error("GitHub rate limit reached (60 unauthenticated requests per hour). Try again later, or use the sample repo.");
    if (!repoRes.ok) throw new Error("GitHub returned HTTP " + repoRes.status + ". The repo may be private — private repos are not supported in this version.");
    var repo = await repoRes.json();
    var branch = repo.default_branch || "main";
    setProgress("Reading the file tree (" + branch + " branch)…");
    var treeRes = await fetch("https://api.github.com/repos/" + parsed.owner + "/" + parsed.repo + "/git/trees/" + branch + "?recursive=1");
    if (!treeRes.ok) throw new Error("Could not read the file tree (HTTP " + treeRes.status + ").");
    var tree = await treeRes.json();
    if (tree.truncated) setProgress("This repo is large — the tree was truncated by GitHub, so the analysis covers the files listed.");
    var allFiles = (tree.tree || []).filter(function (f) { return f.type === "blob"; }).map(function (f) { return f.path; });
    var keyFiles = pickKeyFiles(tree.tree || []);
    setProgress("Reading " + keyFiles.length + " key files…");
    var files = [];
    for (var i = 0; i < keyFiles.length; i++) {
      var kf = keyFiles[i];
      setProgress("Reading " + kf.path + " (" + (i + 1) + " of " + keyFiles.length + ")…");
      var rawRes = await fetch("https://raw.githubusercontent.com/" + parsed.owner + "/" + parsed.repo + "/" + branch + "/" + kf.path);
      if (rawRes.ok) files.push({ path: kf.path, content: await rawRes.text() });
    }
    // Include the full file list so the README layout is complete; content is
    // only present for the key files that were actually read.
    var byPath = {};
    files.forEach(function (f) { byPath[f.path] = f; });
    allFiles.slice(0, MAX_TREE_FILES).forEach(function (p) {
      if (!byPath[p]) files.push({ path: p, content: "" });
    });
    setPipelineActive("readme");
    setProgress("Summarising what the files show…");
    var run = makeRun(parsed.owner + "/" + parsed.repo, "github", files);
    setRun(run, "Live run on " + parsed.owner + "/" + parsed.repo + " — " + files.length + " files listed, " + keyFiles.length + " read in full. Check each artefact before presenting it.");
    setProgress("");
    persistRun(run);
    return run;
  }

  // ---------- Gemini polish (optional, key required) ----------
  function geminiPrompt(kind, facts) {
    var base = "You are editing docs for a hackathon project. Use ONLY the facts below, which were extracted from the repo files. Do not invent features, numbers, names, or tools. If a fact is missing, leave it out or mark it as a placeholder.\n\nFACTS (JSON):\n" + JSON.stringify(facts) + "\n\n";
    if (kind === "readme") return base + "Rewrite the README as Markdown. Keep the sections: What it does, Install, Run, API (only if routes exist), Project layout, Tests (only if tests exist), Notes. Keep it short and plain. Return Markdown only, no code fences around it.";
    if (kind === "script") return base + "Rewrite the 90-second demo script. Return JSON only, exactly this shape: {\"cues\": [{\"at\": 0, \"seconds\": 20, \"cue\": \"Hook\", \"line\": \"...\"}, ...]} with 5 cues whose seconds add to 90. No other text.";
    return base + "Rewrite the 8-slide pitch deck. Return JSON only, exactly this shape: {\"slides\": [{\"title\": \"Problem\", \"points\": [\"...\", \"...\"]}, ...]} with exactly these 8 titles in order: Problem, Solution, Live demo, How it works, Tech stack, What is next, Team, Ask. The Team slide must say it is a placeholder to fill in with real names. No other text.";
  }

  async function polishWithGemini(kind) {
    var settings = loadSettings();
    if (!settings.geminiKey) {
      showError("No Gemini key saved. Open Settings, paste a free key from Google AI Studio, and try again. The local draft stays as it is.");
      return;
    }
    var run = state.run;
    var btn = { readme: "polishReadmeBtn", script: "polishScriptBtn", deck: "polishDeckBtn" }[kind];
    $(btn).disabled = true;
    setProgress("Asking Gemini (" + (settings.model || "gemini-2.5-flash") + ") to polish the " + kind + "…");
    showError("");
    try {
      var res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(settings.model || "gemini-2.5-flash") + ":generateContent?key=" + encodeURIComponent(settings.geminiKey),
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: geminiPrompt(kind, run.facts) }] }] }) }
      );
      if (res.status === 400 || res.status === 403) throw new Error("Gemini rejected the request (HTTP " + res.status + "). The key may be wrong or the model may not be enabled for it — check the key in Settings.");
      if (res.status === 429) throw new Error("Gemini rate limit reached on the free tier. Wait a minute and try again.");
      if (!res.ok) throw new Error("Gemini returned HTTP " + res.status + ".");
      var data = await res.json();
      var text = (((data.candidates || [])[0] || {}).content || {}).parts || [];
      var out = text.map(function (p) { return p.text || ""; }).join("").trim();
      if (!out) throw new Error("Gemini returned an empty reply. Try again.");
      if (kind === "readme") {
        run.readme = out.replace(/^```markdown\n?/, "").replace(/\n?```$/, "");
      } else {
        var jsonText = out.replace(/^```json\n?/, "").replace(/\n?```$/, "");
        var parsedJson = JSON.parse(jsonText);
        if (kind === "script") {
          if (!parsedJson.cues || parsedJson.cues.length !== 5) throw new Error("Gemini returned a script with the wrong shape. The local draft is unchanged.");
          var total = parsedJson.cues.reduce(function (s, c) { return s + (Number(c.seconds) || 0); }, 0);
          if (total !== 90) throw new Error("Gemini returned a script totalling " + total + " seconds, not 90. The local draft is unchanged.");
          run.script = parsedJson;
        } else {
          if (!parsedJson.slides || parsedJson.slides.length !== 8) throw new Error("Gemini returned a deck with the wrong number of slides. The local draft is unchanged.");
          run.deck = { project: run.deck.project, slides: parsedJson.slides.map(function (s, i) { return { title: s.title, points: s.points || [], sources: (run.deck.slides[i] || {}).sources || [] }; }) };
        }
      }
      run.polished[kind] = true;
      run.polishedAt = run.polishedAt || {};
      run.polishedAt[kind] = new Date().toISOString();
      renderAll();
      persistRun(run);
      setProgress("");
    } catch (err) {
      showError("Gemini polish failed: " + err.message + " The local draft is unchanged.");
      setProgress("");
    } finally {
      $(btn).disabled = false;
    }
  }

  function restoreLocal(kind) {
    var run = state.run;
    if (!run.local) return;
    if (kind === "readme") run.readme = run.local.readme;
    if (kind === "script") run.script = JSON.parse(JSON.stringify(run.local.script));
    if (kind === "deck") run.deck = JSON.parse(JSON.stringify(run.local.deck));
    run.polished[kind] = false;
    renderAll();
    persistRun(run);
  }

  // ---------- export ----------
  function download(filename, text, type) {
    var blob = new Blob([text], { type: type || "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function copyText(text, btn) {
    var done = function () {
      var old = btn.textContent;
      btn.textContent = "Copied";
      setTimeout(function () { btn.textContent = old; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    ta.remove();
  }
  function scriptAsMarkdown() {
    var run = state.run;
    var md = "# Demo script — " + run.facts.name + " (90 seconds)\n\n";
    run.script.cues.forEach(function (c) {
      md += "## " + c.at + "s – " + c.seconds + "s — " + c.cue + "\n\n" + c.line + "\n\n";
    });
    return md;
  }
  function slug(s) { return String(s || "project").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project"; }

  function downloadPptx() {
    var run = state.run;
    if (!window.PptxGenJS) { showError("The presentation library did not load. Reload the page and try again."); return; }
    var pptx = new window.PptxGenJS();
    pptx.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
    pptx.layout = "WIDE";
    pptx.author = "Hackathon Teammate";
    pptx.title = run.deck.project + " — pitch deck";
    run.deck.slides.forEach(function (slide, i) {
      var s = pptx.addSlide();
      if (i === 0) {
        s.background = { color: "1D4ED8" };
        s.addText(run.deck.project, { x: 0.7, y: 2.4, w: 11.9, h: 1.0, fontSize: 44, bold: true, color: "FFFFFF", fontFace: "Arial" });
        s.addText(slide.title, { x: 0.7, y: 3.5, w: 11.9, h: 0.6, fontSize: 24, color: "BFDBFE", fontFace: "Arial" });
        s.addText(slide.points.join("  "), { x: 0.7, y: 4.4, w: 11.9, h: 1.2, fontSize: 16, color: "DBEAFE", fontFace: "Arial" });
      } else {
        s.background = { color: "FFFFFF" };
        s.addText(String(i + 1).padStart(2, "0"), { x: 0.7, y: 0.45, w: 1.0, h: 0.4, fontSize: 13, bold: true, color: "1D4ED8", fontFace: "Arial" });
        s.addText(slide.title, { x: 0.7, y: 0.85, w: 11.9, h: 0.8, fontSize: 32, bold: true, color: "111827", fontFace: "Arial" });
        s.addText(slide.points.map(function (p) { return "•  " + p; }).join("\n"), { x: 0.7, y: 1.9, w: 11.9, h: 4.6, fontSize: 18, color: "374151", fontFace: "Arial", valign: "top" });
        s.addText("Hackathon Teammate · " + run.repo, { x: 0.7, y: 6.9, w: 11.9, h: 0.3, fontSize: 11, color: "6B7280", fontFace: "Arial" });
      }
    });
    pptx.writeFile({ fileName: slug(run.deck.project) + "-pitch-deck.pptx" });
  }

  // ---------- save (debounced) ----------
  var saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { if (state.run) persistRun(state.run); }, 600);
  }

  // ---------- wiring ----------
  function switchTab(tab) {
    state.tab = tab;
    try { history.replaceState(null, "", "#" + tab); } catch (e) {}
    document.querySelectorAll(".tab").forEach(function (b) {
      var active = b.getAttribute("data-tab") === tab;
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    });
    document.querySelectorAll(".panel").forEach(function (p) {
      p.classList.toggle("active", p.id === "panel-" + tab);
    });
    // Cue textareas auto-grow to their text, but scrollHeight reads 0 while
    // the panel is hidden — re-grow them once the tab is visible.
    if (tab === "script") {
      document.querySelectorAll("#panel-script .cue-line").forEach(autogrow);
    }
  }

  document.querySelectorAll(".tab").forEach(function (b) {
    b.addEventListener("click", function () { switchTab(b.getAttribute("data-tab")); });
  });
  window.addEventListener("hashchange", function () {
    var h = (location.hash || "").replace("#", "");
    if (["readme", "script", "deck"].indexOf(h) !== -1) switchTab(h);
  });

  $("analyseBtn").addEventListener("click", function () {
    var url = $("repoUrl").value.trim();
    if (!url) { showError("Paste a GitHub repo URL first — or press “Use the sample repo”."); return; }
    $("analyseBtn").disabled = true;
    analyseGitHub(url).catch(function (err) {
      showError(err.message + " The sample repo is still loaded below.");
      setProgress("");
      setPipeline([], "");
    }).finally(function () { $("analyseBtn").disabled = false; });
  });
  $("repoUrl").addEventListener("keydown", function (e) {
    if (e.key === "Enter") $("analyseBtn").click();
  });
  $("sampleBtn").addEventListener("click", function () { loadSample(); });

  $("treeFilter").addEventListener("input", function () {
    if (state.run) renderTree(state.run.facts.files);
  });

  $("readmeEditor").addEventListener("input", function () {
    state.run.readme = $("readmeEditor").value;
    $("readmePreview").innerHTML = window.marked ? window.marked.parse(state.run.readme) : esc(state.run.readme);
    scheduleSave();
  });
  $("copyReadmeBtn").addEventListener("click", function () { copyText(state.run.readme, $("copyReadmeBtn")); });
  $("downloadReadmeBtn").addEventListener("click", function () {
    download(slug(state.run.facts.name) + "-README.md", state.run.readme, "text/markdown;charset=utf-8");
  });
  $("copyScriptBtn").addEventListener("click", function () { copyText(scriptAsMarkdown(), $("copyScriptBtn")); });
  $("downloadScriptBtn").addEventListener("click", function () {
    download(slug(state.run.facts.name) + "-demo-script.md", scriptAsMarkdown(), "text/markdown;charset=utf-8");
  });
  $("downloadPptxBtn").addEventListener("click", downloadPptx);

  $("polishReadmeBtn").addEventListener("click", function () { polishWithGemini("readme"); });
  $("polishScriptBtn").addEventListener("click", function () { polishWithGemini("script"); });
  $("polishDeckBtn").addEventListener("click", function () { polishWithGemini("deck"); });
  $("restoreReadmeBtn").addEventListener("click", function () { restoreLocal("readme"); });
  $("restoreScriptBtn").addEventListener("click", function () { restoreLocal("script"); });
  $("restoreDeckBtn").addEventListener("click", function () { restoreLocal("deck"); });

  $("prevSlideBtn").addEventListener("click", function () {
    if (state.slideIndex > 0) { state.slideIndex--; renderSlide(); }
  });
  $("nextSlideBtn").addEventListener("click", function () {
    if (state.slideIndex < state.run.deck.slides.length - 1) { state.slideIndex++; renderSlide(); }
  });
  document.addEventListener("keydown", function (e) {
    if (state.tab !== "deck" || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (e.key === "ArrowRight") $("nextSlideBtn").click();
    if (e.key === "ArrowLeft") $("prevSlideBtn").click();
  });
  $("slideTitleInput").addEventListener("input", function () {
    state.run.deck.slides[state.slideIndex].title = $("slideTitleInput").value;
    renderSlideListActiveOnly();
    scheduleSave();
  });
  $("slidePointsInput").addEventListener("input", function () {
    state.run.deck.slides[state.slideIndex].points = $("slidePointsInput").value.split("\n").filter(function (l) { return l.trim().length > 0; });
    scheduleSave();
  });
  function renderSlideListActiveOnly() {
    var buttons = document.querySelectorAll("#slideList button");
    buttons.forEach(function (b, i) {
      if (i === state.slideIndex) b.querySelector("span:last-child").textContent = state.run.deck.slides[i].title;
    });
    var canvasTitle = document.querySelector("#slideCanvas h3");
    if (canvasTitle) canvasTitle.textContent = state.run.deck.slides[state.slideIndex].title;
  }

  // Settings dialog
  var dialog = $("settingsDialog");
  $("settingsBtn").addEventListener("click", function () { renderKeyStatus(); dialog.showModal(); });
  $("saveKeyBtn").addEventListener("click", function (e) {
    e.preventDefault();
    saveSettings({ geminiKey: $("geminiKey").value.trim(), model: $("geminiModel").value });
    showError("");
  });
  $("forgetKeyBtn").addEventListener("click", function (e) {
    e.preventDefault();
    saveSettings({ geminiKey: "", model: $("geminiModel").value });
  });

  // ---------- boot ----------
  renderKeyStatus();
  renderRunList();
  loadSample(false);
  var hashTab = (location.hash || "").replace("#", "");
  if (["readme", "script", "deck"].indexOf(hashTab) !== -1) switchTab(hashTab);
})();
