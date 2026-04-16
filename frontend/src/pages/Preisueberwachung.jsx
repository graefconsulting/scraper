import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, ChevronUp, ChevronDown, Minus, ExternalLink, Calculator } from 'lucide-react';
import axios from 'axios';
import * as XLSX from 'xlsx';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ error, errorInfo });
        console.error("UI Crash detected:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '2rem', margin: '2rem', border: '2px solid red', borderRadius: '8px', background: '#ffe6e6' }}>
                    <h2 style={{ color: 'red' }}>UI Crash in Preisüberwachung!</h2>
                    <p>Bitte teile diesen Fehlertext:</p>
                    <pre style={{ background: '#fff', padding: '1rem', overflowX: 'auto', border: '1px solid #ccc' }}>
                        {this.state.error && this.state.error.toString()}
                        <br />
                        {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </pre>
                </div>
            );
        }
        return this.props.children;
    }
}

// --- helper icons ---
const getTrendIcon = (curr, prev) => {
    if (!prev) return <Minus color="gray" size={16} title="Noch kein Vergleichswert vorhanden" />;
    if (curr > prev) return <ChevronUp color="var(--success-color)" size={16} />;
    if (curr < prev) return <ChevronDown color="var(--danger-color)" size={16} />;
    return <Minus color="gray" size={16} />;
};

const getRankTrendIcon = (curr, prev) => {
    if (!prev) return <Minus color="gray" size={16} title="Noch kein Vergleichswert vorhanden" />;
    if (curr < prev) return <ChevronUp color="var(--success-color)" size={16} />;
    if (curr > prev) return <ChevronDown color="var(--danger-color)" size={16} />;
    return <Minus color="gray" size={16} />;
};

const formatEur = (val) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val || 0);
const formatPct = (val) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(val || 0) + '%';
const formatEurPlain = (val) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val || 0);
const formatPctPlain = (val) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(val || 0);

const LS_KEY = 'hr_saved_prices';

