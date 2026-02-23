import React, { useEffect, useState } from 'react';

const ProductEvaluation = ({ savedUrls, results }) => {
    const [history, setHistory] = useState({});

    useEffect(() => {
        // Read the latest history from localStorage, which is updated whenever a scrape finishes
        try {
            const h = JSON.parse(localStorage.getItem('scrapeHistory') || '{}');
            setHistory(h);
        } catch (e) {
            console.error("Failed to parse scrapeHistory", e);
        }
    }, [results]); // Re-run whenever 'results' changes (i.e. a scrape just finished)

    const parsePrice = (priceStr) => {
        if (!priceStr) return null;
        // z.B. "12,99" -> 12.99
        const clean = priceStr.toString().replace(/[^0-9,.]/g, '').replace(',', '.');
        const val = parseFloat(clean);
        return isNaN(val) ? null : val;
    };

    const getBaseUrl = (fullUrl) => fullUrl.split('?')[0];

    const evaluationData = savedUrls
        .filter(u => u.purchasePrice !== null && u.purchasePrice !== undefined)
        .map(u => {
            const baseUrl = getBaseUrl(u.url);
            const histData = history[baseUrl];

            if (!histData) return null; // No scraping data yet for this product

            const ek = parseFloat(u.purchasePrice);

            // Health Rise Price
            const hrPriceRaw = histData.healthRise ? histData.healthRise.price : null;
            const hrPrice = parsePrice(hrPriceRaw);
            const hasHrRank = !!histData.healthRise;

            // Current Margin (HR)
            let currentMargin = null;
            let currentMarginStr = "";
            let trafficLight = "";

            if (hrPrice !== null && hrPrice > 0) {
                currentMargin = ((hrPrice - ek) / hrPrice) * 100;
                currentMarginStr = currentMargin.toFixed(2) + '%';
                if (currentMargin >= 15) trafficLight = '🟢';
                else if (currentMargin >= 0) trafficLight = '🟡';
                else trafficLight = '🔴';
            }

            // Lowest Market Price
            const lowestPriceRaw = histData.rank1 ? histData.rank1.price : null;
            const lowestPrice = parsePrice(lowestPriceRaw);

            // Price Change Indicator
            let arrow = "";
            if (histData.prevRank1Price && lowestPriceRaw) {
                const prevPrice = parsePrice(histData.prevRank1Price);
                if (prevPrice !== null && lowestPrice !== null) {
                    if (lowestPrice > prevPrice) arrow = '↑';
                    else if (lowestPrice < prevPrice) arrow = '↓';
                    else arrow = '→';
                }
            }

            // Recommended Price
            let recommendedPrice = null;
            let recommendedMargin = null;
            let recommendedMarginStr = "";
            if (lowestPrice !== null) {
                recommendedPrice = Math.max(0.01, lowestPrice - 0.10);
                if (recommendedPrice > 0) {
                    recommendedMargin = ((recommendedPrice - ek) / recommendedPrice) * 100;
                    recommendedMarginStr = recommendedMargin.toFixed(2) + '%';
                }
            }

            return {
                id: u.id,
                title: u.title || baseUrl,
                url: u.url,
                ek: ek,
                hrPriceRaw: hasHrRank ? (hrPriceRaw + ' €') : 'nicht gelistet',
                currentMarginStr: hasHrRank ? currentMarginStr : 'nicht gelistet',
                trafficLight: hasHrRank ? trafficLight : 'nicht gelistet',
                lowestPriceRaw: lowestPriceRaw ? `${lowestPriceRaw} € ${arrow}` : '-',
                recommendedPriceRaw: recommendedPrice !== null ? `${recommendedPrice.toFixed(2).replace('.', ',')} €` : '-',
                recommendedMarginStr: recommendedMarginStr || '-'
            };
        })
        .filter(Boolean); // remove nulls

    return (
        <div className="glass-panel">
            <h2 style={{ marginBottom: '1.5rem', color: 'var(--text-main)' }}>Produktauswertung</h2>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', minWidth: '800px' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                            <th style={{ padding: '1rem 0.5rem', color: 'var(--text-muted)' }}>Produkt</th>
                            <th style={{ padding: '1rem 0.5rem', color: 'var(--text-muted)' }}>Einkaufspreis</th>
                            <th style={{ padding: '1rem 0.5rem', color: 'var(--text-muted)' }}>Health Rise Preis</th>
                            <th style={{ padding: '1rem 0.5rem', color: 'var(--text-muted)' }}>Aktuelle Marge</th>
                            <th style={{ padding: '1rem 0.5rem', color: 'var(--text-muted)' }}>Ampel</th>
                            <th style={{ padding: '1rem 0.5rem', color: 'var(--text-muted)' }}>Niedrigster Preis</th>
                            <th style={{ padding: '1rem 0.5rem', color: 'var(--text-muted)' }}>Preisempfehlung</th>
                            <th style={{ padding: '1rem 0.5rem', color: 'var(--text-muted)' }}>Marge (Empf.)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {evaluationData.length === 0 ? (
                            <tr>
                                <td colSpan="8" style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    Keine auswertbaren Produkte. (Erfordere: Hinterlegter Einkaufspreis & durchgeführter Scraping-Lauf)
                                </td>
                            </tr>
                        ) : (
                            evaluationData.map((d) => (
                                <tr key={d.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <td style={{ padding: '1rem 0.5rem', fontWeight: 500, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.url}>
                                        <a href={d.url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary-color)', textDecoration: 'none' }}>{d.title}</a>
                                    </td>
                                    <td style={{ padding: '1rem 0.5rem' }}>{d.ek.toFixed(2).replace('.', ',')} €</td>
                                    <td style={{ padding: '1rem 0.5rem' }}>{d.hrPriceRaw}</td>
                                    <td style={{ padding: '1rem 0.5rem' }}>{d.currentMarginStr}</td>
                                    <td style={{ padding: '1rem 0.5rem', textAlign: 'center' }}>{d.trafficLight}</td>
                                    <td style={{ padding: '1rem 0.5rem' }}>{d.lowestPriceRaw}</td>
                                    <td style={{ padding: '1rem 0.5rem' }}>{d.recommendedPriceRaw}</td>
                                    <td style={{ padding: '1rem 0.5rem' }}>{d.recommendedMarginStr}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ProductEvaluation;
