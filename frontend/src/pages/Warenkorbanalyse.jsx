import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { ShoppingCart, ChevronDown, ChevronUp, TrendingUp, Package, Users } from 'lucide-react';

const fmt = (v, d = 1) => {
    if (v === null || v === undefined || isNaN(v)) return '–';
    return new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
};
const fmtPct = v => fmt(v) + '%';

// Lift farblich einordnen
function liftColor(lift) {
    if (lift >= 5) return '#7c3aed';
    if (lift >= 3) return '#dc2626';
    if (lift >= 2) return '#d97706';
    if (lift >= 1.5) return '#15803d';
    return '#6b7280';
}
function liftBg(lift) {
    if (lift >= 5) return '#f5f3ff';
    if (lift >= 3) return '#fef2f2';
    if (lift >= 2) return '#fffbeb';
    if (lift >= 1.5) return '#f0fdf4';
    return '#f9fafb';
}
function liftLabel(lift) {
    if (lift >= 5) return 'sehr stark';
    if (lift >= 3) return 'stark';
    if (lift >= 2) return 'mittel';
    if (lift >= 1.5) return 'leicht';
    return 'schwach';
}

function SoloBar({ rate }) {
    const color = rate > 85 ? '#6b7280' : rate > 60 ? '#d97706' : '#10b981';
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <div style={{ flex: 1, height: 6, background: '#e5e7eb', borderRadius: 3, minWidth: 50 }}>
                <div style={{ width: `${rate}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
            </div>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color, minWidth: 38, textAlign: 'right' }}>
                {fmt(rate)}%
            </span>
        </div>
    );
}

function StatCard({ icon: Icon, label, value, sub, color = '#4f46e5' }) {
    return (
        <div style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '1rem 1.25rem', display: 'flex', gap: '0.9rem', alignItems: 'center' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={20} color={color} />
            </div>
            <div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>{label}</div>
                {sub && <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{sub}</div>}
            </div>
        </div>
    );
}

export default function Warenkorbanalyse() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState({ key: 'orderCount', desc: true });
    const [expandedSkus, setExpandedSkus] = useState({});
    const [filter, setFilter] = useState('all'); // all | bundle | solo | multi-qty

    useEffect(() => {
        axios.get('/api/warenkorb')
            .then(r => { setData(r.data); setLoading(false); })
            .catch(e => { setError(e.message); setLoading(false); });
    }, []);

    const toggleExpand = sku => setExpandedSkus(p => {
        const n = { ...p };
        if (n[sku]) delete n[sku]; else n[sku] = true;
        return n;
    });

    const handleSort = key => setSort(s => s.key === key ? { ...s, desc: !s.desc } : { key, desc: true });

    const filtered = useMemo(() => {
        if (!data?.products) return [];
        let list = data.products;
        const q = search.toLowerCase();
        if (q) list = list.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
        if (filter === 'bundle') list = list.filter(p => p.soloRate < 60);
        if (filter === 'solo') list = list.filter(p => p.soloRate >= 85);
        if (filter === 'multi-qty') list = list.filter(p => p.avgQtyPerOrder >= 1.5);
        const accessor = {
            name: p => p.name,
            orderCount: p => p.orderCount,
            totalUnits: p => p.totalUnits,
            avgQty: p => p.avgQtyPerOrder,
            soloRate: p => p.soloRate,
            topLift: p => p.topCombos?.[0]?.lift ?? 0,
        }[sort.key] || (p => p.orderCount);
        return [...list].sort((a, b) => {
            const av = accessor(a), bv = accessor(b);
            if (typeof av === 'string') return sort.desc ? bv.localeCompare(av) : av.localeCompare(bv);
            return sort.desc ? bv - av : av - bv;
        });
    }, [data, search, sort, filter]);

    function SortTh({ children, sortKey, align = 'right' }) {
        const active = sort.key === sortKey;
        return (
            <th onClick={() => handleSort(sortKey)} style={{
                textAlign: align, padding: '0.5rem 0.75rem', fontSize: '0.72rem',
                textTransform: 'uppercase', fontWeight: 600, whiteSpace: 'nowrap',
                cursor: 'pointer', userSelect: 'none', background: active ? '#eef2ff' : '#f8fafc',
                color: active ? '#4f46e5' : '#64748b', borderBottom: '1px solid #e2e8f0',
            }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    {children}
                    {active
                        ? (sort.desc ? <ChevronDown size={11} /> : <ChevronUp size={11} />)
                        : <ChevronDown size={11} style={{ opacity: 0.25 }} />}
                </span>
            </th>
        );
    }

    if (loading) return <div style={{ padding: '2rem', color: '#64748b' }}>Lade Warenkorbdaten…</div>;
    if (error) return <div style={{ padding: '2rem', color: '#ef4444' }}>Fehler: {error}</div>;

    const { meta, topPairs } = data;

    return (
        <div style={{ padding: '1.5rem 2rem', maxWidth: 1500, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* Header */}
            <div>
                <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Warenkorbanalyse</h1>
                <p style={{ color: '#64748b', margin: '0.3rem 0 0', fontSize: '0.88rem' }}>
                    Beikäufe, Solo-Rate und Produktkombinationen aus {meta.totalOrders.toLocaleString('de-DE')} Bestellungen (90 Tage)
                </p>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                <StatCard icon={ShoppingCart} label="Bestellungen analysiert" value={meta.totalOrders.toLocaleString('de-DE')} color="#4f46e5" />
                <StatCard icon={Package} label="Multi-Produkt-Bestellungen" value={fmtPct(meta.multiItemRate)} sub={`${meta.multiItemOrders.toLocaleString('de-DE')} Bestellungen`} color="#d97706" />
                <StatCard icon={TrendingUp} label="Ø Artikel pro Bestellung" value={fmt(meta.avgBasketSize, 2)} color="#15803d" />
                <StatCard icon={Users} label="Bundle-Kandidaten" value={filtered.filter(p => p.soloRate < 60).length} sub="Solo-Rate < 60%" color="#7c3aed" />
            </div>

            {/* Top Kombis */}
            {topPairs.length > 0 && (
                <div style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ padding: '0.75rem 1.1rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>Top Produktkombinationen</h3>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>nach Lift sortiert · min. 3 gemeinsame Bestellungen</span>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc' }}>
                                    {['Produkt A', 'Produkt B', 'Gem. Bestellungen', 'Lift', 'Konf. A→B', 'Konf. B→A', 'Stärke'].map((h, i) => (
                                        <th key={i} style={{ textAlign: i < 2 ? 'left' : 'right', padding: '0.5rem 0.75rem', fontSize: '0.72rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {topPairs.map((pair, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '0.55rem 0.75rem', fontSize: '0.84rem', fontWeight: 500, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            <div style={{ fontWeight: 600 }}>{pair.nameA}</div>
                                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontFamily: 'monospace' }}>{pair.skuA}</div>
                                        </td>
                                        <td style={{ padding: '0.55rem 0.75rem', fontSize: '0.84rem', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            <div style={{ fontWeight: 600 }}>{pair.nameB}</div>
                                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontFamily: 'monospace' }}>{pair.skuB}</div>
                                        </td>
                                        <td style={{ textAlign: 'right', padding: '0.55rem 0.75rem', fontSize: '0.84rem', fontWeight: 700 }}>{pair.count}×</td>
                                        <td style={{ textAlign: 'right', padding: '0.55rem 0.75rem' }}>
                                            <span style={{ fontSize: '0.84rem', fontWeight: 800, color: liftColor(pair.lift) }}>{fmt(pair.lift, 2)}</span>
                                        </td>
                                        <td style={{ textAlign: 'right', padding: '0.55rem 0.75rem', fontSize: '0.82rem', color: '#64748b' }}>{fmtPct(pair.confAB)}</td>
                                        <td style={{ textAlign: 'right', padding: '0.55rem 0.75rem', fontSize: '0.82rem', color: '#64748b' }}>{fmtPct(pair.confBA)}</td>
                                        <td style={{ textAlign: 'right', padding: '0.55rem 0.75rem' }}>
                                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: liftColor(pair.lift), background: liftBg(pair.lift), padding: '0.15rem 0.5rem', borderRadius: 999, whiteSpace: 'nowrap' }}>
                                                {liftLabel(pair.lift)}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div style={{ padding: '0.6rem 1rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0', fontSize: '0.75rem', color: '#94a3b8' }}>
                        <strong>Lift-Erklärung:</strong> Lift = wie viel häufiger werden A+B zusammen gekauft als per Zufall erwartet. Lift 1 = kein Zusammenhang. Lift 3 = 3× häufiger als zufällig.
                    </div>
                </div>
            )}

            {/* Filter + Suche */}
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                    placeholder="SKU / Name suchen…" value={search} onChange={e => setSearch(e.target.value)}
                    style={{ padding: '0.45rem 0.8rem', borderRadius: 6, border: '1px solid #e2e8f0', width: 220, fontSize: '0.84rem' }}
                />
                {[
                    { key: 'all', label: 'Alle' },
                    { key: 'bundle', label: 'Bundle-Kandidaten (Solo < 60%)' },
                    { key: 'solo', label: 'Solo-Käufer (≥ 85%)' },
                    { key: 'multi-qty', label: 'Mehrfach-Käufer (Ø ≥ 1.5)' },
                ].map(f => (
                    <button key={f.key} onClick={() => setFilter(f.key)} style={{
                        padding: '0.4rem 0.8rem', borderRadius: 6, fontSize: '0.78rem', fontWeight: 600,
                        border: '1.5px solid',
                        borderColor: filter === f.key ? '#4f46e5' : '#e2e8f0',
                        background: filter === f.key ? '#eef2ff' : 'white',
                        color: filter === f.key ? '#4f46e5' : '#64748b',
                        cursor: 'pointer',
                    }}>
                        {f.label}
                        {f.key !== 'all' && <span style={{ marginLeft: '0.35rem', opacity: 0.7 }}>
                            ({f.key === 'bundle' ? data.products.filter(p => p.soloRate < 60).length
                                : f.key === 'solo' ? data.products.filter(p => p.soloRate >= 85).length
                                    : data.products.filter(p => p.avgQtyPerOrder >= 1.5).length})
                        </span>}
                    </button>
                ))}
                <span style={{ fontSize: '0.78rem', color: '#94a3b8', marginLeft: 'auto' }}>{filtered.length} Produkte</span>
            </div>

            {/* Produkt-Tabelle */}
            <div style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <SortTh sortKey="name" align="left">Produkt</SortTh>
                                <SortTh sortKey="orderCount">Bestellungen</SortTh>
                                <SortTh sortKey="totalUnits">Einheiten</SortTh>
                                <SortTh sortKey="avgQty">Ø Menge/Bestellung</SortTh>
                                <SortTh sortKey="soloRate">Solo-Rate</SortTh>
                                <SortTh sortKey="topLift">Stärkste Kombi</SortTh>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(p => {
                                const exp = !!expandedSkus[p.sku];
                                const topCombo = p.topCombos?.[0];
                                return (
                                    <React.Fragment key={p.sku}>
                                        <tr
                                            onClick={() => p.topCombos?.length > 0 && toggleExpand(p.sku)}
                                            style={{ borderBottom: '1px solid #f1f5f9', cursor: p.topCombos?.length > 0 ? 'pointer' : 'default' }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                                            onMouseLeave={e => e.currentTarget.style.background = ''}
                                        >
                                            <td style={{ padding: '0.6rem 0.75rem', maxWidth: 300 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                    {p.topCombos?.length > 0
                                                        ? (exp ? <ChevronUp size={13} color="#94a3b8" /> : <ChevronDown size={13} color="#94a3b8" />)
                                                        : <span style={{ width: 13 }} />}
                                                    <div>
                                                        <div style={{ fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 270 }}>{p.name}</div>
                                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontFamily: 'monospace' }}>{p.sku}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ textAlign: 'right', padding: '0.6rem 0.75rem', fontWeight: 700, fontSize: '0.84rem' }}>{p.orderCount}</td>
                                            <td style={{ textAlign: 'right', padding: '0.6rem 0.75rem', fontSize: '0.84rem', color: '#64748b' }}>{p.totalUnits}</td>
                                            <td style={{ textAlign: 'right', padding: '0.6rem 0.75rem' }}>
                                                <span style={{
                                                    fontWeight: 700, fontSize: '0.84rem',
                                                    color: p.avgQtyPerOrder >= 2 ? '#7c3aed' : p.avgQtyPerOrder >= 1.5 ? '#d97706' : '#1e293b',
                                                }}>
                                                    {fmt(p.avgQtyPerOrder, 2)}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.6rem 0.75rem', minWidth: 140 }}>
                                                <SoloBar rate={p.soloRate} />
                                            </td>
                                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>
                                                {topCombo ? (
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200, textAlign: 'right' }}>{topCombo.name}</div>
                                                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', marginTop: '0.1rem' }}>
                                                            <span style={{ fontSize: '0.7rem', color: liftColor(topCombo.lift), fontWeight: 700 }}>Lift {fmt(topCombo.lift, 2)}</span>
                                                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>· {topCombo.coCount}×</span>
                                                        </div>
                                                    </div>
                                                ) : <span style={{ fontSize: '0.82rem', color: '#d1d5db' }}>–</span>}
                                            </td>
                                        </tr>
                                        {exp && (
                                            <tr>
                                                <td colSpan={6} style={{ padding: 0, background: '#fafbff', borderBottom: '1px solid #e2e8f0' }}>
                                                    <div style={{ padding: '0.75rem 1.1rem 0.9rem 2.5rem' }}>
                                                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>
                                                            Mitgekaufte Produkte (Top {p.topCombos.length})
                                                        </div>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                            {p.topCombos.map((c, i) => (
                                                                <div key={i} style={{
                                                                    background: liftBg(c.lift),
                                                                    border: `1.5px solid ${liftColor(c.lift)}44`,
                                                                    borderRadius: 8, padding: '0.5rem 0.8rem',
                                                                    minWidth: 180, maxWidth: 260,
                                                                }}>
                                                                    <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#1e293b', marginBottom: '0.2rem' }}>{c.name}</div>
                                                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontFamily: 'monospace', marginBottom: '0.35rem' }}>{c.sku}</div>
                                                                    <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem' }}>
                                                                        <span><span style={{ color: '#94a3b8' }}>Lift </span><strong style={{ color: liftColor(c.lift) }}>{fmt(c.lift, 2)}</strong></span>
                                                                        <span><span style={{ color: '#94a3b8' }}>Konf. </span><strong>{fmtPct(c.confidence)}</strong></span>
                                                                        <span><span style={{ color: '#94a3b8' }}>n= </span><strong>{c.coCount}</strong></span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <div style={{ fontSize: '0.75rem', color: '#94a3b8', padding: '0 0.25rem' }}>
                Nur SW6-Live-Bestellungen (Jan–Apr). Lift &gt; 1 = überdurchschnittlich häufig zusammen gekauft. Solo-Rate: Anteil Bestellungen wo nur dieses Produkt enthalten war.
            </div>
        </div>
    );
}
