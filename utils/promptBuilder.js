function buildTestDataSection(profile, pageUrl) {
  if (!profile) return '';

  const lines = [];
  const globalData = profile.globalData || {};
  const pageData = profile.pageData || {};

  const globalKeys = Object.keys(globalData);
  const matchingPages = Object.entries(pageData).filter(([pattern]) => {
    return pageUrl.includes(pattern) || pageUrl.endsWith(pattern);
  });

  if (globalKeys.length === 0 && matchingPages.length === 0) return '';

  lines.push('');
  lines.push('USER-PROVIDED TEST DATA:');
  lines.push('Use these EXACT values when generating test steps. Do NOT invent your own values for these fields.');

  if (globalKeys.length > 0) {
    lines.push('');
    lines.push('  Global data (use on any page):');
    for (const [key, val] of Object.entries(globalData)) {
      lines.push(`    ${key}: "${val}"`);
    }
  }

  for (const [pattern, fields] of matchingPages) {
    lines.push('');
    lines.push(`  Page-specific data (for "${pattern}"):`);
    for (const [key, val] of Object.entries(fields)) {
      lines.push(`    ${key}: "${val}"`);
    }
  }

  lines.push('');
  lines.push('  When filling forms, use the test data above for matching fields.');
  lines.push('  Match by field name, label, placeholder, or type (e.g. "email" data → email input).');

  return lines.join('\n');
}

function buildPageContext(meta) {
  if (!meta) return '';
  const parts = [];
  if (meta.formCount > 0) parts.push(`${meta.formCount} form(s)`);
  if (meta.inputCount > 0) parts.push(`${meta.inputCount} input(s)`);
  if (meta.buttonCount > 0) parts.push(`${meta.buttonCount} button(s)`);
  if (meta.linkCount > 0) parts.push(`${meta.linkCount} link(s)`);
  if (meta.headingCount > 0) parts.push(`${meta.headingCount} heading(s)`);
  return parts.length > 0 ? `PAGE ELEMENTS SUMMARY: ${parts.join(', ')}` : '';
}

