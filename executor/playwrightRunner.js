const { chromium, expect: pwExpect } = require('playwright');
const path = require('path');
const fs = require('fs');

const DEFAULT_TIMEOUT = 15000;
const DEFAULT_RETRIES = 2;

function resolveLocator(page, step) {
  const { selector, locatorType, locatorArgs } = step;

  if (locatorType) {
    switch (locatorType) {
      case 'role':
        return page.getByRole(locatorArgs.role, locatorArgs.options || {});
      case 'label':
        return page.getByLabel(locatorArgs.text, locatorArgs.options || {});
      case 'placeholder':
        return page.getByPlaceholder(locatorArgs.text, locatorArgs.options || {});
      case 'text':
        return page.getByText(locatorArgs.text, locatorArgs.options || {});
      case 'altText':
        return page.getByAltText(locatorArgs.text, locatorArgs.options || {});
      case 'testId':
        return page.getByTestId(locatorArgs.text);
    }
  }

  if (selector) return page.locator(selector);
  return null;
}

function getLocatorOrThrow(page, step, actionName) {
  const loc = resolveLocator(page, step);
  if (!loc) throw new Error(`${actionName} requires a selector or locator`);
  return loc;
}

async function executeStep(page, step, baseUrl, context = {}) {
  const { action, value, assertion, expected } = step;
  const timeout = context.timeout ?? DEFAULT_TIMEOUT;

  switch (action) {
    case 'goto': {
      const url = step.url || baseUrl;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
      return { success: true };
    }

    case 'wait': {
      if (step.waitFor === 'url') {
        await page.waitForURL(step.expected, { timeout });
      } else if (step.waitFor === 'networkidle') {
        await page.waitForLoadState('networkidle', { timeout });
      } else if (step.waitFor === 'load') {
        await page.waitForLoadState('load', { timeout });
      } else if (step.waitFor === 'selector') {
        const loc = resolveLocator(page, step);
        if (loc) await loc.waitFor({ state: 'visible', timeout });
      } else {
        await page.waitForTimeout(step.duration ?? 1000);
      }
      return { success: true };
    }

    case 'click': {
      const loc = getLocatorOrThrow(page, step, 'Click');
      await loc.click({ force: step.force || false, timeout });
      return { success: true };
    }

    case 'dblclick': {
      const loc = getLocatorOrThrow(page, step, 'Dblclick');
      await loc.dblclick({ force: step.force || false, timeout });
      return { success: true };
    }

    case 'fill': {
      const loc = getLocatorOrThrow(page, step, 'Fill');
      await loc.fill(value ?? '', { timeout });
      return { success: true };
    }

    case 'type': {
      const loc = getLocatorOrThrow(page, step, 'Type');
      await loc.pressSequentially(value ?? '', { delay: step.delay || 50, timeout });
      return { success: true };
    }

    case 'clear': {
      const loc = getLocatorOrThrow(page, step, 'Clear');
      await loc.clear({ timeout });
      return { success: true };
    }

    case 'select': {
      const loc = getLocatorOrThrow(page, step, 'Select');
      await loc.selectOption(value ?? '', { timeout });
      return { success: true };
    }

    case 'check': {
      const loc = getLocatorOrThrow(page, step, 'Check');
      try {
        await loc.check({ force: step.force !== false, timeout });
      } catch (err) {
        const isLabel = await loc.evaluate(el => {
          return el.getAttribute('aria-hidden') === 'true' || el.type === 'checkbox';
        }).catch(() => true);
        if (isLabel) {
          const labelLoc = page.locator(`label:has(${step.selector || 'input[type=checkbox]'})`);
          const labelExists = await labelLoc.count() > 0;
          if (labelExists) {
            await labelLoc.click({ force: true, timeout });
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }
      return { success: true };
    }

    case 'uncheck': {
      const loc = getLocatorOrThrow(page, step, 'Uncheck');
      try {
        await loc.uncheck({ force: step.force !== false, timeout });
      } catch (err) {
        const labelLoc = page.locator(`label:has(${step.selector || 'input[type=checkbox]'})`);
        const labelExists = await labelLoc.count() > 0;
        if (labelExists) {
          await labelLoc.click({ force: true, timeout });
        } else {
          throw err;
        }
      }
      return { success: true };
    }

    case 'hover': {
      const loc = getLocatorOrThrow(page, step, 'Hover');
      await loc.hover({ force: step.force || false, timeout });
      return { success: true };
    }

    case 'focus': {
      const loc = getLocatorOrThrow(page, step, 'Focus');
      await loc.focus({ timeout });
      return { success: true };
    }

    case 'press': {
      const loc = resolveLocator(page, step);
      if (loc) {
        await loc.press(step.key, { timeout });
      } else {
        await page.keyboard.press(step.key);
      }
      return { success: true };
    }

    case 'upload': {
      const loc = getLocatorOrThrow(page, step, 'Upload');
      const files = Array.isArray(step.files) ? step.files : [step.files];
      await loc.setInputFiles(files, { timeout });
      return { success: true };
    }

    case 'screenshot': {
      const screenshotPath = step.path || path.join(process.cwd(), 'reports', 'screenshots', `step_${Date.now()}.png`);
      if (step.selector || step.locatorType) {
        const loc = getLocatorOrThrow(page, step, 'Screenshot');
        await loc.screenshot({ path: screenshotPath });
      } else {
        await page.screenshot({ path: screenshotPath, fullPage: step.fullPage || false });
      }
      return { success: true, screenshot: screenshotPath };
    }

    case 'scrollIntoView': {
      const loc = getLocatorOrThrow(page, step, 'ScrollIntoView');
      await loc.scrollIntoViewIfNeeded({ timeout });
      return { success: true };
    }

    case 'assert': {
      return await runAssertion(page, step, timeout);
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

async function runAssertion(page, step, timeout) {
  const { assertion, expected, selector, locatorType } = step;
  const loc = resolveLocator(page, step);

  switch (assertion) {
    case 'url_contains': {
      const url = page.url();
      const pass = url.includes(expected);
      return { success: pass, error: pass ? null : `URL "${url}" does not contain "${expected}"` };
    }

    case 'url_equals': {
      const url = page.url();
      const pass = url === expected;
      return { success: pass, error: pass ? null : `URL "${url}" does not equal "${expected}"` };
    }

    case 'url_matches': {
      const url = page.url();
      const pass = new RegExp(expected).test(url);
      return { success: pass, error: pass ? null : `URL "${url}" does not match "${expected}"` };
    }

    case 'visible': {
      if (!loc) return { success: false, error: 'Assert visible requires a selector' };
      const visible = await loc.isVisible().catch(() => false);
      return { success: visible, error: visible ? null : `Element not visible: ${selector || locatorType}` };
    }

    case 'hidden': {
      if (!loc) return { success: false, error: 'Assert hidden requires a selector' };
      const hidden = await loc.isHidden().catch(() => true);
      return { success: hidden, error: hidden ? null : `Element not hidden: ${selector || locatorType}` };
    }

    case 'text_contains': {
      if (!loc) return { success: false, error: 'Assert text_contains requires a selector' };
      const text = await loc.textContent({ timeout }).catch(() => '');
      const pass = text && text.includes(expected);
      return { success: !!pass, error: pass ? null : `Text "${text}" does not contain "${expected}"` };
    }

    case 'has_value': {
      if (!loc) return { success: false, error: 'Assert has_value requires a selector' };
      const val = await loc.inputValue({ timeout }).catch(() => '');
      const pass = val === expected;
      return { success: pass, error: pass ? null : `Value "${val}" does not equal "${expected}"` };
    }

    case 'checked': {
      if (!loc) return { success: false, error: 'Assert checked requires a selector' };
      const checked = await loc.isChecked().catch(() => false);
      return { success: checked, error: checked ? null : `Element not checked` };
    }

    case 'unchecked': {
      if (!loc) return { success: false, error: 'Assert unchecked requires a selector' };
      const checked = await loc.isChecked().catch(() => true);
      return { success: !checked, error: !checked ? null : `Element is checked` };
    }

    case 'enabled': {
      if (!loc) return { success: false, error: 'Assert enabled requires a selector' };
      const enabled = await loc.isEnabled().catch(() => false);
      return { success: enabled, error: enabled ? null : `Element not enabled` };
    }

    case 'disabled': {
      if (!loc) return { success: false, error: 'Assert disabled requires a selector' };
      const disabled = await loc.isDisabled().catch(() => false);
      return { success: disabled, error: disabled ? null : `Element not disabled` };
    }

    case 'count': {
      if (!loc) return { success: false, error: 'Assert count requires a selector' };
      const count = await loc.count();
      const pass = count === Number(expected);
      return { success: pass, error: pass ? null : `Count is ${count}, expected ${expected}` };
    }

    case 'title_contains': {
      const title = await page.title();
      const pass = title.includes(expected);
      return { success: pass, error: pass ? null : `Title "${title}" does not contain "${expected}"` };
    }

    case 'page_contains_text': {
      const body = await page.locator('body').textContent().catch(() => '');
      const pass = body && body.includes(expected);
      return { success: !!pass, error: pass ? null : `Page does not contain text "${expected}"` };
    }

    default:
      return { success: false, error: `Unknown assertion: ${assertion}` };
  }
}

async function runScenario(page, scenario, baseUrl, options = {}) {
  const { timeout = DEFAULT_TIMEOUT, retries = DEFAULT_RETRIES, screenshotDir, logger } = options;
  const result = {
    name: scenario.name,
    steps: [],
    status: 'passed',
    durationMs: 0,
    error: null,
    screenshot: null
  };
  const start = Date.now();

  try {
    if (logger) logger.logExecScenarioStart(scenario.name, scenario.steps.length);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];
      const stepResult = {
        stepIndex: i,
        action: step.action,
        selector: step.selector || (step.locatorType ? `${step.locatorType}:${JSON.stringify(step.locatorArgs)}` : null),
        success: false,
        error: null
      };

      let lastError;
      for (let r = 0; r <= retries; r++) {
        try {
          const out = await executeStep(page, step, baseUrl, { timeout });
          stepResult.success = out.success;
          stepResult.error = out.error || null;
          if (out.screenshot) stepResult.screenshot = out.screenshot;
          if (logger) logger.logExecStep(scenario.name, i, step, stepResult.success || stepResult.error);
          break;
        } catch (err) {
          lastError = err;
          stepResult.error = err.message;
          if (logger) logger.logExecStep(scenario.name, i, step, err.message);
          if (r < retries) {
            await page.waitForTimeout(500);
          }
        }
      }

      result.steps.push(stepResult);
      if (!stepResult.success) {
        result.status = 'failed';
        result.error = stepResult.error || lastError?.message;
        break;
      }
    }

    if (screenshotDir && result.status === 'failed') {
      const safeName = scenario.name.replace(/[^a-z0-9]/gi, '_').slice(0, 50);
      const file = path.join(screenshotDir, `failure_${safeName}_${Date.now()}.png`);
      await page.screenshot({ path: file, fullPage: true }).catch(() => {});
      result.screenshot = file;
    }
  } catch (err) {
    result.status = 'failed';
    result.error = err.message;
  }

  result.durationMs = Date.now() - start;
  if (logger) logger.logExecScenarioEnd(scenario.name, result.status, result.durationMs);
  return result;
}

async function runTestPlan(baseUrl, testPlan, options = {}) {
  const settings = options.settings || {};
  const logger = options.logger;
  const timeout = settings.timeout || DEFAULT_TIMEOUT;
  const retries = settings.retries ?? DEFAULT_RETRIES;
  const headless = settings.headless !== false;
  const reportsDir = path.resolve(process.cwd(), 'reports');
  const screenshotDir = path.join(reportsDir, 'screenshots');
  const tracesDir = path.join(reportsDir, 'traces');

  [screenshotDir, tracesDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  const scenarios = Array.isArray(testPlan) ? testPlan : (testPlan.scenarios || testPlan.tests || []);
  if (logger) logger.logStep('executor', `Running ${scenarios.length} scenario(s) on baseUrl`, baseUrl);

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: settings.viewport || { width: 1280, height: 720 },
    ...(settings.recordVideo ? { recordVideo: { dir: path.join(reportsDir, 'videos') } } : {}),
    ...(options.storageState ? { storageState: options.storageState } : {})
  });

  if (settings.tracing !== false) {
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  }

  const allResults = [];

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(timeout);

    for (const scenario of scenarios) {
      const scenarioResult = await runScenario(page, scenario, baseUrl, {
        timeout,
        retries,
        screenshotDir,
        logger
      });
      allResults.push(scenarioResult);
    }

    if (settings.tracing !== false) {
      const traceFile = path.join(tracesDir, `trace_${Date.now()}.zip`);
      await context.tracing.stop({ path: traceFile });
      allResults.traceFile = traceFile;
    }

    await context.close();
    await browser.close();
  } catch (err) {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    throw err;
  }

  return allResults;
}

module.exports = { runTestPlan, executeStep, runScenario, resolveLocator };
