import React, { useState, useEffect } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import { LanguageProvider } from './lib/LanguageContext';
import { ThemeProvider } from './lib/ThemeContext';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return (
    <ThemeProvider>
      {loading ? (
        <div className="min-h-screen bg-[#F5F5F0] dark:bg-[#121212] flex items-center justify-center transition-colors">
          <div className="w-12 h-12 border-4 border-[#5A5A40] border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <LanguageProvider>
          {user ? <Dashboard /> : <Auth />}
        </LanguageProvider>
      )}
    </ThemeProvider>
  );
}
