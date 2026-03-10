# AI Web Testing Agent

AI-powered web testing: scan a site, generate test scenarios with an LLM, run them with Playwright, and get reports.

## Flow

```
URL → Website Scanner → AI Test Planner → Playwright Executor → Test Reporter
```

## Setup

```bash
cd ai-web-tester
npm install
npx playwright install chromium
```

Create `.env` from the example and set your OpenAI API key:

```bash
cp .env.example .env
# Edit .env and set OPENAI_API_KEY=sk-...
```

## Usage

**CLI**

```bash
node main.js https://example.com
```

**Web dashboard**

Run the API and the React UI in **two separate terminals**.

| Terminal | Command | URL |
|----------|---------|-----|
| 1 (API) | `npm run web` | http://localhost:3000 |
| 2 (UI) | `cd web/dashboard && npm run dev` | http://localhost:5173 |

Use the UI at http://localhost:5173. See `web/dashboard/README.md` for details.

---

Expected CLI output:

```
Scanning website...
Generating tests...
Running Playwright automation...

--- AI Web Tester Results ---
URL: https://example.com
Total: 3 | Passed: 2 | Failed: 1

✓ Login test: PASSED (2.34s)
✓ Navigation test: PASSED (1.12s)
✗ Register test: FAILED (3.01s)
  Error: Selector not found: ...
```

Reports are written to `reports/`:

- `report_<timestamp>.html` – view in browser
- `report_<timestamp>.json` – machine-readable results
- `reports/screenshots/` – failure screenshots

## Configuration

Edit `config/settings.json`:

- `timeout` – step timeout (ms)
- `retries` – retries per step
- `headless` – run browser headless
- `viewport` – `{ width, height }`
- `reportFormats` – `["html", "json", "cli"]`

## Logging

The runner logs each phase with clear tags so you can see what comes from the URL, DOM, AI, and executor:

- **`[URL]`** – Target URL and config
- **`[DOM]`** – Scan phase: page load, DOM extraction, url/title/counts (inputs, buttons, links, forms)
- **`[AI]`** – Request (model, prompt length), response (char count, scenario names), full test plan (scenario names + step count)
- **`[EXEC]`** – Base URL, each scenario start/end, every step (action, selector/locator, value/expected, outcome)
- **`[REPORT]`** – Report file paths and summary

**Verbose mode** – set `LOG_LEVEL=verbose` or `DEBUG=1` to also log:

- DOM inputs/buttons sample
- Each step of the AI-generated test plan
- Prompt preview (first 600 chars)

```bash
LOG_LEVEL=verbose node main.js https://example.com
# or
DEBUG=1 node main.js https://example.com
```

## Requirements

- Node.js 18+
- OpenAI API key (GPT-4 or gpt-4o-mini)
- Playwright (Chromium)

## Project structure

```
ai-web-tester/
├── agent/
│   ├── aiPlanner.js    # LLM test plan generation
│   └── domScanner.js   # Playwright DOM extraction
├── executor/
│   └── playwrightRunner.js
├── reporter/
│   └── testReporter.js
├── utils/
│   ├── logger.js        # Tagged logging (URL, DOM, AI, EXEC, REPORT)
│   └── promptBuilder.js
├── config/
│   └── settings.json
├── reports/
├── main.js
└── package.json
```

## Supported actions

- `goto` – navigate to URL
- `click` – click element
- `fill` – type into input
- `select` – select option
- `wait` – wait duration
- `assert` – url_contains, visible, text_contains