function ProductCard({ p, defaultCalcOpen, isExpandedAll, onSavePrice }) {
    const is19 = p.tax_rate === 19;
    const [isCalcOpen, setIsCalcOpen] = useState(defaultCalcOpen || false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [showAllCompetitors, setShowAllCompetitors] = useState(false);
    const [calcBruttoVK, setCalcBruttoVK] = useState(p.price_gross || 0);

    // Sync with global expand/collapse
    useEffect(() => {
        if (isExpandedAll !== null) {
            setIsExpanded(isExpandedAll);
        }
    }, [isExpandedAll]);

    const adjustCalc = (amount) => {
        setCalcBruttoVK(prev => Math.max(0.01, parseFloat((prev + amount).toFixed(2))));
    };

    const setOneCentUnder = () => {
        if (p.currentScrape?.rank1_price) {
            setCalcBruttoVK(parseFloat((p.currentScrape.rank1_price - 0.01).toFixed(2)));
        }
    };

    // --- Calculator derivations ---
    const calcNetto = is19 ? calcBruttoVK / 1.19 : calcBruttoVK / 1.07;
    const ekNetto = p.purchase_price_net;

    let projMargin = null;
    if (calcNetto > 0 && ekNetto !== null) {
        projMargin = ((calcNetto - ekNetto) / calcNetto) * 100;
    }

    let projProfit = null;
    if (ekNetto !== null) {
        projProfit = (calcNetto - ekNetto);
    }

    let projDiffEur = null;
    let projDiffPct = null;
    const lowestRaw = p.currentScrape?.lowest_price;
    const lowestComp = Math.min(
        p.currentScrape?.rank1_price || 999999,
        p.currentScrape?.rank2_price || 999999
    );
    const lowestPrice = lowestRaw || (lowestComp === 999999 ? null : lowestComp);

    if (lowestPrice !== null) {
        projDiffEur = calcBruttoVK - lowestPrice;
        projDiffPct = (projDiffEur / lowestPrice) * 100;
    }

    // --- Competitors Data ---
    let allCompetitors = [];
    if (p.currentScrape?.all_competitors) {
        try {
            allCompetitors = JSON.parse(p.currentScrape.all_competitors) || [];
            if (!Array.isArray(allCompetitors)) allCompetitors = [];
        } catch (e) { console.error("Could not parse all competitors"); }
    }

    let projRank = "Keine Daten";
    if (allCompetitors.length > 0) {
        const competitorsOnly = allCompetitors.filter(c => {
            const shopName = c.shop || "";
            return !(shopName.toLowerCase().includes('health rise') || shopName.toLowerCase().includes('health-rise'));
        });

        const compPrices = competitorsOnly.map(c => c.price).filter(price => price !== null && !isNaN(price));
        compPrices.sort((a, b) => a - b);

        let simulatedRank = 1;
        for (const price of compPrices) {
            if (calcBruttoVK > price) {
                simulatedRank++;
            } else {
                break;
            }
        }
        projRank = `Rang ${simulatedRank}`;
    } else if (p.currentScrape) {
        if (calcBruttoVK < (p.currentScrape.rank1_price || 999999)) projRank = "Rang 1";
        else if (calcBruttoVK < (p.currentScrape.rank2_price || 999999)) projRank = "Rang 2";
        else projRank = "Schlechter als Rang 2";
    }

    return (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0', padding: '0', transition: 'all 0.2s ease-in-out' }}>
            {/* Compact Header (Always visible, acts as Accordion Toggle) */}
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                style={{
                    padding: '1rem 1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    cursor: 'pointer',
                    userSelect: 'none',
                    borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
                {/* Traffic Light */}
                <div style={{ flexShrink: 0, width: '16px', height: '16px', borderRadius: '50%', backgroundColor: p.calc.trafficLight === 'red' ? '#ef4444' : p.calc.trafficLight === 'yellow' ? '#f59e0b' : p.calc.trafficLight === 'green' ? '#10b981' : '#94a3b8' }} title={"Ampel: " + p.calc.trafficLight}></div>

                {/* Name & SKU */}
                <div style={{ flex: '2', minWidth: '200px' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-color)', marginBottom: '0.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.id}</div>
                </div>

                {/* KPI Columns in Compact View */}
                <div style={{ flex: '1', minWidth: '100px', fontSize: '0.9rem' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block' }}>Rang Idealo</span>
                    <span style={{ fontWeight: 500 }}>{p.currentScrape?.hr_rank || '-'}</span>
                </div>

                <div style={{ flex: '1', minWidth: '100px', fontSize: '0.9rem' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block' }}>Handelsspanne</span>
                    <span style={{ fontWeight: 600, color: p.calc.marginPct < 15 ? 'var(--danger-color)' : 'var(--success-color)' }}>
                        {p.calc.marginPct !== null ? formatPct(p.calc.marginPct) : '-'}
                    </span>
                </div>

                <div style={{ flex: '1', minWidth: '100px', fontSize: '0.9rem' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block' }}>Menge (3M)</span>
                    <span style={{ fontWeight: 500 }}>{p.quantity || 0}</span>
                </div>

                {/* Chevron */}
                <div style={{ flexShrink: 0, color: 'var(--text-muted)' }}>
                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
            </div>

            {/* Expanded Content View */}
            {isExpanded && (
                <div style={{ padding: '1.5rem 0 0 0', animation: 'fadeIn 0.2s ease-in-out' }}>
                    {/* Data Two Columns */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 1fr) minmax(300px, 1fr)', gap: '2rem', padding: '0 1.5rem 1.5rem 1.5rem' }}>
                        {/* Left Column: Price Data */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                                <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', margin: 0 }}>Preisdaten</h4>
                                {p.idealo_link && <a href={p.idealo_link} target="_blank" rel="noopener noreferrer" className="badge"><ExternalLink size={12} style={{ marginRight: '4px' }} /> Idealo</a>}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.95rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Brutto-VK:</span> <span style={{ fontWeight: 500 }}>{formatEur(p.price_gross)}</span>
                                <span style={{ color: 'var(--text-muted)' }}>Netto-VK:</span> <span>{formatEur(p.price_net)}</span>
                                <span style={{ color: 'var(--text-muted)' }}>EK Netto:</span> <span>{formatEur(p.purchase_price_net)}</span>
                                <span style={{ color: 'var(--text-muted)' }}>UVP:</span> <span>{formatEur(p.uvp)}</span>
                                <span style={{ color: 'var(--text-muted)' }}>Steuer:</span> <span>{formatPctPlain(p.tax_rate)}%</span>
                                <div style={{ gridColumn: '1/-1', height: '1px', background: 'var(--border-color)', margin: '0.5rem 0' }}></div>

                                <span style={{ fontWeight: 600 }}>Handelsspanne:</span> <span style={{ fontWeight: 600, color: p.calc.marginPct < 15 ? 'var(--danger-color)' : 'var(--success-color)' }}>{formatPct(p.calc.marginPct)}</span>
                                <span style={{ color: 'var(--text-muted)' }}>Rohertrag/Stück:</span> <span>{formatEur(p.calc.grossProfit)}</span>
                                <span style={{ color: 'var(--text-muted)' }}>Abweichung UVP:</span> <span style={{ color: p.calc.discountUvp < 0 ? 'var(--danger-color)' : 'inherit' }}>{formatPct(p.calc.discountUvp)}</span>
                            </div>
                        </div>

                        {/* Right Column: Market Data */}
                        <div>
                            <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.8rem', textTransform: 'uppercase' }}>Marktdaten</h4>
                            {!p.currentScrape ? (
                                <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Noch keine Wettbewerber-Daten (oder kein Link).</div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '0.5rem', fontSize: '0.95rem', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Rang 1:</span>
                                    <a href={p.currentScrape.rank1_link} target="_blank" rel="noopener noreferrer" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.currentScrape.rank1_shop}</a>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontWeight: 600 }}>
                                        {formatEurPlain(p.currentScrape.rank1_price)} €
                                        {getTrendIcon(p.currentScrape.rank1_price, p.prevScrape?.rank1_price)}
                                    </div>

                                    <span style={{ color: 'var(--text-muted)' }}>Rang 2:</span>
                                    <a href={p.currentScrape.rank2_link} target="_blank" rel="noopener noreferrer" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.currentScrape.rank2_shop || '-'}</a>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                        {p.currentScrape.rank2_price ? formatEurPlain(p.currentScrape.rank2_price) + ' €' : '-'}
                                    </div>

                                    <span style={{ color: 'var(--primary-color)', fontWeight: 600, marginTop: '0.5rem' }}>Health Rise:</span>
                                    <span style={{ marginTop: '0.5rem' }}>Rang {p.currentScrape.hr_rank || '-'}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', marginTop: '0.5rem' }}>
                                        {p.currentScrape.hr_price ? formatEurPlain(p.currentScrape.hr_price) + ' €' : '-'}
                                        {getRankTrendIcon(p.currentScrape.hr_rank, p.prevScrape?.hr_rank)}
                                    </div>

                                    <div style={{ gridColumn: '1/-1', height: '1px', background: 'var(--border-color)', margin: '0.5rem 0' }}></div>
                                    <span style={{ color: 'var(--text-muted)', gridColumn: '1/3' }}>Diff. zum Günstigsten (HR):</span>
                                    <span style={{ fontWeight: 500, color: p.calc.diffLowestEur < 0 ? 'var(--success-color)' : 'var(--danger-color)' }}>
                                        {p.calc.diffLowestEur !== null ? (
                                            <>{p.calc.diffLowestEur > 0 ? '+' : ''}{formatEurPlain(p.calc.diffLowestEur)} € ({p.calc.diffLowestPct > 0 ? '+' : ''}{formatPctPlain(p.calc.diffLowestPct)}%)</>
                                        ) : '-'}
                                    </span>

                                    {/* All Competitors Expand */}
                                    {allCompetitors.length > 0 && (
                                        <div style={{ gridColumn: '1/-1', marginTop: '0.5rem' }}>
                                            <button
                                                onClick={() => setShowAllCompetitors(!showAllCompetitors)}
                                                style={{ background: 'none', border: 'none', color: 'var(--primary-color)', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem', padding: 0 }}
                                            >
                                                {showAllCompetitors ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Alle Anbieter anzeigen ({allCompetitors.length})
                                            </button>

                                            {showAllCompetitors && (
                                                <div style={{ marginTop: '0.5rem', maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', background: '#f8fafc' }}>
                                                    <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', textAlign: 'left' }}>
                                                        <thead style={{ position: 'sticky', top: 0, background: '#f1f5f9' }}>
                                                            <tr>
                                                                <th style={{ padding: '0.4rem 0.5rem', width: '50px' }}>Rang</th>
                                                                <th style={{ padding: '0.4rem 0.5rem' }}>Shop</th>
                                                                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>Preis</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {allCompetitors.map((comp, idx) => {
                                                                const shopName = comp.shop || "";
                                                                const isHr = shopName.toLowerCase().includes('health rise') || shopName.toLowerCase().includes('health-rise');
                                                                return (
                                                                    <tr key={idx} style={{
                                                                        borderBottom: '1px solid var(--border-color)',
                                                                        background: isHr ? '#dcfce7' : 'transparent'
                                                                    }}>
                                                                        <td style={{ padding: '0.4rem 0.5rem', color: 'var(--text-muted)' }}>{comp.rank}</td>
                                                                        <td style={{ padding: '0.4rem 0.5rem', fontWeight: isHr ? 600 : 400 }}>
                                                                            {comp.link ? (
                                                                                <a href={comp.link} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                                                                                    {comp.shop} {isHr && '(Health Rise)'}
                                                                                </a>
                                                                            ) : (
                                                                                <span>{comp.shop} {isHr && '(Health Rise)'}</span>
                                                                            )}
                                                                        </td>
                                                                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontWeight: isHr ? 600 : 400 }}>{formatEurPlain(comp.price)} €</td>
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
                    </div>

                    {/* Mini Preisrechner */}
                    <div style={{ margin: '0 1.5rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                        <button
                            onClick={() => setIsCalcOpen(!isCalcOpen)}
                            style={{
                                width: '100%', background: '#f8fafc', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between',
                                alignItems: 'center', border: 'none', cursor: 'pointer', color: 'var(--text-color)', fontWeight: 500
                            }}
                        >
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Calculator size={16} /> Preisrechner</span>
                            {isCalcOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>

                        {isCalcOpen && (
                            <div style={{ padding: '1rem', background: '#fff', borderTop: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Neuer Brutto-VK (€)</label>
                                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                                        <button onClick={() => adjustCalc(-0.05)} className="btn" style={{ padding: '0.4rem 0.8rem', fontSize: '1rem' }}>-</button>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={calcBruttoVK}
                                            onChange={(e) => setCalcBruttoVK(parseFloat(e.target.value) || 0)}
                                            style={{ flex: 1, padding: '0.4rem', textAlign: 'center', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}
                                        />
                                        <button onClick={() => adjustCalc(0.05)} className="btn" style={{ padding: '0.4rem 0.8rem', fontSize: '1rem' }}>+</button>
                                    </div>
                                    <button
                                        onClick={setOneCentUnder}
                                        disabled={!p.currentScrape?.rank1_price}
                                        className="btn" style={{ width: '100%', padding: '0.5rem', fontSize: '0.85rem' }}
                                    >
                                        1 Cent unter Rang 1
                                    </button>
                                    <button
                                        onClick={() => onSavePrice(p.id, calcBruttoVK, calcNetto)}
                                        className="btn"
                                        style={{ width: '100%', padding: '0.5rem', fontSize: '0.85rem', marginTop: '0.5rem', background: 'var(--success-color)', color: 'white', border: 'none', borderRadius: '0.4rem', cursor: 'pointer', fontWeight: 600 }}
                                    >
                                        Neuen Brutto-VK übernehmen
                                    </button>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.9rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: 'var(--text-muted)' }}>Neue Handelsspanne:</span>
                                        <span style={{ fontWeight: 600, color: projMargin < 15 ? 'var(--danger-color)' : 'var(--success-color)' }}>{projMargin !== null ? formatPct(projMargin) : '-'}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: 'var(--text-muted)' }}>Neuer Rohertrag/Stück:</span>
                                        <span>{projProfit !== null ? formatEur(projProfit) : '-'}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: 'var(--text-muted)' }}>Neue Diff. z. Günstigsten:</span>
                                        <span style={{ color: projDiffEur < 0 ? 'var(--success-color)' : 'var(--danger-color)' }}>
                                            {projDiffEur !== null ? <>{projDiffEur > 0 ? '+' : ''}{formatEurPlain(projDiffEur)} € ({projDiffPct > 0 ? '+' : ''}{formatPctPlain(projDiffPct)}%)</> : '-'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem', paddingTop: '0.4rem', borderTop: '1px solid var(--border-color)' }}>
                                        <span style={{ color: 'var(--text-muted)' }}>Vor. Idealo Rang:</span>
                                        <span style={{ fontWeight: 600, color: projRank === 'Rang 1' ? 'var(--success-color)' : 'inherit' }}>{projRank}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Bottom Bar */}
                    <div style={{ background: 'var(--bg-color)', padding: '0.75rem 1.5rem', borderTop: '1px solid var(--border-color)', borderBottomLeftRadius: 'var(--radius-lg)', borderBottomRightRadius: 'var(--radius-lg)', display: 'flex', gap: '2rem', fontSize: '0.85rem' }}>
                        <span><strong style={{ color: 'var(--text-muted)' }}>Menge (3 Mon):</strong> {p.quantity || 0}</span>
                        <span><strong style={{ color: 'var(--text-muted)' }}>Umsatz (3 Mon):</strong> {formatEur(p.revenue_net)}</span>
                        <span><strong style={{ color: 'var(--text-muted)' }}>Idealo Klicks (30d):</strong> {p.clicks_30_days || 'k.A.'}</span>
                    </div>
                </div>
            )}
        </div>
    );
}

function PreisueberwachungContent() {
    const location = useLocation();
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [scrapingProgress, setScrapingProgress] = useState(null);
    // scrapingProgress: null | { isRunning, total, completed, failed: [], completedIds: [] }
    const [isExpandedAll, setIsExpandedAll] = useState(null);
    const [savedPrices, setSavedPrices] = useState(() => JSON.parse(localStorage.getItem(LS_KEY) || '{}'));
    const pollIntervalRef = useRef(null);

    // Filtering & Sorting State
    const [search, setSearch] = useState(location.state?.prefilterSku || '');
    const [sortField, setSortField] = useState('revenue_net');
    const [sortDesc, setSortDesc] = useState(true);
    const [minHandelsspanne, setMinHandelsspanne] = useState('');
    const [minAbweichungUvp, setMinAbweichungUvp] = useState('');
    const [rangFilter, setRangFilter] = useState('Alle');
    const [selectedLights, setSelectedLights] = useState({ green: true, yellow: true, red: true, gray: true });

    const stopPolling = () => {
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
        }
    };

    const startPolling = () => {
        if (pollIntervalRef.current) return;
        pollIntervalRef.current = setInterval(async () => {
            try {
                const statusRes = await axios.get('/api/scrape/status');
                const status = statusRes.data;
                setScrapingProgress(status);

                const prodRes = await axios.get('/api/products');
                if (prodRes.data.success) setProducts(prodRes.data.data);

                if (!status.isRunning) {
                    stopPolling();
                }
            } catch (e) {
                console.error('Scraping status poll error:', e);
            }
        }, 3000);
    };

    useEffect(() => {
        const init = async () => {
            try {
                // Check if a scrape is already running on page load
                const statusRes = await axios.get('/api/scrape/status');
                if (statusRes.data.isRunning) {
                    setScrapingProgress(statusRes.data);
                    startPolling();
                }
                const prodRes = await axios.get('/api/products');
                if (prodRes.data.success) setProducts(prodRes.data.data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        init();
        return () => stopPolling();
    }, []);

    const startScraping = async () => {
        try {
            const res = await axios.post('/api/scrape/start');
            if (res.data.success) {
                setProducts([]);
                setScrapingProgress({ isRunning: true, total: 0, completed: 0, failed: [], completedIds: [] });
                startPolling();
            } else {
                alert('Fehler: ' + (res.data.error || 'Unbekannt.'));
            }
        } catch (error) {
            alert('Netzwerkfehler beim Starten des Scrapings.');
        }
    };

    // Calculations
    const calculateDerived = (p) => {
        const is19 = p.tax_rate === 19;
        const nettoVK = p.price_net;
        const bruttoVK = p.price_gross;
        const ekNetto = p.purchase_price_net;

        let marginPct = null;
        if (nettoVK > 0 && ekNetto !== null) marginPct = ((nettoVK - ekNetto) / nettoVK) * 100;

        let grossProfit = null;
        if (nettoVK !== null && ekNetto !== null) grossProfit = nettoVK - ekNetto;

        let discountUvp = null;
        if (bruttoVK !== null && p.uvp > 0) discountUvp = ((bruttoVK - p.uvp) / p.uvp) * 100;

        let diffLowestEur = null;
        let diffLowestPct = null;
        const lowestRaw = p.currentScrape?.lowest_price;
        const lowestComp = Math.min(
            p.currentScrape?.rank1_price || 999999,
            p.currentScrape?.rank2_price || 999999
        );
        const lowestPrice = lowestRaw || (lowestComp === 999999 ? null : lowestComp);

        const hrPrice = p.currentScrape?.hr_price;

        if (hrPrice !== undefined && hrPrice !== null && lowestPrice !== null) {
            diffLowestEur = hrPrice - lowestPrice;
            diffLowestPct = (diffLowestEur / lowestPrice) * 100;
        }

        let trafficLight = 'gray';
        let targetPrice = p.currentScrape?.rank1_price;
        if (p.currentScrape && p.idealo_link) {
            if (p.currentScrape.hr_rank === 1) {
                trafficLight = 'green';
            } else if (targetPrice) {
                const targetNetto = is19 ? targetPrice / 1.19 : targetPrice / 1.07;
                const projectedMargin = ((targetNetto - ekNetto) / targetNetto) * 100;
                if (projectedMargin >= 15) trafficLight = 'green';
                else if (projectedMargin >= 0) trafficLight = 'yellow';
                else trafficLight = 'red';
            }
        }

        return { marginPct, grossProfit, discountUvp, diffLowestEur, diffLowestPct, trafficLight };
    };

    const savePrice = (id, bruttoVK, nettoVK) => {
        const updated = { ...savedPrices, [id]: { bruttoVK, nettoVK } };
        setSavedPrices(updated);
        localStorage.setItem(LS_KEY, JSON.stringify(updated));
    };

    const exportSavedPricesCSV = () => {
        const entries = Object.entries(savedPrices);
        if (entries.length === 0) return;
        const fmt = (n) => n.toFixed(2).replace('.', ',');
        const lines = ['SKU;Neuer Brutto-VK;Neuer Netto-VK'];
        for (const [sku, d] of entries) {
            lines.push(`${sku};${fmt(d.bruttoVK)};${fmt(d.nettoVK)}`);
        }
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'neue_preise.csv';
        a.click();
        URL.revokeObjectURL(url);
        setSavedPrices({});
        localStorage.removeItem(LS_KEY);
    };

    const exportAllData = (format) => {
        const allData = products.map(p => ({ ...p, calc: calculateDerived(p) }));

        const rows = allData.map(p => {
            const s = p.currentScrape;
            const prev = p.prevScrape;

            // Rank 3 from all_competitors array
            let rank3Shop = '', rank3Price = null;
            if (s?.all_competitors) {
                try {
                    const comps = JSON.parse(s.all_competitors);
                    if (Array.isArray(comps) && comps[2]) {
                        rank3Shop = comps[2].shop || '';
                        rank3Price = comps[2].price ?? null;
                    }
                } catch (e) { /* ignore */ }
            }

            const hrPrice = s?.hr_price ?? null;
            const prevHrPrice = prev?.hr_price ?? null;
            const hrPriceDiff = (hrPrice !== null && prevHrPrice !== null) ? hrPrice - prevHrPrice : null;

            const lowestRaw = s?.lowest_price;
            const lowestComp = Math.min(s?.rank1_price || 999999, s?.rank2_price || 999999);
            const lowestPrice = lowestRaw || (lowestComp === 999999 ? null : lowestComp);
            const diffLowest = (hrPrice !== null && lowestPrice !== null) ? hrPrice - lowestPrice : null;

            let discountUvpPct = null;
            if (hrPrice !== null && p.uvp > 0) discountUvpPct = ((hrPrice - p.uvp) / p.uvp) * 100;

            let scrapeDate = '';
            if (s?.timestamp) {
                const d = new Date(s.timestamp);
                scrapeDate = `${d.toLocaleDateString('de-DE')} ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
            }

            return {
                'SKU': p.id,
                'Titel': p.name,
                'Eigener Preis Brutto (€)': hrPrice ?? p.price_gross,
                'UVP (€)': p.uvp,
                'Abw. vom UVP (%)': discountUvpPct,
                'Rang HR': s?.hr_rank ?? '',
                'Rang 1 Shop': s?.rank1_shop ?? '',
                'Rang 1 Preis (€)': s?.rank1_price ?? '',
                'Rang 2 Shop': s?.rank2_shop ?? '',
                'Rang 2 Preis (€)': s?.rank2_price ?? '',
                'Rang 3 Shop': rank3Shop,
                'Rang 3 Preis (€)': rank3Price ?? '',
                'Günstigster Preis (€)': lowestPrice ?? '',
                'Differenz zum Günstigsten (€)': diffLowest,
                'Anzahl Wettbewerber': s?.competitor_count ?? '',
                'Handelsspanne (%)': p.calc.marginPct,
                'Rohertrag/Stück (€)': p.calc.grossProfit,
                'Preisveränderung HR (€)': hrPriceDiff,
                'Einkaufspreis netto (€)': p.purchase_price_net,
                'Idealo Klicks (30 Tage)': p.clicks_30_days ?? '',
                'Datum letzter Scrape': scrapeDate,
            };
        });

        const filename = `preise_export_${new Date().toISOString().slice(0, 10)}`;

        if (format === 'xlsx') {
            const ws = XLSX.utils.json_to_sheet(rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Preisüberwachung');
            XLSX.writeFile(wb, filename + '.xlsx');
        } else {
            const headers = Object.keys(rows[0]);
            const fmtVal = (v) => {
                if (v === null || v === undefined || v === '') return '';
                if (typeof v === 'number') return v.toFixed(2).replace('.', ',');
                const s = String(v);
                return s.includes(';') ? `"${s}"` : s;
            };
            const lines = [headers.join(';'), ...rows.map(row => headers.map(h => fmtVal(row[h])).join(';'))];
            const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename + '.csv';
            a.click();
            URL.revokeObjectURL(url);
        }
    };

    const toggleLight = (color) => setSelectedLights(prev => ({ ...prev, [color]: !prev[color] }));

    // Global timestamp
    let lastScrapeTimeStr = "Nie";
    const maxTs = products.reduce((max, p) => p.currentScrape?.timestamp > max ? p.currentScrape.timestamp : max, '');
    if (maxTs) {
        const d = new Date(maxTs);
        lastScrapeTimeStr = `${d.toLocaleDateString('de-DE')} ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
    }

    // During scraping: only show products that are already done in this run
    const displayProducts = scrapingProgress?.isRunning
        ? products.filter(p => scrapingProgress.completedIds?.includes(p.id))
        : products;

    // Process and Filter
    let processedData = displayProducts.map(p => ({ ...p, calc: calculateDerived(p) }));

    if (search) {
        const s = search.toLowerCase();
        processedData = processedData.filter(p => (p.name?.toLowerCase()?.includes(s)) || (p.id?.toLowerCase()?.includes(s)));
    }

    if (minHandelsspanne !== '') {
        const m = parseFloat(minHandelsspanne);
        if (!isNaN(m)) processedData = processedData.filter(p => p.calc.marginPct !== null && p.calc.marginPct >= m);
    }

    if (minAbweichungUvp !== '') {
        const a = parseFloat(minAbweichungUvp);
        if (!isNaN(a)) {
            processedData = processedData.filter(p => p.calc.discountUvp !== null && p.calc.discountUvp <= -Math.abs(a));
        }
    }

    if (rangFilter === 'Nur Rang 1') {
        processedData = processedData.filter(p => p.currentScrape?.hr_rank === 1);
    } else if (rangFilter === 'Nicht Rang 1') {
        processedData = processedData.filter(p => p.currentScrape && p.currentScrape?.hr_rank !== 1);
    }

    processedData = processedData.filter(p => selectedLights[p.calc.trafficLight]);

    // Enhanced Sorting
    processedData.sort((a, b) => {
        let valA, valB;
        if (sortField === 'revenue_net') {
            valA = a.revenue_net || 0; valB = b.revenue_net || 0;
        } else if (sortField === 'grossProfit') {
            valA = a.calc.grossProfit || 0; valB = b.calc.grossProfit || 0;
        } else if (sortField === 'marginPct') {
            valA = a.calc.marginPct || -999; valB = b.calc.marginPct || -999;
        } else if (sortField === 'discountUvp') {
            valA = a.calc.discountUvp || 0; valB = b.calc.discountUvp || 0;
        } else if (sortField === 'hr_rank') {
            valA = a.currentScrape?.hr_rank || 999; valB = b.currentScrape?.hr_rank || 999;
        } else if (sortField === 'competitor_count') {
            valA = a.currentScrape?.competitor_count || 0; valB = b.currentScrape?.competitor_count || 0;
        }

        if (valA < valB) return sortDesc ? 1 : -1;
        if (valA > valB) return sortDesc ? -1 : 1;
        return 0;
    });

    const isRunning = scrapingProgress?.isRunning;
    const scrapeDone = scrapingProgress && !scrapingProgress.isRunning && scrapingProgress.total > 0;
    const scrapeProgressPct = scrapingProgress?.total > 0
        ? Math.round((scrapingProgress.completed / scrapingProgress.total) * 100)
        : 0;

    return (
        <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="header-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'flex-start' }}>
                    <div>
                        <h2>Preisüberwachung</h2>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        {Object.keys(savedPrices).length > 0 && (
                            <button
                                onClick={exportSavedPricesCSV}
                                style={{ background: '#1d4ed8', color: 'white', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                            >
                                ↓ Preise exportieren ({Object.keys(savedPrices).length})
                            </button>
                        )}
                        {products.length > 0 && (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    onClick={() => exportAllData('csv')}
                                    style={{ background: 'white', color: 'var(--text-color)', border: '1px solid var(--border-color)', padding: '0.6rem 1rem', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 500, fontSize: '0.85rem' }}
                                >
                                    ↓ CSV
                                </button>
                                <button
                                    onClick={() => exportAllData('xlsx')}
                                    style={{ background: 'white', color: 'var(--text-color)', border: '1px solid var(--border-color)', padding: '0.6rem 1rem', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 500, fontSize: '0.85rem' }}
                                >
                                    ↓ Excel
                                </button>
                            </div>
                        )}
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                            Letzter Scrape: <strong>{lastScrapeTimeStr}</strong>
                        </div>
                        <button
                            onClick={startScraping}
                            disabled={isRunning}
                            style={{
                                background: 'var(--success-color)',
                                color: 'white',
                                border: 'none',
                                padding: '0.6rem 1.2rem',
                                borderRadius: '0.5rem',
                                cursor: isRunning ? 'wait' : 'pointer',
                                opacity: isRunning ? 0.7 : 1,
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            {isRunning ? <span className="animate-spin" style={{ display: 'inline-block' }}>↻</span> : '⟳'}
                            {isRunning ? `Scraping läuft... (${scrapingProgress.completed}/${scrapingProgress.total})` : 'Neuen Scrape starten'}
                        </button>
                    </div>
                </div>

                {/* Filter and Sort Bar */}
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', background: 'white', padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', width: '100%' }}>

                    {/* Search */}
                    <div style={{ position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', left: '10px', top: '10px', color: '#9ca3af' }} />
                        <input
                            type="text"
                            placeholder="Suchen nach Name/SKU..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{ padding: '0.5rem 1rem 0.5rem 2.2rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', width: '220px' }}
                        />
                    </div>

                    {/* Min. Handelsspanne Filter */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Min. Handelsspanne (%):</label>
                        <input
                            type="number"
                            value={minHandelsspanne}
                            onChange={(e) => setMinHandelsspanne(e.target.value)}
                            style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', width: '60px' }}
                        />
                    </div>

                    {/* Abweichung UVP Filter */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Abweichung UVP (&gt; %):</label>
                        <input
                            type="number"
                            placeholder="z.B. 20"
                            value={minAbweichungUvp}
                            onChange={(e) => setMinAbweichungUvp(e.target.value)}
                            style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', width: '70px' }}
                            title="Filtert Produkte, die mindestens diesen Prozentsatz unter dem UVP liegen."
                        />
                    </div>

                    {/* Rang Filter */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>HR Rang:</label>
                        <select
                            value={rangFilter}
                            onChange={(e) => setRangFilter(e.target.value)}
                            style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}
                        >
                            <option>Alle</option>
                            <option>Nur Rang 1</option>
                            <option>Nicht Rang 1</option>
                        </select>
                    </div>

                    {/* Sort Dropdown */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderLeft: '1px solid var(--border-color)', paddingLeft: '1rem', marginLeft: 'auto' }}>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Sortierung:</label>
                        <select
                            value={sortField}
                            onChange={(e) => setSortField(e.target.value)}
                            style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', width: '170px' }}
                        >
                            <option value="revenue_net">Umsatz Netto</option>
                            <option value="grossProfit">Rohertrag</option>
                            <option value="marginPct">Handelsspanne</option>
                            <option value="discountUvp">Abweichung UVP</option>
                            <option value="hr_rank">Rang bei Idealo</option>
                            <option value="competitor_count">Anzahl Wettbewerber</option>
                        </select>
                        <button
                            className="btn"
                            style={{ padding: '0.5rem', borderRadius: '0.5rem' }}
                            onClick={() => setSortDesc(!sortDesc)}
                            title={sortDesc ? "Absteigend" : "Aufsteigend"}
                        >
                            {sortDesc ? '↓' : '↑'}
                        </button>
                    </div>

                    {/* Traffic Light Filter */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '1rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', cursor: 'pointer' }}>
                            <input type="checkbox" checked={selectedLights.green} onChange={() => toggleLight('green')} /> <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#10b981' }}></div>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', cursor: 'pointer' }}>
                            <input type="checkbox" checked={selectedLights.yellow} onChange={() => toggleLight('yellow')} /> <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#f59e0b' }}></div>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', cursor: 'pointer' }}>
                            <input type="checkbox" checked={selectedLights.red} onChange={() => toggleLight('red')} /> <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ef4444' }}></div>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', cursor: 'pointer' }}>
                            <input type="checkbox" checked={selectedLights.gray} onChange={() => toggleLight('gray')} /> <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#94a3b8' }}></div>
                        </label>
                    </div>
                </div>

                {/* Second Row of Controls: Expand / Collapse All & Display Info */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.5rem', width: '100%' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            className="btn"
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                            onClick={() => setIsExpandedAll(true)}
                        >
                            <ChevronDown size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                            Alle aufklappen
                        </button>
                        <button
                            className="btn"
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                            onClick={() => setIsExpandedAll(false)}
                        >
                            <ChevronUp size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                            Alle zuklappen
                        </button>
                    </div>

                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Anzeige: {processedData.length} von {products.length} Produkten
                    </div>
                </div>
            </div>

            {/* Scraping Progress Banner */}
            {isRunning && (
                <div style={{
                    background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                    border: '1px solid #86efac',
                    borderRadius: '0.75rem',
                    padding: '1.25rem 1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 600, color: '#15803d', fontSize: '1rem' }}>
                        <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>↻</span>
                        Scraping läuft: {scrapingProgress.completed} von {scrapingProgress.total} Produkten gescrapt
                        <span style={{ marginLeft: 'auto', fontWeight: 400, fontSize: '0.9rem', color: '#166534' }}>
                            {scrapeProgressPct}%
                        </span>
                    </div>
                    <div style={{ height: '6px', background: '#bbf7d0', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{
                            height: '100%',
                            width: `${scrapeProgressPct}%`,
                            background: 'var(--success-color)',
                            borderRadius: '3px',
                            transition: 'width 0.4s ease'
                        }} />
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#166534' }}>
                        Ergebnisse erscheinen automatisch, sobald Produkte gescrapt werden...
                    </div>
                </div>
            )}

            {/* Scraping Done Banner */}
            {scrapeDone && (
                <div style={{
                    background: scrapingProgress.failed.length > 0 ? '#fffbeb' : '#f0fdf4',
                    border: `1px solid ${scrapingProgress.failed.length > 0 ? '#fcd34d' : '#86efac'}`,
                    borderRadius: '0.75rem',
                    padding: '1rem 1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    position: 'relative'
                }}>
                    <button
                        onClick={() => setScrapingProgress(null)}
                        style={{ position: 'absolute', top: '0.75rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#6b7280', lineHeight: 1 }}
                        title="Schließen"
                    >
                        ×
                    </button>
                    <div style={{ fontWeight: 600, color: '#15803d', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        ✓ Scraping abgeschlossen — {scrapingProgress.completed - scrapingProgress.failed.length} von {scrapingProgress.total} erfolgreich
                    </div>
                    {scrapingProgress.failed.length > 0 && (
                        <div style={{ fontSize: '0.875rem', color: '#92400e' }}>
                            <strong>Fehlgeschlagen ({scrapingProgress.failed.length}):</strong>{' '}
                            {scrapingProgress.failed.map(f => `${f.name} (${f.id})`).join(', ')}
                        </div>
                    )}
                </div>
            )}

            {loading ? (
                <div style={{ textAlign: 'center', padding: '4rem' }}><span className="animate-spin" style={{ display: 'inline-block' }}>↻</span> Lade Daten...</div>
            ) : error ? (
                <div style={{ color: 'var(--danger-color)' }}>Fehler: {error}</div>
            ) : isRunning && processedData.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
                    <div style={{ fontSize: '1rem' }}>Warte auf erste Scrape-Ergebnisse...</div>
                </div>
            ) : (
                <div className="cards-grid" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {processedData.map(p => (
                        <ProductCard
                            key={p.id}
                            p={p}
                            defaultCalcOpen={location.state?.openCalc && location.state?.prefilterSku === p.id}
                            isExpandedAll={isExpandedAll}
                            onSavePrice={savePrice}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function Preisueberwachung() {
    return (
        <ErrorBoundary>
            <PreisueberwachungContent />
        </ErrorBoundary>
    );
}
