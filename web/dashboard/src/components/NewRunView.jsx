import { useState, useEffect, useRef, useCallback } from 'react';
import socket from '../socket';

export default function NewRunView() {
    const [url, setUrl] = useState('');
    const [profileId, setProfileId] = useState('');
    const [profiles, setProfiles] = useState([]);
    const [running, setRunning] = useState(false);
    const [showProgress, setShowProgress] = useState(false);
    const [showSummary, setShowSummary] = useState(false);
    const [progressTitle, setProgressTitle] = useState('Initialising...');
    const [progressWidth, setProgressWidth] = useState('0');
    const [routes, setRoutes] = useState([]);
    const [scenarios, setScenarios] = useState([]);
    const [logs, setLogs] = useState('');
    const [summary, setSummary] = useState(null);

    // Override states
    const [overCrawl, setOverCrawl] = useState('');
    const [overMaxPages, setOverMaxPages] = useState('');
    const [overHeadless, setOverHeadless] = useState('');

    const logRef = useRef(null);
    const totalPagesRef = useRef(0);

    const refreshProfiles = useCallback(async () => {
        try {
            const res = await fetch('/api/profiles');
            const data = await res.json();
            setProfiles(data);
        } catch { }
    }, []);

    useEffect(() => {
        refreshProfiles();
    }, [refreshProfiles]);

    const appendLog = useCallback((line) => {
        setLogs(prev => prev + line + '\n');
    }, []);

    useEffect(() => {
        if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [logs]);

    useEffect(() => {
        const handleRunStart = (data) => {
            totalPagesRef.current = 0;
            const profileInfo = data.profile ? ` (profile: ${data.profile})` : '';
            setProgressTitle(`Initialising...${profileInfo}`);
            setProgressWidth('5%');
        };

        const handleRoutesDiscovered = ({ routes: discoveredRoutes }) => {
            totalPagesRef.current = discoveredRoutes.length;
            setRoutes(discoveredRoutes);
            setProgressTitle(`Found ${discoveredRoutes.length} page(s). Processing...`);
            setProgressWidth('10%');
        };

        const handlePhase = ({ phase, message }) => {
            appendLog(`[${phase.toUpperCase()}] ${message}`);
        };

        const handlePageStart = ({ index, total, url: pageUrl }) => {
            setProgressTitle(`Page ${index + 1}/${total}: ${pageUrl}`);
            appendLog(`── Page ${index + 1}/${total}: ${pageUrl}`);
        };

        const handlePageEnd = ({ index }) => {
            const processedPages = index + 1;
            const tp = totalPagesRef.current;
            const pct = tp > 0 ? 10 + Math.round((processedPages / tp) * 80) : 50;
            setProgressWidth(`${pct}%`);
        };

        const handleScenarioStart = ({ name, stepCount }) => {
            setScenarios(prev => [...prev, { name, status: 'running', stepCount, durationMs: 0 }]);
            appendLog(`  ▸ Scenario: "${name}" (${stepCount} steps)`);
        };

        const handleScenarioEnd = ({ name, status, durationMs }) => {
            setScenarios(prev =>
                prev.map(s =>
                    s.name === name ? { ...s, status, durationMs } : s
                )
            );
            const mark = status === 'passed' ? '✓' : '✗';
            appendLog(`  ${mark} "${name}" → ${status} (${(durationMs / 1000).toFixed(2)}s)`);
        };

        const handleStep = ({ scenario, stepIndex, action, outcome }) => {
            const mark = outcome === true || outcome === 'OK' ? '✓' : '✗';
            appendLog(`    ${mark} step ${stepIndex + 1}: ${action}`);
        };

        const handleLog = ({ tag, message }) => {
            appendLog(`[${(tag || '').toUpperCase()}] ${message}`);
        };

        const handleCrawlDone = ({ routes: crawlRoutes }) => {
            appendLog(`[CRAWL] ${crawlRoutes.length} route(s) discovered`);
        };

        const handleRunEnd = (data) => {
            setProgressWidth('100%');
            setRunning(false);

            if (data.error && !data.totalScenarios) {
                setProgressTitle(`Failed: ${data.error}`);
                return;
            }

            setProgressTitle('Complete!');
            setSummary(data);
            setShowSummary(true);
        };

        const handleError = ({ message }) => {
            appendLog(`[ERROR] ${message}`);
            setRunning(false);
        };

        socket.on('runStart', handleRunStart);
        socket.on('routesDiscovered', handleRoutesDiscovered);
        socket.on('phase', handlePhase);
        socket.on('pageStart', handlePageStart);
        socket.on('pageEnd', handlePageEnd);
        socket.on('scenarioStart', handleScenarioStart);
        socket.on('scenarioEnd', handleScenarioEnd);
        socket.on('step', handleStep);
        socket.on('log', handleLog);
        socket.on('crawlDone', handleCrawlDone);
        socket.on('runEnd', handleRunEnd);
        socket.on('error', handleError);

        return () => {
            socket.off('runStart', handleRunStart);
            socket.off('routesDiscovered', handleRoutesDiscovered);
            socket.off('phase', handlePhase);
            socket.off('pageStart', handlePageStart);
            socket.off('pageEnd', handlePageEnd);
            socket.off('scenarioStart', handleScenarioStart);
            socket.off('scenarioEnd', handleScenarioEnd);
            socket.off('step', handleStep);
            socket.off('log', handleLog);
            socket.off('crawlDone', handleCrawlDone);
            socket.off('runEnd', handleRunEnd);
            socket.off('error', handleError);
        };
    }, [appendLog]);

    const handleStart = () => {
        const trimmedUrl = url.trim();
        if (!trimmedUrl) return;

        const overrides = {};
        if (overCrawl) overrides.crawl = { enabled: overCrawl === 'true' };
        if (overMaxPages) overrides.crawl = { ...(overrides.crawl || {}), maxPages: Number(overMaxPages) };
        if (overHeadless !== '') overrides.headless = overHeadless === 'true';

        // Reset UI
        setScenarios([]);
        setLogs('');
        setRoutes([]);
        setShowSummary(false);
        setSummary(null);
        setProgressWidth('0');
        setShowProgress(true);
        setRunning(true);

        socket.emit('startRun', {
            url: trimmedUrl,
            profileId: profileId || undefined,
            settings: Object.keys(overrides).length ? overrides : undefined,
        });
    };

    const handleAbort = () => {
        socket.emit('abort');
    };

    const passRate = summary && summary.totalScenarios > 0
        ? Math.round((summary.passed / summary.totalScenarios) * 100)
        : 0;

    return (
        <section id="view-run" className="view active">
            <h1>New Test Run</h1>

            <div className="run-form card">
                <div className="form-group">
                    <label htmlFor="urlInput">Target URL</label>
                    <div className="input-row">
                        <input
                            type="url"
                            id="urlInput"
                            placeholder="https://example.com"
                            autoComplete="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !running) handleStart(); }}
                        />
                        {!running ? (
                            <button id="btnStart" className="btn btn-primary" onClick={handleStart}>
                                Start Run
                            </button>
                        ) : (
                            <button id="btnAbort" className="btn btn-danger" onClick={handleAbort}>
                                Abort
                            </button>
                        )}
                    </div>
                </div>

                <div className="form-group" style={{ marginTop: '0.75rem' }}>
                    <label htmlFor="profileSelect">Test Data Profile</label>
                    <select
                        id="profileSelect"
                        value={profileId}
                        onChange={(e) => setProfileId(e.target.value)}
                    >
                        <option value="">None (AI will generate test data)</option>
                        {profiles.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                </div>

                <details className="run-overrides">
                    <summary>Override settings for this run</summary>
                    <div className="override-grid">
                        <div className="form-group">
                            <label htmlFor="overCrawl">Crawl routes</label>
                            <select id="overCrawl" value={overCrawl} onChange={e => setOverCrawl(e.target.value)}>
                                <option value="">Use default</option>
                                <option value="true">Enabled</option>
                                <option value="false">Disabled</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label htmlFor="overMaxPages">Max pages</label>
                            <input
                                type="number"
                                id="overMaxPages"
                                min="1"
                                max="100"
                                placeholder="default"
                                value={overMaxPages}
                                onChange={e => setOverMaxPages(e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="overHeadless">Headless</label>
                            <select id="overHeadless" value={overHeadless} onChange={e => setOverHeadless(e.target.value)}>
                                <option value="">Use default</option>
                                <option value="true">Yes</option>
                                <option value="false">No</option>
                            </select>
                        </div>
                    </div>
                </details>
            </div>

            {/* Progress Panel */}
            {showProgress && (
                <div id="progressPanel" className="card">
                    <div className="progress-header">
                        <h2>{progressTitle}</h2>
                        <div className="progress-bar">
                            <div className="progress-fill" style={{ width: progressWidth }}></div>
                        </div>
                    </div>

                    {routes.length > 0 && (
                        <div className="routes-list">
                            <h3>Discovered Routes</h3>
                            <ul>
                                {routes.map((r, i) => (
                                    <li key={i} title={r.url}>{r.title || r.url}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="scenario-results">
                        {scenarios.map((s, i) => (
                            <div key={i} className={`scenario-result ${s.status}`} data-name={s.name}>
                                <span className="sr-icon">
                                    {s.status === 'running' ? '●' : s.status === 'passed' ? '✓' : '✗'}
                                </span>
                                <span className="sr-name">{s.name}</span>
                                <span className={`sr-status ${s.status === 'passed' ? 'pass' : s.status === 'failed' ? 'fail' : 'pending'}`}>
                                    {s.status === 'running'
                                        ? `${s.stepCount} steps`
                                        : `${s.status.toUpperCase()} (${(s.durationMs / 1000).toFixed(2)}s)`
                                    }
                                </span>
                            </div>
                        ))}
                    </div>

                    <div className="log-panel">
                        <div className="log-header">
                            <h3>Live Log</h3>
                            <button className="btn btn-sm" onClick={() => setLogs('')}>Clear</button>
                        </div>
                        <pre className="log-output" ref={logRef}>{logs}</pre>
                    </div>
                </div>
            )}

            {/* Summary Panel */}
            {showSummary && summary && (
                <div className="card summary-card">
                    <h2>✅ Run Complete</h2>
                    <div className="summary-grid">
                        <div className="summary-item">
                            <div className="si-label">Pages</div>
                            <div className="si-value">{summary.pageCount}</div>
                        </div>
                        <div className="summary-item">
                            <div className="si-label">Scenarios</div>
                            <div className="si-value">{summary.totalScenarios}</div>
                        </div>
                        <div className="summary-item">
                            <div className="si-label">Passed</div>
                            <div className="si-value green">{summary.passed}</div>
                        </div>
                        <div className="summary-item">
                            <div className="si-label">Failed</div>
                            <div className="si-value red">{summary.failed}</div>
                        </div>
                        <div className="summary-item">
                            <div className="si-label">Pass Rate</div>
                            <div
                                className="si-value"
                                style={{
                                    color: passRate >= 80
                                        ? 'var(--green)'
                                        : passRate >= 50
                                            ? 'var(--yellow)'
                                            : 'var(--red)'
                                }}
                            >
                                {passRate}%
                            </div>
                        </div>
                        <div className="summary-item">
                            <div className="si-label">Duration</div>
                            <div className="si-value" style={{ fontSize: '1.1rem' }}>
                                {(summary.durationMs / 1000).toFixed(1)}s
                            </div>
                        </div>
                    </div>
                    <div className="summary-actions">
                        {summary.htmlReport && (
                            <a
                                href={summary.htmlReport}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-primary"
                            >
                                View HTML Report
                            </a>
                        )}
                        {summary.jsonReport && (
                            <a
                                href={summary.jsonReport}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-outline"
                            >
                                View JSON Report
                            </a>
                        )}
                    </div>
                </div>
            )}
        </section>
    );
}
