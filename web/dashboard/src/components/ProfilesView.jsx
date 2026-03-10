import { useState, useEffect, useCallback } from 'react';

function KvRow({ keyVal, valVal, keyPlaceholder, valPlaceholder, onChange, onRemove }) {
    return (
        <div className="kv-row">
            <input
                type="text"
                placeholder={keyPlaceholder || 'Key'}
                value={keyVal}
                onChange={(e) => onChange('key', e.target.value)}
            />
            <input
                type="text"
                placeholder={valPlaceholder || 'Value'}
                value={valVal}
                onChange={(e) => onChange('val', e.target.value)}
            />
            <button type="button" className="btn-remove-row" title="Remove" onClick={onRemove}>
                ×
            </button>
        </div>
    );
}

function PageDataBlock({ pathPattern, fields, onPathChange, onFieldChange, onAddField, onRemoveField, onRemove }) {
    return (
        <div className="page-data-block">
            <div className="pdb-header">
                <input
                    type="text"
                    placeholder="/path"
                    value={pathPattern}
                    onChange={(e) => onPathChange(e.target.value)}
                />
                <button type="button" className="btn-remove-row" title="Remove page" onClick={onRemove}>
                    ×
                </button>
            </div>
            <div className="pdb-fields">
                {fields.map((field, idx) => (
                    <KvRow
                        key={idx}
                        keyVal={field.key}
                        valVal={field.val}
                        keyPlaceholder="Field name"
                        valPlaceholder="Value"
                        onChange={(type, value) => onFieldChange(idx, type, value)}
                        onRemove={() => onRemoveField(idx)}
                    />
                ))}
            </div>
            <button type="button" className="btn-add-row" onClick={onAddField}>
                + Add Field
            </button>
        </div>
    );
}

