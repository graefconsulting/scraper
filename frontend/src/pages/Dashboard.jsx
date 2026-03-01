import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
    Chart as ChartJS, CategoryScale, LinearScale, PointElement,
    BarElement, Title, Tooltip, Legend, ArcElement
} from 'chart.js';
import { Bar, Doughnut, Scatter } from 'react-chartjs-2';
import { ExternalLink, ArrowRight, AlertCircle, TrendingUp } from 'lucide-react';

ChartJS.register(
    CategoryScale, LinearScale, PointElement, BarElement,
    Title, Tooltip, Legend, ArcElement
);

export default function Dashboard() {
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchDashboard = async () => {
            try {
                const res = await axios.get('/api/dashboard');
                if (res.data.success) {
                    setData(res.data);
                } else {
                    setError(res.data.error || 'Failed to fetch dashboard data');
                }
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchDashboard();
    }, []);

    if (loading) return <div style={{ padding: '4rem', textAlign: 'center' }}><span className="animate-spin" style={{ display: 'inline-block' }}>↻</span> Dashboard lädt...</div>;
    if (error) return <div style={{ color: 'var(--danger-color)', padding: '2rem' }}>Fehler: {error}</div>;
    if (!data) return null;

    // --- KPI Bar Data Formatting ---
    const formatEur = (val) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val || 0);
    const formatPct = (val) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(val || 0) + '%';

    let lastScrapeStr = "Noch kein Scrape";
    if (data.kpis.letzter_scrape) {
        const d = new Date(data.kpis.letzter_scrape);
        lastScrapeStr = `${d.toLocaleDateString('de-DE')} ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
    }

    const kpis = data.kpis || {};
    const ampel_verteilung = data.ampel_verteilung || {};
    const top10_rohertrag = data.top10_rohertrag || [];
    const alle_produkte = data.alle_produkte || [];
    const latest_research = data.latest_research || { sections: {} };

    let marginColor = 'var(--danger-color)';
    if ((kpis.avg_handelsspanne || 0) >= 20) marginColor = 'var(--success-color)';
    else if ((kpis.avg_handelsspanne || 0) >= 10) marginColor = 'var(--warning-color)';

    // --- Chart 1: Donut (Ampel) ---
    const donutData = {
        labels: ['Grün', 'Gelb', 'Rot', 'Grau'],
        datasets: [{
            data: [ampel_verteilung.gruen || 0, ampel_verteilung.gelb || 0, ampel_verteilung.rot || 0, ampel_verteilung.grau || 0],
            backgroundColor: ['#22c55e', '#f59e0b', '#ef4444', '#9ca3af'],
            borderWidth: 0
        }]
    };

    // --- Chart 2: Top 10 Rohertrag (Horizontal Bar) ---
    const top10Data = {
        labels: top10_rohertrag.map(p => p.name?.length > 30 ? p.name.substring(0, 30) + '...' : (p.name || '')),
        datasets: [{
            label: 'Rohertrag',
            data: top10_rohertrag.map(p => p.rohertrag),
            backgroundColor: top10_rohertrag.map(p =>
                p.ampel === 'gruen' ? '#22c55e' :
                    p.ampel === 'gelb' ? '#f59e0b' :
                        p.ampel === 'rot' ? '#ef4444' : '#9ca3af'
            )
        }]
    };
    const top10Options = {
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        onClick: (evt, element) => {
            if (element.length > 0) {
                const idx = element[0].index;
                const sku = top10_rohertrag[idx].sku;
                navigate('/preisueberwachung', { state: { prefilterSku: sku } });
            }
        }
    };

    // --- Chart 3: Margin Distribution (Vertical Bar) ---
    const bands = { '<0%': 0, '0-10%': 0, '10-20%': 0, '20-30%': 0, '>30%': 0 };
    alle_produkte.forEach(p => {
        if (p.handelsspanne < 0) bands['<0%']++;
        else if (p.handelsspanne <= 10) bands['0-10%']++;
        else if (p.handelsspanne <= 20) bands['10-20%']++;
        else if (p.handelsspanne <= 30) bands['20-30%']++;
        else bands['>30%']++;
    });
    const marginDistData = {
        labels: Object.keys(bands),
        datasets: [{
            label: 'Produkte',
            data: Object.values(bands),
            backgroundColor: ['#ef4444', '#ef4444', '#f59e0b', '#22c55e', '#22c55e']
        }]
    };
    const marginDistOptions = {
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    };

    // --- Chart 4: Scatter Plot (Margin vs Umsatz) ---
    const scatterData = {
        datasets: [{
            label: 'Produkte',
            data: alle_produkte.map(p => ({
                x: p.handelsspanne,
                y: p.umsatz,
                rawAmpel: p.ampel,
                name: p.name,
                rang: p.rang
            })),
            backgroundColor: (context) => {
                const raw = context.raw?.rawAmpel;
                if (raw === 'gruen') return '#22c55e';
                if (raw === 'gelb') return '#f59e0b';
                if (raw === 'rot') return '#ef4444';
                return '#9ca3af';
            }
        }]
    };
    const scatterOptions = {
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: (ctx) => {
                        const p = ctx.raw;
                        return `${p.name} | Spanne: ${p.x.toFixed(1)}% | Umsatz: €${p.y.toFixed(0)} | Rang: ${p.rang || '-'}`;
                    }
                }
            },
            annotation: {
                // Advanced dashed line requires chartjs-plugin-annotation, to keep it simple without extra libs, 
                // we'll rely on grid lines or just tooltip context. The user asked for a line at 15%.
                // I'll simulate it by forcing the x-axis grid color to highlight 15.
            }
        },
        scales: {
            x: {
                title: { display: true, text: 'Handelsspanne (%)' },
                grid: {
                    color: (ctx) => ctx.tick.value === 15 ? '#ef4444' : '#e5e7eb',
                    lineWidth: (ctx) => ctx.tick.value === 15 ? 2 : 1,
                    borderDash: (ctx) => ctx.tick.value === 15 ? [5, 5] : []
                }
            },
            y: { title: { display: true, text: 'Umsatz (EUR)' }, beginAtZero: true }
        }
    };

    // --- Handlungsbedarf Table ---
    // Filter red/yellow, sort red first then yellow, then by umsatz desc
    const actionNeeded = alle_produkte
        .filter(p => p.ampel === 'rot' || p.ampel === 'gelb')
        .sort((a, b) => {
            if (a.ampel === 'rot' && b.ampel === 'gelb') return -1;
            if (a.ampel === 'gelb' && b.ampel === 'rot') return 1;
            return b.umsatz - a.umsatz;
        });

    // --- Market Research Config ---
    const sections = [
        { key: 'trends', label: 'Trends' },
        { key: 'natugena', label: 'NatuGena' },
        { key: 'vitaworld', label: 'Vitaworld' },
        { key: 'dr_niedermaier', label: 'Dr. Niedermaier' },
        { key: 'shop_naturpur', label: 'Shop Naturpur' },
        { key: 'vitaminversand24', label: 'Vitaminversand24' }
    ];

    let mrDateStr = "";
    if (latest_research?.created_at) {
        mrDateStr = new Date(latest_research.created_at).toLocaleDateString('de-DE');
    }

    const [activeTab, setActiveTab] = useState('Uebersicht');

    return (
        <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: 'calc(100vh - 40px)', overflow: 'hidden', padding: '1rem 2rem' }}>

            {/* Header & Tabs */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                <h2 style={{ margin: 0 }}>Dashboard</h2>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                        onClick={() => setActiveTab('Uebersicht')}
                        style={{ background: 'none', border: 'none', borderBottom: activeTab === 'Uebersicht' ? '2px solid var(--primary-color)' : '2px solid transparent', padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: activeTab === 'Uebersicht' ? 600 : 400, color: activeTab === 'Uebersicht' ? 'var(--primary-color)' : 'var(--text-muted)' }}
                    >
                        Übersicht
                    </button>
                    <button
                        onClick={() => setActiveTab('Marktueberblick')}
                        style={{ background: 'none', border: 'none', borderBottom: activeTab === 'Marktueberblick' ? '2px solid var(--primary-color)' : '2px solid transparent', padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: activeTab === 'Marktueberblick' ? 600 : 400, color: activeTab === 'Marktueberblick' ? 'var(--primary-color)' : 'var(--text-muted)' }}
                    >
                        Marktüberblick
                    </button>
                </div>
            </div>

            {activeTab === 'Uebersicht' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1, minHeight: 0 }}>
                    {/* 1. KPI Bar (Compact) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', flexShrink: 0 }}>
                        <div className="card" style={{ padding: '12px 16px' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Gesamtumsatz (3 Mon.)</div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 600, margin: '0.25rem 0' }}>{formatEur(kpis.gesamtumsatz)}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Summe Umsatz Netto</div>
                        </div>
                        <div className="card" style={{ padding: '12px 16px' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Gesamtrohertrag (3 Mon.)</div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 600, margin: '0.25rem 0' }}>{formatEur(kpis.gesamtrohertrag)}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Summe EUR</div>
                        </div>
                        <div className="card" style={{ padding: '12px 16px' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ø Handelsspanne</div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 600, color: marginColor, margin: '0.25rem 0' }}>{formatPct(kpis.avg_handelsspanne)}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Gewichtet nach Umsatz</div>
                        </div>
                        <div className="card" style={{ padding: '12px 16px' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Produkte überwacht</div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 600, margin: '0.25rem 0' }}>{kpis.produkte_mit_idealo}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>von 50 gesamt</div>
                        </div>
                        <div className="card" style={{ padding: '12px 16px' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Letzter Scrape</div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 600, margin: '0.25rem 0' }}>{lastScrapeStr}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Zeitstempel</div>
                        </div>
                    </div>

                    {/* 2. Charts Row (Flex 1) */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '1rem', flex: 1, minHeight: 0 }}>
                        <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column' }}>
                            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-color)', marginBottom: '0.5rem', flexShrink: 0 }}>Ampel-Verteilung</h3>
                            <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                                <Doughnut data={donutData} options={{ maintainAspectRatio: false }} />
                            </div>
                        </div>
                        <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column' }}>
                            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-color)', marginBottom: '0.5rem', flexShrink: 0 }}>Top 10 Produkte nach Rohertrag</h3>
                            <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                                <Bar data={top10Data} options={{ ...top10Options, maintainAspectRatio: false }} />
                            </div>
                        </div>
                        <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column' }}>
                            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-color)', marginBottom: '0.5rem', flexShrink: 0 }}>Handelsspanne-Verteilung</h3>
                            <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                                <Bar data={marginDistData} options={{ ...marginDistOptions, maintainAspectRatio: false }} />
                            </div>
                        </div>
                        <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column' }}>
                            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-color)', marginBottom: '0.5rem', flexShrink: 0 }}>Marge vs. Umsatz (15% Linie)</h3>
                            <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                                <Scatter data={scatterData} options={{ ...scatterOptions, maintainAspectRatio: false }} />
                            </div>
                        </div>
                    </div>

                    {/* 3. Handlungsbedarf (Fixed Max Height) */}
                    <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                            <h3 style={{ fontSize: '1rem', margin: 0 }}>Handlungsbedarf</h3>
                            <span style={{ background: 'var(--danger-color)', color: 'white', padding: '0.1rem 0.5rem', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: 600 }}>
                                {actionNeeded.length} Produkte
                            </span>
                        </div>
                        {actionNeeded.length === 0 ? (
                            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)' }}>
                                <AlertCircle size={16} style={{ display: 'inline', marginRight: '0.5rem', verticalAlign: 'middle' }} />
                                Noch keine Scrape-Daten vorhanden oder alle Ampeln stehen auf Grün.
                            </div>
                        ) : (
                            <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                                    <thead style={{ position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
                                        <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)' }}>
                                            <th style={{ padding: '0.5rem', width: '40px' }}>Ampel</th>
                                            <th style={{ padding: '0.5rem' }}>Produkt</th>
                                            <th style={{ padding: '0.5rem' }}>Rang Idealo</th>
                                            <th style={{ padding: '0.5rem' }}>Handelsspanne</th>
                                            <th style={{ padding: '0.5rem' }}>Diff. zum Günstigsten</th>
                                            <th style={{ padding: '0.5rem' }}>Umsatz (3 Mon.)</th>
                                            <th style={{ padding: '0.5rem' }}>Aktion</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {actionNeeded.map((p, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: p.ampel === 'rot' ? '#ef4444' : '#f59e0b', margin: '0 auto' }}></div>
                                                </td>
                                                <td style={{ padding: '0.5rem' }}>
                                                    <div style={{ fontWeight: 500 }}>{p.name?.length > 40 ? p.name.substring(0, 40) + '...' : (p.name || '')}</div>
                                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>{p.sku}</div>
                                                </td>
                                                <td style={{ padding: '0.5rem' }}>
                                                    Rang {p.rang || '-'}
                                                    {p.rang_change !== 0 && (
                                                        <span style={{ fontSize: '0.7rem', marginLeft: '0.4rem', color: p.rang_change > 0 ? 'var(--success-color)' : 'var(--danger-color)' }}>
                                                            {p.rang_change > 0 ? '▲' : '▼'} {Math.abs(p.rang_change)}
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '0.5rem', color: p.handelsspanne < 15 ? 'var(--danger-color)' : 'inherit', fontWeight: p.handelsspanne < 15 ? 600 : 400 }}>
                                                    {formatPct(p.handelsspanne)}
                                                </td>
                                                <td style={{ padding: '0.5rem', color: p.diff_guenstigster_eur < 0 ? 'var(--success-color)' : 'var(--danger-color)' }}>
                                                    {p.diff_guenstigster_eur > 0 ? '+' : ''}{p.diff_guenstigster_eur.toFixed(2)} € <br />
                                                    <span style={{ fontSize: '0.7rem' }}>({p.diff_guenstigster_pct > 0 ? '+' : ''}{p.diff_guenstigster_pct.toFixed(1)}%)</span>
                                                </td>
                                                <td style={{ padding: '0.5rem' }}>{formatEur(p.umsatz)}</td>
                                                <td style={{ padding: '0.5rem' }}>
                                                    <button
                                                        className="btn"
                                                        onClick={() => navigate('/preisueberwachung', { state: { prefilterSku: p.sku, openCalc: true } })}
                                                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                                    >
                                                        Preisrechner
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'Marktueberblick' && (
                <div style={{ flex: 1, minHeight: 0 }}>
                    {/* 4. Market Research Teaser */}
                    <div className="card" style={{ padding: '1.5rem', background: 'white', height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexShrink: 0 }}>
                            <h3 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <TrendingUp size={20} color="var(--primary-color)" /> Marktüberblick
                            </h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                {mrDateStr && <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Abgerufen am: {mrDateStr}</span>}
                                <button className="btn" onClick={() => navigate('/research')} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#f8fafc', color: 'var(--text-color)' }}>
                                    Zur vollständigen Analyse <ArrowRight size={14} />
                                </button>
                            </div>
                        </div>

                        {!latest_research.created_at ? (
                            <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)' }}>
                                <AlertCircle size={18} style={{ display: 'inline', marginRight: '0.5rem', verticalAlign: 'middle' }} />
                                Noch keine Research-Daten vorhanden. Starten Sie einen Research-Lauf.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', overflowY: 'auto', alignContent: 'flex-start' }}>
                                {sections.map(sec => {
                                    const d = latest_research?.sections?.[sec.key];
                                    if (!d || !d.zusammenfassung) return null;

                                    const bullets = d.trending_kategorien || d.neue_produkte || d.aktuelle_aktionen || [];

                                    return (
                                        <div key={sec.key} style={{ flex: '1 1 300px', background: '#f8fafc', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
                                            <h4 style={{ color: 'var(--primary-color)', margin: '0 0 0.5rem 0', fontSize: '1rem' }}>{sec.label}</h4>
                                            <p style={{ fontSize: '0.85rem', lineHeight: '1.4', marginBottom: '1rem', flex: 1 }}>{d.zusammenfassung}</p>

                                            {bullets.length > 0 && (
                                                <ul style={{ paddingLeft: '1.2rem', margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                    {bullets.slice(0, 3).map((b, i) => (
                                                        <li key={i}>{typeof b === 'string' ? (b.length > 40 ? b.substring(0, 40) + '...' : b) : (b?.name ? b.name : (b ? Object.values(b)[0] : ''))}</li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
