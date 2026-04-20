import React, { createContext, useContext, useState, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [token, setToken] = useState(() => localStorage.getItem('hr_token'));
    const [user, setUser] = useState(() => {
        try { return JSON.parse(localStorage.getItem('hr_user')); } catch { return null; }
    });

    const login = useCallback((token, userData) => {
        localStorage.setItem('hr_token', token);
        localStorage.setItem('hr_user', JSON.stringify(userData));
        setToken(token);
        setUser(userData);
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem('hr_token');
        localStorage.removeItem('hr_user');
        setToken(null);
        setUser(null);
    }, []);

    return (
        <AuthContext.Provider value={{ token, user, login, logout, isAuthenticated: !!token }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
