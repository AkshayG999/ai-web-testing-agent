import { useState, useEffect } from 'react';

export default function SettingsView() {
    const [timeout, setTimeout_] = useState(30000);
    const [retries, setRetries] = useState(1);
    const [headless, setHeadless] = useState('true');
    const [tracing, setTracing] = useState('true');
    const [provider, setProvider] = useState('');
    const [model, setModel] = useState('');
    const [temperature, setTemperature] = useState(0.2);
    const [crawlEnabled, setCrawlEnabled] = useState('true');
    const [crawlMax, setCrawlMax] = useState(20);
    const [crawlDepth, setCrawlDepth] = useState(3);
    const [providers, setProviders] = useState([]);
    const [saveMsg, setSaveMsg] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const [settingsRes, providersRes] = await Promise.all([
                fetch('/api/settings').then(r => r.json()),
                fetch('/api/providers').then(r => r.json()),
            ]);

            setProviders(providersRes);
            setTimeout_(settingsRes.timeout);
            setRetries(settingsRes.retries);
            setHeadless(String(settingsRes.headless));
            setTracing(String(settingsRes.tracing));
            setProvider(settingsRes.ai.provider);
            setModel(settingsRes.ai.model);
            setTemperature(settingsRes.ai.temperature);
            setCrawlEnabled(String(settingsRes.crawl?.enabled !== false));
            setCrawlMax(settingsRes.crawl?.maxPages || 20);
            setCrawlDepth(settingsRes.crawl?.maxDepth || 3);
        } catch (err) {
            console.error('Failed to load settings:', err);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const payload = {
            timeout: Number(timeout),
            retries: Number(retries),
            headless: headless === 'true',
            tracing: tracing === 'true',
            ai: {
                provider,
                model,
                temperature: Number(temperature),
            },
            crawl: {
                enabled: crawlEnabled === 'true',
                maxPages: Number(crawlMax),
                maxDepth: Number(crawlDepth),
            },
        };

        try {
            await fetch('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            setSaveMsg(true);
            setTimeout(() => setSaveMsg(false), 2000);
        } catch {
            alert('Failed to save settings');
        }
    };

    return (
        <section id="view-settings" className="view active">
            <h1>Settings</h1>
            <form className="settings-form card" onSubmit={handleSubmit}>
                <fieldset>
                    <legend>General</legend>
                    <div className="settings-grid">
                        <div className="form-group">
                            <label htmlFor="sTimeout">Timeout (ms)</label>
                            <input
                                type="number"
                                id="sTimeout"
                                min="5000"
                                step="1000"
                                value={timeout}
                                onChange={e => setTimeout_(Number(e.target.value))}
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="sRetries">Retries</label>
                            <input
                                type="number"
                                id="sRetries"
                                min="0"
                                max="10"
                                value={retries}
                                onChange={e => setRetries(Number(e.target.value))}
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="sHeadless">Headless</label>
                            <select id="sHeadless" value={headless} onChange={e => setHeadless(e.target.value)}>
                                <option value="true">Yes</option>
                                <option value="false">No</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label htmlFor="sTracing">Tracing</label>
                            <select id="sTracing" value={tracing} onChange={e => setTracing(e.target.value)}>
                                <option value="true">Yes</option>
                                <option value="false">No</option>
                            </select>
                        </div>
                    </div>
                </fieldset>

                <fieldset>
                    <legend>AI Provider</legend>
                    <div className="settings-grid">
                        <div className="form-group">
                            <label htmlFor="sProvider">Provider</label>
                            <select
                                id="sProvider"
                                value={provider}
                                onChange={e => setProvider(e.target.value)}
                            >
                                {providers.map(p => (
                                    <option key={p.name} value={p.name}>
                                        {p.name} ({p.defaultModel})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label htmlFor="sModel">Model</label>
                            <input
                                type="text"
                                id="sModel"
                                value={model}
                                onChange={e => setModel(e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="sTemp">Temperature</label>
                            <input
                                type="number"
                                id="sTemp"
                                min="0"
                                max="2"
                                step="0.1"
                                value={temperature}
                                onChange={e => setTemperature(Number(e.target.value))}
                            />
                        </div>
                    </div>
                </fieldset>

                <fieldset>
                    <legend>Route Crawling</legend>
                    <div className="settings-grid">
                        <div className="form-group">
                            <label htmlFor="sCrawlEnabled">Enabled</label>
                            <select
                                id="sCrawlEnabled"
                                value={crawlEnabled}
                                onChange={e => setCrawlEnabled(e.target.value)}
                            >
                                <option value="true">Yes</option>
                                <option value="false">No</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label htmlFor="sCrawlMax">Max pages</label>
                            <input
                                type="number"
                                id="sCrawlMax"
                                min="1"
                                max="200"
                                value={crawlMax}
                                onChange={e => setCrawlMax(Number(e.target.value))}
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="sCrawlDepth">Max depth</label>
                            <input
                                type="number"
                                id="sCrawlDepth"
                                min="1"
                                max="10"
                                value={crawlDepth}
                                onChange={e => setCrawlDepth(Number(e.target.value))}
                            />
                        </div>
                    </div>
                </fieldset>

                <div className="form-actions">
                    <button type="submit" className="btn btn-primary">Save Settings</button>
                    {saveMsg && <span className="save-msg">Saved!</span>}
                </div>
            </form>
        </section>
    );
}
