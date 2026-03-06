const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const STORAGE_DIR = path.resolve(__dirname, '..', '.auth');

async function authenticate(profile, options = {}) {
  const { timeout = 30000, headless = true, viewport, logger } = options;
  const auth = profile.auth;

  if (!auth || !auth.loginUrl || !auth.fields || Object.keys(auth.fields).length === 0) {
    if (logger) logger.log('auth', 'No auth config in profile, skipping login');
    return null;
  }

  if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });

  const storageFile = path.join(STORAGE_DIR, `${sanitizeName(profile.name)}.json`);

  if (logger) logger.log('auth', `Authenticating as "${profile.name}" at ${auth.loginUrl}`);

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ viewport: viewport || { width: 1280, height: 720 } });

  try {
    const page = await context.newPage();
    await page.goto(auth.loginUrl, { waitUntil: 'domcontentloaded', timeout });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});

    for (const [fieldHint, value] of Object.entries(auth.fields)) {
      const filled = await tryFillField(page, fieldHint, value, timeout);
      if (logger) logger.log('auth', `Fill "${fieldHint}" → ${filled ? 'OK' : 'SKIP'}`);
    }

    if (auth.submitSelector) {
      await page.locator(auth.submitSelector).click({ timeout });
    } else {
      const submitBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Sign in"), button:has-text("Log in")').first();
      await submitBtn.click({ timeout });
    }

    if (auth.successCheck) {
      const { type, value } = auth.successCheck;
      if (type === 'url_contains') {
        await page.waitForURL(`**/*${value}*`, { timeout });
      } else if (type === 'url_equals') {
        await page.waitForURL(value, { timeout });
      } else if (type === 'element_visible') {
        await page.locator(value).waitFor({ state: 'visible', timeout });
      } else {
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      }
    } else {
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1000);
    }

    await context.storageState({ path: storageFile });

    if (logger) logger.log('auth', `Auth successful, storage saved to ${storageFile}`);
    await browser.close();
    return storageFile;

  } catch (err) {
    await browser.close();
    if (logger) logger.log('auth', `Auth failed: ${err.message}`);
    throw new Error(`Authentication failed: ${err.message}`);
  }
}

async function tryFillField(page, fieldHint, value, timeout) {
  const strategies = [
    () => page.getByLabel(fieldHint, { exact: false }),
    () => page.getByPlaceholder(fieldHint, { exact: false }),
    () => page.locator(`input[name="${fieldHint}"]`),
    () => page.locator(`input[id="${fieldHint}"]`),
    () => page.locator(`input[type="${fieldHint}"]`),
  ];

  for (const getLoc of strategies) {
    try {
      const loc = getLoc();
      if (await loc.count() > 0) {
        await loc.first().fill(value, { timeout: 5000 });
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

function sanitizeName(name) {
  return (name || 'default').replace(/[^a-z0-9_-]/gi, '_').toLowerCase().slice(0, 40);
}

module.exports = { authenticate, STORAGE_DIR };
