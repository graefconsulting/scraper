import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Search, RotateCw, Clock, ChevronLeft, ChevronRight } from 'lucide-react';

export default function MarketResearch() {
    const [researchData, setResearchData] = useState([]);
    const [versions, setVersions] = useState([]);
    const [currentVersionIndex, setCurrentVersionIndex] = useState(-1);

    const [loading, setLoading] = useState(true);
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        initData();
    }, []);

    const initData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await axios.get('/api/research/versions');
            if (res.data.success) {
                const fetchedVersions = res.data.data;
                setVersions(fetchedVersions);
                if (fetchedVersions.length > 0) {
                    // Start with the latest version
                    const latestIndex = fetchedVersions.length - 1;
                    setCurrentVersionIndex(latestIndex);
                    await loadResearchContent(fetchedVersions[latestIndex].run_id);
                } else {
                    setResearchData([]);
                }
            } else {
                setError(res.data.error || 'Fehler beim Laden der Versionen');
            }
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setLoading(false);
        }
    };

    const loadResearchContent = async (runId) => {
        try {
            const res = await axios.get(`/api/research/version/${runId}`);
            if (res.data.success) {
                setResearchData(res.data.data);
            } else {
                setError(res.data.error || 'Fehler beim Laden der Marktforschung');
            }
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        }
    };

    const startResearch = async () => {
        if (!window.confirm("Achtung: Dies startet einen neuen API-Call zu OpenRouter (Perplexity) und Anthropic (Claude Sonnet). Dies dauert ca. 30-90 Sekunden und verbraucht API-Credits. Fortfahren?")) {
            return;
        }

        setIsRunning(true);
        setError(null);
        try {
            const res = await axios.post('/api/market-research/run');
            if (res.data.success) {
                const previousMaxRunId = versions.length > 0 ? versions[versions.length - 1].run_id : 0;

                let done = false;
                let iterations = 0;
                // Poll every 5 seconds for a maximum of 45 iterations (225 seconds)
                while (!done && iterations < 45) {
                    iterations++;
                    await new Promise(r => setTimeout(r, 5000));
                    try {
                        const versRes = await axios.get('/api/research/versions');
                        if (versRes.data.success) {
                            const newVersions = versRes.data.data;
                            if (newVersions.length > 0) {
                                const newMax = newVersions[newVersions.length - 1].run_id;
                                if (newMax > previousMaxRunId) {
                                    // Check if the backend finished saving all 6 category rows
                                    const detailRes = await axios.get(`/api/research/version/${newMax}`);
                                    if (detailRes.data.success && detailRes.data.data.length >= 6) {
                                        done = true;
                                        await initData(); // Refetch versions and switch to newest
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        // Ignore sporadic network errors during polling loop
                    }
                }

                if (!done) {
                    setError("Zeitüberschreitung. Der Vorgang dauert ungewöhnlich lange, läuft aber womöglich im Hintergrund noch weiter. Bitte lade die Seite später neu.");
                }
            } else {
                setError(res.data.error || 'Fehler beim Starten der Marktforschung');
            }
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setIsRunning(false);
        }
    };

    const prevVersion = async () => {
        if (currentVersionIndex > 0) {
            const newIndex = currentVersionIndex - 1;
            setCurrentVersionIndex(newIndex);
            setLoading(true);
            await loadResearchContent(versions[newIndex].run_id);
            setLoading(false);
        }
    };

    const nextVersion = async () => {
        if (currentVersionIndex < versions.length - 1) {
            const newIndex = currentVersionIndex + 1;
            setCurrentVersionIndex(newIndex);
            setLoading(true);
            await loadResearchContent(versions[newIndex].run_id);
            setLoading(false);
        }
    };

    const getTypeLabel = (type) => {
        switch (type) {
            case 'trends': return 'Markttrends & Segmente';
            case 'natugena': return 'NatuGena';
            case 'vitaworld': return 'Vitaworld';
            case 'dr_niedermaier': return 'Dr. Niedermaier';
            case 'shop_naturpur': return 'Shop Naturpur';
            case 'vitaminversand24': return 'Vitaminversand24';
            default: return type;
        }
    };

    const renderCardContent = (item) => {
        let rawResult = item.result;

        if (!rawResult || rawResult.trim() === 'null') {
            return <div style={{ color: 'var(--text-muted)' }}>Keine Daten abgerufen</div>;
        }

        try {
            const data = JSON.parse(rawResult);

            if (data.parse_error) {
                return (
                    <div>
                        <div style={{ background: '#f1f5f9', color: 'var(--text-muted)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', fontSize: '0.85rem' }}>Rohdaten (JSON Parse Fehler in Claude API)</div>
                        <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', fontSize: '0.95rem', color: 'var(--text-color)' }}>{data.raw_text}</div>
                    </div>
                );
            }

            if (data.keine_daten) {
                return (
                    <div style={{ background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                        Keine aktuellen relevanten Aussagen / Produktdaten im abgerufenen Datensatz vorhanden.
                    </div>
                );
            }

            // Flags based on category
            const isManufacturer = ['natugena', 'vitaworld', 'dr_niedermaier'].includes(item.category);
            const isCompetitor = ['shop_naturpur', 'vitaminversand24'].includes(item.category);
            const isTrend = item.category === 'trends';

            return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {data.zusammenfassung && (
                        <div style={{ background: '#eff6ff', borderLeft: '4px solid var(--primary-color)', padding: '1rem', borderRadius: '0 var(--radius-sm) var(--radius-sm) 0', color: 'var(--text-color)' }}>
                            <strong style={{ display: 'block', marginBottom: '0.3rem', color: 'var(--primary-color)' }}>Zusammenfassung</strong>
                            <span style={{ fontSize: '0.95rem' }}>{data.zusammenfassung}</span>
                        </div>
                    )}

                    {isTrend && (
                        <>
                            {data.trending_kategorien && data.trending_kategorien.length > 0 && (
                                <div>
                                    <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-color)', fontSize: '1.05rem' }}>Trending Kategorien</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                                        {data.trending_kategorien.map((c, i) => (
                                            <div key={i} style={{ background: '#f8fafc', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                                                <strong style={{ color: 'var(--primary-color)' }}>{c.name}</strong>
                                                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>{c.beschreibung}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {data.regulierung && (
                                <div>
                                    <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-color)', fontSize: '1.05rem' }}>Regulierung und Recht</h4>
                                    <p style={{ fontSize: '0.95rem', color: 'var(--text-color)' }}>{data.regulierung}</p>
                                </div>
                            )}
                            {data.medien_wissenschaft && (
                                <div>
                                    <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-color)', fontSize: '1.05rem' }}>Medien & Wissenschaft</h4>
                                    <p style={{ fontSize: '0.95rem', color: 'var(--text-color)' }}>{data.medien_wissenschaft}</p>
                                </div>
                            )}
                        </>
                    )}

                    {(isManufacturer || isCompetitor) && (
                        <>
                            {data.neue_produkte && data.neue_produkte.length > 0 && (
                                <div>
                                    <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-color)', fontSize: '1.05rem' }}>Neue Produkte</h4>
                                    <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-color)', fontSize: '0.95rem' }}>
                                        {data.neue_produkte.map((x, i) => <li key={i} style={{ marginBottom: '0.2rem' }}>{x}</li>)}
                                    </ul>
                                </div>
                            )}

                            {((data.rabattaktionen && data.rabattaktionen.length > 0) || (data.aktuelle_aktionen && data.aktuelle_aktionen.length > 0)) && (
                                <div>
                                    <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-color)', fontSize: '1.05rem' }}>Aktuelle Aktionen</h4>
                                    <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-color)', fontSize: '0.95rem' }}>
                                        {(data.rabattaktionen || data.aktuelle_aktionen).map((x, i) => <li key={i} style={{ marginBottom: '0.2rem' }}>{x}</li>)}
                                    </ul>
                                </div>
                            )}

                            {isCompetitor && data.preishinweise && data.preishinweise.length > 0 && (
                                <div>
                                    <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-color)', fontSize: '1.05rem' }}>Preishinweise</h4>
                                    <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-color)', fontSize: '0.95rem' }}>
                                        {data.preishinweise.map((x, i) => <li key={i} style={{ marginBottom: '0.2rem' }}>{x}</li>)}
                                    </ul>
                                </div>
                            )}

                            {isManufacturer && data.direktverkauf && data.direktverkauf.aktiv && (
                                <div>
                                    <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-color)', fontSize: '1.05rem' }}>Direktverkauf (Aktiv)</h4>
                                    {data.direktverkauf.preisbeispiele && data.direktverkauf.preisbeispiele.length > 0 ? (
                                        <div style={{ background: '#fff', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', overflow: 'hidden', width: 'fit-content' }}>
                                            <table style={{ borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                                                <thead>
                                                    <tr style={{ background: '#f8fafc' }}>
                                                        <th style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontWeight: 600 }}>Produkt</th>
                                                        <th style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontWeight: 600, minWidth: '100px' }}>Preis</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {data.direktverkauf.preisbeispiele.map((p, i) => (
                                                        <tr key={i}>
                                                            <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--border-color)' }}>{p.produkt}</td>
                                                            <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--border-color)' }}>
                                                                {typeof p.preis === 'number' ? `${p.preis.toFixed(2)} €` : `${p.preis} €`}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)' }}>Es sind keine konkreten Preisbeispiele hinterlegt.</p>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            );
        } catch (e) {
            return (
                <div>
                    <div style={{ background: '#f1f5f9', color: 'var(--text-muted)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', fontSize: '0.85rem' }}>Rohdaten (Unstrukturiert)</div>
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', fontSize: '0.95rem', color: 'var(--text-color)' }}>{rawResult}</div>
                </div>
            );
        }
    };

    return (
        <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="header-row" style={{ paddingBottom: '0.5rem' }}>
                <div>
                    <h2>Market Research</h2>
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

            {/* Version Navigation Bar */}
            {versions.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', background: '#fff', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                    <button
                        onClick={prevVersion}
                        disabled={currentVersionIndex === 0 || isRunning || loading}
                        style={{ border: 'none', background: 'transparent', cursor: (currentVersionIndex === 0 || isRunning) ? 'not-allowed' : 'pointer', color: (currentVersionIndex === 0 || isRunning) ? 'var(--border-color)' : 'var(--text-color)', display: 'flex', alignItems: 'center' }}
                    >
                        <ChevronLeft size={20} />
                    </button>

                    <span style={{ fontWeight: 500, color: 'var(--text-color)', minWidth: '220px', textAlign: 'center', fontSize: '0.95rem' }}>
                        Version {currentVersionIndex + 1}/{versions.length} – {new Date(versions[currentVersionIndex].created_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })} Uhr
                    </span>

                    <button
                        onClick={nextVersion}
                        disabled={currentVersionIndex === versions.length - 1 || isRunning || loading}
                        style={{ border: 'none', background: 'transparent', cursor: (currentVersionIndex === versions.length - 1 || isRunning) ? 'not-allowed' : 'pointer', color: (currentVersionIndex === versions.length - 1 || isRunning) ? 'var(--border-color)' : 'var(--text-color)', display: 'flex', alignItems: 'center' }}
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>
            )}

            {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: 'var(--danger-color)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                    <strong>Fehler:</strong> {error}
                </div>
            )}

            {loading ? (
                <div style={{ textAlign: 'center', padding: '4rem' }}>
                    <span className="animate-spin" style={{ display: 'inline-block' }}>↻</span> {isRunning ? 'Erstelle JSON via Claude...' : 'Lade Marktdaten...'}
                </div>
            ) : researchData.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    Noch keine Marktforschungsergebnisse vorhanden. Klicke oben auf "Neuen Research starten".
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {researchData.map((item) => (
                        <div key={item.id} className="card" style={{ padding: '0' }}>
                            <div style={{ background: '#f8fafc', padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                                <h3 style={{ color: 'var(--primary-color)', fontSize: '1.2rem', margin: 0 }}>{getTypeLabel(item.category)}</h3>
                            </div>
                            <div style={{ padding: '1.5rem' }}>
                                {renderCardContent(item)}
                            </div>
                            <div style={{ padding: '0.75rem 1.5rem', background: '#f8fafc', borderTop: '1px solid var(--border-color)', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                                Abgerufen am {new Date(item.timestamp).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })} Uhr
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
