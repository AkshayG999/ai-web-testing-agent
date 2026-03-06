# AI Web Tester — Codebase Overview

This document describes every file, its responsibilities, and how data flows through the system.

---

## 1. Project structure

```
ai-web-tester/
├── main.js                    # Entry point (CLI orchestrator)
├── package.json               # Dependencies and scripts
├── config/
│   └── settings.json          # Runtime config (timeout, tracing, etc.)
├── agent/
│   ├── domScanner.js          # Scans page and extracts DOM structure
│   └── aiPlanner.js           # Calls OpenAI to generate test plan from DOM
├── executor/
│   └── playwrightRunner.js    # Runs test steps with Playwright
├── utils/
│   └── promptBuilder.js       # Builds the AI prompt from DOM JSON
├── reporter/
│   └── testReporter.js        # Writes HTML, JSON, and CLI reports
└── reports/                   # Generated at runtime
    ├── report_*.html
    ├── report_*.json
    ├── screenshots/
    └── traces/
```

---

## 2. End-to-end data flow

```
  User runs: node main.js https://example.com
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  main.js                                                                  │
│  1. Load config (config/settings.json)                                    │
│  2. Parse URL from argv[2] → baseUrl                                      │
│  3. Call scanPage(baseUrl)     ──────────────────────────► domScanner    │
│  4. Receive domStructure (JSON) ◄─────────────────────────                │
│  5. Call generateTestPlan(domStructure) ─────────────────► aiPlanner     │
│  6. Receive testPlan (array of scenarios) ◄──────────────  (uses prompt  │
│                                                             from          │
│                                                             promptBuilder)│
│  7. Call runTestPlan(baseUrl, testPlan) ─────────────────► playwright   │
│  8. Receive results (array + traceFile) ◄───────────────── Runner        │
│  9. Call writeJsonReport, writeHtmlReport, printCliReport ─► testReporter │
│  10. Exit(0) or Exit(1) if any failed                                     │
└──────────────────────────────────────────────────────────────────────────┘
```

So in one sentence: **URL → Scanner → DOM JSON → AI (with prompt from promptBuilder) → Test plan → Executor → Results → Reporter.**

---

## 3. File-by-file

### 3.1 `main.js` — Entry point and orchestrator

**Role:** CLI entry. Parses URL, runs the four phases in order, and exits with the right code.

**Dependencies:**  
`dotenv`, `path`, `agent/domScanner`, `agent/aiPlanner`, `executor/playwrightRunner`, `reporter/testReporter`, `config/settings.json`.

**Flow inside main:**

1. Load `config/settings.json` (or use defaults).
2. Normalize URL from `process.argv[2]` → `baseUrl`.
3. **[1/4] Scan:** `domStructure = await scanPage(baseUrl, settings)`.
4. **[2/4] Plan:** `testPlan = await generateTestPlan(domStructure)`; exit if empty.
5. **[3/4] Run:** `results = await runTestPlan(baseUrl, testPlan, { settings })`.
6. **[4/4] Report:** Based on `settings.reportFormats`, call `printCliReport`, `writeJsonReport`, `writeHtmlReport`; log trace path if present.
7. `process.exit(failed > 0 ? 1 : 0)`.

**Data it passes:**

- Into scanner: `baseUrl`, `timeout`, `headless`, `viewport`.
- Into planner: `domStructure` (object from scanner).
- Into runner: `baseUrl`, `testPlan` (array of `{ name, steps }`), `settings`.
- Into reporter: `results` (array of scenario results + `results.traceFile`), `baseUrl`.

---

### 3.2 `config/settings.json` — Runtime configuration

**Role:** Single place for timeouts, retries, browser and report options.

**Keys:**

| Key             | Purpose                                      |
|-----------------|----------------------------------------------|
| `timeout`       | Default step/page timeout (ms)                |
| `retries`       | Retries per step in executor                 |
| `headless`      | Run browser headless                         |
| `tracing`       | Enable Playwright tracing                    |
| `recordVideo`   | Enable video recording                      |
| `viewport`      | `{ width, height }` for browser             |
| `reportFormats` | `["html", "json", "cli"]` — which reports   |

Used by `main.js` and passed as `settings` into `scanPage` and `runTestPlan`.

---

### 3.3 `agent/domScanner.js` — Website scanner

**Role:** Open the URL in Playwright, wait for the page, then extract a **DOM structure** (JSON) describing inputs, buttons, links, forms, etc.

**Exports:** `{ scanPage }`.

**`scanPage(url, options)`**

