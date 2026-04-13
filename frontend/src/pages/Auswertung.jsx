import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Search, ChevronUp, ChevronDown, Download, ExternalLink, Calculator, Minus } from 'lucide-react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

const fmt = (v, d = 2) => {
    if (v === null || v === undefined) return '-';
    return new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
};
const fmtEur = (v) => v === null || v === undefined ? '-' : fmt(v) + ' €';
const fmtPct = (v) => v === null || v === undefined ? '-' : fmt(v, 1) + '%';
const fmtEurPlain = (v) => v === null || v === undefined ? '-' : fmt(v);

function Lamp({ on, label }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: on ? '#10b981' : '#ef4444', boxShadow: on ? '0 0 6px #10b98155' : '0 0 6px #ef444455', flexShrink: 0 }} />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{label}</span>
        </div>
    );
}

function CostPieChart({ wareneinsatz, betriebskosten, werbekosten, realeMarge }) {
    const w = Math.max(0, wareneinsatz || 0), b = Math.max(0, betriebskosten || 0), a = Math.max(0, werbekosten || 0), m = realeMarge || 0;
    const margeDisplay = Math.max(0, m);
    const total = w + b + a + margeDisplay;
    if (total === 0) return <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Keine Daten</div>;
    const data = { labels: ['Wareneinsatz', 'Betriebskosten', 'Werbekosten', 'Reale Marge'], datasets: [{ data: [w, b, a, margeDisplay], backgroundColor: ['#6366f1', '#f59e0b', '#ef4444', '#10b981'], borderWidth: 1, borderColor: '#fff' }] };
    const options = { responsive: true, maintainAspectRatio: false, cutout: '55%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw.toFixed(1)}%` } } } };
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ width: '140px', height: '140px', flexShrink: 0 }}><Doughnut data={data} options={options} /></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem' }}>
                {[{ label: 'Wareneinsatz', val: w, color: '#6366f1' }, { label: 'Betriebskosten', val: b, color: '#f59e0b' }, { label: 'Werbekosten', val: a, color: '#ef4444' }, { label: 'Reale Marge', val: m, color: '#10b981' }].map(item => (
                    <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: item.color, flexShrink: 0 }} />
                        <span style={{ color: 'var(--text-muted)', minWidth: '110px' }}>{item.label}</span>
                        <span style={{ fontWeight: 600, color: item.label === 'Reale Marge' && item.val < 0 ? '#ef4444' : 'var(--text-color)' }}>{fmt(item.val, 1)}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

const PRICE_CHANGES_KEY = 'hr_price_changes';

function ProductCard({ p, isExpandedAll, onSavePrice }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isCalcOpen, setIsCalcOpen] = useState(false);
    const [showAllCompetitors, setShowAllCompetitors] = useState(false);
    const [calcBruttoVK, setCalcBruttoVK] = useState(p.vkBrutto || 0);
    const [saved, setSaved] = useState(false);

    useEffect(() => { if (isExpandedAll !== null) setIsExpanded(isExpandedAll); }, [isExpandedAll]);

    // Reset saved state when price changes
    const updateCalc = (val) => { setCalcBruttoVK(val); setSaved(false); };

    const margeColor = p.realeMargeProz === null ? 'var(--text-muted)' : p.realeMargeProz < 0 ? '#ef4444' : p.realeMargeProz < 10 ? '#f59e0b' : '#10b981';
    const s = p.currentScrape;
    const hrRank = s?.hr_rank || null;

    // Calculator
    const is19 = p.mwst === 19;
    const calcNetto = is19 ? calcBruttoVK / 1.19 : calcBruttoVK / 1.07;
    const betriebskostenSt = p.betriebskostenStueck || 0;
    const werbekostenSt = (p.werbekosten && p.q1Menge > 0) ? p.werbekosten / p.q1Menge : 0;
    const calcRealeMargeSt = calcNetto - (p.ekNetto || 0) - betriebskostenSt - werbekostenSt;
    const calcRealeMargeProz = calcNetto > 0 ? (calcRealeMargeSt / calcNetto) * 100 : null;

    const lowestPrice = s?.lowest_price || (s?.rank1_price || null);
    let calcDiffEur = null, calcDiffPct = null;
    if (lowestPrice !== null) {
        calcDiffEur = calcBruttoVK - lowestPrice;
        calcDiffPct = (calcDiffEur / lowestPrice) * 100;
    }

    const adjustCalc = (amount) => { const nv = Math.max(0.01, parseFloat((calcBruttoVK + amount).toFixed(2))); updateCalc(nv); };
    const setOneCentUnder = () => { if (s?.rank1_price) updateCalc(parseFloat((s.rank1_price - 0.01).toFixed(2))); };

    // All competitors
    let allCompetitors = [];
    if (s?.all_competitors) { try { allCompetitors = JSON.parse(s.all_competitors) || []; if (!Array.isArray(allCompetitors)) allCompetitors = []; } catch (e) {} }

    return (
        <div className="card" style={{ padding: 0, transition: 'all 0.2s ease-in-out' }}>
            {/* Collapsed Header */}
            <div onClick={() => setIsExpanded(!isExpanded)} style={{ padding: '0.85rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1.25rem', cursor: 'pointer', userSelect: 'none', borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                <div style={{ flex: '2.5', minWidth: '180px' }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                </div>
                <div style={{ flex: '0.8', minWidth: '80px', fontSize: '0.88rem' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>EK Netto</span>
                    <span style={{ fontWeight: 500 }}>{fmtEur(p.ekNetto)}</span>
                </div>
                <div style={{ flex: '0.8', minWidth: '80px', fontSize: '0.88rem' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>VK Netto</span>
                    <span style={{ fontWeight: 500 }}>{fmtEur(p.vkNetto)}</span>
                </div>
                <div style={{ flex: '0.9', minWidth: '90px', fontSize: '0.88rem' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>Umsatz 90d</span>
                    <span style={{ fontWeight: 500 }}>{fmtEur(p.umsatzNetto90d)}</span>
                </div>
                <div style={{ flex: '0.8', minWidth: '85px', fontSize: '0.88rem' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>Rohertrag/St.</span>
                    <span style={{ fontWeight: 500 }}>{fmtEur(p.rohertragStueck)}</span>
                </div>
                <div style={{ flex: '0.7', minWidth: '75px', fontSize: '0.88rem' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>Reale Marge</span>
                    <span style={{ fontWeight: 700, color: margeColor }}>{fmtPct(p.realeMargeProz)}</span>
                </div>
                <div style={{ flex: '0.8', minWidth: '85px', fontSize: '0.88rem' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>Gewinn 90d</span>
                    {(() => {
                        const profit = (p.realeMargeStueck !== null && p.menge90d) ? p.realeMargeStueck * p.menge90d : null;
                        return <span style={{ fontWeight: 600, color: profit === null ? 'var(--text-muted)' : profit < 0 ? '#ef4444' : '#10b981' }}>{profit !== null ? (profit < 0 ? '' : '+') + fmtEur(profit) : '-'}</span>;
                    })()}
                </div>
                <div style={{ flex: '0.5', minWidth: '60px', fontSize: '0.88rem' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>Rang Idealo</span>
                    <span style={{ fontWeight: 600, color: hrRank === 1 ? '#10b981' : hrRank ? 'var(--text-color)' : 'var(--text-muted)' }}>{hrRank || '-'}</span>
                </div>
                <div style={{ flexShrink: 0, color: 'var(--text-muted)' }}>
                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
                <div style={{ padding: '1.25rem', animation: 'fadeIn 0.2s ease-in-out' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                        {/* Left Column */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {/* Preisdaten */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                                    <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', margin: 0 }}>Preisdaten</h4>
                                    <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.sku}</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem 1rem', fontSize: '0.88rem' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Brutto-VK:</span><span style={{ fontWeight: 500 }}>{fmtEur(p.vkBrutto)}</span>
                                    <span style={{ color: 'var(--text-muted)' }}>Netto-VK:</span><span>{fmtEur(p.vkNetto)}</span>
                                    <span style={{ color: 'var(--text-muted)' }}>EK Netto:</span><span>{fmtEur(p.ekNetto)}</span>
                                    <span style={{ color: 'var(--text-muted)' }}>Steuer:</span><span>{p.mwst !== null ? fmt(p.mwst, 0) + '%' : '-'}</span>
                                </div>
                            </div>

                            {/* Verkaufsdaten */}
                            <div>
                                <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', margin: 0, marginBottom: '0.6rem' }}>Verkaufsdaten (90 Tage)</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem 1rem', fontSize: '0.88rem' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Menge:</span><span>{fmt(p.menge90d, 0)}</span>
                                    <span style={{ color: 'var(--text-muted)' }}>Ø Bestellmenge:</span><span>{fmt(p.avgBestellmenge, 1)}</span>
                                    <span style={{ color: 'var(--text-muted)' }}>Umsatz Netto:</span><span style={{ fontWeight: 500 }}>{fmtEur(p.umsatzNetto90d)}</span>
                                    <span style={{ color: 'var(--text-muted)' }}>Rohertrag 90d:</span><span style={{ fontWeight: 500 }}>{fmtEur(p.rohertrag90d)}</span>
                                    <span style={{ color: 'var(--text-muted)' }}>Bestand:</span><span style={{ fontWeight: 500, color: p.bestand === 0 ? '#ef4444' : 'inherit' }}>{p.bestand ?? '-'}</span>
                                </div>
                            </div>

                            {/* Status */}
                            <div>
                                <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', margin: 0, marginBottom: '0.6rem' }}>Status</h4>
                                <div style={{ display: 'flex', gap: '1.5rem' }}>
                                    <Lamp on={p.dauertiefpreis} label="Dauertiefpreis" />
                                    <Lamp on={p.googleAktiv} label="Google" />
                                    <Lamp on={p.staffelpreis} label="Staffelpreis" />
                                    <Lamp on={!p.abverkauf} label="Abverkauf" />
                                    <Lamp on={p.verfuegbar} label="Verfügbar" />
                                </div>
                            </div>

                            {/* Marktdaten */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                                    <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', margin: 0 }}>Marktdaten</h4>
                                    {p.idealoLink && <a href={p.idealoLink} target="_blank" rel="noopener noreferrer" className="badge"><ExternalLink size={12} style={{ marginRight: '4px' }} /> Idealo</a>}
                                </div>
                                {!s ? (
                                    <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.88rem' }}>{p.idealoLink ? 'Noch nicht gescrapt.' : 'Kein Idealo-Link vorhanden.'}</div>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '0.4rem 0.8rem', fontSize: '0.88rem', alignItems: 'center' }}>
                                        <span style={{ color: 'var(--text-muted)' }}>Rang 1:</span>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.rank1_shop || '-'}</span>
                                        <span style={{ fontWeight: 600 }}>{s.rank1_price ? fmtEurPlain(s.rank1_price) + ' €' : '-'}</span>

                                        <span style={{ color: 'var(--text-muted)' }}>Rang 2:</span>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.rank2_shop || '-'}</span>
                                        <span>{s.rank2_price ? fmtEurPlain(s.rank2_price) + ' €' : '-'}</span>

                                        <span style={{ color: 'var(--primary-color)', fontWeight: 600, marginTop: '0.4rem' }}>Health Rise:</span>
                                        <span style={{ marginTop: '0.4rem' }}>Rang {s.hr_rank || '-'}</span>
                                        <span style={{ marginTop: '0.4rem' }}>{s.hr_price ? fmtEurPlain(s.hr_price) + ' €' : '-'}</span>

                                        <div style={{ gridColumn: '1/-1', height: '1px', background: 'var(--border-color)', margin: '0.3rem 0' }}></div>
                                        <span style={{ color: 'var(--text-muted)', gridColumn: '1/3' }}>Diff. zum Günstigsten:</span>
                                        <span style={{ fontWeight: 500, color: s.hr_price && lowestPrice ? (s.hr_price - lowestPrice > 0 ? '#ef4444' : '#10b981') : 'inherit' }}>
                                            {s.hr_price && lowestPrice ? `${s.hr_price - lowestPrice > 0 ? '+' : ''}${fmtEurPlain(s.hr_price - lowestPrice)} €` : '-'}
                                        </span>

                                        {allCompetitors.length > 0 && (
                                            <div style={{ gridColumn: '1/-1', marginTop: '0.4rem' }}>
                                                <button onClick={() => setShowAllCompetitors(!showAllCompetitors)} style={{ background: 'none', border: 'none', color: 'var(--primary-color)', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem', padding: 0 }}>
                                                    {showAllCompetitors ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Alle Anbieter anzeigen ({allCompetitors.length})
                                                </button>
                                                {showAllCompetitors && (
                                                    <div style={{ marginTop: '0.5rem', maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', background: '#f8fafc' }}>
                                                        <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', textAlign: 'left' }}>
                                                            <thead style={{ position: 'sticky', top: 0, background: '#f1f5f9' }}>
                                                                <tr><th style={{ padding: '0.4rem 0.5rem', width: '50px' }}>Rang</th><th style={{ padding: '0.4rem 0.5rem' }}>Shop</th><th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>Preis</th></tr>
                                                            </thead>
                                                            <tbody>
                                                                {allCompetitors.map((comp, idx) => {
                                                                    const isHr = (comp.shop || '').toLowerCase().includes('health rise') || (comp.shop || '').toLowerCase().includes('health-rise');
                                                                    return (
                                                                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)', background: isHr ? '#dcfce7' : 'transparent' }}>
                                                                            <td style={{ padding: '0.4rem 0.5rem', color: 'var(--text-muted)' }}>{comp.rank}</td>
                                                                            <td style={{ padding: '0.4rem 0.5rem', fontWeight: isHr ? 600 : 400 }}>{comp.shop}</td>
                                                                            <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontWeight: isHr ? 600 : 400 }}>{fmtEurPlain(comp.price)} €</td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Preisrechner */}
                            <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                                <button onClick={() => setIsCalcOpen(!isCalcOpen)} style={{ width: '100%', background: '#f8fafc', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: 'none', cursor: 'pointer', color: 'var(--text-color)', fontWeight: 500 }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Calculator size={16} /> Preisrechner</span>
                                    {isCalcOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </button>
                                {isCalcOpen && (
                                    <div style={{ padding: '1rem', background: '#fff', borderTop: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Neuer Brutto-VK (€)</label>
                                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                                <button onClick={() => adjustCalc(-0.05)} className="btn" style={{ padding: '0.4rem 0.8rem', fontSize: '1rem' }}>-</button>
                                                <input type="number" step="0.01" value={parseFloat(calcBruttoVK.toFixed(2))} onChange={e => updateCalc(parseFloat(e.target.value) || 0)} style={{ flex: 1, padding: '0.4rem', textAlign: 'center', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }} />
                                                <button onClick={() => adjustCalc(0.05)} className="btn" style={{ padding: '0.4rem 0.8rem', fontSize: '1rem' }}>+</button>
                                            </div>
                                            <button onClick={setOneCentUnder} disabled={!s?.rank1_price} className="btn" style={{ width: '100%', padding: '0.5rem', fontSize: '0.85rem' }}>1 Cent unter Rang 1</button>
                                            <button
                                                onClick={() => { onSavePrice(p, calcBruttoVK, calcNetto, calcRealeMargeProz, calcRealeMargeSt); setSaved(true); }}
                                                disabled={saved}
                                                style={{
                                                    width: '100%', padding: '0.5rem', fontSize: '0.85rem', marginTop: '0.5rem',
                                                    background: saved ? '#94a3b8' : 'var(--success-color)',
                                                    color: 'white', border: 'none', borderRadius: '0.4rem',
                                                    cursor: saved ? 'default' : 'pointer', fontWeight: 600,
                                                    transition: 'background 0.3s ease',
                                                }}
                                            >
                                                {saved ? '✓ Preis übernommen' : 'Neuen Preis übernehmen'}
                                            </button>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.88rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ color: 'var(--text-muted)' }}>Neue reale Marge:</span>
                                                <span style={{ fontWeight: 700, color: calcRealeMargeProz !== null && calcRealeMargeProz < 0 ? '#ef4444' : calcRealeMargeProz < 10 ? '#f59e0b' : '#10b981' }}>{calcRealeMargeProz !== null ? fmtPct(calcRealeMargeProz) : '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ color: 'var(--text-muted)' }}>Neue Marge/Stück:</span>
                                                <span style={{ color: calcRealeMargeSt < 0 ? '#ef4444' : '#10b981' }}>{fmtEur(calcRealeMargeSt)}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ color: 'var(--text-muted)' }}>Neue Diff. z. Günstigsten:</span>
                                                <span style={{ color: calcDiffEur !== null ? (calcDiffEur > 0 ? '#ef4444' : '#10b981') : 'inherit' }}>
                                                    {calcDiffEur !== null ? <>{calcDiffEur > 0 ? '+' : ''}{fmtEurPlain(calcDiffEur)} € ({calcDiffPct > 0 ? '+' : ''}{fmt(calcDiffPct, 1)}%)</> : '-'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right Column */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {/* Kostenstruktur */}
                            <div>
                                <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', margin: 0, marginBottom: '0.8rem' }}>Kostenstruktur (% vom Umsatz)</h4>
                                <CostPieChart wareneinsatz={p.wareneinsatzAnteil} betriebskosten={p.betriebskostenAnteil} werbekosten={p.werbekostenAnteil} realeMarge={p.realeMargeProz} />
                            </div>

                            {/* Betriebskosten */}
                            <div>
                                <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', margin: 0, marginBottom: '0.6rem' }}>Betriebskosten</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0.25rem 0.8rem', fontSize: '0.85rem', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Versandkosten:</span><span style={{ textAlign: 'right' }}>{fmtEur(p.versandkosten)}</span><span style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.78rem' }}>{p.menge90d > 0 ? fmtEur(p.versandkosten / p.menge90d) + '/St.' : ''}</span>
                                    <span style={{ color: 'var(--text-muted)' }}>Payment (%):</span><span style={{ textAlign: 'right' }}>{fmtEur(p.paymentProzent)}</span><span style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.78rem' }}>{p.menge90d > 0 ? fmtEur(p.paymentProzent / p.menge90d) + '/St.' : ''}</span>
                                    <span style={{ color: 'var(--text-muted)' }}>Payment (Fix):</span><span style={{ textAlign: 'right' }}>{fmtEur(p.paymentFix)}</span><span style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.78rem' }}>{p.menge90d > 0 ? fmtEur(p.paymentFix / p.menge90d) + '/St.' : ''}</span>
                                    <span style={{ color: 'var(--text-muted)' }}>Verpackung:</span><span style={{ textAlign: 'right' }}>{fmtEur(p.verpackung)}</span><span style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.78rem' }}>{p.menge90d > 0 ? fmtEur(p.verpackung / p.menge90d) + '/St.' : ''}</span>
                                    <span style={{ color: 'var(--text-muted)' }}>Software:</span><span style={{ textAlign: 'right' }}>{fmtEur(p.softwareKosten)}</span><span style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.78rem' }}>{p.menge90d > 0 ? fmtEur(p.softwareKosten / p.menge90d) + '/St.' : ''}</span>
                                    <span style={{ fontWeight: 600, borderTop: '1px solid var(--border-color)', paddingTop: '0.3rem', marginTop: '0.1rem' }}>Gesamt:</span><span style={{ fontWeight: 600, textAlign: 'right', borderTop: '1px solid var(--border-color)', paddingTop: '0.3rem', marginTop: '0.1rem' }}>{fmtEur(p.betriebskosten)}</span><span style={{ fontWeight: 500, textAlign: 'right', borderTop: '1px solid var(--border-color)', paddingTop: '0.3rem', marginTop: '0.1rem', fontSize: '0.78rem' }}>{p.menge90d > 0 ? fmtEur(p.betriebskosten / p.menge90d) + '/St.' : ''}</span>
                                </div>
                            </div>

                            {/* Werbekosten */}
                            <div>
                                <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', margin: 0, marginBottom: '0.6rem' }}>Werbekosten</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0.25rem 0.8rem', fontSize: '0.85rem', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Google Ads:</span><span style={{ textAlign: 'right' }}>{fmtEur(p.googleKosten)}</span><span style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.78rem' }}>{p.menge90d > 0 ? fmtEur(p.googleKosten / p.menge90d) + '/St.' : ''}</span>
                                    <span style={{ color: 'var(--text-muted)' }}>Idealo:</span><span style={{ textAlign: 'right' }}>{fmtEur(p.idealoKosten)}</span><span style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.78rem' }}>{p.menge90d > 0 ? fmtEur(p.idealoKosten / p.menge90d) + '/St.' : ''}</span>
                                    <span style={{ color: 'var(--text-muted)' }}>Microsoft Ads:</span><span style={{ textAlign: 'right' }}>{fmtEur(p.msKosten)}</span><span style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.78rem' }}>{p.menge90d > 0 ? fmtEur(p.msKosten / p.menge90d) + '/St.' : ''}</span>
                                    <span style={{ fontWeight: 600, borderTop: '1px solid var(--border-color)', paddingTop: '0.3rem', marginTop: '0.1rem' }}>Gesamt:</span><span style={{ fontWeight: 600, textAlign: 'right', borderTop: '1px solid var(--border-color)', paddingTop: '0.3rem', marginTop: '0.1rem' }}>{fmtEur(p.werbekosten)}</span><span style={{ fontWeight: 500, textAlign: 'right', borderTop: '1px solid var(--border-color)', paddingTop: '0.3rem', marginTop: '0.1rem', fontSize: '0.78rem' }}>{p.menge90d > 0 ? fmtEur(p.werbekosten / p.menge90d) + '/St.' : ''}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Rabatt- vs. Normalzeitraum */}
                    {(p.rabattPeriode || p.normalPeriode) && (() => {
                        const RABATT_TAGE = 74;
                        const NORMAL_TAGE = 16;
                        const rd = p.rabattPeriode;
                        const nd = p.normalPeriode;
                        const thStyle = (highlight) => ({
                            textAlign: 'right', padding: '0.45rem 0.7rem', borderBottom: '1px solid var(--border-color)',
                            color: highlight ? '#4f46e5' : 'var(--text-muted)', fontWeight: 600, fontSize: '0.75rem',
                            background: highlight ? '#eef2ff' : '#f8fafc',
                        });
                        const thLeft = { textAlign: 'left', padding: '0.45rem 0.7rem', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.75rem', background: '#f8fafc' };
                        const tdStyle = (align = 'right', extra = {}) => ({ padding: '0.5rem 0.7rem', textAlign: align, fontSize: '0.84rem', ...extra });
                        const tdNorm = (extra = {}) => ({ padding: '0.5rem 0.7rem', textAlign: 'right', fontSize: '0.84rem', background: '#eef2ff', color: '#4f46e5', fontWeight: 600, ...extra });

                        const diffMengePTag = rd && nd ? ((rd.menge / RABATT_TAGE) - (nd.menge / NORMAL_TAGE)) : null;
                        const diffUmsatzPTag = rd && nd ? ((rd.umsatzNetto / RABATT_TAGE) - (nd.umsatzNetto / NORMAL_TAGE)) : null;
                        const diffGewinnPTag = rd && nd ? ((rd.gewinn / RABATT_TAGE) - (nd.gewinn / NORMAL_TAGE)) : null;

                        return (
                            <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                                <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', margin: 0, marginBottom: '0.75rem' }}>Rabatt- vs. Normalzeitraum (SW6, Jan–Apr)</h4>
                                <table style={{ width: '100%', fontSize: '0.84rem', borderCollapse: 'collapse', borderRadius: '0.5rem', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                                    <thead>
                                        <tr>
                                            <th style={thLeft}>Zeitraum</th>
                                            <th style={{ ...thStyle(false), textAlign: 'right' }}>Tage</th>
                                            <th style={thStyle(false)}>Menge ges.</th>
                                            <th style={thStyle(true)}>Ø St./Tag</th>
                                            <th style={thStyle(false)}>Umsatz ges.</th>
                                            <th style={thStyle(true)}>Ø €/Tag</th>
                                            <th style={thStyle(false)}>Gewinn ges.</th>
                                            <th style={thStyle(true)}>Ø Gew./Tag</th>
                                            <th style={thStyle(false)}>Ø Preis/St.</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[
                                            { label: 'Rabattaktion', data: rd, tage: RABATT_TAGE, color: '#d97706', bg: '#fffbeb' },
                                            { label: 'Normalpreis', data: nd, tage: NORMAL_TAGE, color: '#059669', bg: '#f0fdf4' },
                                        ].map(({ label, data, tage, color, bg }) => {
                                            const avgPreis = data?.menge > 0 ? data.umsatzNetto / data.menge : null;
                                            const mengePTag = data ? data.menge / tage : null;
                                            const umsatzPTag = data ? data.umsatzNetto / tage : null;
                                            const gewinnPTag = data ? data.gewinn / tage : null;
                                            const gewinnColor = data?.gewinn >= 0 ? '#10b981' : '#ef4444';
                                            return (
                                                <tr key={label} style={{ background: bg }}>
                                                    <td style={{ ...tdStyle('left'), fontWeight: 700, color }}>{label}</td>
                                                    <td style={tdStyle('right', { color: 'var(--text-muted)' })}>{tage}</td>
                                                    <td style={tdStyle()}>{data ? fmt(data.menge, 0) : '-'}</td>
                                                    <td style={tdNorm()}>{mengePTag !== null ? fmt(mengePTag, 1) : '-'}</td>
                                                    <td style={tdStyle()}>{data ? fmtEur(data.umsatzNetto) : '-'}</td>
                                                    <td style={tdNorm()}>{umsatzPTag !== null ? fmtEur(umsatzPTag) : '-'}</td>
                                                    <td style={{ ...tdStyle(), fontWeight: 700, color: gewinnColor }}>
                                                        {data?.gewinn !== null && data?.gewinn !== undefined ? (data.gewinn >= 0 ? '+' : '') + fmt(data.gewinn) + ' €' : '-'}
                                                    </td>
                                                    <td style={tdNorm({ color: gewinnPTag !== null ? (gewinnPTag >= 0 ? '#4338ca' : '#ef4444') : '#4f46e5' })}>
                                                        {gewinnPTag !== null ? (gewinnPTag >= 0 ? '+' : '') + fmtEur(gewinnPTag) : '-'}
                                                    </td>
                                                    <td style={tdStyle('right', { color: 'var(--text-muted)' })}>{avgPreis !== null ? fmtEur(avgPreis) : '-'}</td>
                                                </tr>
                                            );
                                        })}
                                        {rd && nd && (
                                            <tr style={{ background: '#f1f5f9', borderTop: '2px solid var(--border-color)' }}>
                                                <td style={{ ...tdStyle('left'), fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.78rem' }}>Δ Rabatt vs. Normal</td>
                                                <td style={tdStyle('right', { color: 'var(--text-muted)' })}></td>
                                                <td style={tdStyle()}></td>
                                                <td style={{ ...tdNorm(), color: diffMengePTag >= 0 ? '#4338ca' : '#ef4444' }}>
                                                    {diffMengePTag !== null ? (diffMengePTag >= 0 ? '+' : '') + fmt(diffMengePTag, 1) : '-'}
                                                </td>
                                                <td style={tdStyle()}></td>
                                                <td style={{ ...tdNorm(), color: diffUmsatzPTag >= 0 ? '#4338ca' : '#ef4444' }}>
                                                    {diffUmsatzPTag !== null ? (diffUmsatzPTag >= 0 ? '+' : '') + fmtEur(diffUmsatzPTag) : '-'}
                                                </td>
                                                <td style={tdStyle()}></td>
                                                <td style={{ ...tdNorm(), color: diffGewinnPTag >= 0 ? '#4338ca' : '#ef4444' }}>
                                                    {diffGewinnPTag !== null ? (diffGewinnPTag >= 0 ? '+' : '') + fmtEur(diffGewinnPTag) : '-'}
                                                </td>
                                                <td style={tdStyle()}></td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })()}
                </div>
            )}
        </div>
    );
}

export default function Auswertung() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [sortKey, setSortKey] = useState('umsatzNetto90d');
    const [sortDesc, setSortDesc] = useState(true);
    const [isExpandedAll, setIsExpandedAll] = useState(null);
    const [idealoFilter, setIdealoFilter] = useState('alle'); // 'alle' | 'mitRang' | 'ohneRang'
    const [scrapeProgress, setScrapeProgress] = useState(null);
    const [herstellerFilter, setHerstellerFilter] = useState(new Set());
    const [herstellerDropdownOpen, setHerstellerDropdownOpen] = useState(false);
    const pollRef = useRef(null);
    const herstellerRef = useRef(null);

    const [savedCount, setSavedCount] = useState(() => Object.keys(JSON.parse(localStorage.getItem(PRICE_CHANGES_KEY) || '{}')).length);

    const savePrice = (product, newBrutto, newNetto, newRealeMargeProz, newRealeMargeSt) => {
        const existing = JSON.parse(localStorage.getItem(PRICE_CHANGES_KEY) || '{}');
        if (existing[product.sku]) {
            const alt = existing[product.sku];
            if (!confirm(`Für "${product.name}" (${product.sku}) existiert bereits eine Preisänderung:\n\nAktuell: ${alt.neuerBrutto.toFixed(2)} € (Marge: ${alt.neueRealeMarge?.toFixed(1)}%)\nNeu: ${newBrutto.toFixed(2)} € (Marge: ${newRealeMargeProz?.toFixed(1)}%)\n\nBestehende Änderung ersetzen?`)) return false;
        }
        existing[product.sku] = {
            sku: product.sku,
            name: product.name,
            alterBrutto: product.vkBrutto,
            alterNetto: product.vkNetto,
            neuerBrutto: parseFloat(newBrutto.toFixed(2)),
            neuerNetto: parseFloat(newNetto.toFixed(4)),
            alteRealeMarge: product.realeMargeProz,
            neueRealeMarge: newRealeMargeProz,
            neueMargeStueck: newRealeMargeSt,
            preisdiffEur: parseFloat((newBrutto - (product.vkBrutto || 0)).toFixed(2)),
            preisdiffPct: product.vkBrutto > 0 ? ((newBrutto - product.vkBrutto) / product.vkBrutto) * 100 : null,
            margenopferPp: (newRealeMargeProz !== null && product.realeMargeProz !== null) ? newRealeMargeProz - product.realeMargeProz : null,
            timestamp: new Date().toISOString(),
        };
        localStorage.setItem(PRICE_CHANGES_KEY, JSON.stringify(existing));
        setSavedCount(Object.keys(existing).length);
    };

    const fetchData = () => axios.get('/api/auswertung').then(res => { if (res.data.success) setData(res.data.data); });

    useEffect(() => {
        fetchData().catch(err => setError(err.message)).finally(() => setLoading(false));
        // Check if scrape running
        axios.get('/api/auswertung/scrape/status').then(res => {
            if (res.data.isRunning) { setScrapeProgress(res.data); startPolling(); }
        }).catch(() => {});
        return () => stopPolling();
    }, []);

    const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
    const startPolling = () => {
        if (pollRef.current) return;
        pollRef.current = setInterval(async () => {
            try {
                const res = await axios.get('/api/auswertung/scrape/status');
                setScrapeProgress(res.data);
                await fetchData();
                if (!res.data.isRunning) stopPolling();
            } catch (e) {}
        }, 5000);
    };

    const startScraping = async () => {
        try {
            const res = await axios.post('/api/auswertung/scrape/start');
            if (res.data.success) {
                setScrapeProgress({ isRunning: true, total: 0, completed: 0, failed: [], completedIds: [] });
                startPolling();
            } else { alert('Fehler: ' + (res.data.error || 'Unbekannt')); }
        } catch (e) {
            if (e.response?.status === 409) alert(e.response.data.error);
            else alert('Netzwerkfehler.');
        }
    };

    // All unique Hersteller
    const alleHersteller = useMemo(() => {
        const set = new Set();
        data.forEach(p => { if (p.hersteller) set.add(p.hersteller); });
        return [...set].sort((a, b) => a.localeCompare(b, 'de'));
    }, [data]);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e) => { if (herstellerRef.current && !herstellerRef.current.contains(e.target)) setHerstellerDropdownOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const toggleHersteller = (h) => {
        setHerstellerFilter(prev => {
            const next = new Set(prev);
            if (next.has(h)) next.delete(h); else next.add(h);
            return next;
        });
    };

    const filtered = useMemo(() => {
        let rows = data;
        if (herstellerFilter.size > 0) rows = rows.filter(r => r.hersteller && herstellerFilter.has(r.hersteller));
        if (idealoFilter === 'mitRang') rows = rows.filter(r => r.currentScrape?.hr_rank);
        else if (idealoFilter === 'ohneRang') rows = rows.filter(r => !r.currentScrape?.hr_rank);
        if (search) { const s = search.toLowerCase(); rows = rows.filter(r => r.sku?.toLowerCase().includes(s) || r.name?.toLowerCase().includes(s)); }
        rows = [...rows].sort((a, b) => {
            let va, vb;
            if (sortKey === 'hr_rank') {
                va = a.currentScrape?.hr_rank || null;
                vb = b.currentScrape?.hr_rank || null;
            } else if (sortKey === 'gewinn90d') {
                va = (a.realeMargeStueck !== null && a.menge90d) ? a.realeMargeStueck * a.menge90d : null;
                vb = (b.realeMargeStueck !== null && b.menge90d) ? b.realeMargeStueck * b.menge90d : null;
            } else {
                va = a[sortKey]; vb = b[sortKey];
            }
            if (typeof va === 'boolean') { va = va ? 1 : 0; vb = vb ? 1 : 0; }
            if (va === null || va === undefined) va = sortDesc ? -Infinity : Infinity;
            if (vb === null || vb === undefined) vb = sortDesc ? -Infinity : Infinity;
            if (typeof va === 'string') return sortDesc ? vb.localeCompare(va) : va.localeCompare(vb);
            return sortDesc ? vb - va : va - vb;
        });
        return rows;
    }, [data, search, sortKey, sortDesc, herstellerFilter, idealoFilter]);

    const exportData = (format) => {
        const rows = filtered.map(r => ({ 'SKU': r.sku, 'Produkt': r.name, 'EK Netto': r.ekNetto, 'VK Netto': r.vkNetto, 'VK Brutto': r.vkBrutto, 'MwSt %': r.mwst, 'Menge 90d': r.menge90d, 'Umsatz Netto 90d': r.umsatzNetto90d, 'Handelsspanne %': r.handelsspanne, 'Reale Marge %': r.realeMargeProz, 'Rang Idealo': r.currentScrape?.hr_rank || '' }));
        const filename = `auswertung_${new Date().toISOString().slice(0, 10)}`;
        if (format === 'xlsx') { const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Auswertung'); XLSX.writeFile(wb, filename + '.xlsx'); }
        else {
            const headers = Object.keys(rows[0]);
            const fmtVal = (v) => { if (v === null || v === undefined || v === '') return ''; if (typeof v === 'number') return v.toFixed(2).replace('.', ','); return String(v).includes(';') ? `"${v}"` : String(v); };
            const lines = [headers.join(';'), ...rows.map(row => headers.map(h => fmtVal(row[h])).join(';'))];
            const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename + '.csv'; a.click(); URL.revokeObjectURL(url);
        }
    };

    // Last scrape timestamp
    let lastScrapeStr = 'Nie';
    const maxTs = data.reduce((max, p) => p.currentScrape?.timestamp > max ? p.currentScrape.timestamp : max, '');
    if (maxTs) { const d = new Date(maxTs); lastScrapeStr = `${d.toLocaleDateString('de-DE')} ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`; }

    const isRunning = scrapeProgress?.isRunning;
    const progressPct = scrapeProgress?.total > 0 ? Math.round((scrapeProgress.completed / scrapeProgress.total) * 100) : 0;

    if (loading) return <div className="page-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}><div style={{ fontSize: '1.1rem', color: 'var(--text-muted)' }}>Daten werden geladen...</div></div>;
    if (error) return <div className="page-container"><div className="card" style={{ padding: '2rem', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>Fehler: {error}</div></div>;

    const SORT_OPTIONS = [
        { key: 'umsatzNetto90d', label: 'Umsatz 90d' }, { key: 'realeMargeProz', label: 'Reale Marge %' },
        { key: 'rohertragStueck', label: 'Rohertrag/Stück' }, { key: 'rohertrag90d', label: 'Rohertrag 90d' },
        { key: 'handelsspanne', label: 'Handelsspanne' }, { key: 'gewinn90d', label: 'Gewinn 90d' }, { key: 'hr_rank', label: 'Rang Idealo' },
        { key: 'menge90d', label: 'Menge 90d' }, { key: 'name', label: 'Name' },
    ];

    return (
        <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h2 style={{ margin: 0 }}>Auswertung</h2>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <button onClick={() => exportData('csv')} style={{ background: 'white', border: '1px solid var(--border-color)', padding: '0.5rem 0.8rem', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Download size={14} /> CSV</button>
                    <button onClick={() => exportData('xlsx')} style={{ background: 'white', border: '1px solid var(--border-color)', padding: '0.5rem 0.8rem', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Download size={14} /> Excel</button>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Letzter Scrape: <strong>{lastScrapeStr}</strong></div>
                    <button onClick={startScraping} disabled={isRunning} style={{ background: 'var(--success-color)', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: isRunning ? 'wait' : 'pointer', opacity: isRunning ? 0.7 : 1, fontWeight: 600, fontSize: '0.85rem' }}>
                        {isRunning ? `Scraping... (${scrapeProgress.completed}/${scrapeProgress.total})` : 'Scrape starten'}
                    </button>
                </div>
            </div>

            {/* Scraping Banner */}
            {isRunning && (
                <div style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1px solid #86efac', borderRadius: '0.75rem', padding: '1rem 1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 600, color: '#15803d', fontSize: '0.95rem', marginBottom: '0.5rem' }}>
                        <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>↻</span>
                        Scraping läuft: {scrapeProgress.completed} von {scrapeProgress.total} Produkten ({progressPct}%)
                    </div>
                    <div style={{ background: '#bbf7d0', borderRadius: '0.5rem', height: '6px' }}>
                        <div style={{ background: '#16a34a', height: '100%', borderRadius: '0.5rem', width: `${progressPct}%`, transition: 'width 0.3s' }}></div>
                    </div>
                </div>
            )}

            {/* Filter Bar */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', background: 'white', padding: '0.75rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
                <div style={{ position: 'relative' }}>
                    <Search size={16} style={{ position: 'absolute', left: '10px', top: '9px', color: '#9ca3af' }} />
                    <input type="text" placeholder="Suche SKU / Name..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: '0.45rem 0.8rem 0.45rem 2rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', width: '220px', fontSize: '0.85rem' }} />
                </div>
                {/* Hersteller Filter */}
                <div ref={herstellerRef} style={{ position: 'relative' }}>
                    <button
                        onClick={() => setHerstellerDropdownOpen(!herstellerDropdownOpen)}
                        style={{
                            padding: '0.45rem 0.8rem', borderRadius: '0.5rem', fontSize: '0.85rem', cursor: 'pointer',
                            border: herstellerFilter.size > 0 ? '1px solid var(--primary-color)' : '1px solid var(--border-color)',
                            background: herstellerFilter.size > 0 ? '#eff6ff' : 'white',
                            color: herstellerFilter.size > 0 ? 'var(--primary-color)' : 'var(--text-color)',
                            display: 'flex', alignItems: 'center', gap: '0.3rem',
                        }}
                    >
                        Hersteller {herstellerFilter.size > 0 && <span style={{ background: 'var(--primary-color)', color: 'white', fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '1rem', fontWeight: 700 }}>{herstellerFilter.size}</span>}
                        <ChevronDown size={14} />
                    </button>
                    {herstellerDropdownOpen && (
                        <div style={{
                            position: 'absolute', top: '100%', left: 0, marginTop: '0.3rem', zIndex: 50,
                            background: 'white', border: '1px solid var(--border-color)', borderRadius: '0.5rem',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)', width: '240px', maxHeight: '300px', overflowY: 'auto',
                        }}>
                            {herstellerFilter.size > 0 && (
                                <button onClick={() => setHerstellerFilter(new Set())} style={{ width: '100%', padding: '0.5rem 0.75rem', background: '#f8fafc', border: 'none', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', fontSize: '0.8rem', color: '#ef4444', textAlign: 'left' }}>
                                    Filter zurücksetzen
                                </button>
                            )}
                            {alleHersteller.map(h => (
                                <label key={h} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '0.83rem' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <input type="checkbox" checked={herstellerFilter.has(h)} onChange={() => toggleHersteller(h)} />
                                    {h}
                                </label>
                            ))}
                        </div>
                    )}
                </div>

                {/* Idealo Filter */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Idealo:</label>
                    <select value={idealoFilter} onChange={e => setIdealoFilter(e.target.value)}
                        style={{ padding: '0.45rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                        <option value="alle">Alle</option>
                        <option value="mitRang">Mit Rang</option>
                        <option value="ohneRang">Ohne Rang</option>
                    </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderLeft: '1px solid var(--border-color)', paddingLeft: '1rem', marginLeft: 'auto' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Sortierung:</label>
                    <select value={sortKey} onChange={e => { setSortKey(e.target.value); setSortDesc(true); }} style={{ padding: '0.45rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                        {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                    </select>
                    <button className="btn" style={{ padding: '0.45rem 0.6rem', borderRadius: '0.5rem' }} onClick={() => setSortDesc(!sortDesc)} title={sortDesc ? 'Absteigend' : 'Aufsteigend'}>{sortDesc ? '↓' : '↑'}</button>
                </div>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.25rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }} onClick={() => setIsExpandedAll(true)}><ChevronDown size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Alle aufklappen</button>
                    <button className="btn" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }} onClick={() => setIsExpandedAll(false)}><ChevronUp size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Alle zuklappen</button>
                </div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{filtered.length} von {data.length} Produkten</span>
            </div>

            {/* Summary Bar */}
            {filtered.length > 0 && (() => {
                const sumUmsatz = filtered.reduce((s, p) => s + (p.umsatzNetto90d || 0), 0);
                const margeValues = filtered.filter(p => p.realeMargeProz !== null);
                const avgMarge = margeValues.length > 0 ? margeValues.reduce((s, p) => s + p.realeMargeProz, 0) / margeValues.length : null;
                const sumGewinn = filtered.reduce((s, p) => s + ((p.realeMargeStueck !== null && p.menge90d) ? p.realeMargeStueck * p.menge90d : 0), 0);
                const gewinnColor = sumGewinn >= 0 ? '#10b981' : '#ef4444';
                return (
                    <div style={{ display: 'flex', gap: '2rem', background: 'white', padding: '0.75rem 1.25rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}>
                        <div>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginRight: '0.5rem' }}>Umsatz 90d:</span>
                            <span style={{ fontWeight: 700 }}>{fmtEur(sumUmsatz)}</span>
                        </div>
                        <div>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginRight: '0.5rem' }}>Ø Reale Marge:</span>
                            <span style={{ fontWeight: 700, color: avgMarge !== null ? (avgMarge < 0 ? '#ef4444' : avgMarge < 10 ? '#f59e0b' : '#10b981') : 'var(--text-muted)' }}>{avgMarge !== null ? fmtPct(avgMarge) : '-'}</span>
                        </div>
                        <div>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginRight: '0.5rem' }}>Gewinn 90d:</span>
                            <span style={{ fontWeight: 700, color: gewinnColor }}>{sumGewinn >= 0 ? '+' : ''}{fmtEur(sumGewinn)}</span>
                        </div>
                    </div>
                );
            })()}

            {/* Product Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {filtered.map(p => <ProductCard key={p.sku} p={p} isExpandedAll={isExpandedAll} onSavePrice={savePrice} />)}
            </div>
        </div>
    );
}