function buildScanPrompt(pageData, profile) {
  const { url, title, html, meta } = pageData;
  const testDataSection = buildTestDataSection(profile, url);
  const contextSummary = buildPageContext(meta);

  return `You are an expert QA automation engineer. Your job is to analyze a real webpage and produce Playwright-compatible test scenarios that a QA team would actually write.

═══════════════════════════════════════
PAGE UNDER TEST
═══════════════════════════════════════
URL: ${url}
TITLE: ${title || '(none)'}
${contextSummary}
${testDataSection}

PAGE HTML:
${html}

═══════════════════════════════════════
YOUR TASK
═══════════════════════════════════════

STEP 1 — UNDERSTAND THE PAGE
Before generating anything, reason about:
  • What is this page's purpose? (login, registration, dashboard, listing, detail, settings, checkout, search, landing, error page, etc.)
  • What are the critical user flows on this page?
  • What interactive elements exist? (forms, buttons, links, dropdowns, modals, tabs, toggles)
  • What could go wrong for a real user?

STEP 2 — APPLY QA TESTING STRATEGY
Generate test scenarios following these industry-standard categories (include whichever are relevant to the page):

  FUNCTIONAL / HAPPY PATH
    Test the primary intended user flow end-to-end (e.g. fill form → submit → verify success).

  NEGATIVE / ERROR HANDLING
    Test invalid inputs, empty required fields, wrong formats — verify the page shows appropriate errors or prevents submission.

  BOUNDARY / EDGE CASES
    Test limits where applicable — very long text, special characters, min/max values.

  UI STATE VERIFICATION
    Verify the page renders correctly — headings, key text, important elements visible, correct initial states (enabled/disabled, checked/unchecked).

  NAVIGATION / LINKS
    Test that key navigation links and buttons lead to the correct destinations.

Skip categories that don't apply. A simple static page needs fewer scenarios than a complex form.

STEP 3 — OUTPUT FORMAT
Return a JSON array of scenario objects. Each scenario:
{
  "name": "descriptive scenario name",
  "steps": [ ...step objects... ]
}

═══════════════════════════════════════
STEP SCHEMA REFERENCE
═══════════════════════════════════════

Every step object MUST have an "action" field. Below are all supported actions and their fields.

LOCATOR — how to target elements (pick the best fit from the HTML):
  Preferred: locatorType + locatorArgs
    locatorType: "role" | "label" | "placeholder" | "text" | "altText" | "testId"

    Examples:
      locatorType:"role", locatorArgs:{ role:"button", options:{ name:"Submit" } }
      locatorType:"role", locatorArgs:{ role:"link", options:{ name:"Sign up" } }
      locatorType:"role", locatorArgs:{ role:"textbox", options:{ name:"Email" } }
      locatorType:"label", locatorArgs:{ text:"Password" }
      locatorType:"placeholder", locatorArgs:{ text:"Enter email" }
      locatorType:"text", locatorArgs:{ text:"Welcome", options:{ exact:true } }
      locatorType:"testId", locatorArgs:{ text:"submit-btn" }

  Fallback: selector (CSS selector string)
      selector: "#email", "input[name=password]", "button.primary", "[data-testid=login]"

  Choose the locator that best matches what the HTML actually provides.
  If an element has a clear label or accessible name, use role/label/placeholder.
  If it only has an id/name/class, use a CSS selector.
  Adapt to whatever the page gives you.

ACTIONS:
  goto          — { action:"goto", url:"..." }
  click         — { action:"click", <locator> }
  dblclick      — { action:"dblclick", <locator> }
  fill          — { action:"fill", <locator>, value:"..." }
  type          — { action:"type", <locator>, value:"...", delay:50 }
  clear         — { action:"clear", <locator> }
  select        — { action:"select", <locator>, value:"..." }
  check         — { action:"check", <locator>, force:true }
  uncheck       — { action:"uncheck", <locator>, force:true }
  hover         — { action:"hover", <locator> }
  focus         — { action:"focus", <locator> }
  press         — { action:"press", key:"Enter" }  (optionally with <locator>)
  scrollIntoView — { action:"scrollIntoView", <locator> }
  upload        — { action:"upload", <locator>, files:["path"] }
  screenshot    — { action:"screenshot" }
  wait          — { action:"wait", waitFor:"networkidle"|"load"|"url"|"selector", expected:"...", duration:1000 }

ASSERT:
  { action:"assert", assertion:"<type>", expected:"<value>", <locator if needed> }

  Page-level (NO locator):
    url_contains, url_equals, url_matches, title_contains, page_contains_text

  Element-level (REQUIRES locator):
    visible, hidden, text_contains, has_value, checked, unchecked, enabled, disabled, count

═══════════════════════════════════════
QUALITY RULES
═══════════════════════════════════════

ACCURACY
  • Only reference text, labels, names, placeholders, ids, attributes that ACTUALLY exist in the HTML above.
  • Never invent selectors, text content, or URLs that aren't in the HTML.
  • Read element attributes carefully — use the exact text as it appears (case-sensitive).

SMART LOCATORS
  • Pick the most resilient locator for each element. Prefer accessible locators (role, label, placeholder) over brittle CSS selectors.
  • For buttons: prefer role:"button" with the visible button text as name.
  • For links: prefer role:"link" with the link text as name.
  • For inputs with labels: prefer locatorType:"label". With placeholders: prefer "placeholder".
  • For inputs without labels/placeholders: use CSS selector (name, id, or type attribute).
  • For custom/styled checkboxes (hidden input inside a label): use click on the label text instead of check on the hidden input.
  • Never use locatorType:"text" to click buttons — that's fragile. Use role:"button" instead.

REALISTIC TEST DATA
  • Use plausible, realistic values that match the field's purpose (valid email for email fields, strong password for password fields, real-looking names, etc.).
  • If user-provided test data is given above, use those exact values instead.

SCENARIO DESIGN
  • Each scenario should test ONE logical flow — keep them focused and independent.
  • Start each scenario from the page's current URL (do NOT add a goto unless navigating away).
  • After form submissions that cause navigation or async operations, add a wait step (waitFor:"networkidle" or waitFor:"url") before assertions.
  • End every scenario with at least one meaningful assertion that verifies the expected outcome.
  • Name scenarios clearly: "Login with valid credentials", "Submit empty form shows errors", etc.

ADAPTABILITY
  • The number of scenarios should match the page complexity. A simple page with one button might need 2-3 scenarios. A complex form might need 5-8.
  • Don't generate tests for elements that are clearly decorative (icons, spacers, loaders).
  • If the page appears to be an error page, empty state, or loading state, generate minimal verification tests.

OUTPUT: Return ONLY a valid JSON array. No markdown, no explanation, no wrapping.`;
}

module.exports = { buildScanPrompt, buildTestDataSection };