- **In:** `url` (string), `options`: `{ timeout, headless, viewport }`.
- **Out:** One object (DOM structure) with:
  - `url`, `title`
  - `inputs` — each: tag, type, name, id, placeholder, label, required, ariaLabel, visible, etc.
  - `selects` — name, id, label, options (value + text), multiple, disabled.
  - `buttons` — tag, type, text, name, id, ariaLabel, visible, disabled.
  - `links` — text, href, ariaLabel, visible.
  - `forms` — action, method, id, name, fields (inputs/selects per form), visible.
  - `headings` — level (h1/h2/h3), text.
  - `navItems` — text, href (from nav/header).
  - `images` — alt, src, visible.
  - `meta` — counts: inputCount, buttonCount, linkCount, formCount, hasNavigation.

**Flow inside:**

1. Launch Chromium, create context with viewport.
2. New page → `page.goto(url, { waitUntil: 'domcontentloaded' })`.
3. `page.waitForLoadState('networkidle')` (best-effort).
4. `page.evaluate(...)` runs in the browser: `getLabel(el)`, `isVisible(el)`, then query `input`, `textarea`, `select`, `button`, `a`, `form`, headings, nav, images` and build the object above.
5. Close browser and return that object.

So: **URL + options → Playwright → one DOM structure object.**

---

### 3.4 `utils/promptBuilder.js` — AI prompt builder

**Role:** Turn the DOM structure into a **single string prompt** that tells the AI how to output a Playwright test plan (scenarios and steps).

**Exports:** `{ buildScanPrompt }`.

**`buildScanPrompt(domStructure)`**

- **In:** `domStructure` (the object from `domScanner`).
- **Out:** One long string (the user prompt).

**What the prompt does:**

- Puts the DOM JSON in the prompt.
- Describes the exact step format: `action`, and for each action what fields are required (e.g. `selector` or `locatorType` + `locatorArgs`, `value`, `assertion`, `expected`).
- Lists **actions:** goto, click, dblclick, fill, type, clear, select, check, uncheck, hover, focus, press, upload, screenshot, scrollIntoView, wait, assert.
- Lists **assertions:** url_contains, url_equals, url_matches, title_contains, page_contains_text, visible, hidden, text_contains, has_value, checked, unchecked, enabled, disabled, count.
- Explains **locatorType**: role, label, placeholder, text, altText, testId, plus CSS `selector` fallback.
- Gives rules (e.g. use `check` + `force:true` for checkboxes; no selector for page-level assertions).
- Asks for **only a JSON array** of scenarios (no markdown).

This module is **only** used by `aiPlanner.js`; it does not run Playwright or OpenAI itself.

---

### 3.5 `agent/aiPlanner.js` — AI test plan generator

**Role:** Call OpenAI with the prompt from `promptBuilder` and the DOM structure, then parse the model response into a **test plan** (array of scenarios with steps).

**Exports:** `generateTestPlan`, `createClient`, `parseJsonFromResponse`.

**`createClient()`**

- Reads `process.env.OPENAI_API_KEY`, throws if missing.
- Returns `new OpenAI({ apiKey })`.

**`parseJsonFromResponse(content)`**

- Takes the raw string from the model.
- Finds the first `[...]` or `{...}` and `JSON.parse`s it.
- Used to handle markdown or extra text around the JSON.

**`generateTestPlan(domStructure, options)`**

- **In:** `domStructure` from scanner, `options`: `{ model, maxRetries }` (default model e.g. `gpt-4o-mini`).
- **Out:** Parsed JSON — expected to be an **array of scenarios**, each `{ name, steps }`, each step with `action` and the right fields.

**Flow inside:**

1. `buildScanPrompt(domStructure)` → user prompt.
2. OpenAI client from `createClient()`.
3. Loop up to `maxRetries`: `client.chat.completions.create` with system message “output only valid JSON” and user message = prompt.
4. Take `completion.choices[0].message.content` → `parseJsonFromResponse(content)` → return that as the test plan.

So: **DOM structure → prompt (via promptBuilder) → OpenAI → test plan (array of scenarios).**

---

### 3.6 `executor/playwrightRunner.js` — Test executor

**Role:** Take the test plan and run each scenario in Playwright (one page, sequential scenarios). Resolve locators, run actions and assertions, collect results and optionally tracing/screenshots.

**Exports:** `runTestPlan`, `executeStep`, `runScenario`, `resolveLocator`.

**`resolveLocator(page, step)`**

- **In:** Playwright `page`, and a `step` object (may have `selector` or `locatorType` + `locatorArgs`).
- **Out:** Playwright locator or null.
- Uses `page.getByRole`, `getByLabel`, `getByPlaceholder`, `getByText`, `getByAltText`, `getByTestId`, or `page.locator(selector)`.

**`executeStep(page, step, baseUrl, context)`**

- **In:** `page`, one `step` (action + selector/locator + value/assertion/expected/etc.), `baseUrl`, `context`: `{ timeout }`.
- **Out:** `{ success, error?, screenshot? }`.
- Implements each **action** by calling the right Playwright API (e.g. `goto`, `click`, `fill`, `check`, `assert` via `runAssertion`). For `assert`, calls `runAssertion`.

**`runAssertion(page, step, timeout)`**

- **In:** `page`, same `step` (with `assertion`, `expected`, and optionally selector/locator).
- **Out:** `{ success, error? }`.
- Handles all assertion types (url_contains, visible, text_contains, has_value, checked, etc.) using `page.url()`, `loc.isVisible()`, `loc.textContent()`, `loc.inputValue()`, `loc.isChecked()`, etc.

**`runScenario(page, scenario, baseUrl, options)`**

- **In:** `page`, one `scenario` (`{ name, steps }`), `baseUrl`, `options`: `{ timeout, retries, screenshotDir }`.
- **Out:** One result object: `{ name, steps: [...], status: 'passed'|'failed', durationMs, error, screenshot? }`.
- Flow: goto baseUrl, wait for networkidle, loop over `scenario.steps`, for each step retry up to `retries` calling `executeStep`, push step result; on first failure set status and break; on failure take full-page screenshot to `screenshotDir`.

**`runTestPlan(baseUrl, testPlan, options)`**

- **In:** `baseUrl`, `testPlan` (array of scenarios or object with `scenarios`/`tests`), `options`: `{ settings }`.
- **Out:** Array of scenario results, with **`traceFile`** attached on the array (e.g. `allResults.traceFile`) if tracing is enabled.
- Flow: create reports dirs (screenshots, traces), launch browser, create context (optionally with video), start tracing if `settings.tracing` is not false, create one page, set default timeout, loop scenarios and call `runScenario` for each, stop tracing and save trace zip, close context and browser. Returns the array of results and sets `results.traceFile` to the trace path.

So: **baseUrl + test plan + settings → Playwright run → array of scenario results + traceFile.**

---

### 3.7 `reporter/testReporter.js` — Report generator

**Role:** Turn the **results** array (and optional `traceFile`) into files and console output. Does not run tests or open browsers.

**Exports:** `writeJsonReport`, `writeHtmlReport`, `printCliReport`, `reportsDir`, `ensureReportsDir`.

**`ensureReportsDir()`**  
Creates `reports/` if needed; returns that path.

**`writeJsonReport(results, url)`**

- Builds payload: `url`, `timestamp`, `summary` (total, passed, failed, totalDurationMs), `traceFile`, `results`.
- Writes to `reports/report_<timestamp>.json`.
- Returns the file path.

**`writeHtmlReport(results, url)`**

- Computes passed/failed/totalDuration/passRate.
- For each result: status badge, scenario name, duration, error (if any), list of steps (with pass/fail, selector, error), optional failure screenshot in `<details>`.
- Adds trace file path and `npx playwright show-trace ...` if `results.traceFile` exists.
- Writes one HTML file to `reports/report_<timestamp>.html`, with inline CSS.
- Returns the file path.

**`printCliReport(results, url)`**

- Logs a short summary (URL, total/passed/failed, duration).
- For each scenario: name, status, duration; then each step with action, selector, and error if failed.
- No file output.

**Data:** All three use the same **results** (array of scenario objects) and **url** (string). `results` may have a property `traceFile` on the array; the reporter reads it for JSON and HTML.

---

### 3.8 `package.json` — Dependencies and scripts

**Role:** Declare entry (`main.js`), scripts, and dependencies.

**Scripts:**

- `npm start` / `npm test` → `node main.js` (you still pass URL as argument).

**Dependencies:**

- `dotenv` — load `.env` (e.g. `OPENAI_API_KEY`) in `main.js`.
- `openai` — used in `aiPlanner.js` for the API client.
- `playwright` — used in `domScanner.js` and `playwrightRunner.js`.

---

## 4. Data shapes (summary)

| Stage        | Variable       | Shape |
|-------------|----------------|--------|
| After scan  | `domStructure` | `{ url, title, inputs[], selects[], buttons[], links[], forms[], headings[], navItems[], images[], meta }` |
| After AI    | `testPlan`     | `[{ name, steps: [{ action, selector?, locatorType?, locatorArgs?, value?, assertion?, expected?, ... }] }]` |
| After run   | `results`      | `[{ name, steps: [{ stepIndex, action, selector?, success, error? }], status, durationMs, error?, screenshot? }]`; array may have `traceFile` |

---

## 5. Quick reference: who calls whom

| Caller     | Callee / dependency |
|-----------|----------------------|
| main.js   | config/settings.json, domScanner.scanPage, aiPlanner.generateTestPlan, playwrightRunner.runTestPlan, testReporter.* |
| aiPlanner | promptBuilder.buildScanPrompt, OpenAI API |
| playwrightRunner | Playwright (chromium, page, locators, tracing) — no other project modules |
| domScanner | Playwright (chromium, page.evaluate) — no other project modules |
| testReporter | fs, path — no other project modules |
| promptBuilder | No dependencies (pure function) |

This is the full picture of the first codebase: all files, their roles, and how they connect end to end.
