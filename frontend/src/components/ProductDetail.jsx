import React, { useState } from 'react';
import { Calculator, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

const fmt = (v, d = 2) => {
    if (v === null || v === undefined || isNaN(v)) return '-';
    return new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
};
const fmtEur = (v) => v === null || v === undefined || isNaN(v) ? '-' : fmt(v) + ' €';
const fmtPct = (v) => v === null || v === undefined || isNaN(v) ? '-' : fmt(v, 1) + '%';
const fmtEurPlain = (v) => v === null || v === undefined || isNaN(v) ? '-' : fmt(v);

export function Lamp({ on, label }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: on ? '#10b981' : '#ef4444', boxShadow: on ? '0 0 6px #10b98155' : '0 0 6px #ef444455', flexShrink: 0 }} />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{label}</span>
        </div>
    );
}

export function CostPieChart({ wareneinsatz, betriebskosten, werbekosten, realeMarge }) {
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

export default function ProductDetail({ p, onSavePrice }) {
    const [isCalcOpen, setIsCalcOpen] = useState(false);
    const [showAllCompetitors, setShowAllCompetitors] = useState(false);
    const [calcBruttoVK, setCalcBruttoVK] = useState(p.vkBrutto || 0);
    const [saved, setSaved] = useState(false);

    const updateCalc = (val) => { setCalcBruttoVK(val); setSaved(false); };
    const s = p.currentScrape;
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

    let allCompetitors = [];
    if (s?.all_competitors) { try { allCompetitors = JSON.parse(s.all_competitors) || []; if (!Array.isArray(allCompetitors)) allCompetitors = []; } catch (e) {} }

    const RABATT_TAGE = 74;
    const NORMAL_TAGE = 16;
    const rd = p.rabattPeriode;
    const nd = p.normalPeriode;
    const thStyle = (highlight) => ({ textAlign: 'right', padding: '0.45rem 0.7rem', borderBottom: '1px solid var(--border-color)', color: highlight ? '#4f46e5' : 'var(--text-muted)', fontWeight: 600, fontSize: '0.75rem', background: highlight ? '#eef2ff' : '#f8fafc' });
    const thLeft = { textAlign: 'left', padding: '0.45rem 0.7rem', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.75rem', background: '#f8fafc' };
    const tdStyle = (align = 'right', extra = {}) => ({ padding: '0.5rem 0.7rem', textAlign: align, fontSize: '0.84rem', ...extra });
    const tdNorm = (extra = {}) => ({ padding: '0.5rem 0.7rem', textAlign: 'right', fontSize: '0.84rem', background: '#eef2ff', color: '#4f46e5', fontWeight: 600, ...extra });
    const diffMengePTag = rd && nd ? ((rd.menge / RABATT_TAGE) - (nd.menge / NORMAL_TAGE)) : null;
    const diffUmsatzPTag = rd && nd ? ((rd.umsatzNetto / RABATT_TAGE) - (nd.umsatzNetto / NORMAL_TAGE)) : null;
    const diffGewinnPTag = rd && nd ? ((rd.gewinn / RABATT_TAGE) - (nd.gewinn / NORMAL_TAGE)) : null;

    return (
        <div style={{ padding: '1.25rem', background: 'white' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                {/* Left Column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                            <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', margin: 0 }}>Preisdaten</h4>
                            <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.sku}</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem 1rem', fontSize: '0.88rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Brutto-VK:</span><span style={{ fontWeight: 500 }}>{fmtEur(p.vkBrutto)}</span>
                            <span style={{ color: 'var(--text-muted)' }}>Netto-VK:</span><span>{fmtEur(p.vkNetto)}</span>
                            <span style={{ color: 'var(--text-muted)' }}>EK Netto:</span>
                            <span>
                                {fmtEur(p.ekNetto)}
                                {p.ekRabattAktiv && <span style={{ color: '#10b981', fontSize: '0.72rem', marginLeft: '0.4rem', fontWeight: 600 }}>−5% Hersteller</span>}
                            </span>
                            <span style={{ color: 'var(--text-muted)' }}>Steuer:</span><span>{p.mwst !== null ? fmt(p.mwst, 0) + '%' : '-'}</span>
                            {p.hersteller && (<><span style={{ color: 'var(--text-muted)' }}>Hersteller:</span><span>{p.hersteller}</span></>)}
                        </div>
                    </div>

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

                    <div>
                        <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', margin: 0, marginBottom: '0.6rem' }}>Status</h4>
                        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                            <Lamp on={p.dauertiefpreis} label="Dauertiefpreis" />
                            <Lamp on={p.googleAktiv} label="Google" />
                            <Lamp on={p.staffelpreis} label="Staffelpreis" />
                            <Lamp on={!p.abverkauf} label="Abverkauf" />
                            <Lamp on={p.verfuegbar} label="Verfügbar" />
                        </div>
                    </div>

                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                            <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', margin: 0 }}>Marktdaten</h4>
                            {p.idealoLink && <a href={p.idealoLink} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#4f46e5', fontSize: '0.78rem', textDecoration: 'none', background: '#eef2ff', padding: '0.2rem 0.6rem', borderRadius: '999px', border: '1px solid #c7d2fe' }}><ExternalLink size={12} /> Idealo</a>}
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
                                            <div style={{ marginTop: '0.5rem', maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '0.4rem', background: '#f8fafc' }}>
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
                    {onSavePrice && (
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '0.5rem', overflow: 'hidden' }}>
                            <button onClick={() => setIsCalcOpen(!isCalcOpen)} style={{ width: '100%', background: '#f8fafc', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: 'none', cursor: 'pointer', color: 'var(--text-color)', fontWeight: 500 }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Calculator size={16} /> Preisrechner</span>
                                {isCalcOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                            {isCalcOpen && (
                                <div style={{ padding: '1rem', background: '#fff', borderTop: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Neuer Brutto-VK (€)</label>
                                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                            <button onClick={() => adjustCalc(-0.05)} style={{ padding: '0.4rem 0.8rem', fontSize: '1rem', border: '1px solid var(--border-color)', background: 'white', borderRadius: '0.4rem', cursor: 'pointer' }}>-</button>
                                            <input type="number" step="0.01" value={parseFloat(calcBruttoVK.toFixed(2))} onChange={e => updateCalc(parseFloat(e.target.value) || 0)} style={{ flex: 1, padding: '0.4rem', textAlign: 'center', border: '1px solid var(--border-color)', borderRadius: '0.4rem' }} />
                                            <button onClick={() => adjustCalc(0.05)} style={{ padding: '0.4rem 0.8rem', fontSize: '1rem', border: '1px solid var(--border-color)', background: 'white', borderRadius: '0.4rem', cursor: 'pointer' }}>+</button>
                                        </div>
                                        <button onClick={setOneCentUnder} disabled={!s?.rank1_price} style={{ width: '100%', padding: '0.5rem', fontSize: '0.85rem', border: '1px solid var(--border-color)', background: 'white', borderRadius: '0.4rem', cursor: s?.rank1_price ? 'pointer' : 'not-allowed', opacity: s?.rank1_price ? 1 : 0.5 }}>1 Cent unter Rang 1</button>
                                        <button onClick={() => { onSavePrice(p, calcBruttoVK, calcNetto, calcRealeMargeProz, calcRealeMargeSt); setSaved(true); }} disabled={saved}
                                            style={{ width: '100%', padding: '0.5rem', fontSize: '0.85rem', marginTop: '0.5rem', background: saved ? '#94a3b8' : '#10b981', color: 'white', border: 'none', borderRadius: '0.4rem', cursor: saved ? 'default' : 'pointer', fontWeight: 600, transition: 'background 0.3s ease' }}>
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
                    )}
                </div>

                {/* Right Column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', margin: 0, marginBottom: '0.8rem' }}>Kostenstruktur (% vom Umsatz)</h4>
                        <CostPieChart wareneinsatz={p.wareneinsatzAnteil} betriebskosten={p.betriebskostenAnteil} werbekosten={p.werbekostenAnteil} realeMarge={p.realeMargeProz} />
                    </div>

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
            {(rd || nd) && (
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
            )}
        </div>
    );
}
