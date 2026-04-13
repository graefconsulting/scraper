import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import axios from 'axios';

export default function Einstellungen() {
    const [file, setFile] = useState(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [preview, setPreview] = useState(null);
    const [removeSkus, setRemoveSkus] = useState(new Set());
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const [error, setError] = useState(null);
    const fileInputRef = useRef(null);

    const handleFileChange = (e) => {
        const f = e.target.files[0];
        setFile(f || null);
        setPreview(null);
        setImportResult(null);
        setError(null);
    };

    const analyze = async () => {
        if (!file) return;
        setAnalyzing(true);
        setError(null);
        setPreview(null);
        setImportResult(null);
        try {
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf);
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

            if (rows.length === 0) {
                setError('Die Datei enthält keine Daten.');
                return;
            }
            if (!('Artikelnummer' in rows[0]) || !('Umsatz Netto' in rows[0])) {
                setError('Unbekanntes Format. Bitte die bekannte Excel-Vorlage verwenden (Spalten: Artikelnummer, Umsatz Netto, ...).');
                return;
            }

            const res = await axios.post('/api/upload/analyze', { rows });
            if (res.data.success) {
                setPreview(res.data);
                // Default: alle weggefallenen entfernen
                setRemoveSkus(new Set(res.data.weggefallen.map(p => p.id)));
            } else {
                setError('Fehler bei der Analyse: ' + res.data.error);
            }
        } catch (err) {
            setError('Fehler: ' + err.message);
        } finally {
            setAnalyzing(false);
        }
    };

    const doImport = async () => {
        if (!preview) return;
        setImporting(true);
        setError(null);
        try {
            const res = await axios.post('/api/upload/import', {
                rows: preview.top100,
                removeSkus: Array.from(removeSkus),
            });
            if (res.data.success) {
                setImportResult(res.data);
                setPreview(null);
                setFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
            } else {
                setError('Fehler beim Import: ' + res.data.error);
            }
        } catch (err) {
            setError('Fehler: ' + err.message);
        } finally {
            setImporting(false);
        }
    };

    const setAllRemove = () => setRemoveSkus(new Set(preview.weggefallen.map(p => p.id)));
    const setAllKeep = () => setRemoveSkus(new Set());

    const toggleSku = (id) => {
        setRemoveSkus(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    return (
        <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <h2 style={{ margin: 0 }}>Einstellungen</h2>

            {/* Upload Card */}
            <div className="card" style={{ maxWidth: '720px', padding: '1.75rem' }}>
                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.05rem' }}>Produktdaten importieren</h3>
                <p style={{ margin: '0 0 1.5rem 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    Excel-Datei (.xlsx) im bekannten Format hochladen. Die <strong>Top 100 nach Umsatz Netto</strong> werden in die Datenbank übernommen. Bestehende Produkte werden bei Änderungen aktualisiert.
                </p>

                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx"
                        onChange={handleFileChange}
                        style={{ flex: 1, padding: '0.45rem 0.6rem', border: '1px solid var(--border-color)', borderRadius: '0.5rem', fontSize: '0.9rem' }}
                    />
                    <button
                        onClick={analyze}
                        disabled={!file || analyzing}
                        style={{
                            background: 'var(--primary-color)',
                            color: 'white',
                            border: 'none',
                            padding: '0.55rem 1.25rem',
                            borderRadius: '0.5rem',
                            fontWeight: 600,
                            fontSize: '0.9rem',
                            cursor: !file || analyzing ? 'not-allowed' : 'pointer',
                            opacity: !file || analyzing ? 0.6 : 1,
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {analyzing ? '↻ Analysiere...' : 'Datei analysieren'}
                    </button>
                </div>

                {error && (
                    <div style={{ marginTop: '1rem', color: 'var(--danger-color)', fontSize: '0.9rem', padding: '0.75rem 1rem', background: '#fee2e2', borderRadius: '0.4rem', border: '1px solid #fca5a5' }}>
                        {error}
                    </div>
                )}
            </div>

            {/* Preview */}
            {preview && (
                <div style={{ maxWidth: '720px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                    {/* Summary */}
                    <div className="card" style={{ padding: '1.25rem' }}>
                        <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem' }}>Analyse-Ergebnis</h4>
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <span style={{ padding: '0.4rem 0.9rem', background: '#dcfce7', border: '1px solid #86efac', borderRadius: '0.5rem', color: '#15803d', fontWeight: 600, fontSize: '0.85rem' }}>
                                ✚ {preview.neu.length} neu
                            </span>
                            <span style={{ padding: '0.4rem 0.9rem', background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: '0.5rem', color: '#1d4ed8', fontWeight: 600, fontSize: '0.85rem' }}>
                                ↺ {preview.aktualisiert.length} aktualisiert
                            </span>
                            <span style={{ padding: '0.4rem 0.9rem', background: '#f1f5f9', border: '1px solid var(--border-color)', borderRadius: '0.5rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem' }}>
                                ✓ {preview.unveraendert.length} unverändert
                            </span>
                            {preview.weggefallen.length > 0 && (
                                <span style={{ padding: '0.4rem 0.9rem', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '0.5rem', color: '#92400e', fontWeight: 600, fontSize: '0.85rem' }}>
                                    ⚠ {preview.weggefallen.length} nicht in Top 100
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Weggefallen */}
                    {preview.weggefallen.length > 0 && (
                        <div className="card" style={{ padding: '1.25rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
                                <h4 style={{ margin: 0, fontSize: '0.95rem' }}>
                                    Produkte nicht mehr in Top 100 — was soll passieren?
                                </h4>
                                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                                    <button
                                        onClick={setAllRemove}
                                        style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem', border: '1px solid #fca5a5', background: '#fee2e2', color: '#b91c1c', borderRadius: '0.35rem', cursor: 'pointer', fontWeight: 600 }}
                                    >
                                        Alle entfernen
                                    </button>
                                    <button
                                        onClick={setAllKeep}
                                        style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem', border: '1px solid #86efac', background: '#dcfce7', color: '#15803d', borderRadius: '0.35rem', cursor: 'pointer', fontWeight: 600 }}
                                    >
                                        Alle behalten
                                    </button>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                {preview.weggefallen.map(p => (
                                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.55rem 0.75rem', background: '#f8fafc', borderRadius: '0.4rem', border: '1px solid var(--border-color)', fontSize: '0.88rem' }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ fontWeight: 600 }}>{p.id}</span>
                                            <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>{p.name}</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                                            <button
                                                onClick={() => { const n = new Set(removeSkus); n.delete(p.id); setRemoveSkus(n); }}
                                                style={{
                                                    padding: '0.25rem 0.65rem', borderRadius: '0.3rem', border: '1px solid', fontSize: '0.8rem', cursor: 'pointer',
                                                    background: !removeSkus.has(p.id) ? '#dcfce7' : 'transparent',
                                                    borderColor: !removeSkus.has(p.id) ? '#86efac' : 'var(--border-color)',
                                                    color: !removeSkus.has(p.id) ? '#15803d' : 'var(--text-muted)',
                                                    fontWeight: !removeSkus.has(p.id) ? 600 : 400,
                                                }}
                                            >Behalten</button>
                                            <button
                                                onClick={() => { const n = new Set(removeSkus); n.add(p.id); setRemoveSkus(n); }}
                                                style={{
                                                    padding: '0.25rem 0.65rem', borderRadius: '0.3rem', border: '1px solid', fontSize: '0.8rem', cursor: 'pointer',
                                                    background: removeSkus.has(p.id) ? '#fee2e2' : 'transparent',
                                                    borderColor: removeSkus.has(p.id) ? '#fca5a5' : 'var(--border-color)',
                                                    color: removeSkus.has(p.id) ? '#b91c1c' : 'var(--text-muted)',
                                                    fontWeight: removeSkus.has(p.id) ? 600 : 400,
                                                }}
                                            >Entfernen</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Confirm */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            onClick={doImport}
                            disabled={importing}
                            style={{
                                background: 'var(--success-color)',
                                color: 'white',
                                border: 'none',
                                padding: '0.7rem 2rem',
                                borderRadius: '0.5rem',
                                fontWeight: 600,
                                fontSize: '0.95rem',
                                cursor: importing ? 'wait' : 'pointer',
                                opacity: importing ? 0.7 : 1,
                            }}
                        >
                            {importing
                                ? '↻ Importiere...'
                                : `Import bestätigen (${preview.top100.length} Produkte${removeSkus.size > 0 ? `, ${removeSkus.size} entfernen` : ''})`
                            }
                        </button>
                    </div>
                </div>
            )}

            {/* Result */}
            {importResult && (
                <div style={{ maxWidth: '720px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '0.75rem', padding: '1.25rem' }}>
                    <div style={{ fontWeight: 600, color: '#15803d', marginBottom: '0.4rem' }}>✓ Import erfolgreich abgeschlossen</div>
                    <div style={{ fontSize: '0.9rem', color: '#166534' }}>
                        {importResult.total} Produkte importiert
                        {importResult.removed > 0 && ` · ${importResult.removed} entfernt`}
                    </div>
                </div>
            )}
        </div>
    );
}
