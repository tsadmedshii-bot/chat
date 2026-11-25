import { useCallback, useEffect, useState } from 'react';
import type { User } from '../../shared/src/types';
import { ApiError, BAN_EVENT, heartbeat, logout, me } from './api';
import Home from './pages/Home';
import Auth from './pages/Auth';
import Rooms from './pages/Rooms';
import Members from './pages/Members';
import Direct from './pages/Direct';
import Profile from './pages/Profile';
import ProfileModal from './components/ProfileModal';
import BanNotice from './components/BanNotice';
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
  /** Бандуулсан мэдэгдэл — нэвтэрсэн үедээ бандуулсан, эсвэл бантай
      хаягаар апп нээсэн үед дэлгэц дүүрэн харуулна. */
  const [ban, setBan] = useState<{ bannedUntil: string | null } | null>(null);

  // Ямар ч хүсэлт бангийн 401 буцаавал (жишээ нь сессийн дундуур бандуулсан)
  // токеныг арилгаж, дэлгэц дүүрэн бангийн мэдэгдэл харуулна.
  useEffect(() => {
    const onBan = (e: Event) => {
      const detail = (e as CustomEvent<{ bannedUntil: string | null }>).detail;
      logout();
      setUser(null);
      setBan({ bannedUntil: detail?.bannedUntil ?? null });
    };
    window.addEventListener(BAN_EVENT, onBan);
    return () => window.removeEventListener(BAN_EVENT, onBan);
  }, []);

  useEffect(() => {
    me()
      .then((u) => setUser(u))
      .catch((err) => {
        // Бантай хаягаар нээсэн бол нэвтрэх хуудас руу чимээгүй шилжүүлэхгүй —
        // бангийн мэдэгдэл харуулна. Бусад алдааг үл тооно.
        if (err instanceof ApiError && err.banned) {
          setBan({ bannedUntil: err.bannedUntil ?? null });
        }
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
    setBan(null);
    setUser(u);
    setView('home');
  }, []);

  function handleLogout() {
    logout();
    setBan(null);
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
    if (ban) {
      return (
        <div className="auth-wrap">
          <div className="auth-card">
            <BanNotice bannedUntil={ban.bannedUntil} />
            <button type="button" className="btn-ghost" onClick={() => setBan(null)}>
              Өөр хаягаар нэвтрэх
            </button>
          </div>
        </div>
      );
    }
    return <Auth onDone={handleAuthDone} />;
  }

  const isAdmin = user.role === 'admin';

  return (
    <div className={view === 'rooms' ? 'app-rooms' : undefined}>
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
              💬 Чат
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
      <main className={view === 'rooms' ? 'main-content chat-full-main' : 'container main-content'}>
        {view === 'home' && <Home user={user} onViewProfile={setProfileUserId} onUserChange={setUser} />}
        {view === 'rooms' && <Rooms user={user} onViewProfile={setProfileUserId} />}
        {view === 'direct' && (
          <Direct
            user={user}
            initialPartnerId={dmPartnerId}
            onPartnerOpened={() => setDmPartnerId(null)}
            onViewProfile={setProfileUserId}
          />
        )}
        {view === 'members' && <Members user={user} onOpenDm={openDm} onViewProfile={setProfileUserId} onUserChange={setUser} />}
        {view === 'profile' && <Profile user={user} onUserChange={setUser} onAccountDeleted={handleLogout} />}
      </main>
      {profileUserId !== null && (
        <ProfileModal userId={profileUserId} viewer={user} onClose={() => setProfileUserId(null)} onOpenDm={openDm} onUserChange={setUser} />
      )}
      <footer className="site-footer">
        <div className="container">
          <span>Чат — пост ба нийтийн чат 💬</span>
        </div>
      </footer>
    </div>
  );
}
