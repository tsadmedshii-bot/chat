import { useCallback, useEffect, useState } from 'react';
import type { User } from '../../shared/src/types';
import { heartbeat, logout, me } from './api';
import Home from './pages/Home';
import Auth from './pages/Auth';
import Rooms from './pages/Rooms';
import Members from './pages/Members';
import Direct from './pages/Direct';
import Profile from './pages/Profile';
import ProfileModal from './components/ProfileModal';
import { Avatar, RoleBadge } from './components/UserBadge';

type View = 'home' | 'rooms' | 'direct' | 'members' | 'profile';

export default function App() {
  const [view, setView] = useState<View>('home');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  /** Гишүүдийн жагсаалтаас «💬 Чат» дарсан хэрэглэгч — DM хуудас нээнэ. */
  const [dmPartnerId, setDmPartnerId] = useState<number | null>(null);
  /** Профайл цонхоор харж буй хэрэглэгч — null бол цонх хаалттай. */
  const [profileUserId, setProfileUserId] = useState<number | null>(null);

  useEffect(() => {
    me()
      .then((u) => setUser(u))
      .catch(() => {
        // Нэвтрээгүй — алдааг үл тооно.
      })
      .finally(() => setLoading(false));
  }, []);

  // Онлайн төлөв: 30 секунд тутамд heartbeat илгээнэ.
  useEffect(() => {
    if (!user) return;
    void heartbeat().catch(() => {
      // Heartbeat бүтэлгүйтвэл чимээгүй өнгөрнө.
    });
    const t = window.setInterval(() => {
      void heartbeat().catch(() => {
        // Heartbeat бүтэлгүйтвэл чимээгүй өнгөрнө.
      });
    }, 30000);
    return () => window.clearInterval(t);
  }, [user]);

  const handleAuthDone = useCallback((u: User) => {
    setUser(u);
    setView('home');
  }, []);

  function handleLogout() {
    logout();
    setUser(null);
    setView('home');
    setDmPartnerId(null);
  }

  function openDm(partnerId: number) {
    setDmPartnerId(partnerId);
    setView('direct');
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
            <button type="button" className={view === 'direct' ? 'active' : ''} onClick={() => setView('direct')}>
              💬 Хувь чат
            </button>
            {isAdmin && (
              <button type="button" className={view === 'members' ? 'active' : ''} onClick={() => setView('members')}>
                👑 Гишүүд
              </button>
            )}
            <button type="button" className={view === 'profile' ? 'active' : ''} onClick={() => setView('profile')}>
              👤 Профайл
            </button>
          </nav>
          <div className="header-user">
            <Avatar user={user} size="small" showDot onClick={() => setView('profile')} />
            <span className="header-user-name">{user.name}</span>
            <RoleBadge role={user.role} />
            <button type="button" className="btn-ghost small header-logout" onClick={handleLogout}>
              Гарах
            </button>
          </div>
        </div>
      </header>
      <main className="container main-content">
        {view === 'home' && <Home user={user} onViewProfile={setProfileUserId} />}
        {view === 'rooms' && <Rooms user={user} onViewProfile={setProfileUserId} />}
        {view === 'direct' && (
          <Direct
            user={user}
            initialPartnerId={dmPartnerId}
            onPartnerOpened={() => setDmPartnerId(null)}
            onViewProfile={setProfileUserId}
          />
        )}
        {view === 'members' && <Members user={user} onOpenDm={openDm} onViewProfile={setProfileUserId} />}
        {view === 'profile' && <Profile user={user} onUserChange={setUser} />}
      </main>
      {profileUserId !== null && (
        <ProfileModal userId={profileUserId} meId={user.id} onClose={() => setProfileUserId(null)} onOpenDm={openDm} />
      )}
      <footer className="site-footer">
        <div className="container">
          <span>Чат — пост ба 2 өрөө 🌍 🏰</span>
        </div>
      </footer>
    </div>
  );
}
