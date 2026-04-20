import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { ChevronUp, ChevronDown, Download, FileSpreadsheet } from 'lucide-react';

const fmt = (v, d = 2) => {
    if (v === null || v === undefined) return '-';
    return new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
};
const fmtEur = (v) => (v === null || v === undefined) ? '-' : fmt(v) + ' €';
const fmtPct = (v, d = 1) => (v === null || v === undefined) ? '-' : fmt(v, d) + ' %';
const fmtRoas = (v) => (v === null || v === undefined) ? '-' : fmt(v, 1) + 'x';

const AMPEL_COLORS = { gruen: '#10b981', gelb: '#f59e0b', rot: '#ef4444', grau: '#94a3b8' };

function ampelFor(roas) {
    if (roas === null || roas === undefined) return 'grau';
    if (roas < 5) return 'gruen';
    if (roas <= 8) return 'gelb';
    return 'rot';
}

function AmpelDot({ roas }) {
    const color = AMPEL_COLORS[ampelFor(roas)];
    const label = roas === null ? '-' : fmtRoas(roas);
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <span style={{ fontWeight: 700, color: ampelFor(roas) === 'grau' ? '#94a3b8' : '#1e293b' }}>{label}</span>
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
                    : <ChevronUp size={11} style={{ opacity: 0.3 }} />}
            </span>
        </th>
    );
}

const dateStr = () => new Date().toISOString().slice(0, 10);

