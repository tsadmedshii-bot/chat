import { useCallback, useEffect, useRef, useState } from 'react';
import type { DirectConversation, DirectMessage, User } from '../../../shared/src/types';
import { ApiError, deleteDm, listDmConversations, listDmMessages, sendDm } from '../api';
import { Avatar } from '../components/UserBadge';

export default function Direct({
  user,
  initialPartnerId,
  onPartnerOpened,
}: {
  user: User;
  initialPartnerId: number | null;
  onPartnerOpened: () => void;
}) {
  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const refreshConversations = useCallback(async () => {
    try {
      setConversations(await listDmConversations());
    } catch {
      // Жагсаалт ачааллахад алдаа гарвал чимээгүй өнгөрнө.
    }
  }, []);

  const loadThread = useCallback(
    async (partnerId: number) => {
      try {
        setMessages(await listDmMessages(partnerId));
        // Сервер уншсан гэж тэмдэглэсэн тул тоог шинэчилнэ.
        await refreshConversations();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Чат ачааллахад алдаа гарлаа.');
      }
    },
    [refreshConversations],
  );

  useEffect(() => {
    void refreshConversations();
  }, [refreshConversations]);

  // Жагсаалтыг 10 секунд тутамд шинэчилнэ — онлайн цэг, уншаагүй тоо шинэчлэгдэнэ.
  useEffect(() => {
    const t = window.setInterval(() => {
      void refreshConversations();
    }, 10000);
    return () => window.clearInterval(t);
  }, [refreshConversations]);

  // Нээлттэй чатыг 5 секунд тутамд шинэчилнэ.
  useEffect(() => {
    if (!selectedId) return;
    const t = window.setInterval(() => {
      void listDmMessages(selectedId)
        .then(setMessages)
        .catch(() => {
          // Poll алдаа гарвал чимээгүй өнгөрнө.
        });
    }, 5000);
    return () => window.clearInterval(t);
  }, [selectedId]);

  // Гишүүд хуудаснаас «💬 Чат» дарж ирсэн хэрэглэгчийг нээнэ.
  useEffect(() => {
    if (initialPartnerId == null) return;
    setSelectedId(initialPartnerId);
    void loadThread(initialPartnerId);
    onPartnerOpened();
  }, [initialPartnerId, loadThread, onPartnerOpened]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const selected = conversations.find((c) => c.user.id === selectedId) ?? null;

  const canDelete = (m: DirectMessage): boolean =>
    m.senderId === user.id || user.role === 'admin' || user.role === 'moderator';

  function selectPartner(partnerId: number): void {
    if (partnerId === selectedId) return;
    setSelectedId(partnerId);
    setMessages([]);
    void loadThread(partnerId);
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!draft.trim() || !selectedId) return;
    setError('');
    try {
      const msg = await sendDm(selectedId, draft.trim());
      setMessages((prev) => [...prev, msg]);
      setDraft('');
      await refreshConversations();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Мессеж илгээхэд алдаа гарлаа.');
    }
  }

  async function onDelete(m: DirectMessage): Promise<void> {
    if (!window.confirm('Энэ мессежийг устгах уу?')) return;
    try {
      await deleteDm(m.id);
      setMessages((prev) => prev.filter((x) => x.id !== m.id));
      await refreshConversations();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Мессеж устгахад алдаа гарлаа.');
    }
  }

  return (
    <div className="dm-wrap">
      <div className="dm-list">
        <h2>💬 Хувь чат</h2>
        <p className="muted small">Хэнтэй ч зөвшөөрөлгүйгээр хувь чат бичиж болно.</p>
        {conversations.length === 0 && <p className="empty">Одоохондоо өөр хэрэглэгч алга.</p>}
        {conversations.map((c) => (
          <button
            key={c.user.id}
            type="button"
            className={selectedId === c.user.id ? 'dm-item active' : 'dm-item'}
            onClick={() => selectPartner(c.user.id)}
          >
            <Avatar user={c.user} size="small" showDot />
            <span className="dm-item-main">
              <span className="dm-item-name">{c.user.name}</span>
              <span className="dm-item-preview">
                {c.lastMessage
                  ? `${c.lastMessage.senderId === user.id ? 'Та: ' : ''}${c.lastMessage.content}`
                  : 'Одоохондоо мессеж алга'}
              </span>
            </span>
            {c.unreadCount > 0 && <span className="unread-badge">{c.unreadCount}</span>}
          </button>
        ))}
      </div>

      <div className="dm-thread">
        {!selected ? (
          <p className="empty">Хүн сонгоод хувь чатаа эхлүүлээрэй ✨</p>
        ) : (
          <>
            <div className="dm-thread-head">
              <Avatar user={selected.user} size="small" showDot />
              <div>
                <strong>{selected.user.name}</strong>
                <span className="muted small"> @{selected.user.username}</span>
                <div className="muted small">{selected.user.online ? '🟢 Онлайн — одоо байна' : '⚪ Офлайн'}</div>
              </div>
            </div>
            {error && <p className="error">{error}</p>}
            <div className="dm-message-list">
              {messages.length === 0 && <p className="empty">Одоохондоо мессеж алга — хамгийн түрүүнд та бичээрэй! ✨</p>}
              {messages.map((m) => (
                <div key={m.id} className={m.senderId === user.id ? 'dm-message mine' : 'dm-message'}>
                  <p>{m.content}</p>
                  <span className="message-time">
                    {new Date(m.createdAt).toLocaleString('mn-MN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
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
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`${selected.user.name}-д мессеж бичих…`}
              />
              <button type="submit" className="btn-primary" disabled={!draft.trim()}>
                Илгээх
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
