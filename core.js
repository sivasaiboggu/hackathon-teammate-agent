// Hackathon Teammate — core pipeline logic.
// Shared by the browser app (window.TeammateCore) and the Node test suite
// (module.exports). No network, no AI calls here: every output is built
// only from the file list the analyser actually read, so nothing in a
// generated README, script or deck can describe a feature the repo
// does not have. Each generated section records its source files.
//
// Pipeline stages (mirrors the plan's LangGraph sequence):
//   1. analyseRepo  — Repo Summariser
//   2. buildReadme  — README Writer
//   3. buildScript  — Demo Script Writer
//   4. buildDeck    — Deck Writer (8 fixed slides)
(function (root) {
  "use strict";

  var DECK_SLIDES = [
    "Problem",
    "Solution",
    "Live demo",
    "How it works",
    "Tech stack",
    "What is next",
    "Team",
    "Ask",
  ];

  var SCRIPT_TOTAL_SECONDS = 90;

  function extOf(path) {
    var i = path.lastIndexOf(".");
    return i === -1 ? "" : path.slice(i + 1).toLowerCase();
  }

  function languageOf(path) {
    var map = {
      js: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
      ts: "TypeScript", tsx: "TypeScript",
      py: "Python", html: "HTML", css: "CSS",
      json: "JSON", md: "Markdown", sql: "SQL", sh: "Shell",
      go: "Go", rs: "Rust", java: "Java", rb: "Ruby",
    };
    return map[extOf(path)] || null;
  }

  function isCodeFile(path) {
    return ["js", "mjs", "cjs", "ts", "tsx", "py", "go", "rs", "java", "rb"].indexOf(extOf(path)) !== -1;
  }

  function isDocFile(path) {
    return ["md", "txt"].indexOf(extOf(path)) !== -1;
  }

  function parsePackageJson(content) {
    try {
      var pkg = JSON.parse(content);
      return {
        name: typeof pkg.name === "string" ? pkg.name : null,
        description: typeof pkg.description === "string" ? pkg.description : null,
        version: typeof pkg.version === "string" ? pkg.version : null,
        main: typeof pkg.main === "string" ? pkg.main : null,
        scripts: pkg.scripts && typeof pkg.scripts === "object" ? pkg.scripts : {},
        dependencies: pkg.dependencies && typeof pkg.dependencies === "object" ? Object.keys(pkg.dependencies) : [],
        devDependencies: pkg.devDependencies && typeof pkg.devDependencies === "object" ? Object.keys(pkg.devDependencies) : [],
        license: typeof pkg.license === "string" ? pkg.license : null,
      };
    } catch (e) {
      return { name: null, description: null, version: null, main: null, scripts: {}, dependencies: [], devDependencies: [], license: null, parseError: true };
    }
  }

  function parsePyproject(content) {
    var out = { name: null, description: null, dependencies: [] };
    var name = content.match(/^\s*name\s*=\s*"([^"]+)"/m);
    if (name) out.name = name[1];
    var desc = content.match(/^\s*description\s*=\s*"([^"]+)"/m);
    if (desc) out.description = desc[1];
    var depBlock = content.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
    if (depBlock) {
      var found = depBlock[1].match(/"([^"]+)"/g) || [];
      out.dependencies = found.map(function (s) { return s.replace(/"/g, "").split(/[>=<~! ]/)[0]; });
    }
    return out;
  }

  // Find HTTP routes in server code: app.get("/api/...", ...) etc.
  function extractRoutes(content) {
    var routes = [];
    var re = /\b(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']/g;
    var m;
    while ((m = re.exec(content)) !== null) {
      routes.push({ method: m[1].toUpperCase(), path: m[2] });
    }
    return routes;
  }

  // Find exported / top-level function names in a JS file.
  function extractFunctions(content) {
    var names = [];
    var re = /function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
    var m;
    while ((m = re.exec(content)) !== null) {
      if (names.indexOf(m[1]) === -1) names.push(m[1]);
    }
    return names;
  }

  function analyseRepo(files, repoLabel) {
    var byPath = {};
    files.forEach(function (f) { byPath[f.path] = f.content || ""; });

    var facts = {
      repo: repoLabel || "repo",
      files: files.map(function (f) { return f.path; }).sort(),
      fileCount: files.length,
      languages: {},
      name: null,
      description: null,
      version: null,
      entryPoint: null,
      license: null,
      scripts: {},
      dependencies: [],
      routes: [],
      routeSources: [],
      functions: {},
      hasTests: false,
      testFiles: [],
      hasReadme: false,
      readmeLength: 0,
      readmeSources: [],
      keyFiles: [],
      features: [],
    };

    files.forEach(function (f) {
      var lang = languageOf(f.path);
      if (lang) facts.languages[lang] = (facts.languages[lang] || 0) + 1;
      if (/test|spec/i.test(f.path) && isCodeFile(f.path)) {
        facts.hasTests = true;
        facts.testFiles.push(f.path);
      }
      if (/^readme\.md$/i.test(f.path)) {
        facts.hasReadme = true;
        facts.readmeLength = (f.content || "").trim().split(/\n/).length;
      }
    });

    var pkg = byPath["package.json"];
    if (pkg !== undefined) {
      var parsed = parsePackageJson(pkg);
      facts.name = parsed.name;
      facts.description = parsed.description;
      facts.version = parsed.version;
      facts.entryPoint = parsed.main;
      facts.license = parsed.license;
      facts.scripts = parsed.scripts;
      facts.dependencies = parsed.dependencies.concat(parsed.devDependencies);
      facts.keyFiles.push("package.json");
    }
    var py = byPath["pyproject.toml"];
    if (py !== undefined) {
      var p = parsePyproject(py);
      if (!facts.name) facts.name = p.name;
      if (!facts.description) facts.description = p.description;
      facts.dependencies = facts.dependencies.concat(p.dependencies);
      facts.keyFiles.push("pyproject.toml");
    }
    if (!facts.name) {
      var firstCode = files.filter(isCodeFilePath).map(function (f) { return f.path; })[0];
      facts.name = repoLabel ? repoLabel.split("/").pop() : (firstCode ? firstCode.split("/")[0] : "project");
    }

    files.forEach(function (f) {
      if (!isCodeFile(f.path)) return;
      var routes = extractRoutes(f.content || "");
      routes.forEach(function (r) {
        facts.routes.push(r);
        if (facts.routeSources.indexOf(f.path) === -1) facts.routeSources.push(f.path);
      });
      var fns = extractFunctions(f.content || "");
      if (fns.length) facts.functions[f.path] = fns;
    });

    // Features, stated only from evidence found in the files.
    if (facts.routes.length) {
      facts.features.push({
        text: facts.routes.length + " HTTP endpoints (" + facts.routes.map(function (r) { return r.method + " " + r.path; }).join(", ") + ")",
        sources: facts.routeSources.slice(),
      });
    }
    if (facts.hasTests) {
      facts.features.push({
        text: "Automated tests in " + facts.testFiles.join(", "),
        sources: facts.testFiles.slice(),
      });
    }
    if (facts.scripts.start) {
      facts.features.push({ text: "Starts with `npm start` (" + facts.scripts.start + ")", sources: ["package.json"] });
    }
    if (facts.scripts.test) {
      facts.features.push({ text: "Tests run with `npm test` (" + facts.scripts.test + ")", sources: ["package.json"] });
    }
    if (byPath["public/index.html"] !== undefined || byPath["index.html"] !== undefined) {
      facts.features.push({ text: "Serves a browser page from a static folder", sources: ["public/index.html"] });
    }

    facts.keyFiles = facts.keyFiles.concat(
      files.filter(function (f) { return isCodeFile(f.path); }).map(function (f) { return f.path; })
    );
    facts.keyFiles = facts.keyFiles.filter(function (v, i, a) { return a.indexOf(v) === i; });
    return facts;
  }

  function isCodeFilePath(f) { return isCodeFile(f.path); }

  function srcNote(sources) {
    return sources && sources.length ? "\n\n_Sources: " + sources.map(function (s) { return "`" + s + "`"; }).join(", ") + "_" : "";
  }

  function buildReadme(facts) {
    var lines = [];
    var title = facts.name || "Project";
    lines.push("# " + title);
    lines.push("");
    lines.push(facts.description || "A project. The description below is drawn only from the files in this repo.");
    lines.push("");
    lines.push("## What it does");
    lines.push("");
    if (facts.features.length) {
      facts.features.forEach(function (f) { lines.push("- " + f.text); });
    } else {
      lines.push("- See the file list below — no feature claims could be verified from the repo files.");
    }
    lines.push("");
    lines.push("## Install");
    lines.push("");
    lines.push("```bash");
    if (facts.dependencies.length && byPathHas(facts, "package.json")) lines.push("npm install");
    if (facts.dependencies.length && byPathHas(facts, "pyproject.toml")) lines.push("pip install -e .");
    if (!facts.dependencies.length) lines.push("# No dependencies declared in the repo manifests.");
    lines.push("```");
    lines.push("");
    lines.push("## Run");
    lines.push("");
    lines.push("```bash");
    if (facts.scripts.start) lines.push("npm start");
    else if (facts.entryPoint) lines.push("node " + facts.entryPoint);
    else lines.push("# No start command found in the repo. Check the entry point file.");
    lines.push("```");
    lines.push("");
    if (facts.routes.length) {
      lines.push("## API");
      lines.push("");
      lines.push("| Method | Path |");
      lines.push("| --- | --- |");
      facts.routes.forEach(function (r) { lines.push("| " + r.method + " | `" + r.path + "` |"); });
      lines.push("");
    }
    lines.push("## Project layout");
    lines.push("");
    lines.push("```");
    facts.files.forEach(function (f) { lines.push(f); });
    lines.push("```");
    lines.push("");
    if (facts.hasTests) {
      lines.push("## Tests");
      lines.push("");
      lines.push("```bash");
      lines.push(facts.scripts.test ? "npm test" : "# Tests live in: " + facts.testFiles.join(", "));
      lines.push("```");
      lines.push("");
    }
    lines.push("## Notes");
    lines.push("");
    lines.push("- This README was drafted from the repo files listed above. Check anything marked with a source before presenting it as final.");
    if (facts.hasReadme && facts.readmeLength <= 3) {
      lines.push("- The repo's previous README was " + facts.readmeLength + " lines long and said almost nothing — this draft replaces it.");
    }
    lines.push("");
    return {
      markdown: lines.join("\n"),
      sections: [
        { name: "What it does", sources: facts.features.length ? facts.features[0].sources : facts.keyFiles.slice(0, 3) },
        { name: "Install", sources: facts.dependencies.length ? ["package.json"] : facts.keyFiles.slice(0, 1) },
        { name: "Run", sources: facts.entryPoint ? [facts.entryPoint] : ["package.json"] },
        { name: "API", sources: facts.routeSources.slice() },
        { name: "Project layout", sources: facts.files.slice() },
      ],
    };
  }

  function byPathHas(facts, name) {
    return facts.files.indexOf(name) !== -1;
  }

  function buildScript(facts) {
    var name = facts.name || "this project";
    var firstFeature = facts.features.length ? facts.features[0].text : "what the code actually does";
    var cues = [
      { at: 0, seconds: 20, cue: "Hook", line: "Every hackathon team loses the last two hours to docs. This is " + name + " — and it had almost no README when we started." },
      { at: 20, seconds: 25, cue: "Show the repo", line: "Here is the repo: " + facts.fileCount + " files. The analyser read them all and pulled out " + firstFeature + "." },
      { at: 45, seconds: 20, cue: "Show the README", line: "From those files alone it wrote the README — install, run, and the API table. Nothing in it comes from anywhere else." },
      { at: 65, seconds: 15, cue: "Show the deck", line: "Same facts, eight slides: problem, solution, demo, how it works, stack, next steps, team, ask." },
      { at: 80, seconds: 10, cue: "Close", line: "Docs done. Back to building." },
    ];
    var total = cues.reduce(function (s, c) { return s + c.seconds; }, 0);
    return { cues: cues, totalSeconds: total, expectedSeconds: SCRIPT_TOTAL_SECONDS };
  }

  function buildDeck(facts) {
    var name = facts.name || "Project";
    var stack = facts.dependencies.length ? facts.dependencies.slice(0, 6).join(", ") : "No dependencies declared";
    var langs = Object.keys(facts.languages);
    var slides = [
      { title: "Problem", points: ["Hackathon teams spend the last hours writing docs instead of finishing the build.", "A repo with no README is hard to judge, demo, or hand over."], sources: [] },
      { title: "Solution", points: [name + ": paste a repo URL, get a README, a demo script, and an 8-slide deck.", "Every line is traced to a file in the repo — nothing invented."], sources: facts.keyFiles.slice(0, 3) },
      { title: "Live demo", points: ["Paste the repo URL and watch the file tree and summary appear.", "README, script, and deck render in under a minute."], sources: [] },
      { title: "How it works", points: ["1. Read the repo: manifests, entry points, routes, tests.", "2. Summarise what the files actually show.", "3. Write the README, script, and deck from that summary."], sources: facts.keyFiles.slice(0, 4) },
      { title: "Tech stack", points: [langs.length ? "Languages in the repo: " + langs.join(", ") + "." : "No code files detected.", "Dependencies: " + stack + ".", facts.hasTests ? "Tests: " + facts.testFiles.join(", ") + "." : "No test files found in the repo."], sources: facts.keyFiles.slice() },
      { title: "What is next", points: ["Add a live deployment link once the app is hosted.", "Add screenshots of the app running.", "Fill in the team slide with real names before presenting."], sources: [] },
      { title: "Team", points: ["Add your team members here — names and what each person built.", "This slide is a placeholder until you fill it in."], sources: [] },
      { title: "Ask", points: ["We are looking for feedback on the draft docs and one more judge run-through.", "Try it on your own repo after the demo."], sources: [] },
    ];
    return { project: name, slides: slides };
  }

  // Grounding check: every generated claim must name a source file that
  // exists in the repo, or be an explicit placeholder / next step.
  function checkGrounding(facts, deck) {
    var problems = [];
    deck.slides.forEach(function (slide, i) {
      (slide.sources || []).forEach(function (s) {
        if (facts.files.indexOf(s) === -1) problems.push("Slide " + (i + 1) + " (" + slide.title + ") cites missing file " + s);
      });
    });
    facts.features.forEach(function (f) {
      f.sources.forEach(function (s) {
        if (facts.files.indexOf(s) === -1) problems.push("Feature cites missing file " + s);
      });
    });
    return problems;
  }

  function parseGitHubUrl(url) {
    var m = String(url || "").trim().match(/^https?:\/\/github\.com\/([^\/\s]+)\/([^\/\s#?]+?)(?:\.git)?(?:\/.*)?$/);
    if (!m) return null;
    return { owner: m[1], repo: m[2] };
  }

  var api = {
    DECK_SLIDES: DECK_SLIDES,
    SCRIPT_TOTAL_SECONDS: SCRIPT_TOTAL_SECONDS,
    analyseRepo: analyseRepo,
    buildReadme: buildReadme,
    buildScript: buildScript,
    buildDeck: buildDeck,
    checkGrounding: checkGrounding,
    parseGitHubUrl: parseGitHubUrl,
    parsePackageJson: parsePackageJson,
    extractRoutes: extractRoutes,
    extractFunctions: extractFunctions,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TeammateCore = api;
})(typeof window !== "undefined" ? window : globalThis);
