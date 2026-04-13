import React, { useEffect, useRef, useState, useMemo } from 'react';
import axios from 'axios';
import {
    Search, Megaphone, Trash2, Lock, ArrowUpCircle, ArrowDownCircle,
    Sparkles, ChevronDown, ChevronUp, Check, AlertTriangle, Sliders, Tag,
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

const RABATT = 0.10;

// ----------------------------------------------------------------------
// Klassifikations-Logik (8 Tiers)
// Tier 1 (NEU): Werbeausgaben optimieren  – operativ gesund, ACoS > 10%
// Tier 2 (NEU): Preisgestaltung überarb.  – strukturell negativ + rabattabhängig
// Tier 3 (ex-1): Werbung abdrehen         – Verlust > 5% UND Werbung aktiv
// Tier 4 (ex-2): Auslistung prüfen        – auch ohne Werbung > –5% Verlust
// Tier 5 (ex-3): Aus Rabattaktion nehmen  – normal OK, im Rabatt Verlust
// Tier 6 (ex-4): Preis erhöhen            – Rabattmarge < 5%, heilbar
// Tier 7 (ex-5): Preis senken             – Marge dick, nicht Rang 1
// Tier 8 (ex-6): Preis hochtesten         – Rang 1 mit Luft
// ----------------------------------------------------------------------
function classify(p) {
    const m_real = p.realeMargeProz;
    const has_ads = (p.werbekosten || 0) > 0;
    const wkAnteil = p.werbekostenAnteil || 0;
    const m_ohne_werbung = m_real !== null && m_real !== undefined ? m_real + wkAnteil : null;

    const rabattMenge = p.rabattPeriode?.menge || 0;
    const normalMenge = p.normalPeriode?.menge || 0;
    const isRabattDependent = normalMenge === 0
        ? rabattMenge > 0
        : rabattMenge > normalMenge * 5;

    // Tier 1 (NEU): Werbeausgaben optimieren
    // Produkt wäre ohne Werbung gesund (>10%), aber ACoS frisst Marge (>10% Umsatz)
    if (m_ohne_werbung !== null && m_ohne_werbung > 10 && wkAnteil > 10 && m_real < 5 && has_ads) {
        const targetAcos = wkAnteil / 2;
        const einsparMonat = (p.werbekosten || 0) / 3 / 2;
        return {
            tier: 1,
            m_real, m_ohne_werbung, wkAnteil,
            werbeQ1: p.werbekosten || 0,
            werbeMonat: (p.werbekosten || 0) / 3,
            targetAcos,
            einsparMonat,
        };
    }

    // Tier 2 (NEU): Preisgestaltung überarbeiten
    // Strukturell negativ UND Umsatz kommt fast ausschließlich aus Rabattaktionen
    if (m_real !== null && m_real < 0 && isRabattDependent) {
        const gesamtMenge = rabattMenge + normalMenge;
        return {
            tier: 2,
            m_real, m_ohne_werbung,
            rabattMenge, normalMenge,
            verlustRabatt: p.rabattPeriode?.gewinn || 0,
            rabattAnteil: gesamtMenge > 0 ? (rabattMenge / gesamtMenge) * 100 : 0,
        };
    }

    // Tier 3: Werbung abdrehen (verfeinert: Verlust > 5% des Umsatzes = m_real < -5)
    if (m_real !== null && m_real < -5 && has_ads) {
        return {
            tier: 3,
            m_real, m_ohne_werbung,
            werbeQ1: p.werbekosten || 0,
            werbeMonat: (p.werbekosten || 0) / 3,
        };
    }

    // Tier 4: Auslistung prüfen (auch ohne Werbung stark negativ)
    if (m_ohne_werbung !== null && m_ohne_werbung < -5 && !has_ads) {
        return { tier: 4, m_real, m_ohne_werbung };
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

    // Tier 5: Aus Rabattaktion nehmen — normal profitabel, im Rabatt Verlust
    if (margeNormal >= 5 && gewinnRabatt < 0 && !p.dauertiefpreis) {
        return {
            tier: 5,
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

    // Tier 6: Preis erhöhen — Rabattmarge zu dünn, aber heilbar
    if (margeRabatt !== null && margeRabatt < 5 && margeRabatt >= -10 && !p.dauertiefpreis) {
        const requiredVkN = costs / (0.9 * 0.95);
        const requiredVkBrutto = requiredVkN * mwstFactor;
        const priceIncreasePct = vkN > 0 ? ((requiredVkN - vkN) / vkN) * 100 : 0;
        const idealoOK = !rank1 || requiredVkBrutto < rank1 * 1.08;
        if (priceIncreasePct > 0 && priceIncreasePct < 25 && idealoOK) {
            return {
                tier: 6,
                margeNormal, margeRabatt,
                newVkBrutto: requiredVkBrutto, newVkNetto: requiredVkN,
                priceIncreasePct,
                rank1, rank2, isRank1,
                newMargeRabatt: 5,
            };
        }
    }

    // Tier 7: Preis senken — Marge dick genug für Rang 1
    if (margeRabatt !== null && margeRabatt >= 10 && !isRank1 && rank1 && rank1 > 0) {
        const newVkBrutto = parseFloat((rank1 - 0.01).toFixed(2));
        if (newVkBrutto < p.vkBrutto) {
            const newVkN = newVkBrutto / mwstFactor;
            const newRabattVkN = newVkN * (1 - RABATT);
            const newGewinnRabatt = newRabattVkN - costs;
            const newMargeRabatt = newRabattVkN > 0 ? (newGewinnRabatt / newRabattVkN) * 100 : null;
            if (newMargeRabatt !== null && newMargeRabatt >= 5) {
                return {
                    tier: 7,
                    margeNormal, margeRabatt,
                    newVkBrutto, newVkNetto: newVkN,
                    newMargeRabatt,
                    rank1, rank2, isRank1,
                };
            }
        }
    }

    // Tier 8: Preis hochtesten — Rang 1 mit Luft nach oben
    if (margeRabatt !== null && margeRabatt >= 15 && isRank1 && rank2 && rank2 > (p.vkBrutto || 0) * 1.02) {
        const newVkBrutto = parseFloat((rank2 - 0.05).toFixed(2));
        const newVkN = newVkBrutto / mwstFactor;
        const newRabattVkN = newVkN * (1 - RABATT);
        const newGewinnRabatt = newRabattVkN - costs;
        const newMargeRabatt = newRabattVkN > 0 ? (newGewinnRabatt / newRabattVkN) * 100 : null;
        return {
            tier: 8,
            margeNormal, margeRabatt,
            newVkBrutto, newVkNetto: newVkN,
            newMargeRabatt,
            rank1, rank2, isRank1,
        };
    }

    return { tier: 0, margeNormal, margeRabatt };
}

// ----------------------------------------------------------------------
// Produkt-spezifische Diagnose-Texte
// ----------------------------------------------------------------------
function getTierExplanation(p, c) {
    switch (c.tier) {
        case 1:
            return `Ohne Werbung wäre die Marge bei ${fmtPct(c.m_ohne_werbung)} — das Produkt ist operativ gesund. Die Werbung kostet jedoch ${fmtPct(c.wkAnteil)} des Umsatzes (${fmtEur(c.werbeQ1)}/Quartal). Empfehlung für die Marketingagentur: ACoS von ${fmtPct(c.wkAnteil)} auf ~${fmtPct(c.targetAcos)} halbieren. Einsparpotenzial: ca. ${fmtEur(c.einsparMonat)}/Monat.`;
        case 2: {
            const ra = fmt(c.rabattAnteil, 0);
            return `Reale Marge: ${fmtPct(c.m_real)}. ${ra}% der Verkäufe (${c.rabattMenge} Stück) fallen in den Rabattzeitraum — dort macht das Produkt ${fmtEur(c.verlustRabatt)} Verlust. Außerhalb der Aktion kaum Nachfrage (${c.normalMenge} Stück). Empfehlung: (1) Dauertiefpreis setzen, um aus der 10%-Aktion herauszukommen, (2) Verkaufspreis auf ein profitables Niveau anheben.`;
        }
        case 3:
            return `Reale Marge: ${fmtPct(c.m_real)} — das Produkt verliert ${fmtPct(Math.abs(c.m_real))} des Umsatzes. Ohne Werbung läge die Marge bei ${fmtPct(c.m_ohne_werbung)}. Einsparpotenzial durch Werbestopp: ${fmtEur(c.werbeMonat)}/Monat.`;
        case 4:
            return `Auch ohne Werbung liegt die Marge bei ${fmtPct(c.m_ohne_werbung)}. Das Produkt ist strukturell defizitär — EK/VK-Verhältnis prüfen, Lieferant neu verhandeln oder Produkt auslistern.`;
        case 5:
            return `Im Normalpreis profitabel (${fmtPct(c.margeNormal)}), aber bei −10% Rabatt ${fmtPct(c.margeRabatt)} Marge / ${fmtEur(c.verlustRabatt)} Quartalsverlust bei ${c.mengeRabatt} Stück im Rabattzeitraum. Lösung: Dauertiefpreis setzen → aus der Rabattaktion herausnehmen.`;
        case 6:
            return `Rabattmarge liegt bei ${fmtPct(c.margeRabatt)}. Mit Preiserhöhung auf ${fmtEur(c.newVkBrutto)} (+${fmt(c.priceIncreasePct, 1)}%) wäre die Marge bei −10% wieder stabil (${fmtPct(c.newMargeRabatt)}). Preiserhöhung ist mit aktuellem Idealo-Wettbewerb vereinbar.`;
        case 7:
            return `Marge bei −10% Rabatt: ${fmtPct(c.margeRabatt)} — genug Spielraum für Preissenkung. Rang-1-Preis auf Idealo: ${fmtEur(c.rank1)}. Mit ${fmtEur(c.newVkBrutto)} Rang 1 erreichbar — Marge bleibt bei ${fmtPct(c.newMargeRabatt)}.`;
        case 8:
            return `Top-Performer auf Rang 1 mit ${fmtPct(c.margeRabatt)} Rabattmarge. Rang 2 liegt bei ${fmtEur(c.rank2)}. Preis auf ${fmtEur(c.newVkBrutto)} anheben — Rang 1 bleibt gesichert, Marge steigt auf ${fmtPct(c.newMargeRabatt)}.`;
        default:
            return null;
    }
}

// ----------------------------------------------------------------------
// Tier-Konfiguration (1–8)
// ----------------------------------------------------------------------
const TIER_CONFIG = {
    1: { icon: Sliders,        title: 'Werbeausgaben optimieren',      color: '#d97706', bg: '#fffbeb', border: '#fcd34d', subtitle: 'Operativ gesund, aber ACoS zu hoch — Ziel-ACoS für Marketingagentur definieren.' },
    2: { icon: Tag,            title: 'Preisgestaltung überarbeiten',  color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd', subtitle: 'Strukturell negativ UND rabattabhängig — Dauertiefpreis + Preisanpassung erforderlich.' },
    3: { icon: Megaphone,      title: 'Werbung abdrehen',              color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', subtitle: 'Verlust > 5% des Umsatzes bei laufender Werbung — sofortiger Stopp empfohlen.' },
    4: { icon: Trash2,         title: 'Auslistung prüfen',             color: '#7c2d12', bg: '#fff7ed', border: '#fdba74', subtitle: 'Auch ohne Werbung über −5% Verlust. Lieferant verhandeln oder delisten.' },
    5: { icon: Lock,           title: 'Aus Rabattaktion nehmen',       color: '#a16207', bg: '#fefce8', border: '#fde047', subtitle: 'Normal profitabel, aber im Rabatt im Verlust → Dauertiefpreis setzen.' },
    6: { icon: ArrowUpCircle,  title: 'Preis erhöhen (Rabatt-Puffer)', color: '#0369a1', bg: '#f0f9ff', border: '#7dd3fc', subtitle: 'Rabattmarge < 5% — Normalpreis anheben, damit auch bei −10% noch Substanz bleibt.' },
    7: { icon: ArrowDownCircle,title: 'Preis senken (Rang 1 holen)',   color: '#15803d', bg: '#f0fdf4', border: '#86efac', subtitle: 'Marge ≥ 10% bei −10%, nicht Rang 1 — Idealo-Position holen, ohne Verlust zu riskieren.' },
    8: { icon: Sparkles,       title: 'Preis hochtesten',              color: '#7e22ce', bg: '#faf5ff', border: '#d8b4fe', subtitle: 'Top-Performer auf Rang 1 mit Luft nach oben — Preis dicht an Rang 2 setzen.' },
};

// ----------------------------------------------------------------------
// TierCard
// ----------------------------------------------------------------------
function TierCard({ tier, products, search, defaultSort, sortAccessors, children, extraBadges }) {
    const cfg = TIER_CONFIG[tier];
    const [open, setOpen] = useState(true);
    const [sort, setSort] = useState(defaultSort || { key: null, desc: true });
    const Icon = cfg.icon;

    const handleSort = (key) => {
        setSort(s => s.key === key ? { ...s, desc: !s.desc } : { key, desc: true });
    };

    const sorted = useMemo(() => {
        if (!sort.key || !sortAccessors || !sortAccessors[sort.key]) return products;
        const accessor = sortAccessors[sort.key];
        const arr = [...products];
        arr.sort((a, b) => {
            const av = accessor(a);
            const bv = accessor(b);
            if (av === null || av === undefined || (typeof av === 'number' && isNaN(av))) return 1;
            if (bv === null || bv === undefined || (typeof bv === 'number' && isNaN(bv))) return -1;
            if (typeof av === 'string') return sort.desc ? bv.localeCompare(av) : av.localeCompare(bv);
            return sort.desc ? bv - av : av - bv;
        });
        return arr;
    }, [products, sort, sortAccessors]);

    const filtered = useMemo(() => {
        const q = (search || '').toLowerCase();
        if (!q) return sorted;
        return sorted.filter(p => (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q));
    }, [sorted, search]);

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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: cfg.color, background: 'white', border: `1px solid ${cfg.border}`, padding: '0.1rem 0.45rem', borderRadius: '999px' }}>
                            TIER {tier}
                        </span>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: cfg.color }}>{cfg.title}</h3>
                        <span style={{ fontSize: '0.86rem', fontWeight: 700, color: cfg.color, background: 'white', border: `1px solid ${cfg.border}`, padding: '0.15rem 0.55rem', borderRadius: '999px' }}>
                            {filtered.length}{search && filtered.length !== products.length ? ` / ${products.length}` : ''}
                        </span>
                        {extraBadges}
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
                    ) : children(filtered, sort, handleSort)}
                </div>
            )}
        </div>
    );
}

