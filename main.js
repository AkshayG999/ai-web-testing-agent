#!/usr/bin/env node
require('dotenv').config();
const path = require('path');
const { TestEngine } = require('./core/testEngine');
const { printCliReport } = require('./reporter/testReporter');
const { loadSettings } = require('./config/defaults');

const configPath = path.join(__dirname, 'config', 'settings.json');
const settings = loadSettings(configPath);

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node main.js <url> [--profile <profile-id>]');
    console.error('Example: node main.js https://example.com --profile staging-admin');
    process.exit(1);
  }

  const baseUrl = url.startsWith('http') ? url : `https://${url}`;

  let profile = null;
  const profileIdx = process.argv.indexOf('--profile');
  if (profileIdx !== -1 && process.argv[profileIdx + 1]) {
    const profileId = process.argv[profileIdx + 1];
    const fs = require('fs');
    const profilePath = path.join(__dirname, 'config', 'profiles', `${profileId}.json`);
    if (fs.existsSync(profilePath)) {
      profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
      profile.id = profileId;
    } else {
      console.error(`  [ERROR] Profile "${profileId}" not found at ${profilePath}`);
      process.exit(1);
    }
  }

  console.log(`\n  [URL] ${baseUrl}`);
  console.log(`  [CONFIG] AI: ${settings.ai.provider} / ${settings.ai.model}`);
  console.log(`  [CONFIG] Crawl: ${settings.crawl.enabled !== false ? 'on' : 'off'}, maxPages: ${settings.crawl.maxPages}`);
  if (profile) console.log(`  [CONFIG] Profile: ${profile.name}`);
  console.log('');

  const engine = new TestEngine(settings, profile);

  engine.on('phase', ({ phase, message }) => console.log(`  [${phase.toUpperCase()}] ${message}`));
  engine.on('log', ({ tag, message }) => console.log(`  [${(tag || '').toUpperCase()}] ${message}`));
  engine.on('routesDiscovered', ({ routes }) => {
    console.log(`  [CRAWL] ${routes.length} testable route(s):`);
    routes.forEach((r, i) => console.log(`      ${i + 1}. ${r.url} — "${r.title || ''}"`));
  });
  engine.on('pageStart', ({ index, total, url }) => {
    console.log(`\n  ──── Page ${index + 1}/${total}: ${url} ────`);
  });
  engine.on('scenarioStart', ({ name, stepCount }) => {
    console.log(`  [EXEC] Scenario: "${name}" (${stepCount} steps)`);
  });
  engine.on('scenarioEnd', ({ name, status, durationMs }) => {
    console.log(`  [EXEC] "${name}" → ${status} (${(durationMs / 1000).toFixed(2)}s)`);
  });
  engine.on('step', ({ scenario, stepIndex, action, outcome }) => {
    const mark = outcome === true ? 'OK' : outcome === false ? 'FAIL' : String(outcome);
    console.log(`  [EXEC]   step ${stepIndex + 1}: ${action} → ${mark}`);
  });

  try {
    const result = await engine.run(baseUrl);

    if (result.pages && result.pages.length > 0) {
      const formats = settings.reportFormats || ['html', 'json', 'cli'];
      if (formats.includes('cli')) printCliReport(result.pages, baseUrl);

      console.log('');
      if (result.htmlReport) console.log(`  [REPORT] HTML: ${result.htmlReport}`);
      if (result.jsonReport) console.log(`  [REPORT] JSON: ${result.jsonReport}`);
      console.log(`  [REPORT] Done in ${(result.durationMs / 1000).toFixed(1)}s — ${result.pageCount} page(s), ${result.totalScenarios} scenarios, ${result.failed} failed\n`);
    }

    process.exit(result.failed > 0 ? 1 : 0);
  } catch (err) {
    console.error(`\n  [ERROR] ${err.message}\n`);
    process.exit(1);
  }
}

main();
