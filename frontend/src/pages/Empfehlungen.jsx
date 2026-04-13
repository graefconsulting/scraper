import React, { useEffect, useRef, useState, useMemo } from 'react';
import axios from 'axios';
import {
    Search, Megaphone, Trash2, Lock, ArrowUpCircle, ArrowDownCircle,
    Sparkles, ChevronDown, ChevronUp, Check, AlertTriangle,
} from 'lucide-react';
import ProductDetail from '../components/ProductDetail';

// localStorage keys (kompatibel zu Preisänderungen-Seite)
const DELIST_KEY = 'hr_delist_decisions';
const PRICE_CHANGES_KEY = 'hr_price_changes';
const ADS_OFF_KEY = 'hr_ads_off_decisions';
const DAUERTIEFPREIS_KEY = 'hr_dauertiefpreis_decisions';

const fmt = (v, d = 2) => {
    if (v === null || v === undefined || isNaN(v)) return '-';
    return new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
};
const fmtEur = (v) => v === null || v === undefined || isNaN(v) ? '-' : fmt(v) + ' €';
const fmtPct = (v) => v === null || v === undefined || isNaN(v) ? '-' : fmt(v, 1) + '%';
const fmtPp  = (v) => v === null || v === undefined || isNaN(v) ? '-' : (v >= 0 ? '+' : '') + fmt(v, 1) + ' pp';

const RABATT = 0.10;
const RABATT_TAGE = 74;

