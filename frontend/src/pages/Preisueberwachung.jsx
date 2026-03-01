import React, { useEffect, useState } from 'react';
import { Search, ChevronUp, ChevronDown, Minus, ExternalLink, Calculator } from 'lucide-react';
import axios from 'axios';

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

function ProductCard({ p }) {
    const is19 = p.tax_rate === 19;
    const [isCalcOpen, setIsCalcOpen] = useState(false);
    const [calcBruttoVK, setCalcBruttoVK] = useState(p.price_gross || 0);

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
    if (ekNetto !== null && p.quantity) {
        projProfit = (calcNetto - ekNetto) * p.quantity;
    }

    let projDiffEur = null;
    let projDiffPct = null;
    // same logic for lowestPrice as derived earlier
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

    let projRank = "-";
    if (p.currentScrape) {
        if (calcBruttoVK < (p.currentScrape.rank1_price || 999999)) projRank = "Rang 1";
        else if (calcBruttoVK < (p.currentScrape.rank2_price || 999999)) projRank = "Rang 2";
        else projRank = "Schlechter als Rang 2";
    }

    return (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0' }}>
            {/* Header */}
            <div style={{ padding: '1.5rem 1.5rem 1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between' }}>
                <div>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '0.2rem' }}>{p.name}</h3>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{p.id}</span>
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    {p.idealo_link && <a href={p.idealo_link} target="_blank" rel="noopener noreferrer" className="badge"><ExternalLink size={12} style={{ marginRight: '4px' }} /> Idealo</a>}
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: p.calc.trafficLight === 'red' ? '#ef4444' : p.calc.trafficLight === 'yellow' ? '#f59e0b' : p.calc.trafficLight === 'green' ? '#10b981' : '#94a3b8' }} title={"Ampel: " + p.calc.trafficLight}></div>
                </div>
            </div>

            {/* Data Two Columns */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 1fr) minmax(300px, 1fr)', gap: '2rem', padding: '0 1.5rem' }}>
                {/* Left Column: Price Data */}
                <div>
                    <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.8rem', textTransform: 'uppercase' }}>Preisdaten</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.95rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Brutto-VK:</span> <span style={{ fontWeight: 500 }}>{p.price_gross?.toFixed(2)} €</span>
                        <span style={{ color: 'var(--text-muted)' }}>Netto-VK:</span> <span>{p.price_net?.toFixed(2)} €</span>
                        <span style={{ color: 'var(--text-muted)' }}>EK Netto:</span> <span>{p.purchase_price_net?.toFixed(2)} €</span>
                        <span style={{ color: 'var(--text-muted)' }}>UVP:</span> <span>{p.uvp?.toFixed(2)} €</span>
                        <span style={{ color: 'var(--text-muted)' }}>Steuer:</span> <span>{p.tax_rate}%</span>
                        <div style={{ gridColumn: '1/-1', height: '1px', background: 'var(--border-color)', margin: '0.5rem 0' }}></div>

                        <span style={{ fontWeight: 600 }}>Handelsspanne:</span> <span style={{ fontWeight: 600, color: p.calc.marginPct < 15 ? 'var(--danger-color)' : 'var(--success-color)' }}>{p.calc.marginPct?.toFixed(2)}%</span>
                        <span style={{ color: 'var(--text-muted)' }}>Rohertrag:</span> <span>{p.calc.grossProfit?.toFixed(2)} €</span>
                        <span style={{ color: 'var(--text-muted)' }}>Abweichung UVP:</span> <span style={{ color: p.calc.discountUvp < 0 ? 'var(--danger-color)' : 'inherit' }}>{p.calc.discountUvp?.toFixed(2)}%</span>
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
                                {p.currentScrape.rank1_price?.toFixed(2)} €
                                {getTrendIcon(p.currentScrape.rank1_price, p.prevScrape?.rank1_price)}
                            </div>

                            <span style={{ color: 'var(--text-muted)' }}>Rang 2:</span>
                            <a href={p.currentScrape.rank2_link} target="_blank" rel="noopener noreferrer" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.currentScrape.rank2_shop || '-'}</a>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                {p.currentScrape.rank2_price?.toFixed(2)} {p.currentScrape.rank2_price && '€'}
                            </div>

                            <span style={{ color: 'var(--primary-color)', fontWeight: 600, marginTop: '0.5rem' }}>Health Rise:</span>
                            <span style={{ marginTop: '0.5rem' }}>Rang {p.currentScrape.hr_rank || '-'}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', marginTop: '0.5rem' }}>
                                {p.currentScrape.hr_price?.toFixed(2)} {p.currentScrape.hr_price && '€'}
                                {getRankTrendIcon(p.currentScrape.hr_rank, p.prevScrape?.hr_rank)}
                            </div>

                            {p.currentScrape.competitor_count != null && (
                                <>
                                    <div style={{ gridColumn: '1/-1', height: '1px', background: 'var(--border-color)', margin: '0.5rem 0' }}></div>
                                    <span style={{ color: 'var(--text-muted)', gridColumn: '1/3' }}>Anbieter auf Idealo:</span>
                                    <span style={{ fontWeight: 500 }}>{p.currentScrape.competitor_count}</span>
                                </>
                            )}

                            <div style={{ gridColumn: '1/-1', height: '1px', background: 'var(--border-color)', margin: '0.5rem 0' }}></div>
                            <span style={{ color: 'var(--text-muted)', gridColumn: '1/3' }}>Diff. zum Günstigsten:</span>
                            <span style={{ fontWeight: 500, color: p.calc.diffLowestEur < 0 ? 'var(--success-color)' : 'var(--danger-color)' }}>{p.calc.diffLowestEur > 0 ? '+' : ''}{p.calc.diffLowestEur?.toFixed(2)} € ({p.calc.diffLowestPct > 0 ? '+' : ''}{p.calc.diffLowestPct?.toFixed(2)}%)</span>
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
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.9rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Neue Handelsspanne:</span>
                                <span style={{ fontWeight: 600, color: projMargin < 15 ? 'var(--danger-color)' : 'var(--success-color)' }}>{projMargin?.toFixed(2)}%</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Neuer Rohertrag:</span>
                                <span>{projProfit?.toFixed(2)} €</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Neue Diff. z. Günstigsten:</span>
                                <span style={{ color: projDiffEur < 0 ? 'var(--success-color)' : 'var(--danger-color)' }}>
                                    {projDiffEur > 0 ? '+' : ''}{projDiffEur?.toFixed(2)} € ({projDiffPct > 0 ? '+' : ''}{projDiffPct?.toFixed(2)}%)
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
                <span><strong style={{ color: 'var(--text-muted)' }}>Umsatz (3 Mon):</strong> {p.revenue_net?.toFixed(2)} €</span>
                <span><strong style={{ color: 'var(--text-muted)' }}>Idealo Klicks (30d):</strong> {p.clicks_30_days || 'k.A.'}</span>
            </div>
        </div>
    );
}

