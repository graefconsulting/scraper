import React, { useState } from 'react';

const UrlManager = ({ savedUrls, setSavedUrls }) => {
    const [newUrl, setNewUrl] = useState('');
    const [newName, setNewName] = useState('');
    const [newPurchasePrice, setNewPurchasePrice] = useState('');

    const handleAdd = (e) => {
        e.preventDefault();
        if (!newUrl.trim()) return;

        const priceVal = newPurchasePrice.trim() !== '' ? parseFloat(newPurchasePrice) : null;

        setSavedUrls([...savedUrls, {
            id: Date.now(),
            url: newUrl.trim(),
            title: newName.trim() || 'Unbenannt',
            purchasePrice: priceVal
        }]);
        setNewUrl('');
        setNewName('');
        setNewPurchasePrice('');
    };

    const handlePriceChange = (id, newPriceString) => {
        const val = newPriceString.trim() !== '' ? parseFloat(newPriceString) : null;
        setSavedUrls(savedUrls.map(u => u.id === id ? { ...u, purchasePrice: val } : u));
    };


    const handleRemove = (id) => {
        setSavedUrls(savedUrls.filter(u => u.id !== id));
    };

    return (
        <div className="glass-panel">
            <h2 style={{ marginBottom: '1.5rem', color: 'var(--text-main)' }}>URLs verwalten</h2>
            <form onSubmit={handleAdd} style={{ display: 'flex', gap: '1rem', flexDirection: 'column', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <input
                        type="url"
                        placeholder="Idealo URL (z.B. https://www.idealo.de/...)"
                        value={newUrl}
                        onChange={(e) => setNewUrl(e.target.value)}
                        required
                        style={{ flex: '2 1 250px', padding: '0.875rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'var(--text-main)' }}
                    />
                    <input
                        type="text"
                        placeholder="Bezeichnung (Optional)"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        style={{ flex: '1 1 150px', padding: '0.875rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'var(--text-main)' }}
                    />
                    <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Einkaufspreis € (Optional)"
                        value={newPurchasePrice}
                        onChange={(e) => setNewPurchasePrice(e.target.value)}
                        style={{ flex: '1 1 150px', padding: '0.875rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'var(--text-main)' }}
                    />
                    <button type="submit" className="submit-btn" style={{ flex: '0 0 auto', padding: '0.875rem 1.5rem' }}>Hinzufügen</button>
                </div>
            </form>

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', minWidth: '500px' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                            <th style={{ padding: '1rem 0.5rem', color: 'var(--text-muted)' }}>Bezeichnung</th>
                            <th style={{ padding: '1rem 0.5rem', color: 'var(--text-muted)' }}>URL</th>
                            <th style={{ padding: '1rem 0.5rem', color: 'var(--text-muted)', width: '150px' }}>Einkaufspreis (€)</th>
                            <th style={{ padding: '1rem 0.5rem', width: '100px', textAlign: 'right', color: 'var(--text-muted)' }}>Aktion</th>
                        </tr>
                    </thead>
                    <tbody>
                        {savedUrls.length === 0 ? (
                            <tr><td colSpan="4" style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>Keine URLs gespeichert. Füge oben welche hinzu!</td></tr>
                        ) : (
                            savedUrls.map((u) => (
                                <tr key={u.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <td style={{ padding: '1rem 0.5rem', fontWeight: 500 }}>{u.title}</td>
                                    <td style={{ padding: '1rem 0.5rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={u.url}>
                                        <a href={u.url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary-color)', textDecoration: 'none' }}>Link öffnen ↗</a>
                                    </td>
                                    <td style={{ padding: '1rem 0.5rem' }}>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={u.purchasePrice !== null && u.purchasePrice !== undefined ? u.purchasePrice : ''}
                                            onChange={(e) => handlePriceChange(u.id, e.target.value)}
                                            style={{ width: '100px', padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'var(--text-main)' }}
                                            placeholder="z.B. 14.99"
                                        />
                                    </td>
                                    <td style={{ padding: '1rem 0.5rem', textAlign: 'right' }}>
                                        <button
                                            onClick={() => handleRemove(u.id)}
                                            style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--error-color)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}
                                            onMouseOver={(e) => { e.currentTarget.style.background = 'var(--error-color)'; e.currentTarget.style.color = '#fff'; }}
                                            onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; e.currentTarget.style.color = 'var(--error-color)'; }}
                                        >
                                            Löschen
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default UrlManager;
