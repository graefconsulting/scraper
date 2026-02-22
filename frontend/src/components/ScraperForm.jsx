import React, { useState } from 'react';

const ScraperForm = ({ savedUrlsCount, handleSubmit, isLoading, error }) => {
    const [urlInput, setUrlInput] = useState('');

    const onSubmit = (e) => {
        e.preventDefault();
        handleSubmit(urlInput);
    };

    return (
        <div className="glass-panel">
            <form onSubmit={onSubmit}>
                <div className="input-group">
                    <label htmlFor="urls" className="input-label">
                        Weitere Idealo URLs für diesen Lauf eingeben (optional)
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
                    disabled={isLoading || (savedUrlsCount === 0 && urlInput.trim().length === 0)}
                >
                    {isLoading ? (
                        <>Scraping läuft...</>
                    ) : (
                        <>Jetzt {savedUrlsCount > 0 ? `${savedUrlsCount} gespeicherte + weitere ` : ''}Scrapen</>
                    )}
                </button>
            </form>
        </div>
    );
};

export default ScraperForm;
