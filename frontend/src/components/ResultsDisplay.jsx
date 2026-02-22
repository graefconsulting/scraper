import React from 'react';

const ResultsDisplay = ({ results, isLoading }) => {
    if (isLoading) {
        return (
            <div className="loading-container">
                <div className="spinner"></div>
                <div className="loading-text">Live Web-Scraping aktiv... Bitte warten.</div>
            </div>
        );
    }

    if (!results || results.length === 0) {
        return null;
    }

    return (
        <div className="results-container">
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-main)', paddingLeft: '0.5rem' }}>
                Ergebnisse ({results.length})
            </h2>

            {results.map((result, idx) => (
                <div className="result-card" key={idx} style={{ animationDelay: `${idx * 0.1}s` }}>
                    <div className="result-header">
                        <div>
                            <h3 className="result-title" title={result.title}>{result.title}</h3>
                            <a href={result.url} target="_blank" rel="noopener noreferrer" className="result-url">
                                Originalseite öffnen ↗
                            </a>
                        </div>
                    </div>

                    <div className="result-body">
                        {!result.success ? (
                            <div className="error-message">
                                Fehler beim Scrapen: {result.error}
                            </div>
                        ) : result.offers && result.offers.length > 0 ? (
                            <div className="offers-list">
                                {result.offers.map((offer, oIdx) => (
                                    <div className={`offer-item ${offer.rank === 1 ? 'rank-1' : ''} ${offer.isHealthRise ? 'health-rise-highlight' : ''}`} key={oIdx}>
                                        <div className="shop-name">
                                            {offer.rank === 1 && <span style={{ marginRight: '8px' }}>🏆</span>}
                                            {offer.isHealthRise && <span style={{ marginRight: '8px' }}>⭐</span>}
                                            {offer.shop} <span className="rank-badge">(Platz {offer.rank}{offer.diff?.oldRank ? ` ← ${offer.diff.oldRank}` : ''})</span>
                                        </div>
                                        <div className="price-container" style={{ textAlign: 'right' }}>
                                            <div className="price">{offer.price} €</div>
                                            {offer.diff?.oldPrice && (
                                                <div className="price-diff" style={{
                                                    fontSize: '0.8rem',
                                                    marginTop: '0.25rem',
                                                    color: parseFloat(offer.price.replace(',', '.')) < parseFloat(offer.diff.oldPrice.replace(',', '.'))
                                                        ? 'var(--success-color)'
                                                        : parseFloat(offer.price.replace(',', '.')) > parseFloat(offer.diff.oldPrice.replace(',', '.'))
                                                            ? 'var(--error-color)'
                                                            : 'var(--text-muted)'
                                                }}>
                                                    Vorher: {offer.diff.oldPrice} €
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ color: 'var(--text-muted)' }}>Keine Angebote gefunden.</div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default ResultsDisplay;
