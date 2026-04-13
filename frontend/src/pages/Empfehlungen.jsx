import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Search, ChevronUp, ChevronDown, TrendingDown, TrendingUp, AlertTriangle, Trash2, CheckCircle } from 'lucide-react';
import axios from 'axios';

const DELIST_KEY = 'hr_delist_decisions';
const PRICE_CHANGES_KEY = 'hr_price_changes';
const ADS_OFF_KEY = 'hr_ads_off_decisions';

const fmt = (v, d = 2) => {
    if (v === null || v === undefined) return '-';
    return new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
};
const fmtEur = (v) => v === null || v === undefined ? '-' : fmt(v) + ' €';
const fmtPct = (v) => v === null || v === undefined ? '-' : fmt(v, 1) + '%';

const BETRIEBSKOSTEN_PCT = 13;
const WERBEKOSTEN_PCT = 10;

function ProductRow({ p, delistable, isDelisted, onToggleDelist }) {
    const estMarge = p.handelsspanne !== null ? p.handelsspanne - BETRIEBSKOSTEN_PCT - WERBEKOSTEN_PCT : null;
    const margeColor = estMarge === null ? 'var(--text-muted)' : estMarge < 0 ? '#ef4444' : estMarge < 10 ? '#f59e0b' : '#10b981';

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: '1rem',
            padding: '0.6rem 1rem',
            borderBottom: '1px solid var(--border-color)',
            fontSize: '0.85rem',
            background: isDelisted ? '#f0fdf4' : 'transparent',
        }}>
            {delistable && (
                <div style={{ flexShrink: 0 }}>
                    <input type="checkbox" checked={isDelisted} onChange={() => onToggleDelist(p.sku, p.name)}
                        style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#10b981' }} />
                </div>
            )}
            <div style={{ flex: '2.5', minWidth: '180px' }}>
                <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{p.sku}</div>
            </div>
            <div style={{ flex: '0.6', minWidth: '70px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block' }}>EK Netto</span>
                <span>{fmtEur(p.ekNetto)}</span>
            </div>
            <div style={{ flex: '0.6', minWidth: '70px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block' }}>VK Brutto</span>
                <span>{fmtEur(p.vkBrutto)}</span>
            </div>
            <div style={{ flex: '0.5', minWidth: '50px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block' }}>MwSt</span>
                <span>{p.mwst !== null ? fmt(p.mwst, 0) + '%' : '-'}</span>
            </div>
            <div style={{ flex: '0.7', minWidth: '75px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block' }}>Handelsspanne</span>
                <span style={{ fontWeight: 500, color: p.handelsspanne !== null && p.handelsspanne < 15 ? '#ef4444' : '#10b981' }}>
                    {p.handelsspanne !== null ? fmt(p.handelsspanne, 1) + '%' : '-'}
                </span>
            </div>
            <div style={{ flex: '0.7', minWidth: '75px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block' }}>Gesch. Marge</span>
                <span style={{ fontWeight: 600, color: margeColor }}>
                    {estMarge !== null ? fmt(estMarge, 1) + '%' : '-'}
                </span>
            </div>
        </div>
    );
}

function RevenueProductRow({ p, showMargeOhneWerbung, delistable, isDelisted, onToggleDelist }) {
    const margeColor = p.realeMargeProz === null ? 'var(--text-muted)' : p.realeMargeProz < 0 ? '#ef4444' : p.realeMargeProz < 10 ? '#f59e0b' : '#10b981';
    const margeOhneWerbung = (p.realeMargeProz !== null && p.werbekostenAnteil !== null) ? p.realeMargeProz + (p.werbekostenAnteil || 0) : null;
    const mohwColor = margeOhneWerbung === null ? 'var(--text-muted)' : margeOhneWerbung < 0 ? '#ef4444' : margeOhneWerbung < 10 ? '#f59e0b' : '#10b981';

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: '1rem',
            padding: '0.6rem 1rem',
            borderBottom: '1px solid var(--border-color)',
            fontSize: '0.85rem',
            background: isDelisted ? '#f0fdf4' : 'transparent',
        }}>
            {delistable && (
                <div style={{ flexShrink: 0 }}>
                    <input type="checkbox" checked={isDelisted} onChange={() => onToggleDelist(p.sku, p.name)}
                        style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#10b981' }} />
                </div>
            )}
            <div style={{ flex: '2.5', minWidth: '180px' }}>
                <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{p.sku}</div>
            </div>
            <div style={{ flex: '0.6', minWidth: '70px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block' }}>Umsatz 90d</span>
                <span>{fmtEur(p.umsatzNetto90d)}</span>
            </div>
            <div style={{ flex: '0.5', minWidth: '55px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block' }}>Menge</span>
                <span>{fmt(p.menge90d, 0)}</span>
            </div>
            <div style={{ flex: '0.7', minWidth: '75px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block' }}>Handelsspanne</span>
                <span style={{ fontWeight: 500, color: p.handelsspanne !== null && p.handelsspanne < 15 ? '#ef4444' : '#10b981' }}>
                    {fmtPct(p.handelsspanne)}
                </span>
            </div>
            <div style={{ flex: '0.7', minWidth: '80px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block' }}>Reale Marge</span>
                <span style={{ fontWeight: 700, color: margeColor }}>{fmtPct(p.realeMargeProz)}</span>
            </div>
            {showMargeOhneWerbung && (
                <div style={{ flex: '0.7', minWidth: '80px' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block' }}>Marge o. Werbung</span>
                    <span style={{ fontWeight: 700, color: mohwColor }}>{fmtPct(margeOhneWerbung)}</span>
                </div>
            )}
            <div style={{ flex: '0.6', minWidth: '70px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block' }}>Marge/St.</span>
                <span style={{ color: margeColor }}>{fmtEur(p.realeMargeStueck)}</span>
            </div>
            <div style={{ flex: '0.6', minWidth: '70px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block' }}>Werbekosten %</span>
                <span>{fmtPct(p.werbekostenAnteil)}</span>
            </div>
        </div>
    );
}

