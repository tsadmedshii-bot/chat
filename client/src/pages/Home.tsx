import { useCallback, useEffect, useState } from 'react';
import type { Post, User } from '../../../shared/src/types';
import { ApiError, addComment, createPost, deletePost, listPosts, toggleLike } from '../api';
import EmojiPicker from '../components/EmojiPicker';
import UserName, { Avatar } from '../components/UserBadge';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'дөнгөж сая';
  if (min < 60) return `${min} минутын өмнө`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} цагийн өмнө`;
  return new Date(iso).toLocaleDateString('mn-MN');
}

export default function Home({ user, onViewProfile }: { user: User; onViewProfile: (userId: number) => void }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [draft, setDraft] = useState('');
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [showEmoji, setShowEmoji] = useState(false);
  const [commentEmojiFor, setCommentEmojiFor] = useState<number | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setPosts(await listPosts());
    } catch {
      // Пост ачааллахад алдаа гарвал хоосон жагсаалтаар үлдээнэ.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Постыг 30 секунд тутамд шинэчилнэ — онлайн цэг, лайк/сэтгэгдэл шинэчлэгдэнэ.
  useEffect(() => {
    const t = window.setInterval(() => {
      void refresh();
    }, 30000);
    return () => window.clearInterval(t);
  }, [refresh]);

  const canDelete = (post: Post): boolean =>
    post.author.id === user.id || user.role === 'admin' || user.role === 'moderator';

  async function submitPost(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!draft.trim()) return;
    setError('');
    try {
      const post = await createPost(draft.trim());
      setPosts((prev) => [post, ...prev]);
      setDraft('');
      setShowEmoji(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Пост оруулахад алдаа гарлаа.');
    }
  }

  async function onLike(post: Post): Promise<void> {
    try {
      const res = await toggleLike(post.id);
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, likedByMe: res.liked, likeCount: res.likeCount } : p)),
      );
    } catch {
      // Лайк дарахад алдаа гарвал чимээгүй өнгөрнө.
    }
  }

  async function submitComment(postId: number): Promise<void> {
    const text = (commentDrafts[postId] ?? '').trim();
    if (!text) return;
    try {
      const comment = await addComment(postId, text);
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, comments: [...p.comments, comment] } : p)),
      );
      setCommentDrafts((prev) => ({ ...prev, [postId]: '' }));
      setCommentEmojiFor(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Сэтгэгдэл бичихэд алдаа гарлаа.');
    }
  }

  async function onDeletePost(post: Post): Promise<void> {
    if (!window.confirm('Энэ постыг устгах уу?')) return;
    try {
      await deletePost(post.id);
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Пост устгахад алдаа гарлаа.');
    }
  }

  return (
    <div className="feed">
      <form className="composer" onSubmit={submitPost}>
        <div className="composer-head">
          <Avatar user={user} showDot />
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Юу бодож байна?"
            rows={3}
          />
        </div>
        <div className="composer-actions">
          <button type="button" className="btn-ghost" onClick={() => setShowEmoji((v) => !v)}>
            😊 Эможи
          </button>
          <button type="submit" className="btn-primary" disabled={!draft.trim()}>
            Нийтлэх
          </button>
        </div>
        {showEmoji && (
          <EmojiPicker onPick={(e) => setDraft((d) => d + e)} onClose={() => setShowEmoji(false)} />
        )}
      </form>
      {error && <p className="error">{error}</p>}

      {posts.length === 0 && (
        <p className="empty">Одоохондоо пост алга — хамгийн түрүүнд та оруулаарай! ✨</p>
      )}

      {posts.map((post) => (
        <article key={post.id} className="post-card">
          <header className="post-head">
            <Avatar user={post.author} showDot onClick={() => onViewProfile(post.author.id)} />
            <div className="post-meta">
              <UserName user={post.author} />
              <span className="post-time">{timeAgo(post.createdAt)}</span>
            </div>
            {canDelete(post) && (
              <button type="button" className="btn-danger-ghost" onClick={() => void onDeletePost(post)}>
                Устгах
              </button>
            )}
          </header>
          <p className="post-content">{post.content}</p>
          <div className="post-actions">
            <button
              type="button"
              className={post.likedByMe ? 'like-btn liked' : 'like-btn'}
              onClick={() => void onLike(post)}
            >
              {post.likedByMe ? '❤️' : '🤍'} Таалагдлаа · {post.likeCount}
            </button>
            <span className="comment-count">💬 {post.comments.length} сэтгэгдэл</span>
          </div>
          <div className="comments">
            {post.comments.map((c) => (
              <div key={c.id} className="comment">
                <Avatar user={c.author} size="small" showDot onClick={() => onViewProfile(c.author.id)} />
                <div className="comment-body">
                  <UserName user={c.author} />
                  <p>{c.content}</p>
                </div>
              </div>
            ))}
            <div className="comment-form">
              <input
                value={commentDrafts[post.id] ?? ''}
                onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void submitComment(post.id);
                  }
                }}
                placeholder="Сэтгэгдэл бичих…"
              />
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setCommentEmojiFor(commentEmojiFor === post.id ? null : post.id)}
              >
                😊
              </button>
              <button type="button" className="btn-primary small" onClick={() => void submitComment(post.id)}>
                Илгээх
              </button>
            </div>
            {commentEmojiFor === post.id && (
              <EmojiPicker
                onPick={(e) => setCommentDrafts((prev) => ({ ...prev, [post.id]: (prev[post.id] ?? '') + e }))}
                onClose={() => setCommentEmojiFor(null)}
              />
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