export default function Preisueberwachung() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isScraping, setIsScraping] = useState(false);

    // Filtering & Sorting State
    const [search, setSearch] = useState('');
    const [sortField, setSortField] = useState('revenue_net');
    const [sortDesc, setSortDesc] = useState(true);
    const [minHandelsspanne, setMinHandelsspanne] = useState('');
    const [minAbweichungUvp, setMinAbweichungUvp] = useState('');
    const [rangFilter, setRangFilter] = useState('Alle');
    const [selectedLights, setSelectedLights] = useState({ green: true, yellow: true, red: true, gray: true });

    useEffect(() => {
        fetchProducts();
    }, []);

    const fetchProducts = async () => {
        try {
            const res = await axios.get('/api/products');
            if (res.data.success) {
                setProducts(res.data.data);
            } else {
                setError(res.data.error || 'Unknown error');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const startScraping = async () => {
        setIsScraping(true);
        try {
            const res = await axios.post('/api/scrape/start');
            if (res.data.success) {
                alert('Scraping-Vorgang wurde im Hintergrund gestartet! (Dies wird sehr lange dauern. Lade die Seite später neu, um Ergebnisse zu sehen.)');
            } else {
                alert('Fehler: ' + (res.data.error || 'Unbekannt.'));
            }
        } catch (error) {
            alert('Netzwerkfehler beim Starten des Scrapings.');
        } finally {
            setIsScraping(false);
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
        if (nettoVK !== null && ekNetto !== null && p.quantity) grossProfit = (nettoVK - ekNetto) * p.quantity;

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

        if (bruttoVK !== null && lowestPrice !== null) {
            diffLowestEur = bruttoVK - lowestPrice;
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

    const toggleLight = (color) => setSelectedLights(prev => ({ ...prev, [color]: !prev[color] }));

    // Global timestamp
    let lastScrapeTimeStr = "Nie";
    const maxTs = products.reduce((max, p) => p.currentScrape?.timestamp > max ? p.currentScrape.timestamp : max, '');
    if (maxTs) {
        const d = new Date(maxTs);
        lastScrapeTimeStr = `${d.toLocaleDateString('de-DE')} ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
    }

    // Process and Filter
    let processedData = products.map(p => ({ ...p, calc: calculateDerived(p) }));

    if (search) {
        const s = search.toLowerCase();
        processedData = processedData.filter(p => (p.name?.toLowerCase().includes(s)) || (p.id?.toLowerCase().includes(s)));
    }

    if (minHandelsspanne !== '') {
        const m = parseFloat(minHandelsspanne);
        if (!isNaN(m)) processedData = processedData.filter(p => p.calc.marginPct !== null && p.calc.marginPct >= m);
    }

    if (minAbweichungUvp !== '') {
        const a = parseFloat(minAbweichungUvp);
        // z z.B. nur Produkte die > 20% unter UVP liegen, dann discountUvp &lt;= -20
        // Wait, the prompt says "mehr als 20% unter UVP", which means discountUvp &lt;= -20
        if (!isNaN(a)) {
            // "mindestens X% unter UVP" implies discountUvp should be &lt;= -X. 
            // the UI input asks for an absolute value, e.g. "20", meaning 20% below.
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

    return (
        <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="header-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'flex-start' }}>
                    <div>
                        <h2>Preisüberwachung</h2>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                            Letzter Scrape: <strong>{lastScrapeTimeStr}</strong>
                        </div>
                        <button
                            onClick={startScraping}
                            disabled={isScraping}
                            style={{
                                background: 'var(--success-color)',
                                color: 'white',
                                border: 'none',
                                padding: '0.6rem 1.2rem',
                                borderRadius: '0.5rem',
                                cursor: isScraping ? 'wait' : 'pointer',
                                opacity: isScraping ? 0.7 : 1,
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            {isScraping ? <span className="animate-spin" style={{ display: 'inline-block' }}>↻</span> : '⟳'}
                            {isScraping ? 'Starte...' : 'Neuen Scrape starten'}
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
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Abweichung UVP (> %):</label>
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

                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', paddingLeft: '0.5rem' }}>
                    Anzeige: {processedData.length} von {products.length} Produkten
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '4rem' }}><span className="animate-spin" style={{ display: 'inline-block' }}>↻</span> Lade Daten...</div>
            ) : error ? (
                <div style={{ color: 'var(--danger-color)' }}>Fehler: {error}</div>
            ) : (
                <div className="cards-grid" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {processedData.map(p => (
                        <ProductCard key={p.id} p={p} />
                    ))}
                </div>
            )}
        </div>
    );
}