// mode: 'lowMargin' (0-10% est. margin group) or 'highMargin' (>10% est. margin group)
function calcPriceSuggestion(p, mode = 'lowMargin') {
    if (p.handelsspanne === null || p.ekNetto === null || p.mwst === null) return null;
    const estMarge = p.handelsspanne - BETRIEBSKOSTEN_PCT - WERBEKOSTEN_PCT;
    const s = p.currentScrape;
    const rank1Price = s?.rank1_price;
    const mwstFactor = 1 + p.mwst / 100;

    const minMargeIdealo = mode === 'highMargin' ? 5 : 0;

    // Strategy 1: Idealo Rang 1 — price = rank1 - 0.01, check min margin
    if (rank1Price && rank1Price > 0) {
        const idealoVkBrutto = parseFloat((rank1Price - 0.01).toFixed(2));
        const idealoVkNetto = idealoVkBrutto / mwstFactor;
        const idealoHS = ((idealoVkNetto - p.ekNetto) / idealoVkNetto) * 100;
        const idealoEstMarge = idealoHS - BETRIEBSKOSTEN_PCT - WERBEKOSTEN_PCT;
        if (idealoEstMarge >= minMargeIdealo) {
            return { strategy: 'idealo', newVkBrutto: idealoVkBrutto, newVkNetto: idealoVkNetto, newEstMarge: idealoEstMarge, oldEstMarge: estMarge, rank1Price };
        }
    }

    // Strategy 2: Fallback
    if (mode === 'highMargin') {
        // Reduce VK Brutto by 5%
        const newVkBrutto = (p.vkBrutto || 0) * 0.95;
        const newVkNetto = newVkBrutto / mwstFactor;
        const newHS = newVkNetto > 0 ? ((newVkNetto - p.ekNetto) / newVkNetto) * 100 : 0;
        const newEstMarge = newHS - BETRIEBSKOSTEN_PCT - WERBEKOSTEN_PCT;
        return { strategy: 'preis-5%', newVkBrutto, newVkNetto, newEstMarge, oldEstMarge: estMarge };
    } else {
        // Reduce margin by 5pp or to 0%
        let targetHS;
        if (estMarge > 5) targetHS = p.handelsspanne - 5;
        else targetHS = BETRIEBSKOSTEN_PCT + WERBEKOSTEN_PCT;
        const newVkNetto = p.ekNetto / (1 - targetHS / 100);
        const newVkBrutto = newVkNetto * mwstFactor;
        const newEstMarge = targetHS - BETRIEBSKOSTEN_PCT - WERBEKOSTEN_PCT;
        return { strategy: 'marge', newVkBrutto, newVkNetto, newEstMarge, oldEstMarge: estMarge };
    }
}

function PriceSuggestionRow({ p, isSaved, onToggleSave, mode = 'lowMargin' }) {
    const calc = calcPriceSuggestion(p, mode);
    if (!calc) return null;

    const { strategy, newVkBrutto, newVkNetto, newEstMarge, oldEstMarge } = calc;
    const priceDiff = newVkBrutto - (p.vkBrutto || 0);
    const margenDiff = newEstMarge - oldEstMarge;
    const stratLabels = { 'idealo': 'Idealo #1', 'marge': 'Marge -5pp', 'preis-5%': 'Preis -5%' };
    const stratColors = { 'idealo': '#1d4ed8', 'marge': '#f59e0b', 'preis-5%': '#f59e0b' };
    const stratLabel = stratLabels[strategy] || strategy;
    const stratColor = stratColors[strategy] || '#f59e0b';

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: '1rem',
            padding: '0.6rem 1rem',
            borderBottom: '1px solid var(--border-color)',
            fontSize: '0.85rem',
            background: isSaved ? '#f0fdf4' : 'transparent',
        }}>
            <div style={{ flexShrink: 0 }}>
                <input type="checkbox" checked={isSaved} onChange={() => onToggleSave(p, newVkBrutto, newVkNetto, newEstMarge)}
                    style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#10b981' }} />
            </div>
            <div style={{ flex: '2', minWidth: '160px' }}>
                <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{p.sku}</div>
            </div>
            <div style={{ flex: '0.6', minWidth: '65px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block' }}>Strategie</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: stratColor, background: stratColor + '15', padding: '0.1rem 0.4rem', borderRadius: '0.25rem' }}>{stratLabel}</span>
            </div>
            <div style={{ flex: '1.2', minWidth: '130px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block' }}>Brutto-VK</span>
                <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)' }}>{fmtEur(p.vkBrutto)}</span>
                <span> → </span>
                <span style={{ fontWeight: 700 }}>{fmtEur(newVkBrutto)}</span>
            </div>
            <div style={{ flex: '0.6', minWidth: '65px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block' }}>Diff.</span>
                <span style={{ fontWeight: 600, color: priceDiff < 0 ? '#10b981' : '#ef4444' }}>{fmt(priceDiff, 2)} €</span>
            </div>
            <div style={{ flex: '0.9', minWidth: '100px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block' }}>Gesch. Marge</span>
                <span style={{ color: 'var(--text-muted)' }}>{fmt(oldEstMarge, 1)}%</span>
                <span> → </span>
                <span style={{ fontWeight: 700, color: newEstMarge <= 0 ? '#f59e0b' : '#10b981' }}>{fmt(newEstMarge, 1)}%</span>
            </div>
            <div style={{ flex: '0.5', minWidth: '50px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block' }}>Opfer</span>
                <span style={{ fontWeight: 600, color: '#ef4444' }}>{fmt(margenDiff, 1)}pp</span>
            </div>
        </div>
    );
}

