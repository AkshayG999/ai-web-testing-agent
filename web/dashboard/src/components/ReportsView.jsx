import { useState, useEffect } from 'react';

export default function ReportsView() {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadReports();
    }, []);

    const loadReports = async () => {
        try {
            const res = await fetch('/api/reports');
            const data = await res.json();
            setReports(data);
        } catch {
            setReports([]);
        }
        setLoading(false);
    };

    return (
        <section id="view-reports" className="view active">
            <h1>Reports</h1>
            <div className="reports-list">
                {loading ? (
                    <p className="muted">Loading...</p>
                ) : reports.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">📊</div>
                        <p className="empty-state-text">No reports found.</p>
                    </div>
                ) : (
                    reports.map((r, i) => (
                        <a
                            key={i}
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="report-entry"
                        >
                            <span className="re-name">{r.name}</span>
                            <span className={`re-type ${r.type}`}>{r.type}</span>
                            <span className="muted" style={{ fontSize: '0.78rem' }}>
                                {r.timestamp ? new Date(r.timestamp).toLocaleString() : ''}
                            </span>
                        </a>
                    ))
                )}
            </div>
        </section>
    );
}
