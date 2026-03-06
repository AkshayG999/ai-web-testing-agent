const { chromium } = require('playwright');

const MAX_HTML_LENGTH = 80000;

function cleanHtml(raw) {
  let html = raw;

  html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<style[\s\S]*?<\/style>/gi, '');
  html = html.replace(/<svg[\s\S]*?<\/svg>/gi, '');
  html = html.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  html = html.replace(/<!--[\s\S]*?-->/g, '');

  html = html.replace(/<link[^>]*>/gi, '');
  html = html.replace(/<meta[^>]*>/gi, '');

  html = html.replace(/\s(style|data-[\w-]+|class)="[^"]*"/gi, '');
  html = html.replace(/\s(style|data-[\w-]+|class)='[^']*'/gi, '');

  html = html.replace(/\n\s*\n/g, '\n');
  html = html.replace(/[ \t]+/g, ' ');
  html = html.replace(/>\s+</g, '>\n<');

  html = html.trim();

  if (html.length > MAX_HTML_LENGTH) {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bodyMatch) {
      html = bodyMatch[1].trim();
    }
    if (html.length > MAX_HTML_LENGTH) {
      html = html.slice(0, MAX_HTML_LENGTH) + '\n<!-- ... truncated -->';
    }
  }

  return html;
}

async function scanPage(url, options = {}) {
  const { timeout = 30000, headless = true, logger, storageState } = options;
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: options.viewport || { width: 1280, height: 720 },
    ...(storageState ? { storageState } : {})
  });

  try {
    if (logger) logger.logStep('dom', 'Loading page', url);
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    if (logger) logger.logStep('dom', 'Extracting page HTML...');

    const rawHtml = await page.content();
    const pageUrl = page.url();
    const pageTitle = await page.title();

    const meta = await page.evaluate(() => {
      const count = (sel) => document.querySelectorAll(sel).length;
      return {
        inputCount: count('input, textarea, select'),
        buttonCount: count('button, [role="button"], input[type="submit"]'),
        linkCount: count('a[href]'),
        formCount: count('form'),
        headingCount: count('h1, h2, h3')
      };
    });

    const html = cleanHtml(rawHtml);

    if (logger) logger.logStep('dom', `HTML extracted: ${html.length} chars (raw ${rawHtml.length})`);
    await browser.close();

    return {
      url: pageUrl,
      title: pageTitle,
      html,
      meta
    };
  } catch (err) {
    await browser.close();
    throw err;
  }
}

module.exports = { scanPage, cleanHtml };
