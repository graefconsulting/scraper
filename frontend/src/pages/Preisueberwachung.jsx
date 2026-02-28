import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Search, ChevronUp, ChevronDown, Minus, ExternalLink } from 'lucide-react';

export default function Preisueberwachung() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isScraping, setIsScraping] = useState(false);

    // Filtering & Sorting State
    const [search, setSearch] = useState('');
    const [sortField, setSortField] = useState('revenue_net');
    const [sortDesc, setSortDesc] = useState(true);
    const [minMargin, setMinMargin] = useState('');
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

        // Netto VK
        const nettoVK = p.price_net;
        const bruttoVK = p.price_gross;
        const ekNetto = p.purchase_price_net;

        // Handelsspanne in Prozent: (Netto-VK minus EK netto) / Netto-VK x 100
        let marginPct = null;
        if (nettoVK > 0 && ekNetto !== null) {
            marginPct = ((nettoVK - ekNetto) / nettoVK) * 100;
        }

        // Rohertrag absolut in Euro: (Netto-VK minus EK netto) x Menge
        let grossProfit = null;
        if (nettoVK !== null && ekNetto !== null && p.quantity) {
            grossProfit = (nettoVK - ekNetto) * p.quantity;
        }

        // Abweichung vom UVP: (Brutto-VK minus UVP) / UVP x 100
        let discountUvp = null;
        if (bruttoVK !== null && p.uvp > 0) {
            discountUvp = ((bruttoVK - p.uvp) / p.uvp) * 100;
        }

        // Conversion Rate: (Menge / 3) / Idealo Clicks 30 Tage x 100
        let conversionRate = null;
        if (p.quantity && p.clicks_30_days > 0) {
            conversionRate = ((p.quantity / 3) / p.clicks_30_days) * 100;
        }

        // Diff to lowest
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

        // Traffic Light (Ampel)
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
            } else {
                trafficLight = 'gray';
            }
        }

        return {
            marginPct, grossProfit, discountUvp, conversionRate, diffLowestEur, diffLowestPct, trafficLight
        };
    };

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

    const getTrafficColor = (tl) => {
        if (tl === 'green') return 'var(--success-color)';
        if (tl === 'yellow') return 'var(--warning-color)';
        if (tl === 'red') return 'var(--danger-color)';
        return 'var(--disabled-color)';
    };

    const toggleLight = (color) => setSelectedLights(prev => ({ ...prev, [color]: !prev[color] }));

    // Process and Filter
    let processedData = products.map(p => ({ ...p, calc: calculateDerived(p) }));

    if (search) {
        const s = search.toLowerCase();
        processedData = processedData.filter(p => (p.name && p.name.toLowerCase().includes(s)) || (p.id && p.id.toLowerCase().includes(s)));
    }

    if (minMargin !== '') {
        const m = parseFloat(minMargin);
        if (!isNaN(m)) {
            processedData = processedData.filter(p => p.calc.marginPct !== null && p.calc.marginPct >= m);
        }
    }

    processedData = processedData.filter(p => selectedLights[p.calc.trafficLight]);

    processedData.sort((a, b) => {
        const valA = a[sortField] || a.calc[sortField] || 0;
        const valB = b[sortField] || b.calc[sortField] || 0;
        if (valA < valB) return sortDesc ? 1 : -1;
        if (valA > valB) return sortDesc ? -1 : 1;
        return 0;
    });

    return (
        <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="header-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                    <h2>Preisüberwachung</h2>
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
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', background: 'white', padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', width: '100%' }}>
                    {/* Search */}
                    <div style={{ position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', left: '10px', top: '10px', color: '#9ca3af' }} />
                        <input
                            type="text"
                            placeholder="Suchen nach Name/SKU..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{ padding: '0.5rem 1rem 0.5rem 2.2rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', width: '250px' }}
                        />
                    </div>

                    {/* Margin Filter */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Min. Marge (%):</label>
                        <input
                            type="number"
                            value={minMargin}
                            onChange={(e) => setMinMargin(e.target.value)}
                            style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', width: '80px' }}
                        />
                    </div>

                    {/* Traffic Light Filter */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }}>
                        <label style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginRight: '0.5rem' }}>Ampel:</label>
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
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '4rem' }}><span className="animate-spin" style={{ display: 'inline-block' }}>↻</span> Lade Daten...</div>
            ) : error ? (
                <div style={{ color: 'var(--danger-color)' }}>Fehler: {error}</div>
            ) : (
                <div className="cards-grid" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {processedData.map(p => (
                        <div key={p.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0' }}>
                            {/* Header */}
                            <div style={{ padding: '1.5rem 1.5rem 1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between' }}>
                                <div>
                                    <h3 style={{ fontSize: '1.1rem', marginBottom: '0.2rem' }}>{p.name}</h3>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{p.id}</span>
                                </div>
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                    {p.idealo_link && <a href={p.idealo_link} target="_blank" className="badge"><ExternalLink size={12} style={{ marginRight: '4px' }} /> Idealo</a>}
                                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: p.calc.trafficLight === 'red' ? '#ef4444' : p.calc.trafficLight === 'yellow' ? '#f59e0b' : p.calc.trafficLight === 'green' ? '#10b981' : '#94a3b8' }} title={"Ampel: " + p.calc.trafficLight}></div>
                                </div>
                            </div>

                            {/* Data Two Columns */}
                            < div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 1fr) minmax(300px, 1fr)', gap: '2rem', padding: '0 1.5rem' }}>
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
                                            <a href={p.currentScrape.rank1_link} target="_blank" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.currentScrape.rank1_shop}</a>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontWeight: 600 }}>
                                                {p.currentScrape.rank1_price?.toFixed(2)} €
                                                {getTrendIcon(p.currentScrape.rank1_price, p.prevScrape?.rank1_price)}
                                            </div>

                                            <span style={{ color: 'var(--text-muted)' }}>Rang 2:</span>
                                            <a href={p.currentScrape.rank2_link} target="_blank" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.currentScrape.rank2_shop || '-'}</a>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                                {p.currentScrape.rank2_price?.toFixed(2)} {p.currentScrape.rank2_price && '€'}
                                            </div>

                                            <span style={{ color: 'var(--primary-color)', fontWeight: 600, marginTop: '0.5rem' }}>Health Rise:</span>
                                            <span style={{ marginTop: '0.5rem' }}>Rang {p.currentScrape.hr_rank || '-'}</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', marginTop: '0.5rem' }}>
                                                {p.currentScrape.hr_price?.toFixed(2)} {p.currentScrape.hr_price && '€'}
                                                {getRankTrendIcon(p.currentScrape.hr_rank, p.prevScrape?.hr_rank)}
                                            </div>

                                            <div style={{ gridColumn: '1/-1', height: '1px', background: 'var(--border-color)', margin: '0.5rem 0' }}></div>
                                            <span style={{ color: 'var(--text-muted)', gridColumn: '1/3' }}>Diff. zum Günstigsten:</span>
                                            <span style={{ fontWeight: 500, color: p.calc.diffLowestEur < 0 ? 'var(--success-color)' : 'var(--danger-color)' }}>{p.calc.diffLowestEur > 0 ? '+' : ''}{p.calc.diffLowestEur?.toFixed(2)} € ({p.calc.diffLowestPct > 0 ? '+' : ''}{p.calc.diffLowestPct?.toFixed(2)}%)</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Bottom Bar */}
                            <div style={{ background: 'var(--bg-color)', padding: '0.75rem 1.5rem', borderTop: '1px solid var(--border-color)', borderBottomLeftRadius: 'var(--radius-lg)', borderBottomRightRadius: 'var(--radius-lg)', display: 'flex', gap: '2rem', fontSize: '0.85rem' }}>
                                <span><strong style={{ color: 'var(--text-muted)' }}>Menge (3 Mon):</strong> {p.quantity || 0}</span>
                                <span><strong style={{ color: 'var(--text-muted)' }}>Umsatz (3 Mon):</strong> {p.revenue_net?.toFixed(2)} €</span>
                                <span><strong style={{ color: 'var(--text-muted)' }}>Idealo Klicks (30d):</strong> {p.clicks_30_days || 'k.A.'}</span>
                                <span><strong style={{ color: 'var(--text-muted)' }}>Conversion Rate:</strong> {p.calc.conversionRate ? p.calc.conversionRate.toFixed(2) + '%' : 'k.A.'}</span>
                            </div>
                        </div>
                    ))
                    }
                </div >
            )}
        </div >
    );
}
