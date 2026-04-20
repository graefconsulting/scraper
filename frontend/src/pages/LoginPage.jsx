import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const res = await axios.post('/api/auth/login', { username, password });
            login(res.data.token, { username: res.data.username, role: res.data.role });
            navigate(res.data.role === 'marketing' ? '/marketing' : '/auswertung', { replace: true });
        } catch (err) {
            setError(err.response?.data?.error || 'Anmeldung fehlgeschlagen.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minHeight: '100vh', background: 'var(--bg-color)'
        }}>
            <div style={{
                background: 'var(--surface-color)', borderRadius: '12px',
                padding: '2.5rem', width: 360,
                boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
                border: '1px solid var(--border-color)'
            }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <img src="/health-rise-logo.png" alt="Health Rise" style={{ maxWidth: 160 }} />
                </div>
                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                            Benutzername
                        </label>
                        <input
                            type="text"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            required
                            autoFocus
                            style={{
                                width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px',
                                border: '1px solid var(--border-color)', fontSize: '0.95rem',
                                background: 'var(--bg-color)', boxSizing: 'border-box',
                                outline: 'none'
                            }}
                        />
                    </div>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                            Passwort
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            style={{
                                width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px',
                                border: '1px solid var(--border-color)', fontSize: '0.95rem',
                                background: 'var(--bg-color)', boxSizing: 'border-box',
                                outline: 'none'
                            }}
                        />
                    </div>
                    {error && (
                        <div style={{
                            color: 'var(--danger-color)', fontSize: '0.875rem',
                            marginBottom: '1rem', padding: '0.5rem 0.75rem',
                            background: '#fef2f2', borderRadius: '6px',
                            border: '1px solid #fecaca'
                        }}>
                            {error}
                        </div>
                    )}
                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            width: '100%', padding: '0.7rem', borderRadius: '6px',
                            background: loading ? '#9ca3af' : 'var(--primary-color)',
                            color: '#fff', border: 'none', fontWeight: 600,
                            fontSize: '0.95rem', cursor: loading ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {loading ? 'Anmelden...' : 'Anmelden'}
                    </button>
                </form>
            </div>
        </div>
    );
}
