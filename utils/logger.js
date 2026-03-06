const LOG_LEVEL = (process.env.LOG_LEVEL || process.env.DEBUG || 'info').toLowerCase();
const VERBOSE = LOG_LEVEL === 'verbose' || LOG_LEVEL === 'debug' || process.env.DEBUG === '1';

const PREFIX = {
  url: '[URL]',
  config: '[CONFIG]',
  crawl: '[CRAWL]',
  dom: '[DOM]',
  ai: '[AI]',
  prompt: '[PROMPT]',
  executor: '[EXEC]',
  report: '[REPORT]'
};

function formatData(data, maxLength = 500) {
  if (data === undefined || data === null) return String(data);
  const str = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  if (!VERBOSE && str.length > maxLength) return str.slice(0, maxLength) + '...';
  return str;
}

function log(tag, message, data) {
  const prefix = typeof tag === 'string' && PREFIX[tag] ? PREFIX[tag] : tag;
  const line = `  ${prefix} ${message}`;
  console.log(line);
  if (data !== undefined && data !== null && (VERBOSE || (typeof data !== 'object'))) {
    const out = formatData(data);
    out.split('\n').forEach(l => console.log('      ' + l));
  }
}

function logStep(tag, stepName, detail) {
  const prefix = PREFIX[tag] || tag;
  const detailStr = detail !== undefined ? ` → ${formatData(detail, 200)}` : '';
  console.log(`  ${prefix} ${stepName}${detailStr}`);
}

function logData(tag, label, data) {
  const prefix = PREFIX[tag] || tag;
  console.log(`  ${prefix} ${label}:`);
  const str = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const truncated = !VERBOSE && str.length > 800 ? str.slice(0, 800) + '\n      ... (set LOG_LEVEL=verbose for full output)' : str;
  truncated.split('\n').forEach(l => console.log('      ' + l));
}

function logAiRequest(providerModel, promptLength, domSummary) {
  console.log(`  ${PREFIX.ai} Request → provider/model: ${providerModel}, prompt length: ${promptLength} chars`);
  if (VERBOSE && domSummary) {
    console.log('      DOM summary: ' + formatData(domSummary, 300));
  }
}

function logAiResponse(rawLength, scenarioCount, scenarioNames) {
  console.log(`  ${PREFIX.ai} Response ← ${rawLength} chars, ${scenarioCount} scenario(s)`);
  scenarioNames.forEach((name, i) => console.log(`      ${i + 1}. ${name}`));
}

function logDomSummary(dom) {
  const m = dom.meta || {};
  console.log(`  ${PREFIX.dom} url: ${dom.url}`);
  console.log(`  ${PREFIX.dom} title: ${dom.title || '(none)'}`);
  console.log(`  ${PREFIX.dom} html: ${(dom.html || '').length} chars`);
  console.log(`  ${PREFIX.dom} counts → inputs: ${m.inputCount}, buttons: ${m.buttonCount}, links: ${m.linkCount}, forms: ${m.formCount}`);
  if (VERBOSE && dom.html) {
    logData('dom', 'HTML preview (first 500 chars)', dom.html.slice(0, 500));
  }
}

function logTestPlan(testPlan) {
  const scenarios = Array.isArray(testPlan) ? testPlan : (testPlan.scenarios || testPlan.tests || []);
  console.log(`  ${PREFIX.ai} Test plan: ${scenarios.length} scenario(s)`);
  scenarios.forEach((s, i) => {
    const stepCount = (s.steps || []).length;
    console.log(`      ${i + 1}. "${s.name}" (${stepCount} steps)`);
    if (VERBOSE && s.steps?.length) {
      s.steps.forEach((st, j) => {
        const desc = st.action + (st.selector ? ` ${st.selector}` : '') + (st.locatorType ? ` ${st.locatorType}` : '') + (st.value !== undefined ? ` value="${String(st.value).slice(0, 30)}"` : '') + (st.assertion ? ` assert ${st.assertion}` : '');
        console.log(`         ${j + 1}. ${desc}`);
      });
    }
  });
}

function logExecStep(scenarioName, stepIndex, step, outcome) {
  const action = step.action || '?';
  const target = step.selector || (step.locatorType ? `${step.locatorType}:${JSON.stringify(step.locatorArgs || {})}` : '') || '';
  const extra = step.value !== undefined ? ` value="${String(step.value).slice(0, 40)}"` : (step.expected !== undefined ? ` expected="${String(step.expected).slice(0, 40)}"` : '');
  const status = outcome === true ? 'OK' : outcome === false ? 'FAIL' : String(outcome);
  console.log(`  ${PREFIX.executor} [${scenarioName}] step ${stepIndex + 1}: ${action} ${target}${extra} → ${status}`);
}

function logExecScenarioStart(name, stepCount) {
  console.log(`  ${PREFIX.executor} Scenario: "${name}" (${stepCount} steps)`);
}

function logExecScenarioEnd(name, status, durationMs) {
  console.log(`  ${PREFIX.executor} Scenario "${name}" → ${status} (${(durationMs / 1000).toFixed(2)}s)`);
}

function logCrawlSummary(testableRoutes) {
  console.log(`  ${PREFIX.crawl} Discovered ${testableRoutes.length} testable route(s):`);
  testableRoutes.forEach((r, i) => {
    console.log(`      ${i + 1}. [${r.statusCode}] ${r.url}  "${r.title || ''}"`);
  });
}

module.exports = {
  log,
  logStep,
  logData,
  logAiRequest,
  logAiResponse,
  logDomSummary,
  logTestPlan,
  logExecStep,
  logExecScenarioStart,
  logExecScenarioEnd,
  logCrawlSummary,
  VERBOSE,
  PREFIX
};
