import React, { useState, useMemo } from 'react';
import { Download, Trash2, Search, PackageX, Ban } from 'lucide-react';

const PRICE_CHANGES_KEY = 'hr_price_changes';
const DELIST_KEY = 'hr_delist_decisions';
const ADS_OFF_KEY = 'hr_ads_off_decisions';

const fmt = (v, d = 2) => {
    if (v === null || v === undefined) return '-';
    return new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
};
const fmtEur = (v) => v === null || v === undefined ? '-' : fmt(v) + ' €';
const fmtPct = (v) => v === null || v === undefined ? '-' : fmt(v, 1) + '%';

export default function Preisaenderungen() {
    const [changes, setChanges] = useState(() => JSON.parse(localStorage.getItem(PRICE_CHANGES_KEY) || '{}'));
    const [delists, setDelists] = useState(() => JSON.parse(localStorage.getItem(DELIST_KEY) || '{}'));
    const [adsOff, setAdsOff] = useState(() => JSON.parse(localStorage.getItem(ADS_OFF_KEY) || '{}'));
    const [search, setSearch] = useState('');

    const priceEntries = useMemo(() => {
        let list = Object.values(changes).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        if (search) { const s = search.toLowerCase(); list = list.filter(e => e.sku?.toLowerCase().includes(s) || e.name?.toLowerCase().includes(s)); }
        return list;
    }, [changes, search]);

    const delistEntries = useMemo(() => {
        let list = Object.values(delists).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        if (search) { const s = search.toLowerCase(); list = list.filter(e => e.sku?.toLowerCase().includes(s) || e.name?.toLowerCase().includes(s)); }
        return list;
    }, [delists, search]);

    const adsOffEntries = useMemo(() => {
        let list = Object.values(adsOff).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        if (search) { const s = search.toLowerCase(); list = list.filter(e => e.sku?.toLowerCase().includes(s) || e.name?.toLowerCase().includes(s)); }
        return list;
    }, [adsOff, search]);

    const removePriceEntry = (sku) => {
        const updated = { ...changes }; delete updated[sku];
        localStorage.setItem(PRICE_CHANGES_KEY, JSON.stringify(updated)); setChanges(updated);
    };
    const clearAllPrices = () => {
        if (!confirm('Alle Preisänderungen löschen?')) return;
        localStorage.removeItem(PRICE_CHANGES_KEY); setChanges({});
    };
    const removeDelistEntry = (sku) => {
        const updated = { ...delists }; delete updated[sku];
        localStorage.setItem(DELIST_KEY, JSON.stringify(updated)); setDelists(updated);
    };
    const clearAllDelists = () => {
        if (!confirm('Alle Auslistungen löschen?')) return;
        localStorage.removeItem(DELIST_KEY); setDelists({});
    };
    const removeAdsOffEntry = (sku) => {
        const updated = { ...adsOff }; delete updated[sku];
        localStorage.setItem(ADS_OFF_KEY, JSON.stringify(updated)); setAdsOff(updated);
    };
    const clearAllAdsOff = () => {
        if (!confirm('Alle Werbung-Abschaltungen löschen?')) return;
        localStorage.removeItem(ADS_OFF_KEY); setAdsOff({});
    };

    const exportCSV = () => {
        const lines = ['Aktion;SKU;Produkt;Alter Brutto-VK;Neuer Brutto-VK;Preisdiff €;Preisdiff %;Alte Reale Marge %;Neue Reale Marge %;Margenopfer pp;Neue Marge/Stück;Datum'];
        const f = (n) => n !== null && n !== undefined ? n.toFixed(2).replace('.', ',') : '';
        for (const e of Object.values(changes)) {
            lines.push(['Preisänderung', e.sku, e.name?.includes(';') ? `"${e.name}"` : e.name,
                f(e.alterBrutto), f(e.neuerBrutto), f(e.preisdiffEur), f(e.preisdiffPct),
                f(e.alteRealeMarge), f(e.neueRealeMarge), f(e.margenopferPp), f(e.neueMargeStueck),
                e.timestamp ? new Date(e.timestamp).toLocaleString('de-DE') : ''].join(';'));
        }
        for (const e of Object.values(delists)) {
            lines.push(['Auslistung', e.sku, e.name?.includes(';') ? `"${e.name}"` : e.name,
                '', '', '', '', '', '', '', '',
                e.timestamp ? new Date(e.timestamp).toLocaleString('de-DE') : ''].join(';'));
        }
        for (const e of Object.values(adsOff)) {
            lines.push(['Werbung ausschalten', e.sku, e.name?.includes(';') ? `"${e.name}"` : e.name,
                '', '', '', '', '', '', '', '',
                e.timestamp ? new Date(e.timestamp).toLocaleString('de-DE') : ''].join(';'));
        }
        if (lines.length <= 1) return;
        const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = `preisaenderungen_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    const priceCount = Object.keys(changes).length;
    const delistCount = Object.keys(delists).length;
    const adsOffCount = Object.keys(adsOff).length;
    const totalCount = priceCount + delistCount + adsOffCount;

    return (
        <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h2 style={{ margin: 0 }}>Preisänderungen</h2>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {priceCount} Preisänderung{priceCount !== 1 ? 'en' : ''}, {delistCount} Auslistung{delistCount !== 1 ? 'en' : ''}, {adsOffCount} Werbung aus
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={16} style={{ position: 'absolute', left: '10px', top: '9px', color: '#9ca3af' }} />
                        <input type="text" placeholder="Suche..." value={search} onChange={e => setSearch(e.target.value)}
                            style={{ padding: '0.45rem 0.8rem 0.45rem 2rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', width: '180px', fontSize: '0.85rem' }} />
                    </div>
                    <button onClick={exportCSV} disabled={totalCount === 0}
                        style={{ background: totalCount > 0 ? '#1d4ed8' : '#94a3b8', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: totalCount > 0 ? 'pointer' : 'default', fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Download size={14} /> CSV Export
                    </button>
                </div>
            </div>

            {/* Price Changes Section */}
            <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Preisänderungen ({priceCount})</h3>
                    {priceCount > 0 && (
                        <button onClick={clearAllPrices}
                            style={{ background: 'white', color: '#ef4444', border: '1px solid #fecaca', padding: '0.35rem 0.7rem', borderRadius: '0.4rem', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Trash2 size={12} /> Alle löschen
                        </button>
                    )}
                </div>

                {priceCount === 0 ? (
                    <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Keine Preisänderungen. Nutze den Preisrechner in der Auswertung.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        {priceEntries.map(e => {
                            const diffColor = e.preisdiffEur < 0 ? '#10b981' : e.preisdiffEur > 0 ? '#ef4444' : 'var(--text-color)';
                            const margenColor = e.margenopferPp !== null && e.margenopferPp < 0 ? '#ef4444' : e.margenopferPp > 0 ? '#10b981' : 'var(--text-color)';
                            const neueMargeColor = e.neueRealeMarge !== null ? (e.neueRealeMarge < 0 ? '#ef4444' : e.neueRealeMarge < 10 ? '#f59e0b' : '#10b981') : 'var(--text-muted)';
                            return (
                                <div key={e.sku} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.6rem 0.5rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                                    <div style={{ flex: '2', minWidth: '160px' }}>
                                        <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{e.sku}</div>
                                    </div>
                                    <div style={{ flex: '1.2', minWidth: '130px' }}>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block' }}>Brutto-VK</span>
                                        <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)' }}>{fmtEur(e.alterBrutto)}</span>
                                        <span style={{ color: 'var(--text-color)' }}> → </span>
                                        <span style={{ fontWeight: 700 }}>{fmtEur(e.neuerBrutto)}</span>
                                    </div>
                                    <div style={{ flex: '0.7', minWidth: '80px' }}>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block' }}>Diff.</span>
                                        <span style={{ fontWeight: 600, color: diffColor }}>{e.preisdiffEur > 0 ? '+' : ''}{fmtEur(e.preisdiffEur)}</span>
                                    </div>
                                    <div style={{ flex: '1', minWidth: '110px' }}>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block' }}>Reale Marge</span>
                                        <span style={{ color: 'var(--text-muted)' }}>{fmtPct(e.alteRealeMarge)}</span>
                                        <span> → </span>
                                        <span style={{ fontWeight: 700, color: neueMargeColor }}>{fmtPct(e.neueRealeMarge)}</span>
                                    </div>
                                    <div style={{ flex: '0.5', minWidth: '55px' }}>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block' }}>Opfer</span>
                                        <span style={{ fontWeight: 600, color: margenColor }}>{e.margenopferPp !== null ? `${e.margenopferPp > 0 ? '+' : ''}${fmt(e.margenopferPp, 1)}pp` : '-'}</span>
                                    </div>
                                    <div style={{ flex: '0.5', minWidth: '55px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                        {e.timestamp ? new Date(e.timestamp).toLocaleDateString('de-DE') : ''}
                                    </div>
                                    <button onClick={() => removePriceEntry(e.sku)} style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '0.3rem' }}
                                        onMouseEnter={ev => ev.currentTarget.style.color = '#ef4444'} onMouseLeave={ev => ev.currentTarget.style.color = '#94a3b8'}>
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Delist Section */}
            <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <PackageX size={18} color="#ef4444" />
                        <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Auslistungen ({delistCount})</h3>
                    </div>
                    {delistCount > 0 && (
                        <button onClick={clearAllDelists}
                            style={{ background: 'white', color: '#ef4444', border: '1px solid #fecaca', padding: '0.35rem 0.7rem', borderRadius: '0.4rem', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Trash2 size={12} /> Alle löschen
                        </button>
                    )}
                </div>

                {delistCount === 0 ? (
                    <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Keine Auslistungen. Markiere Produkte auf der Empfehlungen-Seite.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        {delistEntries.map(e => (
                            <div key={e.sku} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                                <div style={{ flex: '3', minWidth: '200px' }}>
                                    <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{e.sku}</div>
                                </div>
                                <div style={{ flex: '0.5' }}>
                                    <span style={{ background: '#fef2f2', color: '#991b1b', fontSize: '0.78rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '0.3rem' }}>Auslistung</span>
                                </div>
                                <div style={{ flex: '0.5', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                    {e.timestamp ? new Date(e.timestamp).toLocaleDateString('de-DE') : ''}
                                </div>
                                <button onClick={() => removeDelistEntry(e.sku)} style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '0.3rem' }}
                                    onMouseEnter={ev => ev.currentTarget.style.color = '#ef4444'} onMouseLeave={ev => ev.currentTarget.style.color = '#94a3b8'}>
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Ads Off Section */}
            <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Ban size={18} color="#e85d04" />
                        <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Werbung ausschalten ({adsOffCount})</h3>
                    </div>
                    {adsOffCount > 0 && (
                        <button onClick={clearAllAdsOff}
                            style={{ background: 'white', color: '#ef4444', border: '1px solid #fecaca', padding: '0.35rem 0.7rem', borderRadius: '0.4rem', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Trash2 size={12} /> Alle löschen
                        </button>
                    )}
                </div>

                {adsOffCount === 0 ? (
                    <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Keine Werbung-Abschaltungen. Markiere Produkte unter "Aus der Werbung nehmen" auf der Empfehlungen-Seite.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        {adsOffEntries.map(e => (
                            <div key={e.sku} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                                <div style={{ flex: '3', minWidth: '200px' }}>
                                    <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{e.sku}</div>
                                </div>
                                <div style={{ flex: '0.5' }}>
                                    <span style={{ background: '#fff7ed', color: '#c2410c', fontSize: '0.78rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '0.3rem' }}>Google Aus</span>
                                </div>
                                <div style={{ flex: '0.5', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                    {e.timestamp ? new Date(e.timestamp).toLocaleDateString('de-DE') : ''}
                                </div>
                                <button onClick={() => removeAdsOffEntry(e.sku)} style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '0.3rem' }}
                                    onMouseEnter={ev => ev.currentTarget.style.color = '#ef4444'} onMouseLeave={ev => ev.currentTarget.style.color = '#94a3b8'}>
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
