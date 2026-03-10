import { useState, useEffect } from 'react';

export default function HistoryView() {
    const [runs, setRuns] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadHistory();
    }, []);

    const loadHistory = async () => {
        try {
            const res = await fetch('/api/runs');
            const data = await res.json();
            setRuns(data);
        } catch {
            setRuns([]);
        }
        setLoading(false);
    };

    return (
        <section id="view-history" className="view active">
            <h1>Run History</h1>
            <div className="history-list">
                {loading ? (
                    <p className="muted">Loading...</p>
                ) : runs.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">📄</div>
                        <p className="empty-state-text">No runs yet. Start a test run to see history.</p>
                    </div>
                ) : (
                    runs.map(r => {
                        const profileTag = r.profile ? ` · profile: ${r.profile}` : '';
                        return (
                            <div key={r.id} className="history-entry">
                                <span className="he-url">{r.baseUrl}</span>
                                <span className="he-stats">
                                    {r.pageCount} page(s) · {r.passed}/{r.totalScenarios} passed · {(r.durationMs / 1000).toFixed(1)}s{profileTag}
                                </span>
                                <div className="he-actions">
                                    {r.htmlReport && (
                                        <a href={r.htmlReport} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
                                            HTML
                                        </a>
                                    )}
                                    {r.jsonReport && (
                                        <a href={r.jsonReport} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
                                            JSON
                                        </a>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </section>
    );
}
