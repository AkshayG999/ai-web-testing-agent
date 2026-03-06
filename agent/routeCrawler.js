const { chromium } = require('playwright');
const { URL } = require('url');

function normalizeUrl(href, baseOrigin) {
  try {
    const resolved = new URL(href, baseOrigin);
    if (resolved.origin !== baseOrigin) return null;
    resolved.hash = '';
    resolved.search = '';
    let pathname = resolved.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    return `${resolved.origin}${pathname}`;
  } catch {
    return null;
  }
}

const SKIP_EXTENSIONS = /\.(png|jpg|jpeg|gif|svg|ico|css|js|woff|woff2|ttf|eot|pdf|zip|mp4|mp3|json|xml)$/i;

async function discoverRoutes(baseUrl, options = {}) {
  const { maxPages = 20, maxDepth = 3, timeout = 30000, headless = true, viewport, logger, storageState } = options;
  const origin = new URL(baseUrl).origin;
  const visited = new Set();
  const routes = [];
  const queue = [{ url: normalizeUrl(baseUrl, origin), depth: 0 }];

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: viewport || { width: 1280, height: 720 },
    ...(storageState ? { storageState } : {})
  });

  try {
    const page = await context.newPage();

    while (queue.length > 0 && visited.size < maxPages) {
      const { url, depth } = queue.shift();
      if (!url || visited.has(url) || depth > maxDepth) continue;
      if (SKIP_EXTENSIONS.test(url)) continue;
      visited.add(url);

      if (logger) logger.logStep('crawl', `[${visited.size}/${maxPages}] depth ${depth}`, url);

      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});

        const finalUrl = normalizeUrl(page.url(), origin);
        if (finalUrl && finalUrl !== url && !visited.has(finalUrl)) {
          visited.add(finalUrl);
        }

        const statusCode = response?.status() || 0;
        const title = await page.title().catch(() => '');

        const pageLinks = await page.evaluate((orig) => {
          const hrefs = [];
          document.querySelectorAll('a[href]').forEach(a => {
            const href = a.getAttribute('href');
            if (href && !href.startsWith('javascript:') && !href.startsWith('mailto:') && href !== '#') {
              hrefs.push(href);
            }
          });
          return hrefs;
        }, origin);

        const childLinks = pageLinks
          .map(h => normalizeUrl(h, origin))
          .filter(h => h && !visited.has(h) && !SKIP_EXTENSIONS.test(h));

        const uniqueChildren = [...new Set(childLinks)];
        for (const child of uniqueChildren) {
          if (!visited.has(child) && queue.length + visited.size < maxPages * 2) {
            queue.push({ url: child, depth: depth + 1 });
          }
        }

        routes.push({
          url: finalUrl || url,
          title,
          statusCode,
          depth,
          linkCount: uniqueChildren.length
        });
      } catch (err) {
        if (logger) logger.logStep('crawl', `  SKIP (${err.message.slice(0, 80)})`);
        routes.push({ url, title: '', statusCode: 0, depth, error: err.message });
      }
    }

    await browser.close();
  } catch (err) {
    await browser.close();
    throw err;
  }

  const testableRoutes = routes.filter(r => r.statusCode >= 200 && r.statusCode < 400 && !r.error);
  if (logger) {
    logger.logStep('crawl', `Crawl complete: ${routes.length} pages visited, ${testableRoutes.length} testable`);
  }

  return { allRoutes: routes, testableRoutes };
}

module.exports = { discoverRoutes, normalizeUrl };
