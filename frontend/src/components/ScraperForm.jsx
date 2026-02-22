import React from 'react';

const ScraperForm = ({ urlInput, setUrlInput, handleSubmit, isLoading, error }) => {
    return (
        <div className="glass-panel">
            <form onSubmit={handleSubmit}>
                <div className="input-group">
                    <label htmlFor="urls" className="input-label">
                        Idealo URLs eingeben (eine pro Zeile oder durch Komma getrennt)
                    </label>
                    <textarea
                        id="urls"
                        className="url-input"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        placeholder="https://www.idealo.de/preisvergleich/OffersOfProduct/..."
                        disabled={isLoading}
                    />
                </div>

                {error && <div className="error-message" style={{ marginBottom: '1rem' }}>{error}</div>}

                <button
                    type="submit"
                    className="submit-btn"
                    disabled={isLoading || urlInput.trim().length === 0}
                >
                    {isLoading ? (
                        <>Scraping läuft...</>
                    ) : (
                        <>Jetzt Scrapen</>
                    )}
                </button>
            </form>
        </div>
    );
};

export default ScraperForm;