// ----------------------------------------------------------------------
// Badge-Helper für Tier-Header
// ----------------------------------------------------------------------
function StatBadge({ color, border, bg, children }) {
    return (
        <span style={{
            fontSize: '0.76rem', fontWeight: 700, color,
            background: bg || 'white', border: `1px solid ${border}`,
            padding: '0.15rem 0.55rem', borderRadius: '999px',
            whiteSpace: 'nowrap',
        }}>
            {children}
        </span>
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
function SortTh({ children, sortKey, sort, onSort, align = 'right' }) {
    const active = sort?.key === sortKey;
    return (
        <th onClick={() => onSort(sortKey)} style={{
            textAlign: align, padding: '0.5rem 0.75rem',
            fontSize: '0.72rem', textTransform: 'uppercase',
            color: active ? '#4f46e5' : 'var(--text-muted)', fontWeight: 600,
            background: active ? '#eef2ff' : '#f8fafc',
            borderBottom: '1px solid var(--border-color)',
            whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
        }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                {children}
                {active
                    ? (sort.desc ? <ChevronDown size={11} /> : <ChevronUp size={11} />)
                    : <ChevronDown size={11} style={{ opacity: 0.25 }} />
                }
            </span>
        </th>
    );
}
function Td({ children, align = 'right', color, weight, style: st }) {
    return (
        <td style={{
            textAlign: align, padding: '0.55rem 0.75rem',
            fontSize: '0.84rem', borderBottom: '1px solid var(--border-color)',
            color, fontWeight: weight, whiteSpace: 'nowrap', ...st,
        }}>{children}</td>
    );
}
function ProductCell({ p, isExpanded, onToggle }) {
    return (
        <td onClick={onToggle} style={{
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

function ExpandedRow({ p, c, colSpan, onSavePrice }) {
    const cfg = c ? TIER_CONFIG[c.tier] : null;
    const explanation = c ? getTierExplanation(p, c) : null;
    return (
        <tr>
            <td colSpan={colSpan} style={{ padding: 0, background: '#f8fafc', borderBottom: '1px solid var(--border-color)' }}>
                {explanation && cfg && (
                    <div style={{
                        margin: '0.75rem 1rem 0.35rem',
                        padding: '0.65rem 1rem',
                        background: cfg.bg,
                        border: `1px solid ${cfg.border}`,
                        borderRadius: '8px',
                        fontSize: '0.82rem',
                        color: cfg.color,
                        lineHeight: 1.6,
                    }}>
                        <strong>Diagnose:</strong> {explanation}
                    </div>
                )}
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

    useEffect(() => {
        axios.get('/api/auswertung')
            .then(r => { setData(r.data.data || []); setLoading(false); })
            .catch(e => { setError(e.message); setLoading(false); });
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
        const t = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 0: [] };
        data.forEach(p => {
            if ((p.menge90d || 0) === 0) return;
            const c = classify(p);
            t[c.tier].push({ ...p, _c: c });
        });
        return t;
    }, [data]);

    // Tier-Statistiken: Umsatz + spezifische Kennzahlen
    const tierStats = useMemo(() => {
        const stats = {};
        [1, 2, 3, 4, 5, 6, 7, 8].forEach(t => {
            const ps = tiers[t] || [];
            stats[t] = {
                umsatz: ps.reduce((s, p) => s + (p.umsatzNetto90d || 0), 0),
            };
        });
        // Tier 1: Einsparpotenzial wenn ACoS halbiert (monatlich)
        stats[1].einsparpot = (tiers[1] || []).reduce((s, p) => s + (p._c.einsparMonat || 0), 0);
        // Tier 2: Verlust im Rabattzeitraum
        stats[2].verlustRabatt = (tiers[2] || []).reduce((s, p) => s + Math.abs(p._c.verlustRabatt || 0), 0);
        // Tier 3: Einsparpotenzial Werbekosten/Monat
        stats[3].einsparpot = (tiers[3] || []).reduce((s, p) => s + (p._c.werbeMonat || 0), 0);
        // Tier 5: Verlust im Rabattzeitraum
        stats[5].verlustRabatt = (tiers[5] || []).reduce((s, p) => s + Math.abs(p._c.verlustRabatt || 0), 0);
        return stats;
    }, [tiers]);

    if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Lade Daten...</div>;
    if (error) return <div style={{ padding: '2rem', color: '#ef4444' }}>Fehler: {error}</div>;

    const activeCount = data.filter(p => (p.menge90d || 0) > 0).length;

    return (
        <div style={{ padding: '1.5rem 2rem', maxWidth: '1500px', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Empfehlungen</h1>
                    <p style={{ color: 'var(--text-muted)', margin: '0.3rem 0 0', fontSize: '0.88rem' }}>
                        8-Tier-Strategie für {activeCount} Produkte mit Umsatz · hierarchisch — jedes Produkt erscheint nur in der höchsten Kategorie
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '0.5rem' }}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map(t => {
                    const cfg = TIER_CONFIG[t];
                    return (
                        <div key={t} style={{
                            background: cfg.bg, border: `1.5px solid ${cfg.border}`,
                            borderRadius: '8px', padding: '0.6rem 0.75rem', textAlign: 'center',
                        }}>
                            <div style={{ fontSize: '1.55rem', fontWeight: 800, color: cfg.color, lineHeight: 1 }}>{tiers[t].length}</div>
                            <div style={{ fontSize: '0.68rem', color: cfg.color, fontWeight: 600, marginTop: '0.2rem', lineHeight: 1.2 }}>
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
                    <div style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 600, marginTop: '0.2rem' }}>Healthy</div>
                </div>
            </div>

            {/* === TIER 1: Werbeausgaben optimieren === */}
            <TierCard tier={1} products={tiers[1]} search={search}
                defaultSort={{ key: 'wkAnteil', desc: true }}
                sortAccessors={{
                    name: p => p.name || '',
                    m_real: p => p._c.m_real,
                    m_ohne: p => p._c.m_ohne_werbung,
                    wkAnteil: p => p._c.wkAnteil,
                    targetAcos: p => p._c.targetAcos,
                    werbeQ1: p => p._c.werbeQ1,
                    einspar: p => p._c.einsparMonat,
                    umsatz: p => p.umsatzNetto90d,
                }}
                extraBadges={<>
                    {tierStats[1]?.umsatz > 0 && (
                        <StatBadge color="#d97706" border="#fcd34d" bg="#fffbeb">
                            Umsatz: {fmtEur(tierStats[1].umsatz)}
                        </StatBadge>
                    )}
                    {tierStats[1]?.einsparpot > 0 && (
                        <StatBadge color="#10b981" border="#86efac" bg="#ecfdf5">
                            Einsparpot. (ACoS ÷2): {fmtEur(tierStats[1].einsparpot)}/Mon
                        </StatBadge>
                    )}
                </>}>
                {(filtered, sort, onSort) => (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <SortTh align="left" sortKey="name" sort={sort} onSort={onSort}>Produkt</SortTh>
                                    <SortTh sortKey="umsatz" sort={sort} onSort={onSort}>Umsatz 90d</SortTh>
                                    <SortTh sortKey="m_real" sort={sort} onSort={onSort}>Reale Marge</SortTh>
                                    <SortTh sortKey="m_ohne" sort={sort} onSort={onSort}>Marge o. Werbung</SortTh>
                                    <SortTh sortKey="wkAnteil" sort={sort} onSort={onSort}>ACoS aktuell</SortTh>
                                    <SortTh sortKey="targetAcos" sort={sort} onSort={onSort}>Ziel-ACoS</SortTh>
                                    <SortTh sortKey="werbeQ1" sort={sort} onSort={onSort}>Werbung/Quartal</SortTh>
                                    <SortTh sortKey="einspar" sort={sort} onSort={onSort}>Einsparpot./Mon</SortTh>
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
                                                <Td color="var(--text-muted)">{fmtEur(p.umsatzNetto90d)}</Td>
                                                <Td color="#ef4444" weight={700}>{fmtPct(c.m_real)}</Td>
                                                <Td color="#10b981" weight={600}>{fmtPct(c.m_ohne_werbung)}</Td>
                                                <Td color="#ef4444" weight={700}>{fmtPct(c.wkAnteil)}</Td>
                                                <Td color="#10b981">{fmtPct(c.targetAcos)}</Td>
                                                <Td>{fmtEur(c.werbeQ1)}</Td>
                                                <Td color="#10b981" weight={700}>{fmtEur(c.einsparMonat)}</Td>
                                            </tr>
                                            {exp && <ExpandedRow p={p} c={c} colSpan={8} onSavePrice={savePriceFromCalculator} />}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </TierCard>

            {/* === TIER 2: Preisgestaltung überarbeiten === */}
            <TierCard tier={2} products={tiers[2]} search={search}
                defaultSort={{ key: 'verlustRabatt', desc: false }}
                sortAccessors={{
                    name: p => p.name || '',
                    m_real: p => p._c.m_real,
                    m_ohne: p => p._c.m_ohne_werbung,
                    rabattAnteil: p => p._c.rabattAnteil,
                    verlustRabatt: p => p._c.verlustRabatt,
                    rabattMenge: p => p._c.rabattMenge,
                    umsatz: p => p.umsatzNetto90d,
                }}
                extraBadges={<>
                    {tierStats[2]?.umsatz > 0 && (
                        <StatBadge color="#7c3aed" border="#c4b5fd" bg="#f5f3ff">
                            Umsatz: {fmtEur(tierStats[2].umsatz)}
                        </StatBadge>
                    )}
                    {tierStats[2]?.verlustRabatt > 0 && (
                        <StatBadge color="#ef4444" border="#fca5a5" bg="#fef2f2">
                            Verlust Rabattperiode: {fmtEur(tierStats[2].verlustRabatt)}
                        </StatBadge>
                    )}
                </>}>
                {(filtered, sort, onSort) => (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <SortTh align="left" sortKey="name" sort={sort} onSort={onSort}>Produkt</SortTh>
                                    <SortTh sortKey="umsatz" sort={sort} onSort={onSort}>Umsatz 90d</SortTh>
                                    <SortTh sortKey="m_real" sort={sort} onSort={onSort}>Reale Marge</SortTh>
                                    <SortTh sortKey="m_ohne" sort={sort} onSort={onSort}>Marge o. Werbung</SortTh>
                                    <SortTh sortKey="rabattAnteil" sort={sort} onSort={onSort}>% Verkäufe im Rabatt</SortTh>
                                    <SortTh sortKey="verlustRabatt" sort={sort} onSort={onSort}>Verlust Rabattperiode</SortTh>
                                    <SortTh sortKey="rabattMenge" sort={sort} onSort={onSort}>Menge Rabatt/Normal</SortTh>
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
                                                <Td color="var(--text-muted)">{fmtEur(p.umsatzNetto90d)}</Td>
                                                <Td color="#ef4444" weight={700}>{fmtPct(c.m_real)}</Td>
                                                <Td color={c.m_ohne_werbung > 5 ? '#10b981' : '#ef4444'} weight={600}>{fmtPct(c.m_ohne_werbung)}</Td>
                                                <Td color="#ef4444" weight={700}>{fmtPct(c.rabattAnteil)}</Td>
                                                <Td color="#ef4444" weight={700}>{fmtEur(c.verlustRabatt)}</Td>
                                                <Td color="var(--text-muted)" st={{ fontSize: '0.78rem' }}>
                                                    {c.rabattMenge} / {c.normalMenge}
                                                </Td>
                                                <Td align="center">
                                                    <ActionButton active={!!dtp[p.sku]}
                                                        onClick={() => toggleDtp(p, { verlustRabatt: c.verlustRabatt, mengeRabatt: c.rabattMenge })}
                                                        label="Dauertiefpreis" color="#7c3aed" />
                                                </Td>
                                            </tr>
                                            {exp && <ExpandedRow p={p} c={c} colSpan={8} onSavePrice={savePriceFromCalculator} />}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </TierCard>

            {/* === TIER 3: Werbung abdrehen === */}
            <TierCard tier={3} products={tiers[3]} search={search}
                defaultSort={{ key: 'werbeMonat', desc: true }}
                sortAccessors={{
                    name: p => p.name || '',
                    m_real: p => p._c.m_real,
                    m_ohne_werbung: p => p._c.m_ohne_werbung,
                    werbeQ1: p => p._c.werbeQ1,
                    werbeMonat: p => p._c.werbeMonat,
                    umsatz: p => p.umsatzNetto90d,
                }}
                extraBadges={<>
                    {tierStats[3]?.umsatz > 0 && (
                        <StatBadge color="#dc2626" border="#fca5a5" bg="#fef2f2">
                            Umsatz: {fmtEur(tierStats[3].umsatz)}
                        </StatBadge>
                    )}
                    {tierStats[3]?.einsparpot > 0 && (
                        <StatBadge color="#10b981" border="#86efac" bg="#ecfdf5">
                            Einsparpotenzial: {fmtEur(tierStats[3].einsparpot)}/Mon
                        </StatBadge>
                    )}
                </>}>
                {(filtered, sort, onSort) => (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <SortTh align="left" sortKey="name" sort={sort} onSort={onSort}>Produkt</SortTh>
                                    <SortTh sortKey="umsatz" sort={sort} onSort={onSort}>Umsatz 90d</SortTh>
                                    <SortTh sortKey="m_real" sort={sort} onSort={onSort}>Reale Marge</SortTh>
                                    <SortTh sortKey="m_ohne_werbung" sort={sort} onSort={onSort}>Marge o. Werbung</SortTh>
                                    <SortTh sortKey="werbeQ1" sort={sort} onSort={onSort}>Werbung Q1</SortTh>
                                    <SortTh sortKey="werbeMonat" sort={sort} onSort={onSort}>Sparpot. /Mon</SortTh>
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
                                                <Td color="var(--text-muted)">{fmtEur(p.umsatzNetto90d)}</Td>
                                                <Td color="#ef4444" weight={700}>{fmtPct(c.m_real)}</Td>
                                                <Td color={c.m_ohne_werbung >= 0 ? '#10b981' : '#ef4444'} weight={600}>{fmtPct(c.m_ohne_werbung)}</Td>
                                                <Td>{fmtEur(c.werbeQ1)}</Td>
                                                <Td color="#10b981" weight={700}>{fmtEur(c.werbeMonat)}</Td>
                                                <Td align="center">
                                                    <ActionButton active={!!adsOff[p.sku]} onClick={() => toggleAdsOff(p)} label="Werbung aus" color="#dc2626" />
                                                </Td>
                                            </tr>
                                            {exp && <ExpandedRow p={p} c={c} colSpan={7} onSavePrice={savePriceFromCalculator} />}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </TierCard>

            {/* === TIER 4: Auslistung prüfen === */}
            <TierCard tier={4} products={tiers[4]} search={search}
                defaultSort={{ key: 'm_real', desc: false }}
                sortAccessors={{
                    name: p => p.name || '',
                    m_real: p => p._c.m_real,
                    m_ohne_werbung: p => p._c.m_ohne_werbung,
                    ek: p => p.ekNetto,
                    vk: p => p.vkBrutto,
                    menge: p => p.menge90d,
                    umsatz: p => p.umsatzNetto90d,
                }}
                extraBadges={tierStats[4]?.umsatz > 0 && (
                    <StatBadge color="#7c2d12" border="#fdba74" bg="#fff7ed">
                        Umsatz: {fmtEur(tierStats[4].umsatz)}
                    </StatBadge>
                )}>
                {(filtered, sort, onSort) => (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <SortTh align="left" sortKey="name" sort={sort} onSort={onSort}>Produkt</SortTh>
                                    <SortTh sortKey="umsatz" sort={sort} onSort={onSort}>Umsatz 90d</SortTh>
                                    <SortTh sortKey="m_real" sort={sort} onSort={onSort}>Marge real</SortTh>
                                    <SortTh sortKey="m_ohne_werbung" sort={sort} onSort={onSort}>Marge o. Werbung</SortTh>
                                    <SortTh sortKey="ek" sort={sort} onSort={onSort}>EK</SortTh>
                                    <SortTh sortKey="vk" sort={sort} onSort={onSort}>VK Brutto</SortTh>
                                    <SortTh sortKey="menge" sort={sort} onSort={onSort}>Menge 90d</SortTh>
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
                                                <Td color="var(--text-muted)">{fmtEur(p.umsatzNetto90d)}</Td>
                                                <Td color="#ef4444" weight={700}>{fmtPct(c.m_real)}</Td>
                                                <Td color="#ef4444" weight={600}>{fmtPct(c.m_ohne_werbung)}</Td>
                                                <Td>{fmtEur(p.ekNetto)}</Td>
                                                <Td>{fmtEur(p.vkBrutto)}</Td>
                                                <Td color="var(--text-muted)">{fmt(p.menge90d, 0)}</Td>
                                                <Td align="center">
                                                    <ActionButton active={!!delisted[p.sku]} onClick={() => toggleDelist(p)} label="Auslisten" color="#7c2d12" />
                                                </Td>
                                            </tr>
                                            {exp && <ExpandedRow p={p} c={c} colSpan={8} onSavePrice={savePriceFromCalculator} />}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </TierCard>

            {/* === TIER 5: Aus Rabattaktion nehmen === */}
            <TierCard tier={5} products={tiers[5]} search={search}
                defaultSort={{ key: 'verlust', desc: false }}
                sortAccessors={{
                    name: p => p.name || '',
                    margeNormal: p => p._c.margeNormal,
                    margeRabatt: p => p._c.margeRabatt,
                    gewinnStRab: p => p._c.gewinnRabattStueck,
                    verlust: p => p._c.verlustRabatt,
                    mengeRabatt: p => p._c.mengeRabatt,
                    umsatz: p => p.umsatzNetto90d,
                }}
                extraBadges={<>
                    {tierStats[5]?.umsatz > 0 && (
                        <StatBadge color="#a16207" border="#fde047" bg="#fefce8">
                            Umsatz: {fmtEur(tierStats[5].umsatz)}
                        </StatBadge>
                    )}
                    {tierStats[5]?.verlustRabatt > 0 && (
                        <StatBadge color="#ef4444" border="#fca5a5" bg="#fef2f2">
                            Verlust Rabattperiode: {fmtEur(tierStats[5].verlustRabatt)}
                        </StatBadge>
                    )}
                </>}>
                {(filtered, sort, onSort) => (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <SortTh align="left" sortKey="name" sort={sort} onSort={onSort}>Produkt</SortTh>
                                    <SortTh sortKey="umsatz" sort={sort} onSort={onSort}>Umsatz 90d</SortTh>
                                    <SortTh sortKey="margeNormal" sort={sort} onSort={onSort}>Marge normal</SortTh>
                                    <SortTh sortKey="margeRabatt" sort={sort} onSort={onSort}>Marge bei −10%</SortTh>
                                    <SortTh sortKey="gewinnStRab" sort={sort} onSort={onSort}>Gewinn/St. −10%</SortTh>
                                    <SortTh sortKey="verlust" sort={sort} onSort={onSort}>Verlust Rabattperiode</SortTh>
                                    <SortTh sortKey="mengeRabatt" sort={sort} onSort={onSort}>Menge Rabatt</SortTh>
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
                                                <Td color="var(--text-muted)">{fmtEur(p.umsatzNetto90d)}</Td>
                                                <Td color="#10b981" weight={600}>{fmtPct(c.margeNormal)}</Td>
                                                <Td color="#ef4444" weight={700}>{fmtPct(c.margeRabatt)}</Td>
                                                <Td color="#ef4444" weight={600}>{fmtEur(c.gewinnRabattStueck)}</Td>
                                                <Td color="#ef4444" weight={700}>{fmtEur(c.verlustRabatt)}</Td>
                                                <Td>{fmt(c.mengeRabatt, 0)}</Td>
                                                <Td align="center">
                                                    <ActionButton active={!!dtp[p.sku]} onClick={() => toggleDtp(p, c)} label="Dauertiefpreis" color="#a16207" />
                                                </Td>
                                            </tr>
                                            {exp && <ExpandedRow p={p} c={c} colSpan={8} onSavePrice={savePriceFromCalculator} />}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </TierCard>

            {/* === TIER 6: Preis erhöhen === */}
            <TierCard tier={6} products={tiers[6]} search={search}
                defaultSort={{ key: 'priceIncreasePct', desc: false }}
                sortAccessors={{
                    name: p => p.name || '',
                    vkAlt: p => p.vkBrutto,
                    vkNeu: p => p._c.newVkBrutto,
                    priceIncreasePct: p => p._c.priceIncreasePct,
                    margeJetzt: p => p._c.margeRabatt,
                    margeNeu: p => p._c.newMargeRabatt,
                    rang: p => p.currentScrape?.hr_rank ?? 99,
                    umsatz: p => p.umsatzNetto90d,
                }}
                extraBadges={tierStats[6]?.umsatz > 0 && (
                    <StatBadge color="#0369a1" border="#7dd3fc" bg="#f0f9ff">
                        Umsatz: {fmtEur(tierStats[6].umsatz)}
                    </StatBadge>
                )}>
                {(filtered, sort, onSort) => (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <SortTh align="left" sortKey="name" sort={sort} onSort={onSort}>Produkt</SortTh>
                                    <SortTh sortKey="umsatz" sort={sort} onSort={onSort}>Umsatz 90d</SortTh>
                                    <SortTh sortKey="vkAlt" sort={sort} onSort={onSort}>Aktuell VK Brutto</SortTh>
                                    <SortTh sortKey="vkNeu" sort={sort} onSort={onSort}>Empf. VK Brutto</SortTh>
                                    <SortTh sortKey="priceIncreasePct" sort={sort} onSort={onSort}>Δ Preis</SortTh>
                                    <SortTh sortKey="margeJetzt" sort={sort} onSort={onSort}>Marge −10% jetzt</SortTh>
                                    <SortTh sortKey="margeNeu" sort={sort} onSort={onSort}>Marge −10% neu</SortTh>
                                    <SortTh sortKey="rang" sort={sort} onSort={onSort}>Idealo Rang/Rang1</SortTh>
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
                                                <Td color="var(--text-muted)">{fmtEur(p.umsatzNetto90d)}</Td>
                                                <Td>{fmtEur(p.vkBrutto)}</Td>
                                                <Td color="#0369a1" weight={700}>{fmtEur(c.newVkBrutto)}</Td>
                                                <Td color="#0369a1">+{fmt(c.priceIncreasePct, 1)}%</Td>
                                                <Td color="#ef4444">{fmtPct(c.margeRabatt)}</Td>
                                                <Td color="#10b981" weight={700}>{fmtPct(c.newMargeRabatt)}</Td>
                                                <Td color="var(--text-muted)" st={{ fontSize: '0.78rem' }}>
                                                    {c.isRank1 ? 'Rang 1' : (p.currentScrape?.hr_rank ? `Rang ${p.currentScrape.hr_rank}` : '–')}
                                                    {c.rank1 && ` / ${fmt(c.rank1)}€`}
                                                </Td>
                                                <Td align="center">
                                                    <ActionButton active={saved} onClick={() => togglePrice(p, c, 'erhoehen')} label="Übernehmen" color="#0369a1" />
                                                </Td>
                                            </tr>
                                            {exp && <ExpandedRow p={p} c={c} colSpan={9} onSavePrice={savePriceFromCalculator} />}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </TierCard>

            {/* === TIER 7: Preis senken === */}
            <TierCard tier={7} products={tiers[7]} search={search}
                defaultSort={{ key: 'margeNeu', desc: true }}
                sortAccessors={{
                    name: p => p.name || '',
                    vkAlt: p => p.vkBrutto,
                    vkNeu: p => p._c.newVkBrutto,
                    diffPct: p => p.vkBrutto > 0 ? ((p._c.newVkBrutto - p.vkBrutto) / p.vkBrutto) * 100 : 0,
                    margeJetzt: p => p._c.margeRabatt,
                    margeNeu: p => p._c.newMargeRabatt,
                    rang: p => p.currentScrape?.hr_rank ?? 99,
                    umsatz: p => p.umsatzNetto90d,
                }}
                extraBadges={tierStats[7]?.umsatz > 0 && (
                    <StatBadge color="#15803d" border="#86efac" bg="#f0fdf4">
                        Umsatz: {fmtEur(tierStats[7].umsatz)}
                    </StatBadge>
                )}>
                {(filtered, sort, onSort) => (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <SortTh align="left" sortKey="name" sort={sort} onSort={onSort}>Produkt</SortTh>
                                    <SortTh sortKey="umsatz" sort={sort} onSort={onSort}>Umsatz 90d</SortTh>
                                    <SortTh sortKey="vkAlt" sort={sort} onSort={onSort}>Aktuell VK Brutto</SortTh>
                                    <SortTh sortKey="vkNeu" sort={sort} onSort={onSort}>Empf. VK Brutto</SortTh>
                                    <SortTh sortKey="diffPct" sort={sort} onSort={onSort}>Δ Preis</SortTh>
                                    <SortTh sortKey="margeJetzt" sort={sort} onSort={onSort}>Marge −10% jetzt</SortTh>
                                    <SortTh sortKey="margeNeu" sort={sort} onSort={onSort}>Marge −10% neu</SortTh>
                                    <SortTh sortKey="rang" sort={sort} onSort={onSort}>Rang/Rang1</SortTh>
                                    <Th align="center">Aktion</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(p => {
                                    const c = p._c;
                                    const saved = !!priceChanges[p.sku];
                                    const diffPct = p.vkBrutto > 0 ? ((c.newVkBrutto - p.vkBrutto) / p.vkBrutto) * 100 : 0;
                                    const exp = !!expandedSkus[p.sku];
                                    return (
                                        <React.Fragment key={p.sku}>
                                            <tr>
                                                <ProductCell p={p} isExpanded={exp} onToggle={() => toggleExpand(p.sku)} />
                                                <Td color="var(--text-muted)">{fmtEur(p.umsatzNetto90d)}</Td>
                                                <Td>{fmtEur(p.vkBrutto)}</Td>
                                                <Td color="#15803d" weight={700}>{fmtEur(c.newVkBrutto)}</Td>
                                                <Td color="#15803d">{fmt(diffPct, 1)}%</Td>
                                                <Td color="#10b981">{fmtPct(c.margeRabatt)}</Td>
                                                <Td color="#10b981" weight={700}>{fmtPct(c.newMargeRabatt)}</Td>
                                                <Td color="var(--text-muted)" st={{ fontSize: '0.78rem' }}>
                                                    {p.currentScrape?.hr_rank ? `Rang ${p.currentScrape.hr_rank}` : '–'}
                                                    {c.rank1 && ` / ${fmt(c.rank1)}€`}
                                                </Td>
                                                <Td align="center">
                                                    <ActionButton active={saved} onClick={() => togglePrice(p, c, 'senken')} label="Übernehmen" color="#15803d" />
                                                </Td>
                                            </tr>
                                            {exp && <ExpandedRow p={p} c={c} colSpan={9} onSavePrice={savePriceFromCalculator} />}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </TierCard>

            {/* === TIER 8: Preis hochtesten === */}
            <TierCard tier={8} products={tiers[8]} search={search}
                defaultSort={{ key: 'margeNeu', desc: true }}
                sortAccessors={{
                    name: p => p.name || '',
                    vkAlt: p => p.vkBrutto,
                    vkNeu: p => p._c.newVkBrutto,
                    rank2: p => p._c.rank2,
                    margeJetzt: p => p._c.margeRabatt,
                    margeNeu: p => p._c.newMargeRabatt,
                    umsatz: p => p.umsatzNetto90d,
                }}
                extraBadges={tierStats[8]?.umsatz > 0 && (
                    <StatBadge color="#7e22ce" border="#d8b4fe" bg="#faf5ff">
                        Umsatz: {fmtEur(tierStats[8].umsatz)}
                    </StatBadge>
                )}>
                {(filtered, sort, onSort) => (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <SortTh align="left" sortKey="name" sort={sort} onSort={onSort}>Produkt</SortTh>
                                    <SortTh sortKey="umsatz" sort={sort} onSort={onSort}>Umsatz 90d</SortTh>
                                    <SortTh sortKey="vkAlt" sort={sort} onSort={onSort}>Aktuell VK Brutto</SortTh>
                                    <SortTh sortKey="vkNeu" sort={sort} onSort={onSort}>Empf. VK Brutto</SortTh>
                                    <SortTh sortKey="rank2" sort={sort} onSort={onSort}>Rang2-Preis</SortTh>
                                    <SortTh sortKey="margeJetzt" sort={sort} onSort={onSort}>Marge −10% jetzt</SortTh>
                                    <SortTh sortKey="margeNeu" sort={sort} onSort={onSort}>Marge −10% neu</SortTh>
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
                                                <Td color="var(--text-muted)">{fmtEur(p.umsatzNetto90d)}</Td>
                                                <Td>{fmtEur(p.vkBrutto)}</Td>
                                                <Td color="#7e22ce" weight={700}>{fmtEur(c.newVkBrutto)}</Td>
                                                <Td color="var(--text-muted)">{fmtEur(c.rank2)}</Td>
                                                <Td color="#10b981">{fmtPct(c.margeRabatt)}</Td>
                                                <Td color="#10b981" weight={700}>{fmtPct(c.newMargeRabatt)}</Td>
                                                <Td align="center">
                                                    <ActionButton active={saved} onClick={() => togglePrice(p, c, 'hochtest')} label="Übernehmen" color="#7e22ce" />
                                                </Td>
                                            </tr>
                                            {exp && <ExpandedRow p={p} c={c} colSpan={8} onSavePrice={savePriceFromCalculator} />}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </TierCard>

            {/* Footer */}
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '0.5rem 0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={13} />
                Die Tiers sind hierarchisch — jedes Produkt erscheint nur in der höchsten zutreffenden Kategorie. Tier 1 (Werbeagentur) und Tier 2 (Preisgestaltung) haben Vorrang, da sie strukturelle Probleme adressieren.
            </div>
        </div>
    );
}