// ----------------------------------------------------------------------
// Klassifikations-Logik
// ----------------------------------------------------------------------
function classify(p) {
    const m_real = p.realeMargeProz;
    const has_ads = (p.werbekosten || 0) > 0;
    const wkAnteil = p.werbekostenAnteil || 0;
    const m_ohne_werbung = m_real !== null && m_real !== undefined ? m_real + wkAnteil : null;

    // Tier 1: Werbung abdrehen
    if (m_real !== null && m_real < 5 && has_ads) {
        return {
            tier: 1,
            m_real, m_ohne_werbung,
            werbeQ1: p.werbekosten || 0,
            werbeMonat: (p.werbekosten || 0) / 3,
        };
    }

    // Tier 2: Struktureller Verlust (auch ohne Werbung negativ)
    if (m_ohne_werbung !== null && m_ohne_werbung < -5 && !has_ads) {
        return { tier: 2, m_real, m_ohne_werbung };
    }

    // Bei fehlenden Basisdaten → keine weitere Klassifizierung
    if (!p.vkNetto || p.ekNetto === null || p.ekNetto === undefined) return { tier: 0 };
    if (!p.mwst) return { tier: 0 };

    const mwstFactor = 1 + p.mwst / 100;
    const ek = p.ekNetto;
    const betriebSt = p.betriebskostenStueck != null ? p.betriebskostenStueck : p.vkNetto * 0.13;
    const werbeSt = p.menge90d > 0 ? (p.werbekosten || 0) / p.menge90d : p.vkNetto * 0.10;
    const costs = ek + betriebSt + werbeSt;

    const vkN = p.vkNetto;
    const vkNRabatt = vkN * (1 - RABATT);
    const gewinnNormal = vkN - costs;
    const margeNormal = vkN > 0 ? (gewinnNormal / vkN) * 100 : null;
    const gewinnRabatt = vkNRabatt - costs;
    const margeRabatt = vkNRabatt > 0 ? (gewinnRabatt / vkNRabatt) * 100 : null;

    // Tier 3: Aus Rabattaktion nehmen — normal profitabel, im Rabatt Verlust
    if (margeNormal >= 5 && gewinnRabatt < 0 && !p.dauertiefpreis) {
        return {
            tier: 3,
            margeNormal, margeRabatt,
            gewinnRabattStueck: gewinnRabatt,
            gewinnNormalStueck: gewinnNormal,
            mengeRabatt: p.rabattPeriode?.menge || 0,
            verlustRabatt: p.rabattPeriode?.gewinn || 0,
        };
    }

    const s = p.currentScrape;
    const rank1 = s?.rank1_price;
    const rank2 = s?.rank2_price;
    const isRank1 = s?.hr_rank === 1;

    // Tier 4: Preis erhöhen — Rabattmarge zu dünn, aber heilbar
    if (margeRabatt !== null && margeRabatt < 5 && margeRabatt >= -10 && !p.dauertiefpreis) {
        // Erforderlicher VK Netto, damit margeRabatt = 5%
        const requiredVkN = costs / (0.9 * 0.95);
        const requiredVkBrutto = requiredVkN * mwstFactor;
        const priceIncreasePct = vkN > 0 ? ((requiredVkN - vkN) / vkN) * 100 : 0;
        const idealoOK = !rank1 || requiredVkBrutto < rank1 * 1.08;
        if (priceIncreasePct > 0 && priceIncreasePct < 25 && idealoOK) {
            return {
                tier: 4,
                margeNormal, margeRabatt,
                newVkBrutto: requiredVkBrutto, newVkNetto: requiredVkN,
                priceIncreasePct,
                rank1, rank2, isRank1,
                newMargeRabatt: 5,
            };
        }
    }

    // Tier 5: Preis senken — Marge dick genug für Rang 1
    if (margeRabatt !== null && margeRabatt >= 10 && !isRank1 && rank1 && rank1 > 0) {
        const newVkBrutto = parseFloat((rank1 - 0.01).toFixed(2));
        if (newVkBrutto < p.vkBrutto) {
            const newVkN = newVkBrutto / mwstFactor;
            const newRabattVkN = newVkN * (1 - RABATT);
            const newGewinnRabatt = newRabattVkN - costs;
            const newMargeRabatt = newRabattVkN > 0 ? (newGewinnRabatt / newRabattVkN) * 100 : null;
            if (newMargeRabatt !== null && newMargeRabatt >= 5) {
                return {
                    tier: 5,
                    margeNormal, margeRabatt,
                    newVkBrutto, newVkNetto: newVkN,
                    newMargeRabatt,
                    rank1, rank2, isRank1,
                };
            }
        }
    }

    // Tier 6: Preis hochtesten — Rang 1 mit Luft nach oben
    if (margeRabatt !== null && margeRabatt >= 15 && isRank1 && rank2 && rank2 > (p.vkBrutto || 0) * 1.02) {
        const newVkBrutto = parseFloat((rank2 - 0.05).toFixed(2));
        const newVkN = newVkBrutto / mwstFactor;
        const newRabattVkN = newVkN * (1 - RABATT);
        const newGewinnRabatt = newRabattVkN - costs;
        const newMargeRabatt = newRabattVkN > 0 ? (newGewinnRabatt / newRabattVkN) * 100 : null;
        return {
            tier: 6,
            margeNormal, margeRabatt,
            newVkBrutto, newVkNetto: newVkN,
            newMargeRabatt,
            rank1, rank2, isRank1,
        };
    }

    return { tier: 0, margeNormal, margeRabatt };
}