export default function MarketingTabelle() {
    const [data, setData] = useState([]);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [discountPct, setDiscountPct] = useState(0);
    const [filterHersteller, setFilterHersteller] = useState('');
    const [sort, setSort] = useState({ key: 'name', desc: false });
    const navigate = useNavigate();

    useEffect(() => {
        axios.get('/api/marketing')
            .then(res => {
                setData(res.data.data || []);
                setLastUpdated(res.data.lastUpdated);
            })
            .catch(err => {
                if (err.response?.status === 401) navigate('/login', { replace: true });
                else setError('Daten konnten nicht geladen werden.');
            })
            .finally(() => setLoading(false));
    }, [navigate]);

    const hersteller = useMemo(() => {
        const set = new Set(data.map(p => p.hersteller).filter(Boolean));
        return [...set].sort((a, b) => a.localeCompare(b, 'de'));
    }, [data]);

    const handleSort = (key) => {
        setSort(s => s.key === key ? { key, desc: !s.desc } : { key, desc: false });
    };

    const processed = useMemo(() => {
        const discount = discountPct / 100;
        return data
            .filter(p => !filterHersteller || p.hersteller === filterHersteller)
            .map(p => {
                const applyDiscount = discount > 0 && !p.dauertiefpreis;
                const effPriceNet = (p.price_net !== null && applyDiscount) ? p.price_net * (1 - discount) : p.price_net;
                const effPriceGross = (p.price_gross !== null && applyDiscount) ? p.price_gross * (1 - discount) : p.price_gross;

                const rohertrag = (effPriceNet !== null && p.purchase_price_net !== null)
                    ? Math.round((effPriceNet - p.purchase_price_net) * 100) / 100 : null;
                const rohertragAnteil = (rohertrag !== null && effPriceNet > 0) ? (rohertrag / effPriceNet) * 100 : null;

                const nettomarge = (rohertrag !== null && p.betriebskostenStueck !== null)
                    ? Math.round((rohertrag - p.betriebskostenStueck) * 100) / 100 : null;
                const nettomargeAnteil = (nettomarge !== null && effPriceNet > 0) ? (nettomarge / effPriceNet) * 100 : null;

                const breakEvenRoas = (effPriceNet !== null && nettomarge !== null && nettomarge > 0)
                    ? Math.round((effPriceNet / nettomarge) * 10) / 10 : null;

                return { ...p, applyDiscount, effPriceNet, effPriceGross, rohertrag, rohertragAnteil, nettomarge, nettomargeAnteil, breakEvenRoas };
            })
            .sort((a, b) => {
                const av = a[sort.key], bv = b[sort.key];
                if (av === null || av === undefined) return 1;
                if (bv === null || bv === undefined) return -1;
                const cmp = typeof av === 'string' ? av.localeCompare(bv, 'de') : av - bv;
                return sort.desc ? -cmp : cmp;
            });
    }, [data, discountPct, filterHersteller, sort]);

    const exportCSV = () => {
        const headers = ['SKU', 'Produkt', 'Hersteller', 'MwSt %', 'VK Brutto', 'VK Netto',
            'Eff. VK Brutto', 'Eff. VK Netto', 'EK Netto', 'Rohertrag €', 'Rohertrag %',
            'Betriebskosten €', 'Betriebskosten %', 'Nettomarge €', 'Nettomarge %',
            'Break-Even ROAS', 'DTP'];
        const rows = processed.map(p => [
            p.id, p.name, p.hersteller || '', p.tax_rate,
            p.price_gross, p.price_net,
            p.effPriceGross, p.effPriceNet,
            p.purchase_price_net,
            p.rohertrag, p.rohertragAnteil?.toFixed(1),
            p.betriebskostenStueck, p.betriebskostenAnteil?.toFixed(1),
            p.nettomarge, p.nettomargeAnteil?.toFixed(1),
            p.breakEvenRoas,
            p.dauertiefpreis ? 'Ja' : 'Nein',
        ]);
        const content = [headers, ...rows].map(r => r.map(v => v ?? '').join(';')).join('\n');
        const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `marketing_margen_${dateStr()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const exportXLSX = () => {
        const headers = ['SKU', 'Produkt', 'Hersteller', 'MwSt %', 'VK Brutto', 'VK Netto',
            'Eff. VK Brutto', 'Eff. VK Netto', 'EK Netto', 'Rohertrag €', 'Rohertrag %',
            'Betriebskosten €', 'Betriebskosten %', 'Nettomarge €', 'Nettomarge %',
            'Break-Even ROAS', 'DTP'];
        const rows = processed.map(p => [
            p.id, p.name, p.hersteller || '', p.tax_rate,
            p.price_gross, p.price_net,
            p.effPriceGross, p.effPriceNet,
            p.purchase_price_net,
            p.rohertrag, p.rohertragAnteil ? +p.rohertragAnteil.toFixed(1) : null,
            p.betriebskostenStueck, p.betriebskostenAnteil ? +p.betriebskostenAnteil.toFixed(1) : null,
            p.nettomarge, p.nettomargeAnteil ? +p.nettomargeAnteil.toFixed(1) : null,
            p.breakEvenRoas,
            p.dauertiefpreis ? 'Ja' : 'Nein',
        ]);
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Marketing Margen');
        XLSX.writeFile(wb, `marketing_margen_${dateStr()}.xlsx`);
    };

    const formattedLastUpdated = lastUpdated
        ? new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(lastUpdated))
        : null;

    const tdStyle = { padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.85rem', verticalAlign: 'middle' };
    const tdNum = { ...tdStyle, textAlign: 'right' };
    const tdCenter = { ...tdStyle, textAlign: 'center' };

    if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Lade Marketing-Daten...</div>;
    if (error) return <div style={{ padding: '2rem', color: 'var(--danger-color)' }}>{error}</div>;

    return (
        <div style={{ padding: '1.5rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Marketing-Margen</h1>
                    {formattedLastUpdated && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            Zuletzt aktualisiert: {formattedLastUpdated}
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button onClick={exportCSV} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}>
                        <Download size={14} /> CSV
                    </button>
                    <button onClick={exportXLSX} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}>
                        <FileSpreadsheet size={14} /> Excel
                    </button>
                </div>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Discount toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>Rabatt:</span>
                    {[0, 5, 10].map(pct => (
                        <button
                            key={pct}
                            onClick={() => setDiscountPct(pct)}
                            style={{
                                padding: '0.35rem 0.85rem', borderRadius: '6px', border: '1px solid var(--border-color)',
                                background: discountPct === pct ? 'var(--primary-color)' : 'var(--surface-color)',
                                color: discountPct === pct ? '#fff' : 'inherit',
                                cursor: 'pointer', fontWeight: discountPct === pct ? 600 : 400,
                                fontSize: '0.85rem',
                            }}
                        >
                            {pct === 0 ? 'Kein' : `-${pct}%`}
                        </button>
                    ))}
                </div>

                {/* Hersteller filter */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>Hersteller:</span>
                    <select
                        value={filterHersteller}
                        onChange={e => setFilterHersteller(e.target.value)}
                        style={{ padding: '0.35rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.85rem', background: 'var(--surface-color)', cursor: 'pointer' }}
                    >
                        <option value="">Alle</option>
                        {hersteller.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                </div>

                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    {processed.length} Produkte
                </span>
            </div>

            {/* Ampel legend */}
            <div style={{ display: 'flex', gap: '1.25rem', marginBottom: '1rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {[['gruen', '< 5x ROAS — profitabel'], ['gelb', '5–8x ROAS — grenzwertig'], ['rot', '> 8x ROAS — schwierig']].map(([c, label]) => (
                    <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: AMPEL_COLORS[c], display: 'inline-block' }} />
                        {label}
                    </span>
                ))}
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto', background: 'var(--surface-color)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                        <tr>
                            <ColHeader label="Produkt" sortKey="name" currentSort={sort} onSort={handleSort} align="left" />
                            <ColHeader label="Hersteller" sortKey="hersteller" currentSort={sort} onSort={handleSort} align="left" />
                            <ColHeader label="MwSt" sortKey="tax_rate" currentSort={sort} onSort={handleSort} />
                            <ColHeader label="VK Brutto" sortKey="price_gross" currentSort={sort} onSort={handleSort} />
                            <ColHeader label="VK Netto" sortKey="price_net" currentSort={sort} onSort={handleSort} />
                            {discountPct > 0 && <>
                                <ColHeader label={`Eff. VK Brutto (−${discountPct}%)`} sortKey="effPriceGross" currentSort={sort} onSort={handleSort} />
                                <ColHeader label={`Eff. VK Netto (−${discountPct}%)`} sortKey="effPriceNet" currentSort={sort} onSort={handleSort} />
                            </>}
                            <ColHeader label="EK Netto" sortKey="purchase_price_net" currentSort={sort} onSort={handleSort} />
                            <ColHeader label="Rohertrag €" sortKey="rohertrag" currentSort={sort} onSort={handleSort} />
                            <ColHeader label="Rohertrag %" sortKey="rohertragAnteil" currentSort={sort} onSort={handleSort} />
                            <ColHeader label="Betriebsk. €" sortKey="betriebskostenStueck" currentSort={sort} onSort={handleSort} />
                            <ColHeader label="Betriebsk. %" sortKey="betriebskostenAnteil" currentSort={sort} onSort={handleSort} />
                            <ColHeader label="Nettomarge €" sortKey="nettomarge" currentSort={sort} onSort={handleSort} />
                            <ColHeader label="Nettomarge %" sortKey="nettomargeAnteil" currentSort={sort} onSort={handleSort} />
                            <ColHeader label="Break-Even ROAS" sortKey="breakEvenRoas" currentSort={sort} onSort={handleSort} />
                            <th style={{ textAlign: 'center', padding: '0.55rem 0.75rem', fontSize: '0.77rem', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '2px solid var(--border-color)', background: '#f8fafc' }}>DTP</th>
                        </tr>
                    </thead>
                    <tbody>
                        {processed.map(p => (
                            <tr key={p.id} style={{ background: p.dauertiefpreis ? '#f0fdf4' : undefined }}>
                                <td style={{ ...tdStyle, textAlign: 'left' }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.name}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.id}</div>
                                </td>
                                <td style={{ ...tdStyle, textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{p.hersteller || '—'}</td>
                                <td style={tdNum}>{p.tax_rate !== null ? `${p.tax_rate} %` : '—'}</td>
                                <td style={tdNum}>{fmtEur(p.price_gross)}</td>
                                <td style={tdNum}>{fmtEur(p.price_net)}</td>
                                {discountPct > 0 && <>
                                    <td style={{ ...tdNum, color: p.applyDiscount ? '#d97706' : 'inherit' }}>{fmtEur(p.effPriceGross)}</td>
                                    <td style={{ ...tdNum, color: p.applyDiscount ? '#d97706' : 'inherit' }}>{fmtEur(p.effPriceNet)}</td>
                                </>}
                                <td style={tdNum}>{fmtEur(p.purchase_price_net)}</td>
                                <td style={{ ...tdNum, color: p.rohertrag !== null && p.rohertrag < 0 ? 'var(--danger-color)' : undefined }}>
                                    {fmtEur(p.rohertrag)}
                                </td>
                                <td style={tdNum}>{fmtPct(p.rohertragAnteil)}</td>
                                <td style={tdNum}>{fmtEur(p.betriebskostenStueck)}</td>
                                <td style={tdNum}>{fmtPct(p.betriebskostenAnteil)}</td>
                                <td style={{ ...tdNum, fontWeight: 700, color: p.nettomarge !== null && p.nettomarge < 0 ? 'var(--danger-color)' : '#1e293b' }}>
                                    {fmtEur(p.nettomarge)}
                                </td>
                                <td style={{ ...tdNum, fontWeight: 600 }}>{fmtPct(p.nettomargeAnteil)}</td>
                                <td style={tdCenter}><AmpelDot roas={p.breakEvenRoas} /></td>
                                <td style={tdCenter}>
                                    {p.dauertiefpreis && (
                                        <span style={{ background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', borderRadius: '999px', padding: '0.15rem 0.5rem', fontSize: '0.72rem', fontWeight: 700 }}>
                                            DTP
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {processed.length === 0 && (
                            <tr>
                                <td colSpan={20} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    Keine Produkte gefunden.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
