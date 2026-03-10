import { useEffect, useState } from 'react';
import socket from '../socket';

const navItems = [
    { id: 'run', icon: '▶', label: 'New Run' },
    { id: 'profiles', icon: '👤', label: 'Test Data' },
    { id: 'history', icon: '📄', label: 'History' },
    { id: 'reports', icon: '📊', label: 'Reports' },
    { id: 'settings', icon: '⚙', label: 'Settings' },
];

export default function Sidebar({ activeView, onViewChange }) {
    const [status, setStatus] = useState({ state: 'idle', text: 'Idle' });

    useEffect(() => {
        const handleStatus = ({ running }) => {
            if (running) setStatus({ state: 'running', text: 'Running...' });
        };

        const handleRunStart = () => setStatus({ state: 'running', text: 'Running...' });
        const handleRunEnd = (data) => {
            if (data.error && !data.totalScenarios) {
                setStatus({ state: 'error', text: 'Error' });
            } else {
                setStatus({ state: 'done', text: 'Done' });
            }
        };
        const handleError = () => setStatus({ state: 'error', text: 'Error' });

        socket.on('status', handleStatus);
        socket.on('runStart', handleRunStart);
        socket.on('runEnd', handleRunEnd);
        socket.on('error', handleError);

        return () => {
            socket.off('status', handleStatus);
            socket.off('runStart', handleRunStart);
            socket.off('runEnd', handleRunEnd);
            socket.off('error', handleError);
        };
    }, []);

    // Expose setStatus for external use
    useEffect(() => {
        window.__setDashboardStatus = setStatus;
        return () => { delete window.__setDashboardStatus; };
    }, []);

    return (
        <aside className="sidebar">
            <div className="sidebar-brand">
                <span className="brand-icon">⚙</span>
                <span className="brand-text">AI Web Tester</span>
            </div>
            <nav className="sidebar-nav">
                {navItems.map(item => (
                    <button
                        key={item.id}
                        className={`nav-btn${activeView === item.id ? ' active' : ''}`}
                        data-view={item.id}
                        onClick={() => onViewChange(item.id)}
                    >
                        <span className="nav-icon">{item.icon}</span>
                        {item.label}
                    </button>
                ))}
            </nav>
            <div className="sidebar-footer">
                <div className={`status-dot ${status.state}`}></div>
                <span>{status.text}</span>
            </div>
        </aside>
    );
}