// ----------------------------------------------------------------------
// Tier-Konfiguration
// ----------------------------------------------------------------------
const TIER_CONFIG = {
    1: { icon: Megaphone,      title: 'Werbung abdrehen',           color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', subtitle: 'Marge < 5% bei laufender Werbung — sofortiger Stopp ohne Risiko.' },
    2: { icon: Trash2,         title: 'Auslistung prüfen',          color: '#7c2d12', bg: '#fff7ed', border: '#fdba74', subtitle: 'Auch ohne Werbung über −5% Verlust. Lieferant verhandeln oder delisten.' },
    3: { icon: Lock,           title: 'Aus Rabattaktion nehmen',    color: '#a16207', bg: '#fefce8', border: '#fde047', subtitle: 'Normal profitabel, aber im Rabatt im Verlust → Dauertiefpreis setzen.' },
    4: { icon: ArrowUpCircle,  title: 'Preis erhöhen (Rabatt-Puffer)', color: '#0369a1', bg: '#f0f9ff', border: '#7dd3fc', subtitle: 'Rabattmarge < 5% — Normalpreis anheben, damit auch bei −10% noch Substanz bleibt.' },
    5: { icon: ArrowDownCircle,title: 'Preis senken (Rang 1 holen)', color: '#15803d', bg: '#f0fdf4', border: '#86efac', subtitle: 'Marge ≥ 10% bei −10%, nicht Rang 1 — Idealo-Position holen, ohne Verlust zu riskieren.' },
    6: { icon: Sparkles,       title: 'Preis hochtesten',           color: '#7e22ce', bg: '#faf5ff', border: '#d8b4fe', subtitle: 'Top-Performer auf Rang 1 mit Luft nach oben — Preis dicht an Rang 2 setzen.' },
};

// ----------------------------------------------------------------------
// Reusable Card mit Header + Collapse + Aktion
// ----------------------------------------------------------------------
function TierCard({ tier, products, search, onSearch, children, extraBadge }) {
    const cfg = TIER_CONFIG[tier];
    const [open, setOpen] = useState(true);
    const Icon = cfg.icon;
    const filtered = useMemo(() => {
        const q = (search || '').toLowerCase();
        if (!q) return products;
        return products.filter(p => (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q));
    }, [products, search]);

    return (
        <div style={{
            background: 'white', border: `1.5px solid ${cfg.border}`,
            borderRadius: '12px', overflow: 'hidden',
        }}>
            <div onClick={() => setOpen(!open)} style={{
                display: 'flex', alignItems: 'center', gap: '0.85rem',
                padding: '0.85rem 1.1rem', cursor: 'pointer',
                background: cfg.bg, borderBottom: open ? `1px solid ${cfg.border}` : 'none',
            }}>
                <div style={{
                    width: 36, height: 36, borderRadius: '8px',
                    background: 'white', border: `1.5px solid ${cfg.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: cfg.color, flexShrink: 0,
                }}>
                    <Icon size={19} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: cfg.color, background: 'white', border: `1px solid ${cfg.border}`, padding: '0.1rem 0.45rem', borderRadius: '999px' }}>
                            TIER {tier}
                        </span>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: cfg.color }}>{cfg.title}</h3>
                        <span style={{ fontSize: '0.86rem', fontWeight: 700, color: cfg.color, background: 'white', border: `1px solid ${cfg.border}`, padding: '0.15rem 0.55rem', borderRadius: '999px' }}>
                            {filtered.length}{search && filtered.length !== products.length ? ` / ${products.length}` : ''}
                        </span>
                        {extraBadge}
                    </div>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{cfg.subtitle}</p>
                </div>
                {open ? <ChevronUp size={18} color={cfg.color} /> : <ChevronDown size={18} color={cfg.color} />}
            </div>
            {open && (
                <div>
                    {filtered.length === 0 ? (
                        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            Keine Produkte in dieser Kategorie.
                        </div>
                    ) : children(filtered)}
                </div>
            )}
        </div>
    );
}

// ----------------------------------------------------------------------
// Tabellen-Hilfen
// ----------------------------------------------------------------------
function Th({ children, align = 'right', width }) {
    return (
        <th style={{
            textAlign: align, padding: '0.5rem 0.75rem',
            fontSize: '0.72rem', textTransform: 'uppercase',
            color: 'var(--text-muted)', fontWeight: 600,
            background: '#f8fafc', borderBottom: '1px solid var(--border-color)',
            whiteSpace: 'nowrap', width,
        }}>{children}</th>
    );
}
function Td({ children, align = 'right', color, weight, style }) {
    return (
        <td style={{
            textAlign: align, padding: '0.55rem 0.75rem',
            fontSize: '0.84rem', borderBottom: '1px solid var(--border-color)',
            color, fontWeight: weight, whiteSpace: 'nowrap', ...style,
        }}>{children}</td>
    );
}
function ProductCell({ p, isExpanded, onToggle }) {
    return (
        <td
            onClick={onToggle}
            style={{
                padding: '0.55rem 0.75rem', borderBottom: '1px solid var(--border-color)',
                maxWidth: 280, cursor: 'pointer', userSelect: 'none',
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                {isExpanded
                    ? <ChevronUp size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                    : <ChevronDown size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                }
                <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem' }}>
                        <span style={{ fontFamily: 'monospace' }}>{p.sku}</span>
                        {p.hersteller && <span>· {p.hersteller}</span>}
                        {p.ekRabattAktiv && <span style={{ color: '#10b981' }}>· EK −5%</span>}
                    </div>
                </div>
            </div>
        </td>
    );
}

function ExpandedRow({ p, colSpan, onSavePrice }) {
    return (
        <tr>
            <td colSpan={colSpan} style={{ padding: 0, background: '#f8fafc', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ borderTop: '2px solid var(--border-color)' }}>
                    <ProductDetail p={p} onSavePrice={onSavePrice} />
                </div>
            </td>
        </tr>
    );
}
function ActionButton({ active, onClick, label, color }) {
    return (
        <button onClick={onClick} style={{
            background: active ? color : 'white',
            color: active ? 'white' : color,
            border: `1.5px solid ${color}`,
            padding: '0.35rem 0.7rem', borderRadius: '6px',
            fontWeight: 600, fontSize: '0.78rem',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
            whiteSpace: 'nowrap',
        }}>
            {active && <Check size={13} />}
            {label}
        </button>
    );
}

// ----------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------
export default function Empfehlungen() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [scrapeProgress, setScrapeProgress] = useState(null);
    const pollRef = useRef(null);

    // localStorage state
    const [delisted, setDelisted] = useState(() => JSON.parse(localStorage.getItem(DELIST_KEY) || '{}'));
    const [adsOff, setAdsOff] = useState(() => JSON.parse(localStorage.getItem(ADS_OFF_KEY) || '{}'));
    const [priceChanges, setPriceChanges] = useState(() => JSON.parse(localStorage.getItem(PRICE_CHANGES_KEY) || '{}'));
    const [dtp, setDtp] = useState(() => JSON.parse(localStorage.getItem(DAUERTIEFPREIS_KEY) || '{}'));
    const [expandedSkus, setExpandedSkus] = useState({});

    const toggleExpand = (sku) => {
        setExpandedSkus(prev => {
            const n = { ...prev };
            if (n[sku]) delete n[sku]; else n[sku] = true;
            return n;
        });
    };

    // Manual price save from Preisrechner inside ProductDetail
    const savePriceFromCalculator = (product, newBrutto, newNetto, newMargeProz, newMargeSt) => {
        const u = { ...priceChanges };
        u[product.sku] = {
            sku: product.sku, name: product.name,
            alterBrutto: product.vkBrutto, alterNetto: product.vkNetto,
            neuerBrutto: parseFloat(newBrutto.toFixed(2)),
            neuerNetto: parseFloat(newNetto.toFixed(4)),
            alteRealeMarge: product.realeMargeProz,
            neueRealeMarge: newMargeProz,
            neueMargeStueck: newMargeSt,
            preisdiffEur: parseFloat((newBrutto - (product.vkBrutto || 0)).toFixed(2)),
            preisdiffPct: product.vkBrutto > 0 ? ((newBrutto - product.vkBrutto) / product.vkBrutto) * 100 : null,
            action: 'manuell',
            timestamp: new Date().toISOString(),
        };
        persist(PRICE_CHANGES_KEY, u, setPriceChanges);
    };

    const persist = (key, value, setter) => {
        localStorage.setItem(key, JSON.stringify(value));
        setter(value);
    };

    const toggleAdsOff = (p) => {
        const u = { ...adsOff };
        if (u[p.sku]) delete u[p.sku];
        else u[p.sku] = { sku: p.sku, name: p.name, werbekosten: p.werbekosten, timestamp: new Date().toISOString() };
        persist(ADS_OFF_KEY, u, setAdsOff);
    };
    const toggleDelist = (p) => {
        const u = { ...delisted };
        if (u[p.sku]) delete u[p.sku];
        else u[p.sku] = { sku: p.sku, name: p.name, timestamp: new Date().toISOString() };
        persist(DELIST_KEY, u, setDelisted);
    };
    const toggleDtp = (p, info) => {
        const u = { ...dtp };
        if (u[p.sku]) delete u[p.sku];
        else u[p.sku] = {
            sku: p.sku, name: p.name,
            verlustRabatt: info.verlustRabatt,
            mengeRabatt: info.mengeRabatt,
            timestamp: new Date().toISOString(),
        };
        persist(DAUERTIEFPREIS_KEY, u, setDtp);
    };
    const togglePrice = (p, info, action) => {
        const u = { ...priceChanges };
        if (u[p.sku]) {
            delete u[p.sku];
        } else {
            u[p.sku] = {
                sku: p.sku, name: p.name,
                alterBrutto: p.vkBrutto, alterNetto: p.vkNetto,
                neuerBrutto: parseFloat(info.newVkBrutto.toFixed(2)),
                neuerNetto: parseFloat(info.newVkNetto.toFixed(4)),
                alteRealeMarge: p.realeMargeProz,
                neueRealeMarge: info.newMargeRabatt,
                preisdiffEur: parseFloat((info.newVkBrutto - (p.vkBrutto || 0)).toFixed(2)),
                preisdiffPct: p.vkBrutto > 0 ? ((info.newVkBrutto - p.vkBrutto) / p.vkBrutto) * 100 : null,
                action,
                timestamp: new Date().toISOString(),
            };
        }
        persist(PRICE_CHANGES_KEY, u, setPriceChanges);
    };

    // Data fetch
    useEffect(() => {
        axios.get('/api/auswertung')
            .then(r => { setData(r.data.data || []); setLoading(false); })
            .catch(e => { setError(e.message); setLoading(false); });
        // Initial scrape status
        axios.get('/api/auswertung/scrape/status').then(r => {
            if (r.data.isRunning) { setScrapeProgress(r.data); startPolling(); }
        }).catch(() => {});
        return () => stopPolling();
    }, []);

    const startPolling = () => {
        if (pollRef.current) return;
        pollRef.current = setInterval(async () => {
            try {
                const r = await axios.get('/api/auswertung/scrape/status');
                setScrapeProgress(r.data);
                if (!r.data.isRunning) {
                    stopPolling();
                    const a = await axios.get('/api/auswertung');
                    setData(a.data.data || []);
                }
            } catch {}
        }, 3000);
    };
    const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

    const startScrape = async () => {
        try {
            await axios.post('/api/auswertung/scrape/start');
            startPolling();
        } catch (e) { alert('Scrape konnte nicht gestartet werden: ' + e.message); }
    };

    // Klassifizierung
    const tiers = useMemo(() => {
        const t = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
        data.forEach(p => {
            if ((p.menge90d || 0) === 0) return;
            const c = classify(p);
            t[c.tier].push({ ...p, _c: c });
        });
        return t;
    }, [data]);

    // Summen für Header
    const tier1Save = useMemo(() => tiers[1].reduce((s, p) => s + (p._c.werbeMonat || 0), 0), [tiers]);

    if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Lade Daten...</div>;
    if (error) return <div style={{ padding: '2rem', color: '#ef4444' }}>Fehler: {error}</div>;

    return (
        <div style={{ padding: '1.5rem 2rem', maxWidth: '1500px', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Empfehlungen</h1>
                    <p style={{ color: 'var(--text-muted)', margin: '0.3rem 0 0', fontSize: '0.88rem' }}>
                        6-Tier-Strategie für {data.filter(p => (p.menge90d || 0) > 0).length} Produkte mit Umsatz · sortiert nach Hebel und Risiko
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                        <input
                            type="text" placeholder="SKU / Name..." value={search} onChange={(e) => setSearch(e.target.value)}
                            style={{ padding: '0.45rem 0.8rem 0.45rem 2rem', borderRadius: '6px', border: '1px solid var(--border-color)', width: '200px', fontSize: '0.84rem' }}
                        />
                    </div>
                    {scrapeProgress?.isRunning && (
                        <span style={{ fontSize: '0.78rem', color: '#15803d', fontWeight: 500 }}>
                            Scraping {scrapeProgress.completed}/{scrapeProgress.total}
                        </span>
                    )}
                    <button onClick={startScrape} disabled={scrapeProgress?.isRunning}
                        style={{ background: '#10b981', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: scrapeProgress?.isRunning ? 'wait' : 'pointer', opacity: scrapeProgress?.isRunning ? 0.6 : 1, fontWeight: 600, fontSize: '0.84rem' }}>
                        Idealo Scrape
                    </button>
                </div>
            </div>

            {/* Summary bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.5rem' }}>
                {[1, 2, 3, 4, 5, 6].map(t => {
                    const cfg = TIER_CONFIG[t];
                    return (
                        <div key={t} style={{
                            background: cfg.bg, border: `1.5px solid ${cfg.border}`,
                            borderRadius: '8px', padding: '0.6rem 0.75rem', textAlign: 'center',
                        }}>
                            <div style={{ fontSize: '1.55rem', fontWeight: 800, color: cfg.color, lineHeight: 1 }}>{tiers[t].length}</div>
                            <div style={{ fontSize: '0.7rem', color: cfg.color, fontWeight: 600, marginTop: '0.2rem', lineHeight: 1.2 }}>
                                Tier {t}
                            </div>
                        </div>
                    );
                })}
                <div style={{
                    background: '#ecfdf5', border: '1.5px solid #6ee7b7', borderRadius: '8px',
                    padding: '0.6rem 0.75rem', textAlign: 'center',
                }}>
                    <div style={{ fontSize: '1.55rem', fontWeight: 800, color: '#10b981', lineHeight: 1 }}>{tiers[0].length}</div>
                    <div style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 600, marginTop: '0.2rem' }}>Healthy</div>
                </div>
            </div>

            {/* === TIER 1: Werbung abdrehen === */}
            <TierCard tier={1} products={tiers[1]} search={search}
                extraBadge={tier1Save > 0 && (
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#10b981', background: '#ecfdf5', padding: '0.18rem 0.6rem', borderRadius: '999px', border: '1px solid #86efac' }}>
                        Sparpotenzial: {fmtEur(tier1Save)} / Monat
                    </span>
                )}>
                {(filtered) => (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <Th align="left">Produkt</Th>
                                    <Th>Reale Marge</Th>
                                    <Th>Marge o. Werbung</Th>
                                    <Th>Werbung Q1</Th>
                                    <Th>Sparpot. /Mon</Th>
                                    <Th align="center">Aktion</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(p => {
                                    const c = p._c;
                                    const exp = !!expandedSkus[p.sku];
                                    return (
                                        <React.Fragment key={p.sku}>
                                            <tr>
                                                <ProductCell p={p} isExpanded={exp} onToggle={() => toggleExpand(p.sku)} />
                                                <Td color="#ef4444" weight={700}>{fmtPct(c.m_real)}</Td>
                                                <Td color={c.m_ohne_werbung >= 0 ? '#10b981' : '#ef4444'} weight={600}>{fmtPct(c.m_ohne_werbung)}</Td>
                                                <Td>{fmtEur(c.werbeQ1)}</Td>
                                                <Td color="#10b981" weight={700}>{fmtEur(c.werbeMonat)}</Td>
                                                <Td align="center">
                                                    <ActionButton active={!!adsOff[p.sku]} onClick={() => toggleAdsOff(p)} label="Werbung aus" color="#dc2626" />
                                                </Td>
                                            </tr>
                                            {exp && <ExpandedRow p={p} colSpan={6} onSavePrice={savePriceFromCalculator} />}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </TierCard>

            {/* === TIER 2: Auslistung prüfen === */}
            <TierCard tier={2} products={tiers[2]} search={search}>
                {(filtered) => (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <Th align="left">Produkt</Th>
                                    <Th>Marge real</Th>
                                    <Th>Marge o. Werbung</Th>
                                    <Th>EK</Th>
                                    <Th>VK Brutto</Th>
                                    <Th>Menge 90d</Th>
                                    <Th align="center">Aktion</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(p => {
                                    const c = p._c;
                                    const exp = !!expandedSkus[p.sku];
                                    return (
                                        <React.Fragment key={p.sku}>
                                            <tr>
                                                <ProductCell p={p} isExpanded={exp} onToggle={() => toggleExpand(p.sku)} />
                                                <Td color="#ef4444" weight={700}>{fmtPct(c.m_real)}</Td>
                                                <Td color="#ef4444" weight={600}>{fmtPct(c.m_ohne_werbung)}</Td>
                                                <Td>{fmtEur(p.ekNetto)}</Td>
                                                <Td>{fmtEur(p.vkBrutto)}</Td>
                                                <Td color="var(--text-muted)">{fmt(p.menge90d, 0)}</Td>
                                                <Td align="center">
                                                    <ActionButton active={!!delisted[p.sku]} onClick={() => toggleDelist(p)} label="Auslisten" color="#7c2d12" />
                                                </Td>
                                            </tr>
                                            {exp && <ExpandedRow p={p} colSpan={7} onSavePrice={savePriceFromCalculator} />}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </TierCard>

            {/* === TIER 3: Aus Rabattaktion nehmen === */}
            <TierCard tier={3} products={tiers[3]} search={search}>
                {(filtered) => (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <Th align="left">Produkt</Th>
                                    <Th>Marge normal</Th>
                                    <Th>Marge bei −10%</Th>
                                    <Th>Gewinn/St. −10%</Th>
                                    <Th>Verlust Rabattperiode</Th>
                                    <Th>Menge Rabatt</Th>
                                    <Th align="center">Aktion</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(p => {
                                    const c = p._c;
                                    const exp = !!expandedSkus[p.sku];
                                    return (
                                        <React.Fragment key={p.sku}>
                                            <tr>
                                                <ProductCell p={p} isExpanded={exp} onToggle={() => toggleExpand(p.sku)} />
                                                <Td color="#10b981" weight={600}>{fmtPct(c.margeNormal)}</Td>
                                                <Td color="#ef4444" weight={700}>{fmtPct(c.margeRabatt)}</Td>
                                                <Td color="#ef4444" weight={600}>{fmtEur(c.gewinnRabattStueck)}</Td>
                                                <Td color="#ef4444" weight={700}>{fmtEur(c.verlustRabatt)}</Td>
                                                <Td>{fmt(c.mengeRabatt, 0)}</Td>
                                                <Td align="center">
                                                    <ActionButton active={!!dtp[p.sku]} onClick={() => toggleDtp(p, c)} label="Dauertiefpreis" color="#a16207" />
                                                </Td>
                                            </tr>
                                            {exp && <ExpandedRow p={p} colSpan={7} onSavePrice={savePriceFromCalculator} />}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </TierCard>

            {/* === TIER 4: Preis erhöhen === */}
            <TierCard tier={4} products={tiers[4]} search={search}>
                {(filtered) => (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <Th align="left">Produkt</Th>
                                    <Th>Aktuell VK Brutto</Th>
                                    <Th>Empf. VK Brutto</Th>
                                    <Th>Δ Preis</Th>
                                    <Th>Marge −10% jetzt</Th>
                                    <Th>Marge −10% neu</Th>
                                    <Th>Idealo Rang/Rang1</Th>
                                    <Th align="center">Aktion</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(p => {
                                    const c = p._c;
                                    const saved = !!priceChanges[p.sku];
                                    const exp = !!expandedSkus[p.sku];
                                    return (
                                        <React.Fragment key={p.sku}>
                                            <tr>
                                                <ProductCell p={p} isExpanded={exp} onToggle={() => toggleExpand(p.sku)} />
                                                <Td>{fmtEur(p.vkBrutto)}</Td>
                                                <Td color="#0369a1" weight={700}>{fmtEur(c.newVkBrutto)}</Td>
                                                <Td color="#0369a1">+{fmt(c.priceIncreasePct, 1)}%</Td>
                                                <Td color="#ef4444">{fmtPct(c.margeRabatt)}</Td>
                                                <Td color="#10b981" weight={700}>{fmtPct(c.newMargeRabatt)}</Td>
                                                <Td color="var(--text-muted)" style={{ fontSize: '0.78rem' }}>
                                                    {c.isRank1 ? 'Rang 1' : (p.currentScrape?.hr_rank ? `Rang ${p.currentScrape.hr_rank}` : '–')}
                                                    {c.rank1 && ` / ${fmt(c.rank1)}€`}
                                                </Td>
                                                <Td align="center">
                                                    <ActionButton active={saved} onClick={() => togglePrice(p, c, 'erhoehen')} label="Übernehmen" color="#0369a1" />
                                                </Td>
                                            </tr>
                                            {exp && <ExpandedRow p={p} colSpan={8} onSavePrice={savePriceFromCalculator} />}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </TierCard>

            {/* === TIER 5: Preis senken === */}
            <TierCard tier={5} products={tiers[5]} search={search}>
                {(filtered) => (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <Th align="left">Produkt</Th>
                                    <Th>Aktuell VK Brutto</Th>
                                    <Th>Empf. VK Brutto</Th>
                                    <Th>Δ Preis</Th>
                                    <Th>Marge −10% jetzt</Th>
                                    <Th>Marge −10% neu</Th>
                                    <Th>Rang/Rang1</Th>
                                    <Th align="center">Aktion</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(p => {
                                    const c = p._c;
                                    const saved = !!priceChanges[p.sku];
                                    const diffPct = ((c.newVkBrutto - p.vkBrutto) / p.vkBrutto) * 100;
                                    const exp = !!expandedSkus[p.sku];
                                    return (
                                        <React.Fragment key={p.sku}>
                                            <tr>
                                                <ProductCell p={p} isExpanded={exp} onToggle={() => toggleExpand(p.sku)} />
                                                <Td>{fmtEur(p.vkBrutto)}</Td>
                                                <Td color="#15803d" weight={700}>{fmtEur(c.newVkBrutto)}</Td>
                                                <Td color="#15803d">{fmt(diffPct, 1)}%</Td>
                                                <Td color="#10b981">{fmtPct(c.margeRabatt)}</Td>
                                                <Td color="#10b981" weight={700}>{fmtPct(c.newMargeRabatt)}</Td>
                                                <Td color="var(--text-muted)" style={{ fontSize: '0.78rem' }}>
                                                    {p.currentScrape?.hr_rank ? `Rang ${p.currentScrape.hr_rank}` : '–'}
                                                    {c.rank1 && ` / ${fmt(c.rank1)}€`}
                                                </Td>
                                                <Td align="center">
                                                    <ActionButton active={saved} onClick={() => togglePrice(p, c, 'senken')} label="Übernehmen" color="#15803d" />
                                                </Td>
                                            </tr>
                                            {exp && <ExpandedRow p={p} colSpan={8} onSavePrice={savePriceFromCalculator} />}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </TierCard>

            {/* === TIER 6: Preis hochtesten === */}
            <TierCard tier={6} products={tiers[6]} search={search}>
                {(filtered) => (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <Th align="left">Produkt</Th>
                                    <Th>Aktuell VK Brutto</Th>
                                    <Th>Empf. VK Brutto</Th>
                                    <Th>Rang2-Preis</Th>
                                    <Th>Marge −10% jetzt</Th>
                                    <Th>Marge −10% neu</Th>
                                    <Th align="center">Aktion</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(p => {
                                    const c = p._c;
                                    const saved = !!priceChanges[p.sku];
                                    const exp = !!expandedSkus[p.sku];
                                    return (
                                        <React.Fragment key={p.sku}>
                                            <tr>
                                                <ProductCell p={p} isExpanded={exp} onToggle={() => toggleExpand(p.sku)} />
                                                <Td>{fmtEur(p.vkBrutto)}</Td>
                                                <Td color="#7e22ce" weight={700}>{fmtEur(c.newVkBrutto)}</Td>
                                                <Td color="var(--text-muted)">{fmtEur(c.rank2)}</Td>
                                                <Td color="#10b981">{fmtPct(c.margeRabatt)}</Td>
                                                <Td color="#10b981" weight={700}>{fmtPct(c.newMargeRabatt)}</Td>
                                                <Td align="center">
                                                    <ActionButton active={saved} onClick={() => togglePrice(p, c, 'hochtest')} label="Übernehmen" color="#7e22ce" />
                                                </Td>
                                            </tr>
                                            {exp && <ExpandedRow p={p} colSpan={7} onSavePrice={savePriceFromCalculator} />}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </TierCard>

            {/* Footer note */}
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '0.5rem 0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={13} />
                Die Tiers sind hierarchisch — jedes Produkt erscheint nur in der höchsten zutreffenden Kategorie. Werbung-Stop kommt vor allem anderen, weil es sofortiges, risikofreies Sparen ist.
            </div>
        </div>
    );
}
