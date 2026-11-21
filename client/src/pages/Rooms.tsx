import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, Room, User } from '../../../shared/src/types';
import { ApiError, deleteMessage, listMessages, myPrivateAccess, requestPrivateAccess, sendMessage } from '../api';
import EmojiPicker from '../components/EmojiPicker';
import UserName from '../components/UserBadge';

const ROOMS: { id: Room; label: string; desc: string }[] = [
  { id: 'public', label: '🌍 Нийтийн өрөө', desc: 'Хүн бүрд нээлттэй' },
  { id: 'private', label: '🏰 Зөвшөөрөлтэй өрөө', desc: 'Зөвхөн зөвшөөрөлтэй гишүүд' },
];

export default function Rooms({ user }: { user: User }) {
  const [room, setRoom] = useState<Room>('public');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [access, setAccess] = useState<'approved' | 'pending' | 'denied' | 'none' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (r: Room) => {
    setError('');
    try {
      if (r === 'private') {
        const status = await myPrivateAccess();
        setAccess(status);
        if (status !== 'approved') {
          setMessages([]);
          return;
        }
      } else {
        setAccess(null);
      }
      setMessages(await listMessages(r));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Мессеж ачааллахад алдаа гарлаа.');
      setMessages([]);
    }
  }, []);

  useEffect(() => {
    void load(room);
  }, [room, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const canDelete = (m: ChatMessage): boolean =>
    m.author.id === user.id || user.role === 'admin' || user.role === 'moderator';

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!draft.trim()) return;
    setError('');
    try {
      const msg = await sendMessage(room, draft.trim());
      setMessages((prev) => [...prev, msg]);
      setDraft('');
      setShowEmoji(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Мессеж илгээхэд алдаа гарлаа.');
    }
  }

  async function onDelete(m: ChatMessage): Promise<void> {
    if (!window.confirm('Энэ мессежийг устгах уу?')) return;
    try {
      await deleteMessage(m.id);
      setMessages((prev) => prev.filter((x) => x.id !== m.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Мессеж устгахад алдаа гарлаа.');
    }
  }

  async function onRequest(): Promise<void> {
    setError('');
    setNotice('');
    try {
      const status = await requestPrivateAccess();
      setAccess(status);
      setNotice(
        status === 'approved'
          ? 'Танд аль хэдийн зөвшөөрөл байна.'
          : 'Хүсэлт илгээгдлээ. Том админ зөвшөөрөхөөр өрөө нээгдэнэ.',
      );
      if (status === 'approved') void load('private');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Хүсэлт илгээхэд алдаа гарлаа.');
    }
  }

  const locked = room === 'private' && access !== 'approved';

  return (
    <div className="rooms">
      <div className="room-tabs">
        {ROOMS.map((r) => (
          <button
            key={r.id}
            type="button"
            className={room === r.id ? 'room-tab active' : 'room-tab'}
            onClick={() => setRoom(r.id)}
          >
            <span className="room-tab-label">{r.label}</span>
            <span className="room-tab-desc">{r.desc}</span>
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {locked ? (
        <div className="locked-card">
          <div className="locked-icon">🏰</div>
          <h2>Зөвшөөрөлтэй өрөө</h2>
          <p>Энэ өрөөнд зөвхөн том админаас зөвшөөрөл авсан гишүүд орно.</p>
          {access === 'pending' ? (
            <p className="notice">Таны хүсэлт хүлээгдэж байна — админ зөвшөөрөхийг хүлээнэ үү.</p>
          ) : (
            <>
              {access === 'denied' && <p className="error">Таны хүсэлт татгалзагдсан байна. Дахин хүсэлт илгээж болно.</p>}
              <button type="button" className="btn-primary" onClick={() => void onRequest()}>
                Зөвшөөрөл хүсэх
              </button>
            </>
          )}
          <button type="button" className="btn-ghost" onClick={() => void load('private')}>
            Шинэчлэх
          </button>
        </div>
      ) : (
        <>
          <div className="message-list">
            {messages.length === 0 && <p className="empty">Одоохондоо мессеж алга — хамгийн түрүүнд та бичээрэй! ✨</p>}
            {messages.map((m) => (
              <div key={m.id} className={m.author.id === user.id ? 'message mine' : 'message'}>
                <span className="avatar">{m.author.name.slice(0, 1).toUpperCase()}</span>
                <div className="message-body">
                  <UserName user={m.author} />
                  <p>{m.content}</p>
                  <span className="message-time">
                    {new Date(m.createdAt).toLocaleString('mn-MN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {canDelete(m) && (
                  <button type="button" className="btn-danger-ghost small" onClick={() => void onDelete(m)}>
                    ✕
                  </button>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <form className="message-form" onSubmit={submit}>
            <button type="button" className="btn-ghost" onClick={() => setShowEmoji((v) => !v)}>
              😊
            </button>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Мессеж бичих…"
            />
            <button type="submit" className="btn-primary" disabled={!draft.trim()}>
              Илгээх
            </button>
          </form>
          {showEmoji && (
            <EmojiPicker onPick={(e) => setDraft((d) => d + e)} onClose={() => setShowEmoji(false)} />
          )}
        </>
      )}
    </div>
  );
}