export default function ProfilesView() {
    const [profiles, setProfiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showEditor, setShowEditor] = useState(false);

    // Editor state
    const [editId, setEditId] = useState('');
    const [editorTitle, setEditorTitle] = useState('New Profile');
    const [peName, setPeName] = useState('');
    const [peAuthUrl, setPeAuthUrl] = useState('');
    const [peSuccessType, setPeSuccessType] = useState('');
    const [peSuccessValue, setPeSuccessValue] = useState('');
    const [authFields, setAuthFields] = useState([{ key: '', val: '' }]);
    const [globalData, setGlobalData] = useState([{ key: '', val: '' }]);
    const [pageData, setPageData] = useState([]);
    const [saveMsg, setSaveMsg] = useState(false);

    const loadProfiles = useCallback(async () => {
        try {
            const res = await fetch('/api/profiles');
            const data = await res.json();
            setProfiles(data);
        } catch {
            setProfiles([]);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        loadProfiles();
    }, [loadProfiles]);

    const openEditor = (profile) => {
        setShowEditor(true);
        if (profile) {
            setEditorTitle(`Edit: ${profile.name}`);
            setEditId(profile.id);
            setPeName(profile.name);

            const auth = profile.auth || {};
            setPeAuthUrl(auth.loginUrl || '');
            setPeSuccessType(auth.successCheck?.type || '');
            setPeSuccessValue(auth.successCheck?.value || '');

            if (auth.fields && Object.keys(auth.fields).length > 0) {
                setAuthFields(Object.entries(auth.fields).map(([key, val]) => ({ key, val })));
            } else {
                setAuthFields([{ key: '', val: '' }]);
            }

            if (profile.globalData && Object.keys(profile.globalData).length > 0) {
                setGlobalData(Object.entries(profile.globalData).map(([key, val]) => ({ key, val })));
            } else {
                setGlobalData([{ key: '', val: '' }]);
            }

            if (profile.pageData && Object.keys(profile.pageData).length > 0) {
                setPageData(
                    Object.entries(profile.pageData).map(([path, fields]) => ({
                        path,
                        fields: Object.entries(fields).map(([key, val]) => ({ key, val })),
                    }))
                );
            } else {
                setPageData([]);
            }
        } else {
            setEditorTitle('New Profile');
            setEditId('');
            setPeName('');
            setPeAuthUrl('');
            setPeSuccessType('');
            setPeSuccessValue('');
            setAuthFields([{ key: '', val: '' }]);
            setGlobalData([{ key: '', val: '' }]);
            setPageData([]);
        }
    };

    const gatherProfile = () => {
        const authFieldsObj = {};
        authFields.forEach(({ key, val }) => {
            if (key.trim()) authFieldsObj[key.trim()] = val.trim();
        });

        const auth = {};
        if (peAuthUrl.trim()) {
            auth.loginUrl = peAuthUrl.trim();
            auth.fields = authFieldsObj;
            if (peSuccessType && peSuccessValue.trim()) {
                auth.successCheck = { type: peSuccessType, value: peSuccessValue.trim() };
            }
        }

        const globalDataObj = {};
        globalData.forEach(({ key, val }) => {
            if (key.trim()) globalDataObj[key.trim()] = val.trim();
        });

        const pageDataObj = {};
        pageData.forEach(({ path, fields }) => {
            if (!path.trim()) return;
            const fieldsObj = {};
            fields.forEach(({ key, val }) => {
                if (key.trim()) fieldsObj[key.trim()] = val.trim();
            });
            pageDataObj[path.trim()] = fieldsObj;
        });

        return {
            name: peName.trim(),
            auth: Object.keys(auth).length ? auth : undefined,
            globalData: Object.keys(globalDataObj).length ? globalDataObj : undefined,
            pageData: Object.keys(pageDataObj).length ? pageDataObj : undefined,
        };
    };

    const handleSave = async () => {
        const profile = gatherProfile();
        if (!profile.name) {
            alert('Profile name is required');
            return;
        }

        try {
            if (editId) {
                await fetch(`/api/profiles/${editId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(profile),
                });
            } else {
                await fetch('/api/profiles', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(profile),
                });
            }
            setSaveMsg(true);
            setTimeout(() => setSaveMsg(false), 2000);
            loadProfiles();
        } catch {
            alert('Failed to save profile');
        }
    };

    const handleDelete = async (id, name) => {
        if (!confirm(`Delete profile "${name}"?`)) return;
        try {
            await fetch(`/api/profiles/${id}`, { method: 'DELETE' });
            loadProfiles();
        } catch {
            alert('Failed to delete profile');
        }
    };

    const handleEdit = async (id) => {
        try {
            const res = await fetch(`/api/profiles/${id}`);
            const profile = await res.json();
            openEditor(profile);
        } catch {
            alert('Failed to load profile');
        }
    };

    // KV row helpers for auth fields
    const updateAuthField = (index, type, value) => {
        setAuthFields(prev => prev.map((item, i) =>
            i === index ? { ...item, [type]: value } : item
        ));
    };

    const updateGlobalData = (index, type, value) => {
        setGlobalData(prev => prev.map((item, i) =>
            i === index ? { ...item, [type]: value } : item
        ));
    };

    const updatePageDataPath = (pageIndex, newPath) => {
        setPageData(prev => prev.map((item, i) =>
            i === pageIndex ? { ...item, path: newPath } : item
        ));
    };

    const updatePageDataField = (pageIndex, fieldIndex, type, value) => {
        setPageData(prev => prev.map((item, i) =>
            i === pageIndex
                ? {
                    ...item,
                    fields: item.fields.map((f, fi) =>
                        fi === fieldIndex ? { ...f, [type]: value } : f
                    ),
                }
                : item
        ));
    };

    return (
        <section id="view-profiles" className="view active">
            <div className="view-header-row">
                <h1>Test Data Profiles</h1>
                <button className="btn btn-primary" onClick={() => openEditor(null)}>
                    + New Profile
                </button>
            </div>

            <div className="profiles-list">
                {loading ? (
                    <p className="muted">Loading...</p>
                ) : profiles.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">👤</div>
                        <p className="empty-state-text">No profiles yet. Create one to provide test data for your runs.</p>
                    </div>
                ) : (
                    profiles.map(p => {
                        const authInfo = p.auth && p.auth.loginUrl ? `Auth: ${p.auth.loginUrl}` : 'No auth';
                        const globalCount = Object.keys(p.globalData || {}).length;
                        const pageCount = Object.keys(p.pageData || {}).length;
                        return (
                            <div key={p.id} className="profile-card">
                                <span className="pc-name">{p.name}</span>
                                <span className="pc-meta">
                                    {authInfo} · {globalCount} global field(s) · {pageCount} page override(s)
                                </span>
                                <div className="pc-actions">
                                    <button className="btn btn-sm" onClick={() => handleEdit(p.id)}>Edit</button>
                                    <button className="btn btn-sm" onClick={() => handleDelete(p.id, p.name)}>Delete</button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Profile Editor */}
            {showEditor && (
                <div className="card profile-editor">
                    <h2>{editorTitle}</h2>

                    <div className="form-group">
                        <label htmlFor="peName">Profile Name</label>
                        <input
                            type="text"
                            id="peName"
                            placeholder="e.g. Staging Admin"
                            value={peName}
                            onChange={(e) => setPeName(e.target.value)}
                        />
                    </div>

                    <fieldset>
                        <legend>Authentication (optional)</legend>
                        <p className="field-hint">
                            If the site requires login, provide credentials here. The system will log in before testing.
                        </p>
                        <div className="settings-grid">
                            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                <label htmlFor="peAuthUrl">Login URL</label>
                                <input
                                    type="text"
                                    id="peAuthUrl"
                                    placeholder="https://example.com/login or /login"
                                    value={peAuthUrl}
                                    onChange={(e) => setPeAuthUrl(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="kv-section">
                            <label className="kv-label">Login Fields</label>
                            <p className="field-hint">
                                Field hint = label, placeholder, name, id, or type (e.g. "Email", "password")
                            </p>
                            {authFields.map((field, i) => (
                                <KvRow
                                    key={i}
                                    keyVal={field.key}
                                    valVal={field.val}
                                    keyPlaceholder='Field hint (e.g. email)'
                                    valPlaceholder="Value"
                                    onChange={(type, value) => updateAuthField(i, type, value)}
                                    onRemove={() => setAuthFields(prev => prev.filter((_, idx) => idx !== i))}
                                />
                            ))}
                            <button
                                type="button"
                                className="btn-add-row"
                                onClick={() => setAuthFields(prev => [...prev, { key: '', val: '' }])}
                            >
                                + Add Field
                            </button>
                        </div>
                        <div className="settings-grid" style={{ marginTop: '0.75rem' }}>
                            <div className="form-group">
                                <label htmlFor="peSuccessType">Success Check</label>
                                <select
                                    id="peSuccessType"
                                    value={peSuccessType}
                                    onChange={(e) => setPeSuccessType(e.target.value)}
                                >
                                    <option value="">Auto (wait for navigation)</option>
                                    <option value="url_contains">URL contains</option>
                                    <option value="url_equals">URL equals</option>
                                    <option value="element_visible">Element visible</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label htmlFor="peSuccessValue">Success Value</label>
                                <input
                                    type="text"
                                    id="peSuccessValue"
                                    placeholder="e.g. /dashboard or .welcome-msg"
                                    value={peSuccessValue}
                                    onChange={(e) => setPeSuccessValue(e.target.value)}
                                />
                            </div>
                        </div>
                    </fieldset>

                    <fieldset>
                        <legend>Global Test Data</legend>
                        <p className="field-hint">
                            Key-value pairs available to the AI for all pages (e.g. email, password, userName).
                        </p>
                        {globalData.map((field, i) => (
                            <KvRow
                                key={i}
                                keyVal={field.key}
                                valVal={field.val}
                                keyPlaceholder="Key"
                                valPlaceholder="Value"
                                onChange={(type, value) => updateGlobalData(i, type, value)}
                                onRemove={() => setGlobalData(prev => prev.filter((_, idx) => idx !== i))}
                            />
                        ))}
                        <button
                            type="button"
                            className="btn-add-row"
                            onClick={() => setGlobalData(prev => [...prev, { key: '', val: '' }])}
                        >
                            + Add Field
                        </button>
                    </fieldset>

                    <fieldset>
                        <legend>Page-Specific Data</legend>
                        <p className="field-hint">
                            Data for specific URL paths. The key is the path pattern (e.g. "/register"), values are field-value pairs.
                        </p>
                        {pageData.map((page, pi) => (
                            <PageDataBlock
                                key={pi}
                                pathPattern={page.path}
                                fields={page.fields}
                                onPathChange={(val) => updatePageDataPath(pi, val)}
                                onFieldChange={(fi, type, value) => updatePageDataField(pi, fi, type, value)}
                                onAddField={() => {
                                    setPageData(prev => prev.map((item, i) =>
                                        i === pi
                                            ? { ...item, fields: [...item.fields, { key: '', val: '' }] }
                                            : item
                                    ));
                                }}
                                onRemoveField={(fi) => {
                                    setPageData(prev => prev.map((item, i) =>
                                        i === pi
                                            ? { ...item, fields: item.fields.filter((_, idx) => idx !== fi) }
                                            : item
                                    ));
                                }}
                                onRemove={() => setPageData(prev => prev.filter((_, i) => i !== pi))}
                            />
                        ))}
                        <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => setPageData(prev => [...prev, { path: '', fields: [{ key: '', val: '' }] }])}
                        >
                            + Add Page
                        </button>
                    </fieldset>

                    <div className="form-actions">
                        <button type="button" className="btn btn-primary" onClick={handleSave}>
                            Save Profile
                        </button>
                        <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => setShowEditor(false)}
                        >
                            Cancel
                        </button>
                        {saveMsg && <span className="save-msg">Saved!</span>}
                    </div>
                </div>
            )}
        </section>
    );
}
