const PROVIDERS = {
  openai: {
    pkg: '@langchain/openai',
    className: 'ChatOpenAI',
    envKey: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o-mini'
  },
  anthropic: {
    pkg: '@langchain/anthropic',
    className: 'ChatAnthropic',
    envKey: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-sonnet-4-20250514'
  },
  google: {
    pkg: '@langchain/google-genai',
    className: 'ChatGoogleGenerativeAI',
    envKey: 'GOOGLE_API_KEY',
    defaultModel: 'gemini-3-flash-preview'
  },
  groq: {
    pkg: '@langchain/groq',
    className: 'ChatGroq',
    envKey: 'GROQ_API_KEY',
    defaultModel: 'llama-3.3-70b-versatile'
  },
  ollama: {
    pkg: '@langchain/ollama',
    className: 'ChatOllama',
    envKey: null,
    defaultModel: 'llama3'
  }
};

function createLlm(aiConfig = {}) {
  const provider = (aiConfig.provider || 'openai').toLowerCase();
  const providerInfo = PROVIDERS[provider];
  if (!providerInfo) {
    const supported = Object.keys(PROVIDERS).join(', ');
    throw new Error(`Unknown AI provider "${provider}". Supported: ${supported}`);
  }

  if (providerInfo.envKey && !process.env[providerInfo.envKey]) {
    throw new Error(`${providerInfo.envKey} environment variable is required for provider "${provider}". Add it to .env or export it.`);
  }

  const model = aiConfig.model || providerInfo.defaultModel;
  const temperature = aiConfig.temperature ?? 0.2;

  let ChatClass;
  try {
    const mod = require(providerInfo.pkg);
    ChatClass = mod[providerInfo.className];
  } catch (err) {
    throw new Error(`Package "${providerInfo.pkg}" not installed. Run: npm install ${providerInfo.pkg}`);
  }

  const opts = { model, temperature };

  if (provider === 'openai') {
    opts.openAIApiKey = process.env.OPENAI_API_KEY;
    if (aiConfig.baseUrl) opts.configuration = { baseURL: aiConfig.baseUrl };
  } else if (provider === 'anthropic') {
    opts.anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  } else if (provider === 'google') {
    opts.apiKey = process.env.GOOGLE_API_KEY;
  } else if (provider === 'groq') {
    opts.apiKey = process.env.GROQ_API_KEY;
  } else if (provider === 'ollama') {
    if (aiConfig.baseUrl) opts.baseUrl = aiConfig.baseUrl;
  }

  if (aiConfig.maxTokens) opts.maxTokens = aiConfig.maxTokens;

  const llm = new ChatClass(opts);
  return { llm, provider, model };
}

function getProviderInfo(providerName) {
  return PROVIDERS[(providerName || 'openai').toLowerCase()] || null;
}

function listProviders() {
  return Object.entries(PROVIDERS).map(([name, info]) => ({
    name,
    envKey: info.envKey,
    defaultModel: info.defaultModel
  }));
}

module.exports = { createLlm, getProviderInfo, listProviders, PROVIDERS };