function RecommendationCard({ icon, iconColor, bgColor, borderColor, title, description, products, search, RowComponent = ProductRow, rowProps = {}, extraBadge = null, delistable = false, delistedSkus = {}, onToggleDelist, onDelistAll }) {
    const [isOpen, setIsOpen] = useState(false);

    const remainingProducts = useMemo(() => {
        if (!delistable) return products;
        return products.filter(p => !delistedSkus[p.sku]);
    }, [products, delistable, delistedSkus]);

    const filtered = useMemo(() => {
        if (!search) return remainingProducts;
        const s = search.toLowerCase();
        return remainingProducts.filter(r => r.sku?.toLowerCase().includes(s) || r.name?.toLowerCase().includes(s));
    }, [remainingProducts, search]);

    const delistedCount = delistable ? products.length - remainingProducts.length : 0;

    return (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Header - clickable */}
            <div
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    padding: '1rem 1.25rem',
                    background: bgColor,
                    borderBottom: isOpen ? `1px solid ${borderColor}` : 'none',
                    cursor: 'pointer',
                    userSelect: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                }}
            >
                <div style={{ flexShrink: 0, color: iconColor }}>{icon}</div>
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.2rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-color)' }}>{title}</span>
                        <span style={{
                            background: borderColor + '33', color: iconColor, fontSize: '0.78rem', fontWeight: 600,
                            padding: '0.15rem 0.55rem', borderRadius: '1rem', border: `1px solid ${borderColor}`,
                        }}>{remainingProducts.length} Produkte</span>
                        {delistable && delistedCount > 0 && (
                            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#10b981', background: '#f0fdf4', padding: '0.15rem 0.55rem', borderRadius: '1rem', border: '1px solid #86efac' }}>
                                {delistedCount} übernommen
                            </span>
                        )}
                        {(() => {
                            const totalUmsatz = products.reduce((sum, p) => sum + (p.umsatzNetto90d || 0), 0);
                            const monatlich = totalUmsatz / 3;
                            if (monatlich > 0) return (
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                    Ø {fmtEur(monatlich)} / Monat
                                </span>
                            );
                            return null;
                        })()}
                        {extraBadge}
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{description}</p>
                </div>
                <div style={{ flexShrink: 0, color: 'var(--text-muted)' }}>
                    {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
            </div>

            {/* Product list */}
            {isOpen && (
                <div>
                    {/* Alle übernehmen bar */}
                    {delistable && remainingProducts.length > 0 && (
                        <div style={{ padding: '0.5rem 1rem', background: '#f8fafc', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <button onClick={(e) => { e.stopPropagation(); onDelistAll(remainingProducts); }}
                                style={{ background: '#10b981', color: 'white', border: 'none', padding: '0.35rem 0.75rem', borderRadius: '0.4rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                                Alle übernehmen ({remainingProducts.length})
                            </button>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                                {delistedCount > 0 ? `${delistedCount} von ${products.length} bereits übernommen` : `${remainingProducts.length} Produkte`}
                            </span>
                        </div>
                    )}
                    {filtered.length > 0 ? (
                        <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                            {filtered.map(p => <RowComponent key={p.sku} p={p} {...rowProps}
                                delistable={delistable} isDelisted={!!delistedSkus[p.sku]} onToggleDelist={onToggleDelist} />)}
                        </div>
                    ) : (
                        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            Keine Produkte gefunden.
                        </div>
                    )}
                    {search && filtered.length !== products.length && (
                        <div style={{ padding: '0.5rem 1rem', fontSize: '0.78rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', background: '#f8fafc' }}>
                            {filtered.length} von {products.length} angezeigt (gefiltert)
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function RevenuePriceRow({ p, isSaved, onToggleSave }) {
    const rec = p._rec;
    if (!rec) return null;
    const priceDiff = rec.newVkBrutto - (p.vkBrutto || 0);
    const margeDiff = (rec.newRealeMargeProz || 0) - (p.realeMargeProz || 0);
    const stratLabel = rec.strategy === 'erhöhen' ? 'Erhöhen' : 'Rang 1';
    const stratColor = rec.strategy === 'erhöhen' ? '#10b981' : '#1d4ed8';
    const neueMargeColor = rec.newRealeMargeProz < 0 ? '#ef4444' : rec.newRealeMargeProz < 10 ? '#f59e0b' : '#10b981';

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.6rem 1rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.85rem', background: isSaved ? '#f0fdf4' : 'transparent' }}>
            <div style={{ flexShrink: 0 }}>
                <input type="checkbox" checked={isSaved} onChange={() => onToggleSave(p, rec.newVkBrutto, rec.newVkNetto, rec.newRealeMargeProz, rec.newRealeMargeSt)}
                    style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#10b981' }} />
            </div>
            <div style={{ flex: '2', minWidth: '160px' }}>
                <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{p.sku}</div>
            </div>
            <div style={{ flex: '0.6', minWidth: '65px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block' }}>Strategie</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: stratColor, background: stratColor + '15', padding: '0.1rem 0.4rem', borderRadius: '0.25rem' }}>{stratLabel}</span>
            </div>
            <div style={{ flex: '1.2', minWidth: '130px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block' }}>Brutto-VK</span>
                <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)' }}>{fmtEur(p.vkBrutto)}</span>
                <span> → </span>
                <span style={{ fontWeight: 700 }}>{fmtEur(rec.newVkBrutto)}</span>
            </div>
            <div style={{ flex: '0.6', minWidth: '65px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block' }}>Diff.</span>
                <span style={{ fontWeight: 600, color: priceDiff > 0 ? '#10b981' : '#ef4444' }}>{priceDiff > 0 ? '+' : ''}{fmt(priceDiff, 2)} €</span>
            </div>
            <div style={{ flex: '0.9', minWidth: '100px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block' }}>Reale Marge</span>
                <span style={{ color: 'var(--text-muted)' }}>{fmtPct(p.realeMargeProz)}</span>
                <span> → </span>
                <span style={{ fontWeight: 700, color: neueMargeColor }}>{fmtPct(rec.newRealeMargeProz)}</span>
            </div>
            <div style={{ flex: '0.5', minWidth: '50px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block' }}>Δ Marge</span>
                <span style={{ fontWeight: 600, color: margeDiff > 0 ? '#10b981' : '#ef4444' }}>{margeDiff > 0 ? '+' : ''}{fmt(margeDiff, 1)}pp</span>
            </div>
        </div>
    );
}

function RevenuePriceCard({ icon, iconColor, bgColor, borderColor, title, description, products, search, savedPriceSkus, onToggleRevenueSave, onSaveAllRevenue }) {
    const [isOpen, setIsOpen] = useState(false);
    const remainingProducts = useMemo(() => products.filter(p => !savedPriceSkus[p.sku]), [products, savedPriceSkus]);
    const filtered = useMemo(() => {
        if (!search) return remainingProducts;
        const s = search.toLowerCase();
        return remainingProducts.filter(r => r.sku?.toLowerCase().includes(s) || r.name?.toLowerCase().includes(s));
    }, [remainingProducts, search]);
    const savedCount = products.length - remainingProducts.length;
    const erhoehenCount = remainingProducts.filter(p => p._rec?.strategy === 'erhöhen').length;
    const senkenCount = remainingProducts.filter(p => p._rec?.strategy === 'senken').length;

    return (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div onClick={() => setIsOpen(!isOpen)} style={{ padding: '1rem 1.25rem', background: bgColor, borderBottom: isOpen ? `1px solid ${borderColor}` : 'none', cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ flexShrink: 0, color: iconColor }}>{icon}</div>
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.2rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-color)' }}>{title}</span>
                        <span style={{ background: borderColor + '33', color: iconColor, fontSize: '0.78rem', fontWeight: 600, padding: '0.15rem 0.55rem', borderRadius: '1rem', border: `1px solid ${borderColor}` }}>{remainingProducts.length} Produkte</span>
                        {erhoehenCount > 0 && <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#10b981', background: '#f0fdf415', padding: '0.15rem 0.55rem', borderRadius: '1rem', border: '1px solid #86efac' }}>{erhoehenCount} Erhöhungen</span>}
                        {senkenCount > 0 && <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1d4ed8', background: '#eff6ff', padding: '0.15rem 0.55rem', borderRadius: '1rem', border: '1px solid #93c5fd' }}>{senkenCount} Senkungen</span>}
                        {savedCount > 0 && <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#10b981', background: '#f0fdf4', padding: '0.15rem 0.55rem', borderRadius: '1rem', border: '1px solid #86efac' }}>{savedCount} übernommen</span>}
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{description}</p>
                </div>
                <div style={{ flexShrink: 0, color: 'var(--text-muted)' }}>{isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</div>
            </div>
            {isOpen && (
                <div>
                    {remainingProducts.length > 0 && (
                        <div style={{ padding: '0.5rem 1rem', background: '#f8fafc', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <button onClick={(e) => { e.stopPropagation(); onSaveAllRevenue(remainingProducts); }}
                                style={{ background: '#1d4ed8', color: 'white', border: 'none', padding: '0.35rem 0.75rem', borderRadius: '0.4rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                                Alle übernehmen ({remainingProducts.length})
                            </button>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                                {savedCount > 0 ? `${savedCount} von ${products.length} bereits übernommen` : `${remainingProducts.length} Produkte`}
                            </span>
                        </div>
                    )}
                    {filtered.length > 0 ? (
                        <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                            {filtered.map(p => <RevenuePriceRow key={p.sku} p={p} isSaved={!!savedPriceSkus[p.sku]} onToggleSave={onToggleRevenueSave} />)}
                        </div>
                    ) : (
                        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Keine Produkte.</div>
                    )}
                </div>
            )}
        </div>
    );
}

function PriceSuggestionCard({ icon, iconColor, bgColor, borderColor, title, description, products, search, savedPriceSkus, onTogglePriceSave, onSaveAllPrices, mode = 'lowMargin' }) {
    const [isOpen, setIsOpen] = useState(false);

    const remainingProducts = useMemo(() => products.filter(p => !savedPriceSkus[p.sku]), [products, savedPriceSkus]);

    const filtered = useMemo(() => {
        if (!search) return remainingProducts;
        const s = search.toLowerCase();
        return remainingProducts.filter(r => r.sku?.toLowerCase().includes(s) || r.name?.toLowerCase().includes(s));
    }, [remainingProducts, search]);

    const savedCount = products.length - remainingProducts.length;

    return (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div onClick={() => setIsOpen(!isOpen)} style={{ padding: '1rem 1.25rem', background: bgColor, borderBottom: isOpen ? `1px solid ${borderColor}` : 'none', cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ flexShrink: 0, color: iconColor }}>{icon}</div>
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.2rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-color)' }}>{title}</span>
                        <span style={{ background: borderColor + '33', color: iconColor, fontSize: '0.78rem', fontWeight: 600, padding: '0.15rem 0.55rem', borderRadius: '1rem', border: `1px solid ${borderColor}` }}>{remainingProducts.length} Produkte</span>
                        {savedCount > 0 && <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#10b981', background: '#f0fdf4', padding: '0.15rem 0.55rem', borderRadius: '1rem', border: '1px solid #86efac' }}>{savedCount} übernommen</span>}
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{description}</p>
                </div>
                <div style={{ flexShrink: 0, color: 'var(--text-muted)' }}>{isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</div>
            </div>
            {isOpen && (
                <div>
                    {remainingProducts.length > 0 && (
                        <div style={{ padding: '0.5rem 1rem', background: '#f8fafc', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <button onClick={(e) => { e.stopPropagation(); onSaveAllPrices(remainingProducts, mode); }}
                                style={{ background: '#1d4ed8', color: 'white', border: 'none', padding: '0.35rem 0.75rem', borderRadius: '0.4rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                                Alle übernehmen ({remainingProducts.length})
                            </button>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                                {savedCount > 0 ? `${savedCount} von ${products.length} bereits übernommen` : `${remainingProducts.length} Produkte`}
                            </span>
                        </div>
                    )}
                    {filtered.length > 0 ? (
                        <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                            {filtered.map(p => <PriceSuggestionRow key={p.sku} p={p} isSaved={!!savedPriceSkus[p.sku]} onToggleSave={onTogglePriceSave} mode={mode} />)}
                        </div>
                    ) : (
                        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Keine Produkte.</div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function Empfehlungen() {
    const [allProducts, setAllProducts] = useState([]);
    const [auswertungData, setAuswertungData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [delistedSkus, setDelistedSkus] = useState(() => JSON.parse(localStorage.getItem(DELIST_KEY) || '{}'));
    const [adsOffSkus, setAdsOffSkus] = useState(() => JSON.parse(localStorage.getItem(ADS_OFF_KEY) || '{}'));
    const [scrapeProgress, setScrapeProgress] = useState(null);
    const pollRef = useRef(null);

    const saveAdsOff = (updated) => { setAdsOffSkus(updated); localStorage.setItem(ADS_OFF_KEY, JSON.stringify(updated)); };
    const toggleAdsOff = (sku, name) => {
        const updated = { ...adsOffSkus };
        if (updated[sku]) delete updated[sku];
        else updated[sku] = { sku, name, timestamp: new Date().toISOString() };
        saveAdsOff(updated);
    };
    const adsOffAll = (products) => {
        const updated = { ...adsOffSkus };
        products.forEach(p => { updated[p.sku] = { sku: p.sku, name: p.name, timestamp: new Date().toISOString() }; });
        saveAdsOff(updated);
    };
    const [savedPriceSkus, setSavedPriceSkus] = useState(() => {
        const all = JSON.parse(localStorage.getItem(PRICE_CHANGES_KEY) || '{}');
        const skuSet = {};
        Object.keys(all).forEach(k => skuSet[k] = true);
        return skuSet;
    });

    const saveDelist = (updated) => {
        setDelistedSkus(updated);
        localStorage.setItem(DELIST_KEY, JSON.stringify(updated));
    };

    const toggleDelist = (sku, name) => {
        const updated = { ...delistedSkus };
        if (updated[sku]) delete updated[sku];
        else updated[sku] = { sku, name, timestamp: new Date().toISOString() };
        saveDelist(updated);
    };

    const delistAll = (products) => {
        const updated = { ...delistedSkus };
        products.forEach(p => { updated[p.sku] = { sku: p.sku, name: p.name, timestamp: new Date().toISOString() }; });
        saveDelist(updated);
    };

    const delistNone = (products) => {
        const updated = { ...delistedSkus };
        products.forEach(p => { delete updated[p.sku]; });
        saveDelist(updated);
    };

    // Use shared calcPriceSuggestion function (defined outside component)

    const checkDuplicate = (sku, name, newBrutto, newMarge) => {
        const existing = JSON.parse(localStorage.getItem(PRICE_CHANGES_KEY) || '{}');
        if (existing[sku]) {
            const alt = existing[sku];
            return confirm(`Für "${name}" (${sku}) existiert bereits eine Preisänderung:\n\nAktuell: ${alt.neuerBrutto.toFixed(2)} € (Marge: ${alt.neueRealeMarge?.toFixed(1)}%)\nNeu: ${newBrutto.toFixed(2)} € (Marge: ${newMarge?.toFixed(1)}%)\n\nBestehende Änderung ersetzen?`);
        }
        return true;
    };

    const savePriceSuggestion = (product, newVkBrutto, newVkNetto, newEstMarge) => {
        if (!checkDuplicate(product.sku, product.name, newVkBrutto, newEstMarge)) return;
        const existing = JSON.parse(localStorage.getItem(PRICE_CHANGES_KEY) || '{}');
        existing[product.sku] = {
            sku: product.sku,
            name: product.name,
            alterBrutto: product.vkBrutto,
            alterNetto: product.vkNetto,
            neuerBrutto: parseFloat(newVkBrutto.toFixed(2)),
            neuerNetto: parseFloat(newVkNetto.toFixed(4)),
            alteRealeMarge: product.handelsspanne ? product.handelsspanne - BETRIEBSKOSTEN_PCT - WERBEKOSTEN_PCT : null,
            neueRealeMarge: newEstMarge,
            neueMargeStueck: newVkNetto - (product.ekNetto || 0) - (newVkNetto * (BETRIEBSKOSTEN_PCT + WERBEKOSTEN_PCT) / 100),
            preisdiffEur: parseFloat((newVkBrutto - (product.vkBrutto || 0)).toFixed(2)),
            preisdiffPct: product.vkBrutto > 0 ? ((newVkBrutto - product.vkBrutto) / product.vkBrutto) * 100 : null,
            margenopferPp: product.handelsspanne ? newEstMarge - (product.handelsspanne - BETRIEBSKOSTEN_PCT - WERBEKOSTEN_PCT) : null,
            timestamp: new Date().toISOString(),
        };
        localStorage.setItem(PRICE_CHANGES_KEY, JSON.stringify(existing));
        setSavedPriceSkus(prev => ({ ...prev, [product.sku]: true }));
    };

    const togglePriceSave = (product, newVkBrutto, newVkNetto, newEstMarge) => {
        if (savedPriceSkus[product.sku]) {
            // Remove
            const existing = JSON.parse(localStorage.getItem(PRICE_CHANGES_KEY) || '{}');
            delete existing[product.sku];
            localStorage.setItem(PRICE_CHANGES_KEY, JSON.stringify(existing));
            setSavedPriceSkus(prev => { const n = { ...prev }; delete n[product.sku]; return n; });
        } else {
            savePriceSuggestion(product, newVkBrutto, newVkNetto, newEstMarge);
        }
    };

    const saveAllPrices = (products, mode = 'lowMargin') => {
        const existing = JSON.parse(localStorage.getItem(PRICE_CHANGES_KEY) || '{}');
        const newSkus = {};
        products.forEach(p => {
            const calc = calcPriceSuggestion(p, mode);
            if (!calc) return;
            existing[p.sku] = {
                sku: p.sku, name: p.name,
                alterBrutto: p.vkBrutto, alterNetto: p.vkNetto,
                neuerBrutto: parseFloat(calc.newVkBrutto.toFixed(2)),
                neuerNetto: parseFloat(calc.newVkNetto.toFixed(4)),
                alteRealeMarge: calc.oldEstMarge,
                neueRealeMarge: calc.newEstMarge,
                neueMargeStueck: calc.newVkNetto - (p.ekNetto || 0) - (calc.newVkNetto * (BETRIEBSKOSTEN_PCT + WERBEKOSTEN_PCT) / 100),
                preisdiffEur: parseFloat((calc.newVkBrutto - (p.vkBrutto || 0)).toFixed(2)),
                preisdiffPct: p.vkBrutto > 0 ? ((calc.newVkBrutto - p.vkBrutto) / p.vkBrutto) * 100 : null,
                margenopferPp: calc.newEstMarge - calc.oldEstMarge,
                timestamp: new Date().toISOString(),
            };
            newSkus[p.sku] = true;
        });
        localStorage.setItem(PRICE_CHANGES_KEY, JSON.stringify(existing));
        setSavedPriceSkus(prev => ({ ...prev, ...newSkus }));
    };

    const toggleRevenueSave = (product, newBrutto, newNetto, newMargeProz, newMargeSt) => {
        if (savedPriceSkus[product.sku]) {
            const existing = JSON.parse(localStorage.getItem(PRICE_CHANGES_KEY) || '{}');
            delete existing[product.sku];
            localStorage.setItem(PRICE_CHANGES_KEY, JSON.stringify(existing));
            setSavedPriceSkus(prev => { const n = { ...prev }; delete n[product.sku]; return n; });
        } else {
            if (!checkDuplicate(product.sku, product.name, newBrutto, newMargeProz)) return;
            const existing = JSON.parse(localStorage.getItem(PRICE_CHANGES_KEY) || '{}');
            existing[product.sku] = {
                sku: product.sku, name: product.name,
                alterBrutto: product.vkBrutto, alterNetto: product.vkNetto,
                neuerBrutto: parseFloat(newBrutto.toFixed(2)),
                neuerNetto: parseFloat(newNetto.toFixed(4)),
                alteRealeMarge: product.realeMargeProz,
                neueRealeMarge: newMargeProz,
                neueMargeStueck: newMargeSt,
                preisdiffEur: parseFloat((newBrutto - (product.vkBrutto || 0)).toFixed(2)),
                preisdiffPct: product.vkBrutto > 0 ? ((newBrutto - product.vkBrutto) / product.vkBrutto) * 100 : null,
                margenopferPp: newMargeProz !== null && product.realeMargeProz !== null ? newMargeProz - product.realeMargeProz : null,
                timestamp: new Date().toISOString(),
            };
            localStorage.setItem(PRICE_CHANGES_KEY, JSON.stringify(existing));
            setSavedPriceSkus(prev => ({ ...prev, [product.sku]: true }));
        }
    };

    const saveAllRevenue = (products) => {
        const existing = JSON.parse(localStorage.getItem(PRICE_CHANGES_KEY) || '{}');
        const newSkus = {};
        products.forEach(p => {
            const rec = p._rec;
            if (!rec) return;
            existing[p.sku] = {
                sku: p.sku, name: p.name,
                alterBrutto: p.vkBrutto, alterNetto: p.vkNetto,
                neuerBrutto: parseFloat(rec.newVkBrutto.toFixed(2)),
                neuerNetto: parseFloat(rec.newVkNetto.toFixed(4)),
                alteRealeMarge: p.realeMargeProz,
                neueRealeMarge: rec.newRealeMargeProz,
                neueMargeStueck: rec.newRealeMargeSt,
                preisdiffEur: parseFloat((rec.newVkBrutto - (p.vkBrutto || 0)).toFixed(2)),
                preisdiffPct: p.vkBrutto > 0 ? ((rec.newVkBrutto - p.vkBrutto) / p.vkBrutto) * 100 : null,
                margenopferPp: rec.newRealeMargeProz !== null && p.realeMargeProz !== null ? rec.newRealeMargeProz - p.realeMargeProz : null,
                timestamp: new Date().toISOString(),
            };
            newSkus[p.sku] = true;
        });
        localStorage.setItem(PRICE_CHANGES_KEY, JSON.stringify(existing));
        setSavedPriceSkus(prev => ({ ...prev, ...newSkus }));
    };

    const [auswScrapeProgress, setAuswScrapeProgress] = useState(null);

    const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
    const startPolling = (reason) => {
        if (pollRef.current) return;
        pollRef.current = setInterval(async () => {
            try {
                const [empfStatus, auswStatus, zeroRes, auswRes] = await Promise.all([
                    axios.get('/api/empfehlungen/scrape/status'),
                    axios.get('/api/auswertung/scrape/status'),
                    axios.get('/api/empfehlungen/zero-revenue'),
                    axios.get('/api/auswertung'),
                ]);
                setScrapeProgress(empfStatus.data);
                setAuswScrapeProgress(auswStatus.data);
                if (zeroRes.data.success) setAllProducts(zeroRes.data.data);
                if (auswRes.data.success) setAuswertungData(auswRes.data.data);
                if (!empfStatus.data.isRunning && !auswStatus.data.isRunning) stopPolling();
            } catch (e) {}
        }, 5000);
    };

    const startScraping = async () => {
        try {
            const res = await axios.post('/api/empfehlungen/scrape/start');
            if (res.data.success) {
                setScrapeProgress({ isRunning: true, total: 0, completed: 0, failed: [], completedIds: [] });
                startPolling('empf');
            }
        } catch (e) {
            if (e.response?.status === 409) alert(e.response.data.error);
            else alert('Netzwerkfehler.');
        }
    };

    useEffect(() => {
        Promise.all([
            axios.get('/api/empfehlungen/zero-revenue'),
            axios.get('/api/auswertung'),
            axios.get('/api/empfehlungen/scrape/status'),
            axios.get('/api/auswertung/scrape/status'),
        ])
            .then(([zeroRes, auswRes, empfStatus, auswStatus]) => {
                if (zeroRes.data.success) setAllProducts(zeroRes.data.data);
                if (auswRes.data.success) setAuswertungData(auswRes.data.data);
                const anyRunning = empfStatus.data.isRunning || auswStatus.data.isRunning;
                if (empfStatus.data.isRunning) setScrapeProgress(empfStatus.data);
                if (auswStatus.data.isRunning) setAuswScrapeProgress(auswStatus.data);
                if (anyRunning) startPolling('init');
            })
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
        return () => stopPolling();
    }, []);

    const groups = useMemo(() => {
        const highMargin = [], lowMargin = [], negative = [], noData = [];
        allProducts.forEach(p => {
            if (p.handelsspanne === null) { noData.push(p); return; }
            const estMarge = p.handelsspanne - BETRIEBSKOSTEN_PCT - WERBEKOSTEN_PCT;
            if (estMarge > 10) highMargin.push(p);
            else if (estMarge >= 0) lowMargin.push(p);
            else negative.push(p);
        });
        const sortByEstMarge = (a, b) => ((b.handelsspanne || 0) - BETRIEBSKOSTEN_PCT - WERBEKOSTEN_PCT) - ((a.handelsspanne || 0) - BETRIEBSKOSTEN_PCT - WERBEKOSTEN_PCT);
        highMargin.sort(sortByEstMarge);
        lowMargin.sort(sortByEstMarge);
        negative.sort(sortByEstMarge);
        noData.sort((a, b) => (b.vkBrutto || 0) - (a.vkBrutto || 0));
        return { highMargin, lowMargin, negative, noData };
    }, [allProducts]);

    // Calculate revenue recommendation for a product
    const calcRevenueRec = (p, minMargin) => {
        const s = p.currentScrape;
        if (!s || !p.mwst || p.ekNetto === null) return null;
        const mwstFactor = 1 + p.mwst / 100;
        const betriebSt = p.betriebskostenStueck || 0;
        const werbeSt = (p.werbekosten && p.q1Menge > 0) ? p.werbekosten / p.q1Menge : 0;
        const isRank1 = s.hr_rank === 1;

        if (isRank1 && s.rank2_price && s.rank2_price > 0) {
            // Already rank 1 → increase to rank2 - 0.05€
            const newBrutto = parseFloat((s.rank2_price - 0.05).toFixed(2));
            if (newBrutto <= (p.vkBrutto || 0)) return null;
            const newNetto = newBrutto / mwstFactor;
            const newMargeSt = newNetto - p.ekNetto - betriebSt - werbeSt;
            const newMargeProz = newNetto > 0 ? (newMargeSt / newNetto) * 100 : null;
            return { strategy: 'erhöhen', newVkBrutto: newBrutto, newVkNetto: newNetto, newRealeMargeProz: newMargeProz, newRealeMargeSt: newMargeSt };
        }

        if (!isRank1 && s.rank1_price && s.rank1_price > 0 && minMargin !== null) {
            // Not rank 1 → decrease to rank1 - 0.01€
            const newBrutto = parseFloat((s.rank1_price - 0.01).toFixed(2));
            const newNetto = newBrutto / mwstFactor;
            const newMargeSt = newNetto - p.ekNetto - betriebSt - werbeSt;
            const newMargeProz = newNetto > 0 ? (newMargeSt / newNetto) * 100 : null;
            if (newMargeProz !== null && newMargeProz >= minMargin) {
                return { strategy: 'senken', newVkBrutto: newBrutto, newVkNetto: newNetto, newRealeMargeProz: newMargeProz, newRealeMargeSt: newMargeSt };
            }
        }
        return null;
    };

    const revenueGroups = useMemo(() => {
        const ads = [], deep = [];
        const lowPriceRec = [], lowObserve = []; // -2% to +5%
        const midPriceRec = []; // 5-15%
        const highPriceRec = []; // 15%+

        auswertungData.forEach(p => {
            if (!p.umsatzNetto90d || p.umsatzNetto90d <= 0 || p.realeMargeProz === null) return;

            if (p.realeMargeProz < -2) {
                const m = p.realeMargeProz + (p.werbekostenAnteil || 0);
                if (m > 0) ads.push(p); else deep.push(p);
            } else if (p.realeMargeProz < 5) {
                // -2% to +5%: only recommend increase if rank 1
                const rec = calcRevenueRec(p, null); // null = don't try decrease
                if (rec && rec.strategy === 'erhöhen') {
                    lowPriceRec.push({ ...p, _rec: rec });
                } else {
                    lowObserve.push(p);
                }
            } else if (p.realeMargeProz < 15) {
                // 5-15%: increase if rank 1, decrease if margin stays >5%
                const rec = calcRevenueRec(p, 5);
                if (rec) midPriceRec.push({ ...p, _rec: rec });
            } else {
                // 15%+: increase if rank 1, decrease if margin stays >10%
                const rec = calcRevenueRec(p, 10);
                if (rec) highPriceRec.push({ ...p, _rec: rec });
            }
        });

        const sAsc = (a, b) => (a.realeMargeProz || 0) - (b.realeMargeProz || 0);
        const sDesc = (a, b) => (b.realeMargeProz || 0) - (a.realeMargeProz || 0);
        ads.sort(sAsc); deep.sort(sAsc); lowObserve.sort(sAsc);
        lowPriceRec.sort(sDesc); midPriceRec.sort(sDesc); highPriceRec.sort(sDesc);

        return { removeFromAds: ads, deepNegative: deep, lowPriceRec, lowObserve, midPriceRec, highPriceRec };
    }, [auswertungData]);

    const delistCount = Object.keys(delistedSkus).length;

    if (loading) return <div className="page-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}><div style={{ fontSize: '1.1rem', color: 'var(--text-muted)' }}>Daten werden geladen...</div></div>;
    if (error) return <div className="page-container"><div className="card" style={{ padding: '2rem', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>Fehler: {error}</div></div>;

    const delistProps = { delistable: true, delistedSkus, onToggleDelist: toggleDelist, onDelistAll: delistAll };

    return (
        <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ margin: 0 }}>Empfehlungen</h2>
                    {delistCount > 0 && (
                        <span style={{ fontSize: '0.85rem', color: '#10b981', fontWeight: 500 }}>
                            {delistCount} Produkte zur Auslistung markiert — sichtbar unter Preisänderungen
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={16} style={{ position: 'absolute', left: '10px', top: '9px', color: '#9ca3af' }} />
                        <input type="text" placeholder="Suche SKU / Name..." value={search} onChange={(e) => setSearch(e.target.value)}
                            style={{ padding: '0.45rem 0.8rem 0.45rem 2rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', width: '200px', fontSize: '0.85rem' }} />
                    </div>
                    {auswScrapeProgress?.isRunning && (
                        <span style={{ fontSize: '0.82rem', color: '#15803d', fontWeight: 500 }}>
                            Auswertung-Scrape: {auswScrapeProgress.completed}/{auswScrapeProgress.total}
                        </span>
                    )}
                    <button onClick={startScraping} disabled={scrapeProgress?.isRunning || auswScrapeProgress?.isRunning}
                        style={{ background: 'var(--success-color)', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: (scrapeProgress?.isRunning || auswScrapeProgress?.isRunning) ? 'wait' : 'pointer', opacity: (scrapeProgress?.isRunning || auswScrapeProgress?.isRunning) ? 0.7 : 1, fontWeight: 600, fontSize: '0.85rem' }}>
                        {scrapeProgress?.isRunning ? `Scraping... (${scrapeProgress.completed}/${scrapeProgress.total})` : 'Idealo Scrape starten'}
                    </button>
                </div>
            </div>

            {/* Outer card: No revenue */}
            <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Produkte ohne Umsatz in den letzten 3 Monaten</h3>
                <span style={{ fontSize: '0.83rem', color: 'var(--text-muted)', marginTop: '-0.25rem' }}>
                    {allProducts.length} Produkte — geschätzte Marge nach Abzug von {BETRIEBSKOSTEN_PCT}% Betriebskosten und {WERBEKOSTEN_PCT}% Werbekosten
                </span>

                <PriceSuggestionCard icon={<TrendingDown size={22} />} iconColor="#10b981" bgColor="#f0fdf4" borderColor="#86efac"
                    title="Preisvorschlag: Raum für Preissenkungen"
                    description="Über 10% geschätzte Marge. Vorschlag: Idealo Rang 1 (min. 5% Marge) oder Preis um 5% senken."
                    products={groups.highMargin} search={search} mode="highMargin"
                    savedPriceSkus={savedPriceSkus} onTogglePriceSave={togglePriceSave} onSaveAllPrices={saveAllPrices} />

                <PriceSuggestionCard icon={<TrendingDown size={22} />} iconColor="#f59e0b" bgColor="#fffbeb" borderColor="#fde68a"
                    title="Preisvorschlag: Marge senken"
                    description="Produkte mit 0–10% geschätzter Marge. Vorschlag: Marge um 5pp senken (bei >5%) oder auf 0% (bei ≤5%), um den Absatz anzukurbeln."
                    products={groups.lowMargin} search={search}
                    savedPriceSkus={savedPriceSkus} onTogglePriceSave={togglePriceSave} onSaveAllPrices={saveAllPrices} />

                <RecommendationCard icon={<Trash2 size={22} />} iconColor="#ef4444" bgColor="#fef2f2" borderColor="#fecaca"
                    title="Empfehlung: Auslistung"
                    description="Negative geschätzte Marge bei fehlendem Umsatz. Auslistung empfohlen."
                    products={groups.negative} search={search}
                    {...delistProps}
                    extraBadge={(() => {
                        const tw = groups.negative.reduce((s, p) => s + (p.werbekosten || 0), 0);
                        return tw > 0 ? <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#10b981', background: '#f0fdf4', padding: '0.15rem 0.55rem', borderRadius: '1rem', border: '1px solid #86efac' }}>Einsparpotenzial Werbung: {fmtEur(tw / 3)} / Monat</span> : null;
                    })()} />

                {groups.noData.length > 0 && (
                    <RecommendationCard icon={<AlertTriangle size={22} />} iconColor="#94a3b8" bgColor="#f8fafc" borderColor="#cbd5e1"
                        title="Keine Margendaten verfügbar"
                        description="Keine EK-/VK-Daten vorhanden."
                        products={groups.noData} search={search}
                        {...delistProps}
                        extraBadge={(() => {
                            const tw = groups.noData.reduce((s, p) => s + (p.werbekosten || 0), 0);
                            return tw > 0 ? <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#10b981', background: '#f0fdf4', padding: '0.15rem 0.55rem', borderRadius: '1rem', border: '1px solid #86efac' }}>Einsparpotenzial Werbung: {fmtEur(tw / 3)} / Monat</span> : null;
                        })()} />
                )}
            </div>

            {/* Outer card: With revenue */}
            <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Produkte mit Umsatz in den letzten 3 Monaten</h3>
                <span style={{ fontSize: '0.83rem', color: 'var(--text-muted)', marginTop: '-0.25rem' }}>
                    Analyse basierend auf tatsächlichen Kosten aus der Q1-Auswertung
                </span>

                <RecommendationCard icon={<Trash2 size={22} />} iconColor="#ef4444" bgColor="#fef2f2" borderColor="#fecaca"
                    title="Reale Marge unter -2% — Empfehlung: Auslistung prüfen"
                    description="Auch ohne Werbekosten bleibt die Marge negativ."
                    products={revenueGroups.deepNegative} search={search} RowComponent={RevenueProductRow}
                    {...delistProps}
                    extraBadge={(() => {
                        const tw = revenueGroups.deepNegative.reduce((s, p) => s + (p.werbekosten || 0), 0);
                        const tb = revenueGroups.deepNegative.reduce((s, p) => s + (p.betriebskosten || 0), 0);
                        return (<>
                            {tw > 0 && <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#10b981', background: '#f0fdf4', padding: '0.15rem 0.55rem', borderRadius: '1rem', border: '1px solid #86efac' }}>Einsparpotenzial Werbung: {fmtEur(tw / 3)} / Monat</span>}
                            {tb > 0 && <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#3b82f6', background: '#eff6ff', padding: '0.15rem 0.55rem', borderRadius: '1rem', border: '1px solid #93c5fd' }}>Einsparpotenzial Betriebskosten: {fmtEur(tb / 3)} / Monat</span>}
                        </>);
                    })()} />

                <RecommendationCard icon={<TrendingDown size={22} />} iconColor="#e85d04" bgColor="#fff7ed" borderColor="#fed7aa"
                    title="Reale Marge unter -2% — Empfehlung: Aus der Werbung nehmen"
                    description="Ohne Werbeausgaben wäre die Marge positiv."
                    products={revenueGroups.removeFromAds} search={search} RowComponent={RevenueProductRow}
                    rowProps={{ showMargeOhneWerbung: true }}
                    delistable={true} delistedSkus={adsOffSkus} onToggleDelist={toggleAdsOff} onDelistAll={adsOffAll}
                    extraBadge={(() => {
                        const tw = revenueGroups.removeFromAds.reduce((s, p) => s + (p.werbekosten || 0), 0);
                        const m = tw / 3;
                        return m > 0 ? <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#10b981', background: '#f0fdf4', padding: '0.15rem 0.55rem', borderRadius: '1rem', border: '1px solid #86efac' }}>Einsparpotenzial: {fmtEur(m)} / Monat</span> : null;
                    })()} />

                {/* -2% to +5%: Price increase recommendations */}
                {revenueGroups.lowPriceRec.length > 0 && (
                    <RevenuePriceCard icon={<TrendingUp size={22} />} iconColor="#10b981" bgColor="#f0fdf4" borderColor="#86efac"
                        title="Marge -2% bis 5% — Preiserhöhung (Rang 1)"
                        description="Diese Produkte sind bereits auf Idealo Rang 1. Preis kann auf 5 Cent unter Rang 2 erhöht werden."
                        products={revenueGroups.lowPriceRec} search={search}
                        savedPriceSkus={savedPriceSkus} onToggleRevenueSave={toggleRevenueSave} onSaveAllRevenue={saveAllRevenue} />
                )}

                {/* -2% to +5%: Observe */}
                {revenueGroups.lowObserve.length > 0 && (
                    <RecommendationCard icon={<AlertTriangle size={22} />} iconColor="#f59e0b" bgColor="#fffbeb" borderColor="#fde68a"
                        title="Geringe Marge — Beobachten"
                        description="Marge zwischen -2% und +5%, nicht auf Rang 1 oder keine Idealo-Daten. Keine Preisempfehlung möglich."
                        products={revenueGroups.lowObserve} search={search} RowComponent={RevenueProductRow} />
                )}

                {/* 5-15%: Price recommendations */}
                {revenueGroups.midPriceRec.length > 0 && (
                    <RevenuePriceCard icon={<TrendingUp size={22} />} iconColor="#3b82f6" bgColor="#eff6ff" borderColor="#93c5fd"
                        title="Marge 5–15% — Preisoptimierung"
                        description="Rang 1: Preis erhöhen auf 5 Cent unter Rang 2. Nicht Rang 1: Preis senken auf Rang 1, min. 5% reale Marge."
                        products={revenueGroups.midPriceRec} search={search}
                        savedPriceSkus={savedPriceSkus} onToggleRevenueSave={toggleRevenueSave} onSaveAllRevenue={saveAllRevenue} />
                )}

                {/* 15%+: Price recommendations */}
                {revenueGroups.highPriceRec.length > 0 && (
                    <RevenuePriceCard icon={<CheckCircle size={22} />} iconColor="#10b981" bgColor="#f0fdf4" borderColor="#86efac"
                        title="Top-Performer (>15%) — Preisoptimierung"
                        description="Rang 1: Preis erhöhen auf 5 Cent unter Rang 2. Nicht Rang 1: Preis senken auf Rang 1, min. 10% reale Marge."
                        products={revenueGroups.highPriceRec} search={search}
                        savedPriceSkus={savedPriceSkus} onToggleRevenueSave={toggleRevenueSave} onSaveAllRevenue={saveAllRevenue} />
                )}
            </div>
        </div>
    );
}
