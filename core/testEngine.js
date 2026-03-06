const EventEmitter = require('events');
const path = require('path');
const { scanPage } = require('../agent/domScanner');
const { generateTestPlan } = require('../agent/aiPlanner');
const { discoverRoutes } = require('../agent/routeCrawler');
const { runTestPlan } = require('../executor/playwrightRunner');
const { writeJsonReport, writeHtmlReport } = require('../reporter/testReporter');
const { authenticate } = require('./authHandler');

class TestEngine extends EventEmitter {
  constructor(settings, profile) {
    super();
    this.settings = settings;
    this.profile = profile || null;
    this.running = false;
    this.aborted = false;
  }

  _emit(event, data) {
    this.emit(event, data);
  }

  _createLogger() {
    const self = this;
    return {
      log(tag, msg, data) { self._emit('log', { tag, message: msg, data }); },
      logStep(tag, msg, detail) { self._emit('log', { tag, message: msg, detail }); },
      logData(tag, label, data) { self._emit('log', { tag, message: label, data }); },
      logAiRequest(providerModel, promptLen, domSummary) {
        self._emit('log', { tag: 'ai', message: `Request → ${providerModel}, prompt ${promptLen} chars` });
      },
      logAiResponse(rawLen, count, names) {
        self._emit('log', { tag: 'ai', message: `Response ← ${rawLen} chars, ${count} scenario(s)`, data: names });
      },
      logDomSummary(dom) {
        const m = dom.meta || {};
        self._emit('log', { tag: 'dom', message: `${dom.url} — html:${(dom.html || '').length} chars, inputs:${m.inputCount} buttons:${m.buttonCount} links:${m.linkCount} forms:${m.formCount}` });
      },
      logTestPlan(plan) {
        const scenarios = Array.isArray(plan) ? plan : (plan.scenarios || plan.tests || []);
        self._emit('log', { tag: 'ai', message: `Test plan: ${scenarios.length} scenario(s)`, data: scenarios.map(s => s.name) });
      },
      logExecStep(name, idx, step, outcome) {
        self._emit('step', { scenario: name, stepIndex: idx, action: step.action, outcome });
      },
      logExecScenarioStart(name, count) {
        self._emit('scenarioStart', { name, stepCount: count });
      },
      logExecScenarioEnd(name, status, ms) {
        self._emit('scenarioEnd', { name, status, durationMs: ms });
      },
      logCrawlSummary(routes) {
        self._emit('crawlDone', { routes });
      },
      VERBOSE: false
    };
  }

