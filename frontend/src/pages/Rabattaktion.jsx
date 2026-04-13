import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { ChevronUp, ChevronDown } from 'lucide-react';

const fmt = (v, d = 2) => {
    if (v === null || v === undefined) return '-';
    return new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
};
const fmtEur = (v) => v === null || v === undefined ? '-' : fmt(v) + ' €';
const fmtPct = (v) => v === null || v === undefined ? '-' : fmt(v, 1) + '%';

const RABATT = 0.10;

function calcRabattSzenario(p) {
    if (!p.vkNetto || p.ekNetto === null || p.ekNetto === undefined) return null;
    const vkNettoRabatt = p.vkNetto * (1 - RABATT);
    const vkBruttoRabatt = p.vkBrutto != null ? p.vkBrutto * (1 - RABATT) : null;
    // Use actual per-unit costs if available, otherwise estimate
    const betriebSt = p.betriebskostenStueck != null ? p.betriebskostenStueck : p.vkNetto * 0.13;
    const werbeStueck = p.menge90d > 0 ? p.werbekosten / p.menge90d : p.vkNetto * 0.10;

    const gewinnNormalStueck = p.vkNetto - p.ekNetto - betriebSt - werbeStueck;
    const margeNormalProz = p.vkNetto > 0 ? (gewinnNormalStueck / p.vkNetto) * 100 : null;
    const gewinnRabattStueck = vkNettoRabatt - p.ekNetto - betriebSt - werbeStueck;
    const margeRabattProz = vkNettoRabatt > 0 ? (gewinnRabattStueck / vkNettoRabatt) * 100 : null;
    const deltaMarge = margeRabattProz !== null && margeNormalProz !== null ? margeRabattProz - margeNormalProz : null;

    let status;
    if (gewinnRabattStueck < 0) status = 'kritisch';
    else if (margeRabattProz < 10) status = 'vorsicht';
    else status = 'ok';

    return { vkBruttoRabatt, gewinnNormalStueck, margeNormalProz, gewinnRabattStueck, margeRabattProz, deltaMarge, status };
}

function getStatusConfig(status) {
    return ({
        kritisch: { label: 'Kritisch', color: '#ef4444', bg: '#fef2f2', border: '#fca5a5', sort: 0 },
        vorsicht: { label: 'Vorsicht', color: '#d97706', bg: '#fffbeb', border: '#fcd34d', sort: 1 },
        ok:       { label: 'OK',       color: '#10b981', bg: '#ecfdf5', border: '#6ee7b7', sort: 2 },
        unknown:  { label: '?',        color: '#6b7280', bg: '#f9fafb', border: '#d1d5db', sort: 3 },
    })[status] || { label: '?', color: '#6b7280', bg: '#f9fafb', border: '#d1d5db', sort: 3 };
}

function getDTPStatus(realeMargeProz, realeMargeStueck) {
    if (realeMargeStueck === null || realeMargeStueck === undefined || realeMargeProz === null || realeMargeProz === undefined) return 'unknown';
    if (realeMargeStueck < 0) return 'kritisch';
    if (realeMargeProz < 10) return 'vorsicht';
    return 'ok';
}

function StatusBadge({ status }) {
    const sc = getStatusConfig(status);
    return (
        <span style={{
            background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
            borderRadius: '999px', padding: '0.2rem 0.65rem',
            fontSize: '0.76rem', fontWeight: 700, whiteSpace: 'nowrap',
        }}>
            {sc.label}
        </span>
    );
}

function ColHeader({ label, sortKey, currentSort, onSort, align = 'right' }) {
    const active = currentSort.key === sortKey;
    return (
        <th
            onClick={() => onSort(sortKey)}
            style={{
                textAlign: align, padding: '0.55rem 0.75rem', cursor: 'pointer',
                userSelect: 'none', whiteSpace: 'nowrap', fontSize: '0.77rem',
                color: active ? '#4f46e5' : 'var(--text-muted)', fontWeight: 600,
                borderBottom: '2px solid var(--border-color)', background: '#f8fafc',
            }}
        >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                {label}
                {active
                    ? (currentSort.desc ? <ChevronDown size={11} /> : <ChevronUp size={11} />)
                    : <ChevronDown size={11} style={{ opacity: 0.25 }} />
                }
            </span>
        </th>
    );
}

