const defaultSettings = {
  timeout: 30000,
  retries: 2,
  headless: true,
  tracing: true,
  recordVideo: false,
  viewport: { width: 1280, height: 720 },
  reportFormats: ['html', 'json', 'cli'],
  ai: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    temperature: 0.2
  },
  crawl: {
    enabled: true,
    maxPages: 20,
    maxDepth: 3
  }
};

function loadSettings(configPath) {
  try {
    const loaded = require(configPath);
    return {
      ...defaultSettings,
      ...loaded,
      ai: { ...defaultSettings.ai, ...(loaded.ai || {}) },
      crawl: { ...defaultSettings.crawl, ...(loaded.crawl || {}) }
    };
  } catch {
    return { ...defaultSettings };
  }
}

module.exports = { defaultSettings, loadSettings };
