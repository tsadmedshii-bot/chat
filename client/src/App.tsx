import { useCallback, useEffect, useState } from 'react';
import type { User } from '../../shared/src/types';
import { logout, me } from './api';
import Home from './pages/Home';
import Auth from './pages/Auth';
import Rooms from './pages/Rooms';
import Members from './pages/Members';
import { RoleBadge } from './components/UserBadge';

type View = 'home' | 'rooms' | 'members';

export default function App() {
  const [view, setView] = useState<View>('home');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    me()
      .then((u) => setUser(u))
      .catch(() => {
        // Нэвтрээгүй — алдааг үл тооно.
      })
      .finally(() => setLoading(false));
  }, []);

  const handleAuthDone = useCallback((u: User) => {
    setUser(u);
    setView('home');
  }, []);

  function handleLogout() {
    logout();
    setUser(null);
    setView('home');
  }

  if (loading) {
    return <div className="loading">Ачааллаж байна…</div>;
  }

  if (!user) {
    return <Auth onDone={handleAuthDone} />;
  }

  const isAdmin = user.role === 'admin';

  return (
    <div>
      <header className="site-header">
        <div className="container header-inner">
          <button type="button" className="brand" onClick={() => setView('home')}>
            <span className="brand-icon">💬</span>
            <span className="brand-name">Чат</span>
          </button>
          <nav className="main-nav">
            <button type="button" className={view === 'home' ? 'active' : ''} onClick={() => setView('home')}>
              🏠 Нүүр
            </button>
            <button type="button" className={view === 'rooms' ? 'active' : ''} onClick={() => setView('rooms')}>
              💬 Өрөөнүүд
            </button>
            {isAdmin && (
              <button type="button" className={view === 'members' ? 'active' : ''} onClick={() => setView('members')}>
                👑 Гишүүд
              </button>
            )}
          </nav>
          <div className="header-user">
            <span className="header-user-badge">
              <RoleBadge role={user.role} />
              <span>{user.name}</span>
            </span>
            <button type="button" className="btn-ghost small" onClick={handleLogout}>
              Гарах
            </button>
          </div>
        </div>
      </header>
      <main className="container main-content">
        {view === 'home' && <Home user={user} />}
        {view === 'rooms' && <Rooms user={user} />}
        {view === 'members' && <Members user={user} />}
      </main>
      <footer className="site-footer">
        <div className="container">
          <span>Чат — пост ба 2 өрөө 🌍 🏰</span>
        </div>
      </footer>
    </div>
  );
}