  async run(baseUrl) {
    if (this.running) throw new Error('A test run is already in progress');
    this.running = true;
    this.aborted = false;
    const startTime = Date.now();
    const logger = this._createLogger();
    const settings = this.settings;
    const profile = this.profile;
    const crawlConfig = settings.crawl || {};

    this._emit('runStart', { baseUrl, settings, profile: profile ? profile.name : null });

    try {
      let storageState = null;

      if (profile && profile.auth && profile.auth.loginUrl) {
        this._emit('phase', { phase: 'auth', message: `Logging in as "${profile.name}"...` });
        try {
          storageState = await authenticate(profile, {
            timeout: settings.timeout,
            headless: settings.headless !== false,
            viewport: settings.viewport,
            logger
          });
        } catch (err) {
          this._emit('log', { tag: 'auth', message: `Auth failed: ${err.message}` });
        }
      }

      let pagesToTest = [];

      if (crawlConfig.enabled !== false) {
        this._emit('phase', { phase: 'crawl', message: 'Discovering routes...' });
        const { testableRoutes } = await discoverRoutes(baseUrl, {
          maxPages: crawlConfig.maxPages || 20,
          maxDepth: crawlConfig.maxDepth || 3,
          timeout: settings.timeout,
          headless: settings.headless !== false,
          viewport: settings.viewport,
          logger,
          storageState
        });
        pagesToTest = testableRoutes.map(r => ({ url: r.url, title: r.title }));
        this._emit('routesDiscovered', { routes: pagesToTest });
      } else {
        pagesToTest = [{ url: baseUrl, title: '' }];
        this._emit('routesDiscovered', { routes: pagesToTest });
      }

      if (pagesToTest.length === 0) {
        this._emit('runEnd', { error: 'No testable pages found' });
        this.running = false;
        return { pages: [], error: 'No testable pages found' };
      }

      const allPageResults = [];

      for (let i = 0; i < pagesToTest.length; i++) {
        if (this.aborted) break;
        const { url: pageUrl, title: pageTitle } = pagesToTest[i];
        this._emit('pageStart', { index: i, total: pagesToTest.length, url: pageUrl, title: pageTitle });

        const pageResult = await this._processPage(pageUrl, pageTitle, logger, storageState);
        if (pageResult) {
          allPageResults.push(pageResult);
        }
        this._emit('pageEnd', { index: i, url: pageUrl, hasResults: !!pageResult });
      }

      this._emit('phase', { phase: 'report', message: 'Generating reports...' });
      let htmlFile = null, jsonFile = null;
      if (allPageResults.length > 0) {
        jsonFile = writeJsonReport(allPageResults, baseUrl);
        htmlFile = writeHtmlReport(allPageResults, baseUrl);
      }

      const totalMs = Date.now() - startTime;
      const totalScenarios = allPageResults.reduce((s, p) => s + p.results.length, 0);
      const totalFailed = allPageResults.reduce((s, p) => s + p.results.filter(r => r.status === 'failed').length, 0);
      const totalPassed = totalScenarios - totalFailed;

      const summary = {
        baseUrl,
        durationMs: totalMs,
        pageCount: allPageResults.length,
        totalScenarios,
        passed: totalPassed,
        failed: totalFailed,
        htmlReport: htmlFile,
        jsonReport: jsonFile,
        pages: allPageResults
      };

      this._emit('runEnd', summary);
      this.running = false;
      return summary;

    } catch (err) {
      this._emit('runEnd', { error: err.message });
      this.running = false;
      throw err;
    }
  }

  abort() {
    this.aborted = true;
    this._emit('log', { tag: 'engine', message: 'Abort requested' });
  }

  async _processPage(pageUrl, pageTitle, logger, storageState) {
    this._emit('phase', { phase: 'scan', message: `Scanning ${pageUrl}` });
    let pageData;
    try {
      pageData = await scanPage(pageUrl, {
        timeout: this.settings.timeout,
        headless: this.settings.headless !== false,
        viewport: this.settings.viewport,
        logger,
        storageState
      });
    } catch (err) {
      this._emit('log', { tag: 'dom', message: `Scan failed: ${err.message}` });
      return null;
    }

    this._emit('phase', { phase: 'plan', message: `Generating test plan for ${pageUrl}` });
    let testPlan;
    try {
      testPlan = await generateTestPlan(pageData, {
        aiConfig: this.settings.ai,
        logger,
        profile: this.profile
      });
      const scenarios = Array.isArray(testPlan) ? testPlan : (testPlan.scenarios || testPlan.tests || []);
      if (scenarios.length === 0) return null;
    } catch (err) {
      this._emit('log', { tag: 'ai', message: `AI failed: ${err.message}` });
      return null;
    }

    this._emit('phase', { phase: 'execute', message: `Running tests on ${pageUrl}` });
    let results;
    try {
      results = await runTestPlan(pageUrl, testPlan, {
        settings: this.settings,
        logger,
        storageState
      });
    } catch (err) {
      this._emit('log', { tag: 'executor', message: `Execution failed: ${err.message}` });
      return null;
    }

    return {
      pageUrl,
      pageTitle: pageTitle || pageData.title || pageUrl,
      results
    };
  }
}

module.exports = { TestEngine };