function buildSorter(sort) {
    return (a, b) => {
        let av, bv;
        if (sort.key === 'status') {
            av = getStatusConfig(a._r?.status ?? 'unknown').sort;
            bv = getStatusConfig(b._r?.status ?? 'unknown').sort;
        } else if (sort.key === 'dtpStatus') {
            av = getStatusConfig(getDTPStatus(a.realeMargeProz, a.realeMargeStueck)).sort;
            bv = getStatusConfig(getDTPStatus(b.realeMargeProz, b.realeMargeStueck)).sort;
        } else if (sort.key.startsWith('r_')) {
            const k = sort.key.slice(2);
            av = a._r?.[k] ?? null;
            bv = b._r?.[k] ?? null;
        } else {
            av = a[sort.key];
            bv = b[sort.key];
        }
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        if (typeof av === 'string') return sort.desc ? bv.localeCompare(av) : av.localeCompare(bv);
        return sort.desc ? bv - av : av - bv;
    };
}

export default function Rabattaktion() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [view, setView] = useState('rabatt'); // 'rabatt' | 'dauertiefpreis' | 'alle'
    const [sort1, setSort1] = useState({ key: 'status', desc: false });
    const [sort2, setSort2] = useState({ key: 'realeMargeProz', desc: false });
    const [search1, setSearch1] = useState('');
    const [search2, setSearch2] = useState('');

    useEffect(() => {
        axios.get('/api/auswertung')
            .then(r => { setData(r.data.data || []); setLoading(false); })
            .catch(e => { setError(e.message); setLoading(false); });
    }, []);

    const { rabattProdukte, dtpProdukte } = useMemo(() => {
        const rabatt = [];
        const dtp = [];
        data.forEach(p => {
            if (p.dauertiefpreis) dtp.push(p);
            else rabatt.push({ ...p, _r: calcRabattSzenario(p) });
        });
        return { rabattProdukte: rabatt, dtpProdukte: dtp };
    }, [data]);

    const summary = useMemo(() => {
        const c = { kritisch: 0, vorsicht: 0, ok: 0 };
        rabattProdukte.forEach(p => { if (p._r?.status) c[p._r.status] = (c[p._r.status] || 0) + 1; });
        return c;
    }, [rabattProdukte]);

    function handleSort1(key) {
        setSort1(s => s.key === key ? { key, desc: !s.desc } : { key, desc: key === 'status' ? false : true });
    }
    function handleSort2(key) {
        setSort2(s => s.key === key ? { key, desc: !s.desc } : { key, desc: key === 'dtpStatus' ? false : true });
    }

    const sorted1 = useMemo(() => {
        const q = search1.toLowerCase();
        return [...rabattProdukte]
            .filter(p => !q || p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q))
            .sort(buildSorter(sort1));
    }, [rabattProdukte, sort1, search1]);

    const sorted2 = useMemo(() => {
        const q = search2.toLowerCase();
        return [...dtpProdukte]
            .filter(p => !q || p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q))
            .sort(buildSorter(sort2));
    }, [dtpProdukte, sort2, search2]);

    if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Lade Daten...</div>;
    if (error) return <div style={{ padding: '2rem', color: '#ef4444' }}>Fehler: {error}</div>;

    const showRabatt = view === 'rabatt' || view === 'alle';
    const showDTP = view === 'dauertiefpreis' || view === 'alle';

    return (
        <div style={{ padding: '1.5rem 2rem', maxWidth: '1400px' }}>
            {/* Header */}
            <div style={{ marginBottom: '1.5rem' }}>
                <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Rabattaktion</h1>
                <p style={{ color: 'var(--text-muted)', margin: '0.3rem 0 0', fontSize: '0.88rem' }}>
                    Auswirkung einer 10%-Rabattaktion auf Marge und Gewinn je Produkt
                </p>
            </div>

            {/* View tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                {[
                    { key: 'rabatt', label: `Für Rabatt freigegeben (${rabattProdukte.length})` },
                    { key: 'dauertiefpreis', label: `Nur Dauertiefpreis (${dtpProdukte.length})` },
                    { key: 'alle', label: 'Alle anzeigen' },
                ].map(({ key, label }) => (
                    <button key={key} onClick={() => setView(key)} style={{
                        padding: '0.45rem 1.1rem', borderRadius: '6px',
                        border: `1.5px solid ${view === key ? '#4f46e5' : 'var(--border-color)'}`,
                        background: view === key ? '#4f46e5' : 'white',
                        color: view === key ? 'white' : 'var(--text-muted)',
                        fontWeight: view === key ? 600 : 400,
                        cursor: 'pointer', fontSize: '0.85rem', transition: 'all 0.15s',
                    }}>
                        {label}
                    </button>
                ))}
            </div>

            {/* Summary cards (only visible in rabatt / alle view) */}
            {showRabatt && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.75rem' }}>
                    {[
                        { key: 'kritisch', label: 'Kritisch', subtitle: 'Verlust pro Stück bei −10%', color: '#ef4444', bg: '#fef2f2', border: '#fca5a5' },
                        { key: 'vorsicht', label: 'Vorsicht', subtitle: 'Marge unter 10% bei −10%', color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
                        { key: 'ok',       label: 'OK',       subtitle: 'Marge ≥ 10% bei −10%',    color: '#10b981', bg: '#ecfdf5', border: '#6ee7b7' },
                    ].map(({ key, label, subtitle, color, bg, border }) => (
                        <div key={key} style={{ background: bg, border: `1.5px solid ${border}`, borderRadius: '10px', padding: '1rem 1.25rem' }}>
                            <div style={{ fontSize: '2.2rem', fontWeight: 800, color, lineHeight: 1 }}>{summary[key] ?? 0}</div>
                            <div style={{ fontSize: '0.92rem', fontWeight: 700, color, marginTop: '0.3rem' }}>{label}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{subtitle}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Table 1: Für Rabatt freigegeben */}
            {showRabatt && (
                <section style={{ marginBottom: '2.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
                        <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
                            Produkte für Rabattaktion
                        </h2>
                        <input
                            value={search1}
                            onChange={e => setSearch1(e.target.value)}
                            placeholder="Suche nach Name / SKU..."
                            style={{ padding: '0.35rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.84rem', width: '220px' }}
                        />
                    </div>
                    <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr>
                                    <ColHeader label="Produkt"        sortKey="name"               currentSort={sort1} onSort={handleSort1} align="left" />
                                    <ColHeader label="Status"         sortKey="status"              currentSort={sort1} onSort={handleSort1} align="left" />
                                    <ColHeader label="Preis normal"   sortKey="vkBrutto"            currentSort={sort1} onSort={handleSort1} />
                                    <ColHeader label="Preis −10%"     sortKey="r_vkBruttoRabatt"    currentSort={sort1} onSort={handleSort1} />
                                    <ColHeader label="Marge normal"   sortKey="r_margeNormalProz"   currentSort={sort1} onSort={handleSort1} />
                                    <ColHeader label="Marge −10%"     sortKey="r_margeRabattProz"   currentSort={sort1} onSort={handleSort1} />
                                    <ColHeader label="Δ Marge"        sortKey="r_deltaMarge"        currentSort={sort1} onSort={handleSort1} />
                                    <ColHeader label="Gew./St. normal" sortKey="r_gewinnNormalStueck" currentSort={sort1} onSort={handleSort1} />
                                    <ColHeader label="Gew./St. −10%"  sortKey="r_gewinnRabattStueck" currentSort={sort1} onSort={handleSort1} />
                                </tr>
                            </thead>
                            <tbody>
                                {sorted1.map((p, i) => {
                                    const r = p._r;
                                    return (
                                        <tr key={p.sku} style={{ background: i % 2 === 0 ? 'white' : '#fafafa', borderBottom: '1px solid var(--border-color)' }}>
                                            <td style={{ padding: '0.6rem 0.75rem', maxWidth: '240px' }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                                                <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>{p.sku}</div>
                                            </td>
                                            <td style={{ padding: '0.6rem 0.75rem' }}>
                                                <StatusBadge status={r?.status ?? 'unknown'} />
                                            </td>
                                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>{fmtEur(p.vkBrutto)}</td>
                                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: '#4f46e5', fontWeight: 500 }}>{r ? fmtEur(r.vkBruttoRabatt) : '-'}</td>
                                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>{r ? fmtPct(r.margeNormalProz) : '-'}</td>
                                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 700, color: r ? (r.margeRabattProz < 0 ? '#ef4444' : r.margeRabattProz < 10 ? '#d97706' : '#10b981') : 'inherit' }}>
                                                {r ? fmtPct(r.margeRabattProz) : '-'}
                                            </td>
                                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 500, color: r?.deltaMarge < 0 ? '#ef4444' : '#10b981' }}>
                                                {r?.deltaMarge !== null && r?.deltaMarge !== undefined
                                                    ? (r.deltaMarge >= 0 ? '+' : '') + fmt(r.deltaMarge, 1) + ' pp'
                                                    : '-'}
                                            </td>
                                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: r?.gewinnNormalStueck >= 0 ? '#10b981' : '#ef4444' }}>
                                                {r ? fmtEur(r.gewinnNormalStueck) : '-'}
                                            </td>
                                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 700, color: r?.gewinnRabattStueck >= 0 ? '#10b981' : '#ef4444' }}>
                                                {r ? fmtEur(r.gewinnRabattStueck) : '-'}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {sorted1.length === 0 && (
                                    <tr><td colSpan={9} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Keine Produkte gefunden</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {/* Table 2: Dauertiefpreis */}
            {showDTP && (
                <section>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
                        <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
                            Dauertiefpreis-Produkte
                        </h2>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', background: '#f1f5f9', padding: '0.2rem 0.6rem', borderRadius: '999px', border: '1px solid var(--border-color)' }}>
                            Nicht für Rabattaktion geeignet
                        </span>
                        <input
                            value={search2}
                            onChange={e => setSearch2(e.target.value)}
                            placeholder="Suche nach Name / SKU..."
                            style={{ padding: '0.35rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.84rem', width: '220px' }}
                        />
                    </div>
                    <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr>
                                    <ColHeader label="Produkt"     sortKey="name"          currentSort={sort2} onSort={handleSort2} align="left" />
                                    <ColHeader label="Status"      sortKey="dtpStatus"     currentSort={sort2} onSort={handleSort2} align="left" />
                                    <ColHeader label="Preis Brutto" sortKey="vkBrutto"    currentSort={sort2} onSort={handleSort2} />
                                    <ColHeader label="Marge %"     sortKey="realeMargeProz" currentSort={sort2} onSort={handleSort2} />
                                    <ColHeader label="Gew./St."    sortKey="realeMargeStueck" currentSort={sort2} onSort={handleSort2} />
                                    <ColHeader label="Menge 90d"   sortKey="menge90d"      currentSort={sort2} onSort={handleSort2} />
                                </tr>
                            </thead>
                            <tbody>
                                {sorted2.map((p, i) => {
                                    const dtpStatus = getDTPStatus(p.realeMargeProz, p.realeMargeStueck);
                                    return (
                                        <tr key={p.sku} style={{ background: i % 2 === 0 ? 'white' : '#fafafa', borderBottom: '1px solid var(--border-color)' }}>
                                            <td style={{ padding: '0.6rem 0.75rem', maxWidth: '240px' }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                                                <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>{p.sku}</div>
                                            </td>
                                            <td style={{ padding: '0.6rem 0.75rem' }}>
                                                <StatusBadge status={dtpStatus} />
                                            </td>
                                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>{fmtEur(p.vkBrutto)}</td>
                                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 700, color: p.realeMargeProz < 0 ? '#ef4444' : p.realeMargeProz < 10 ? '#d97706' : '#10b981' }}>
                                                {fmtPct(p.realeMargeProz)}
                                            </td>
                                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 600, color: (p.realeMargeStueck ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>
                                                {fmtEur(p.realeMargeStueck)}
                                            </td>
                                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: 'var(--text-muted)' }}>
                                                {fmt(p.menge90d, 0)}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {sorted2.length === 0 && (
                                    <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Keine Dauertiefpreis-Produkte gefunden</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}
        </div>
    );
}
