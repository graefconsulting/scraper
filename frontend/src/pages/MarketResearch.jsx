import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Search, RotateCw, Clock } from 'lucide-react';

export default function MarketResearch() {
    const [researchData, setResearchData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchResearch();
    }, []);

    const fetchResearch = async () => {
        setLoading(true);
        try {
            const res = await axios.get('http://72.61.80.21:3000/api/market-research');
            if (res.data.success) {
                // Sort to ensure specific order if needed, but backend already orders by created_at DESC
                setResearchData(res.data.data);
            } else {
                setError(res.data.error || 'Fehler beim Laden der Marktforschung');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const startResearch = async () => {
        if (!window.confirm("Achtung: Dies startet einen neuen API-Call zu OpenRouter (Perplexity) für alle 3 Analysen. Dies kann 30-90 Sekunden dauern und verbraucht API-Credits. Fortfahren?")) {
            return;
        }

        setIsRunning(true);
        setError(null);
        try {
            const res = await axios.post('http://72.61.80.21:3000/api/market-research/run');
            if (res.data.success) {
                await fetchResearch();
            } else {
                setError(res.data.error || 'Fehler beim Starten der Marktforschung');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setIsRunning(false);
        }
    };

    const getTypeLabel = (type) => {
        switch (type) {
            case 'Trends': return 'Markttrends & Segmente';
            case 'Manufacturers': return 'Hersteller-Vergleich';
            case 'Competitors': return 'Wettbewerbsanalyse';
            default: return type;
        }
    };

    // Extract last update time
    const lastUpdate = researchData.length > 0 ? new Date(researchData[0].created_at).toLocaleString('de-DE') : 'Noch kein Research vorhanden';

    return (
        <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="header-row">
                <div>
                    <h2>Market Research</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                        <Clock size={16} />
                        <span>Stand: {loading ? 'Lade...' : lastUpdate}</span>
                    </div>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={startResearch}
                    disabled={isRunning || loading}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                    {isRunning ? <RotateCw className="animate-spin" size={18} /> : <Search size={18} />}
                    {isRunning ? 'Research läuft...' : 'Neuen Research starten'}
                </button>
            </div>

            {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: 'var(--danger-color)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                    <strong>Fehler:</strong> {error}
                </div>
            )}

            {loading ? (
                <div style={{ textAlign: 'center', padding: '4rem' }}>
                    <span className="animate-spin" style={{ display: 'inline-block' }}>↻</span> Lade Marktdaten...
                </div>
            ) : researchData.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    Noch keine Marktforschungsergebnisse vorhanden. Klicke oben auf "Neuen Research starten".
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    {researchData.map((item) => (
                        <div key={item.id} className="card" style={{ padding: '2rem' }}>
                            <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                                <h3 style={{ color: 'var(--primary-color)', fontSize: '1.3rem' }}>{getTypeLabel(item.research_type)}</h3>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Prompt: {item.prompt.substring(0, 100)}...</div>
                            </div>
                            <div
                                style={{
                                    whiteSpace: 'pre-wrap',
                                    lineHeight: '1.6',
                                    color: 'var(--text-color)',
                                    fontSize: '0.95rem',
                                    background: '#f8fafc',
                                    padding: '1.5rem',
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid var(--border-color)'
                                }}
                            >
                                {item.raw_response}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
