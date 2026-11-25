import { useCallback, useEffect, useRef, useState } from 'react';
import type { DirectConversation, DirectMessage, User } from '../../../shared/src/types';
import { ApiError, deleteDm, editDm, listDmConversations, listDmMessages, sendDm, toggleReaction } from '../api';
import { EditedMark, ReactionBar, ReplyQuoteView, authorFontClass } from '../components/MessageParts';
import { Avatar } from '../components/UserBadge';

export default function Direct({
  user,
  initialPartnerId,
  onPartnerOpened,
  onViewProfile,
}: {
  user: User;
  initialPartnerId: number | null;
  onPartnerOpened: () => void;
  onViewProfile: (userId: number) => void;
}) {
  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<DirectMessage | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const firstLoadRef = useRef(true);
  // Өөрөө мессеж илгээхэд заавал доош гүйлгэнэ (Rooms-той ижил дүрэм).
  const forceScrollRef = useRef(false);
  // Сүүлд харсан мессежийн тоо — шинэ мессеж ирснийг танихдаа хэрэглэнэ.
  const lastCountRef = useRef(0);

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

  // Шинэ мессеж ирэхэд заавал доош гүйлгэнэ — хэн бичсэнээс үл хамааран
  // сүүлийн чатыг гараар скролдож харах шаардлагагүй. Мессеж ирээгүй
  // шинэчлэлт (5 секунд тутамд) бол гүйлгэхгүй.
  useEffect(() => {
    const grew = messages.length > lastCountRef.current;
    const force = forceScrollRef.current;
    forceScrollRef.current = false;
    lastCountRef.current = messages.length;
    if (firstLoadRef.current || grew || force) {
      firstLoadRef.current = false;
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const selected = conversations.find((c) => c.user.id === selectedId) ?? null;

  const canDelete = (m: DirectMessage): boolean =>
    m.senderId === user.id ||
    user.role === 'admin' ||
    (user.role === 'moderator' && user.agreementActive);

  function selectPartner(partnerId: number): void {
    if (partnerId === selectedId) return;
    setSelectedId(partnerId);
    setMessages([]);
    setReplyTo(null);
    setEditingId(null);
    firstLoadRef.current = true;
    void loadThread(partnerId);
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!draft.trim() || !selectedId) return;
    setError('');
    try {
      const msg = await sendDm(selectedId, draft.trim(), replyTo?.id ?? null);
      forceScrollRef.current = true;
      setMessages((prev) => [...prev, msg]);
      setDraft('');
      setReplyTo(null);
      await refreshConversations();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Мессеж илгээхэд алдаа гарлаа.');
    }
  }

  function startEdit(m: DirectMessage): void {
    setEditingId(m.id);
    setEditDraft(m.content);
  }

  async function saveEdit(m: DirectMessage): Promise<void> {
    const text = editDraft.trim();
    if (!text) return;
    try {
      const updated = await editDm(m.id, text);
      setMessages((prev) => prev.map((x) => (x.id === m.id ? updated : x)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Мессеж засахад алдаа гарлаа.');
    }
  }

  async function onReact(m: DirectMessage, emoji: string): Promise<void> {
    try {
      const reactions = await toggleReaction('dm', m.id, emoji);
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, reactions } : x)));
    } catch {
      // Урвал дарахад алдаа гарвал чимээгүй өнгөрнө.
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
        {conversations.map((c) => {
          // Сүүлийн мессежийг бичсэн хүн — би эсвэл ярилцагч; түүний өнгө/фонтыг
          // урьдчилан харуулахад хэрэглэнэ.
          const previewSender =
            c.lastMessage && c.lastMessage.senderId === user.id ? user : c.user;
          const previewFont = c.lastMessage ? authorFontClass(previewSender) : undefined;
          return (
            <div
              key={c.user.id}
              role="button"
              tabIndex={0}
              className={selectedId === c.user.id ? 'dm-item active' : 'dm-item'}
              onClick={() => selectPartner(c.user.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  selectPartner(c.user.id);
                }
              }}
            >
              <Avatar user={c.user} size="small" showDot onClick={() => onViewProfile(c.user.id)} />
              <span className="dm-item-main">
                <span className="dm-item-name">{c.user.name}</span>
                <span
                  className={previewFont ? `dm-item-preview ${previewFont}` : 'dm-item-preview'}
                  style={c.lastMessage && previewSender.textColor ? { color: previewSender.textColor } : undefined}
                >
                  {c.lastMessage
                    ? `${c.lastMessage.senderId === user.id ? 'Та: ' : ''}${c.lastMessage.content}`
                    : 'Одоохондоо мессеж алга'}
                </span>
              </span>
              {c.unreadCount > 0 && <span className="unread-badge">{c.unreadCount}</span>}
            </div>
          );
        })}
      </div>

      <div className="dm-thread">
        {!selected ? (
          <p className="empty">Хүн сонгоод хувь чатаа эхлүүлээрэй ✨</p>
        ) : (
          <>
            <div className="dm-thread-head">
              <Avatar user={selected.user} size="small" showDot onClick={() => onViewProfile(selected.user.id)} />
              <div>
                <strong>{selected.user.name}</strong>
                <span className="muted small"> @{selected.user.username}</span>
                <div className="muted small">{selected.user.online ? '🟢 Онлайн — одоо байна' : '⚪ Офлайн'}</div>
              </div>
            </div>
            {error && <p className="error">{error}</p>}
            <div className="dm-message-list" ref={listRef}>
              {messages.length === 0 && <p className="empty">Одоохондоо мессеж алга — хамгийн түрүүнд та бичээрэй! ✨</p>}
              {messages.map((m) => {
                const sender = m.senderId === user.id ? user : selected.user;
                return (
                  <div key={m.id} className={m.senderId === user.id ? 'dm-message mine' : 'dm-message'}>
                    <div className="dm-message-body">
                      {m.replyTo && <ReplyQuoteView quote={m.replyTo} />}
                      {editingId === m.id ? (
                        <div className="edit-box">
                          <textarea
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            rows={2}
                            autoFocus
                          />
                          <div className="edit-actions">
                            <button type="button" className="btn-primary small" onClick={() => void saveEdit(m)} disabled={!editDraft.trim()}>
                              Хадгалах
                            </button>
                            <button type="button" className="btn-ghost small" onClick={() => setEditingId(null)}>
                              Цуцлах
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p
                          className={authorFontClass(sender)}
                          style={sender.textColor ? { color: sender.textColor } : undefined}
                        >
                          {m.content}
                        </p>
                      )}
                      <span className="message-time">
                        {new Date(m.createdAt).toLocaleString('mn-MN', { hour: '2-digit', minute: '2-digit' })}
                        <EditedMark editedAt={m.editedAt} />
                      </span>
                      <ReactionBar reactions={m.reactions} onToggle={(e) => void onReact(m, e)} />
                    </div>
                    <div className="message-actions">
                      <button type="button" className="btn-ghost small" onClick={() => setReplyTo(m)} title="Хариулах">
                        ↩️
                      </button>
                      {m.senderId === user.id && editingId !== m.id && (
                        <button type="button" className="btn-ghost small" onClick={() => startEdit(m)} title="Засах">
                          ✏️
                        </button>
                      )}
                      {canDelete(m) && (
                        <button type="button" className="btn-danger-ghost small" onClick={() => void onDelete(m)} title="Устгах">
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
            {replyTo && (
              <div className="reply-bar">
                <span>
                  ↩️ <strong>{replyTo.senderId === user.id ? 'Өөртөө' : selected.user.name}</strong>-д хариулах:{' '}
                  {replyTo.content.length > 80 ? `${replyTo.content.slice(0, 80)}…` : replyTo.content}
                </span>
                <button type="button" className="btn-ghost small" onClick={() => setReplyTo(null)} title="Цуцлах">
                  ✕
                </button>
              </div>
            )}
            <form className="message-form" onSubmit={submit}>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={replyTo ? 'Хариу бичих…' : `${selected.user.name}-д мессеж бичих…`}
              />
              <button type="submit" className="btn-primary" disabled={!draft.trim()}>
                Илгээх
              </button>
            </form>
            <p className="muted small">💬 Мессежүүд 15 минутын дараа автоматаар устах болно.</p>
          </>
        )}
      </div>
    </div>
  );
}
