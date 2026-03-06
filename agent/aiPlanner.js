const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const { createLlm } = require('./llmProvider');
const { buildScanPrompt } = require('../utils/promptBuilder');

function parseJsonFromResponse(content) {
  const raw = content.trim();
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']') + 1;
  if (start === -1 || end <= start) {
    const objStart = raw.indexOf('{');
    const objEnd = raw.lastIndexOf('}') + 1;
    if (objStart !== -1 && objEnd > objStart) {
      return JSON.parse(raw.slice(objStart, objEnd));
    }
    throw new Error('No JSON array or object found in AI response');
  }
  return JSON.parse(raw.slice(start, end));
}

async function generateTestPlan(pageData, options = {}) {
  const { aiConfig = {}, maxRetries = 2, logger, profile } = options;
  const { llm, provider, model } = createLlm(aiConfig);
  const prompt = buildScanPrompt(pageData, profile || null);

  if (logger) {
    logger.logAiRequest(`${provider}/${model}`, prompt.length, pageData.meta);
    if (logger.VERBOSE) logger.logData('prompt', 'Prompt preview (first 600 chars)', prompt.slice(0, 600));
  }

  const systemPrompt = [
    'You are a senior QA automation engineer who thinks critically about what to test.',
    'You analyze webpages and produce Playwright-compatible test scenarios as a JSON array.',
    'You adapt your testing strategy to the page — forms get validation tests, dashboards get state verification, etc.',
    'Output ONLY valid JSON. No markdown code blocks, no commentary, no wrapping text.'
  ].join(' ');

  const messages = [
    new SystemMessage(systemPrompt),
    new HumanMessage(prompt)
  ];

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await llm.invoke(messages);
      const content = typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);

      if (!content) throw new Error('Empty AI response');

      const testPlan = parseJsonFromResponse(content);
      const scenarios = Array.isArray(testPlan) ? testPlan : (testPlan.scenarios || testPlan.tests || []);

      if (logger) {
        logger.logAiResponse(content.length, scenarios.length, scenarios.map(s => s.name));
      }

      return testPlan;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }

  throw lastError;
}

module.exports = { generateTestPlan, parseJsonFromResponse };
