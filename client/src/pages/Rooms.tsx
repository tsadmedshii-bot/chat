// Нийтийн чат — одоо зөвхөн нэг нийтийн өрөө л байна. Дэлгэц дүүрэн,
// хариулах, өөрийн мессеж засах, эможи урвал боломжтой.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, User } from '../../../shared/src/types';
import { ApiError, deleteMessage, editMessage, listMessages, sendMessage, toggleReaction } from '../api';
import EmojiPicker from '../components/EmojiPicker';
import { EditedMark, ReactionBar, ReplyQuoteView } from '../components/MessageParts';
import UserName, { Avatar } from '../components/UserBadge';

export default function Rooms({ user, onViewProfile }: { user: User; onViewProfile: (userId: number) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const firstLoadRef = useRef(true);

  const load = useCallback(async () => {
    setError('');
    try {
      setMessages(await listMessages());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Мессеж ачааллахад алдаа гарлаа.');
      setMessages([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Мессежийг 10 секунд тутамд шинэчилнэ.
  useEffect(() => {
    const t = window.setInterval(() => {
      void load();
    }, 10000);
    return () => window.clearInterval(t);
  }, [load]);

  // Шинэ мессеж ирэхэд зөвхөн доод талд нь байвал автоматаар гүйлгэнэ —
  // хэрэглэгч дээш гүйлгэж уншиж байхад нь тасалдуулахгүй.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = firstLoadRef.current || el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    firstLoadRef.current = false;
    if (nearBottom) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const canDelete = (m: ChatMessage): boolean =>
    m.author.id === user.id || user.role === 'admin' || user.role === 'moderator';

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!draft.trim()) return;
    setError('');
    try {
      const msg = await sendMessage(draft.trim(), replyTo?.id ?? null);
      setMessages((prev) => [...prev, msg]);
      setDraft('');
      setReplyTo(null);
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

  function startEdit(m: ChatMessage): void {
    setEditingId(m.id);
    setEditDraft(m.content);
  }

  async function saveEdit(m: ChatMessage): Promise<void> {
    const text = editDraft.trim();
    if (!text) return;
    try {
      const updated = await editMessage(m.id, text);
      setMessages((prev) => prev.map((x) => (x.id === m.id ? updated : x)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Мессеж засахад алдаа гарлаа.');
    }
  }

  async function onReact(m: ChatMessage, emoji: string): Promise<void> {
    try {
      const reactions = await toggleReaction('message', m.id, emoji);
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, reactions } : x)));
    } catch {
      // Урвал дарахад алдаа гарвал чимээгүй өнгөрнө.
    }
  }

  return (
    <div className="chat-full">
      <div className="chat-full-head">
        <h2>💬 Нийтийн чат</h2>
        <span className="muted small">Хүн бүрд нээлттэй</span>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="message-list chat-list" ref={listRef}>
        {messages.length === 0 && <p className="empty">Одоохондоо мессеж алга — хамгийн түрүүнд та бичээрэй! ✨</p>}
        {messages.map((m) => (
          <div key={m.id} className={m.author.id === user.id ? 'message mine' : 'message'}>
            <Avatar user={m.author} showDot onClick={() => onViewProfile(m.author.id)} />
            <div className="message-body">
              <UserName user={m.author} />
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
                  className={m.author.role === 'admin' ? 'message-admin' : undefined}
                  style={m.author.textColor ? { color: m.author.textColor } : undefined}
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
              {m.author.id === user.id && editingId !== m.id && (
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
        ))}
        <div ref={bottomRef} />
      </div>

      {replyTo && (
        <div className="reply-bar">
          <span>
            ↩️ <strong>{replyTo.author.name}</strong>-д хариулах: {replyTo.content.length > 80 ? `${replyTo.content.slice(0, 80)}…` : replyTo.content}
          </span>
          <button type="button" className="btn-ghost small" onClick={() => setReplyTo(null)} title="Цуцлах">
            ✕
          </button>
        </div>
      )}
      <form className="message-form chat-form" onSubmit={submit}>
        <button type="button" className="btn-ghost" onClick={() => setShowEmoji((v) => !v)}>
          😊
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={replyTo ? 'Хариу бичих…' : 'Мессеж бичих…'}
        />
        <button type="submit" className="btn-primary" disabled={!draft.trim()}>
          Илгээх
        </button>
      </form>
      {showEmoji && (
        <EmojiPicker onPick={(e) => setDraft((d) => d + e)} onClose={() => setShowEmoji(false)} />
      )}
      <p className="muted small">💬 Мессежүүд 15 минутын дараа автоматаар устах болно. Постууд устахгүй.</p>
    </div>
  );
}
