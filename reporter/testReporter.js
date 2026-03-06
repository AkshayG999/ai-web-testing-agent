const path = require('path');
const fs = require('fs');

const reportsDir = path.resolve(process.cwd(), 'reports');

function ensureReportsDir() {
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  return reportsDir;
}

function getOverallSummary(pageResults) {
  let total = 0, passed = 0, failed = 0, totalDurationMs = 0;
  for (const page of pageResults) {
    for (const r of page.results) {
      total++;
      if (r.status === 'passed') passed++;
      else failed++;
      totalDurationMs += r.durationMs || 0;
    }
  }
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
  return { total, passed, failed, totalDurationMs, passRate, pageCount: pageResults.length };
}

function writeJsonReport(pageResults, baseUrl) {
  ensureReportsDir();
  const summary = getOverallSummary(pageResults);
  const payload = {
    baseUrl,
    timestamp: new Date().toISOString(),
    summary,
    pages: pageResults.map(p => ({
      pageUrl: p.pageUrl,
      pageTitle: p.pageTitle,
      scenarios: p.results
    }))
  };
  const file = path.join(reportsDir, `report_${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
  return file;
}

function writeHtmlReport(pageResults, baseUrl) {
  ensureReportsDir();
  const { total, passed, failed, totalDurationMs, passRate, pageCount } = getOverallSummary(pageResults);

  const pagesHtml = pageResults.map(page => {
    const pageScenarios = page.results;
    const pagePassed = pageScenarios.filter(r => r.status === 'passed').length;
    const pageFailed = pageScenarios.filter(r => r.status === 'failed').length;

    const scenarioRows = pageScenarios.map(r => {
      const statusBadge = r.status === 'passed'
        ? '<span class="badge pass">PASSED</span>'
        : '<span class="badge fail">FAILED</span>';

      const stepsHtml = (r.steps || []).map(s => {
        const icon = s.success ? '&#10003;' : '&#10007;';
        const cls = s.success ? 'step-pass' : 'step-fail';
        const selectorInfo = s.selector ? `<code>${escapeHtml(String(s.selector))}</code>` : '';
        const errorInfo = s.error ? `<span class="step-error">${escapeHtml(s.error)}</span>` : '';
        return `<div class="step ${cls}"><span class="step-icon">${icon}</span> <strong>${escapeHtml(s.action)}</strong> ${selectorInfo} ${errorInfo}</div>`;
      }).join('');

      const screenshotHtml = r.screenshot
        ? `<details><summary>Failure Screenshot</summary><img src="screenshots/${path.basename(r.screenshot)}" alt="screenshot" loading="lazy"/></details>`
        : '';

      return `<div class="scenario ${r.status}">
        <div class="scenario-header">
          <h4>${escapeHtml(r.name)}</h4>
          <div class="scenario-meta">${statusBadge} <span class="duration">${(r.durationMs / 1000).toFixed(2)}s</span></div>
        </div>
        ${r.error ? `<div class="scenario-error">${escapeHtml(r.error)}</div>` : ''}
        <div class="steps">${stepsHtml}</div>
        ${screenshotHtml}
      </div>`;
    }).join('');

    return `<div class="page-section">
      <div class="page-header">
        <h2><a href="${escapeHtml(page.pageUrl)}" target="_blank">${escapeHtml(page.pageTitle || page.pageUrl)}</a></h2>
        <div class="page-meta">
          <span class="page-url">${escapeHtml(page.pageUrl)}</span>
          <span class="page-stats">${pagePassed} passed / ${pageFailed} failed</span>
        </div>
      </div>
      ${scenarioRows}
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>AI Web Tester Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; line-height: 1.6; }
    .container { max-width: 1000px; margin: 0 auto; }
    h1 { font-size: 1.75rem; margin-bottom: 0.5rem; color: #f1f5f9; }
    .meta { color: #94a3b8; margin-bottom: 1.5rem; }
    .meta strong { color: #cbd5e1; }
    .summary { display: flex; gap: 1rem; margin-bottom: 2rem; flex-wrap: wrap; }
    .summary-card { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 1rem 1.5rem; flex: 1; min-width: 120px; }
    .summary-card .label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; }
    .summary-card .value { font-size: 1.75rem; font-weight: 700; color: #f1f5f9; }
    .summary-card.pass-rate .value { color: ${passRate >= 80 ? '#4ade80' : passRate >= 50 ? '#fbbf24' : '#f87171'}; }

    .page-section { margin-bottom: 2rem; }
    .page-header { background: #1e293b; border: 1px solid #334155; border-radius: 10px 10px 0 0; padding: 1rem 1.25rem; margin-bottom: 0; }
    .page-header h2 { font-size: 1.15rem; color: #f1f5f9; margin-bottom: 0.25rem; }
    .page-header h2 a { color: #60a5fa; text-decoration: none; }
    .page-header h2 a:hover { text-decoration: underline; }
    .page-meta { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; }
    .page-url { font-size: 0.8rem; color: #64748b; word-break: break-all; }
    .page-stats { font-size: 0.8rem; color: #94a3b8; font-weight: 600; }

    .scenario { background: #1e293b; border: 1px solid #334155; margin-top: -1px; padding: 1.25rem; }
    .scenario:last-child { border-radius: 0 0 10px 10px; }
    .scenario.passed { border-left: 4px solid #4ade80; }
    .scenario.failed { border-left: 4px solid #f87171; }
    .scenario-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem; }
    .scenario-header h4 { font-size: 1rem; color: #f1f5f9; }
    .scenario-meta { display: flex; gap: 0.75rem; align-items: center; }
    .badge { font-size: 0.7rem; font-weight: 600; padding: 0.2rem 0.6rem; border-radius: 4px; text-transform: uppercase; }
    .badge.pass { background: #166534; color: #bbf7d0; }
    .badge.fail { background: #991b1b; color: #fecaca; }
    .duration { font-size: 0.8rem; color: #94a3b8; }
    .scenario-error { background: #451a1a; color: #fca5a5; padding: 0.5rem 0.75rem; border-radius: 6px; font-size: 0.85rem; margin-bottom: 0.75rem; }
    .steps { display: flex; flex-direction: column; gap: 0.3rem; }
    .step { font-size: 0.85rem; padding: 0.35rem 0.5rem; border-radius: 4px; display: flex; align-items: baseline; gap: 0.5rem; flex-wrap: wrap; }
    .step-pass { color: #86efac; }
    .step-fail { color: #fca5a5; background: #2a1515; }
    .step-icon { font-weight: bold; flex-shrink: 0; }
    .step code { background: #334155; padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.8rem; color: #93c5fd; }
    .step-error { color: #fca5a5; font-size: 0.8rem; }
    details { margin-top: 0.75rem; }
    summary { cursor: pointer; color: #94a3b8; font-size: 0.85rem; }
    details img { max-width: 100%; border-radius: 8px; margin-top: 0.5rem; border: 1px solid #334155; }
    .trace-info { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 1rem; margin-top: 1.5rem; font-size: 0.85rem; color: #94a3b8; }
    .trace-info code { background: #334155; padding: 0.15rem 0.4rem; border-radius: 3px; font-size: 0.8rem; color: #93c5fd; }
  </style>
</head>
<body>
  <div class="container">
    <h1>AI Web Tester Report</h1>
    <div class="meta">
      <p><strong>Base URL:</strong> ${escapeHtml(baseUrl)}</p>
      <p><strong>Time:</strong> ${new Date().toISOString()}</p>
    </div>
    <div class="summary">
      <div class="summary-card"><div class="label">Pages</div><div class="value">${pageCount}</div></div>
      <div class="summary-card"><div class="label">Total</div><div class="value">${total}</div></div>
      <div class="summary-card"><div class="label">Passed</div><div class="value" style="color:#4ade80">${passed}</div></div>
      <div class="summary-card"><div class="label">Failed</div><div class="value" style="color:#f87171">${failed}</div></div>
      <div class="summary-card pass-rate"><div class="label">Pass Rate</div><div class="value">${passRate}%</div></div>
      <div class="summary-card"><div class="label">Duration</div><div class="value" style="font-size:1.25rem">${(totalDurationMs / 1000).toFixed(1)}s</div></div>
    </div>
    ${pagesHtml}
  </div>
</body>
</html>`;

  const file = path.join(reportsDir, `report_${Date.now()}.html`);
  fs.writeFileSync(file, html, 'utf8');
  return file;
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function printCliReport(pageResults, baseUrl) {
  const { total, passed, failed, totalDurationMs, pageCount } = getOverallSummary(pageResults);

  console.log('\n  ── AI Web Tester Results ──────────────────────');
  console.log(`  Base URL:  ${baseUrl}`);
  console.log(`  Pages:     ${pageCount}`);
  console.log(`  Total:     ${total} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`  Duration:  ${(totalDurationMs / 1000).toFixed(1)}s\n`);

  for (const page of pageResults) {
    console.log(`  ── ${page.pageTitle || page.pageUrl} ──`);
    console.log(`     ${page.pageUrl}`);

    for (const r of page.results) {
      const icon = r.status === 'passed' ? '  ✓' : '  ✗';
      console.log(`${icon} ${r.name}: ${r.status.toUpperCase()} (${(r.durationMs / 1000).toFixed(2)}s)`);

      for (const s of r.steps) {
        const stepIcon = s.success ? '    ✓' : '    ✗';
        const selectorStr = s.selector ? ` → ${s.selector}` : '';
        const errorStr = s.error ? ` [${s.error}]` : '';
        console.log(`${stepIcon} ${s.action}${selectorStr}${errorStr}`);
      }
      console.log('');
    }
  }
}

module.exports = {
  reportsDir: () => reportsDir,
  getOverallSummary,
  writeJsonReport,
  writeHtmlReport,
  printCliReport,
  ensureReportsDir
};
