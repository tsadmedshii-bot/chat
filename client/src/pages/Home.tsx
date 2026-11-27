import { useCallback, useEffect, useRef, useState } from 'react';
import type { Post, PostComment, User } from '../../../shared/src/types';
import { ApiError, addComment, createPost, deletePost, editComment, editPost, listPosts, toggleLike, toggleReaction } from '../api';
import AgreementModal from '../components/AgreementModal';
import EmojiPicker from '../components/EmojiPicker';
import { EditedMark, ReactionBar, ReplyQuoteView } from '../components/MessageParts';
import UserName, { Avatar } from '../components/UserBadge';
import Lightbox from '../components/Lightbox';
import { resizePostImageToDataUrl } from '../components/imageUtils';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'дөнгөж сая';
  if (min < 60) return `${min} минутын өмнө`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} цагийн өмнө`;
  return new Date(iso).toLocaleDateString('mn-MN');
}

export default function Home({
  user,
  onViewProfile,
  onUserChange,
}: {
  user: User;
  onViewProfile: (userId: number) => void;
  onUserChange?: (u: User) => void;
}) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [draft, setDraft] = useState('');
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [showEmoji, setShowEmoji] = useState(false);
  const [commentEmojiFor, setCommentEmojiFor] = useState<number | null>(null);
  // Хариулж буй сэтгэгдэл — пост тус бүрээр нэг.
  const [replyToComment, setReplyToComment] = useState<Record<number, PostComment | null>>({});
  // Засаж буй пост / сэтгэгдэл.
  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  const [editingPostDraft, setEditingPostDraft] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentDraft, setEditingCommentDraft] = useState('');
  const [error, setError] = useState('');
  // Ёс зүйн гэрээний цонх — гэрээ нь бүрэн баталгаажаагүй жижиг админд нээгдэнэ.
  const [showAgreement, setShowAgreement] = useState(false);
  // Постын зураг — хавсаргасан зургийн data URL + томруулж харах төлөв.
  const [postImage, setPostImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const imageFileRef = useRef<HTMLInputElement | null>(null);

  // Escape: том зургийг хаана.
  useEffect(() => {
    if (!lightboxSrc) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setLightboxSrc(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxSrc]);

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
    post.author.id === user.id ||
    user.role === 'admin' ||
    (user.role === 'moderator' && user.agreementActive);

  async function submitPost(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!draft.trim() && !postImage) return;
    setError('');
    try {
      const post = await createPost(draft.trim(), postImage);
      setPosts((prev) => [post, ...prev]);
      setDraft('');
      setPostImage(null);
      setShowEmoji(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Пост оруулахад алдаа гарлаа.');
    }
  }

  async function onPickPostImage(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    if (!file.type.startsWith('image/')) {
      setError('Зөвхөн зураг сонгоно уу');
      return;
    }
    setUploadingImage(true);
    try {
      const dataUrl = await resizePostImageToDataUrl(file);
      setPostImage(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Зураг оруулахад алдаа гарлаа.');
    } finally {
      setUploadingImage(false);
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
      const replyTo = replyToComment[postId] ?? null;
      const comment = await addComment(postId, text, replyTo?.id ?? null);
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, comments: [...p.comments, comment] } : p)),
      );
      setCommentDrafts((prev) => ({ ...prev, [postId]: '' }));
      setReplyToComment((prev) => ({ ...prev, [postId]: null }));
      setCommentEmojiFor(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Сэтгэгдэл бичихэд алдаа гарлаа.');
    }
  }

  function startEditPost(post: Post): void {
    setEditingPostId(post.id);
    setEditingPostDraft(post.content);
  }

  async function saveEditPost(post: Post): Promise<void> {
    const text = editingPostDraft.trim();
    if (!text) return;
    try {
      const updated = await editPost(post.id, text);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? updated : p)));
      setEditingPostId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Пост засахад алдаа гарлаа.');
    }
  }

  function startEditComment(c: PostComment): void {
    setEditingCommentId(c.id);
    setEditingCommentDraft(c.content);
  }

  async function saveEditComment(postId: number, c: PostComment): Promise<void> {
    const text = editingCommentDraft.trim();
    if (!text) return;
    try {
      const updated = await editComment(c.id, text);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, comments: p.comments.map((x) => (x.id === c.id ? updated : x)) } : p,
        ),
      );
      setEditingCommentId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Сэтгэгдэл засахад алдаа гарлаа.');
    }
  }

  async function onReactComment(postId: number, commentId: number, emoji: string): Promise<void> {
    try {
      const reactions = await toggleReaction('comment', commentId, emoji);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, comments: p.comments.map((x) => (x.id === commentId ? { ...x, reactions } : x)) }
            : p,
        ),
      );
    } catch {
      // Урвал дарахад алдаа гарвал чимээгүй өнгөрнө.
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
      {user.role === 'moderator' && !user.agreementActive && (
        <div className="agreement-card">
          <h3>📜 Ёс зүйн гэрээ — таны эрх хүлээгдэж байна</h3>
          <p>
            Та жижиг админ болсон ч таны эрх (бандах, өнгө/фонт сонгох, бусдын бичлэг устгах) хараахан
            идэвхжээгүй байна. Эхлээд та болон том админ ёс зүйн гэрээг зөвшөөрөх хэрэгтэй — хоёр тал
            хоёул зөвшөөрөхөд таны бүх эрх автоматаар идэвхжинэ.
          </p>
          <p className="muted small">
            Таны зөвшөөрөл: {user.agreementMiniAt ? '✅ Зөвшөөрсөн' : '⏳ Хүлээгдэж байна'} · Том админы
            зөвшөөрөл: {user.agreementAdminAt ? '✅ Зөвшөөрсөн' : '⏳ Хүлээгдэж байна'}
          </p>
          <button type="button" className="btn-primary" onClick={() => setShowAgreement(true)}>
            📜 Гэрээ унших
          </button>
        </div>
      )}
      {showAgreement && (
        <AgreementModal
          mini={user}
          viewer={user}
          onAgreed={(updated) => {
            setShowAgreement(false);
            if (onUserChange) onUserChange(updated);
          }}
          onClose={() => setShowAgreement(false)}
        />
      )}
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
        {postImage && (
          <div className="post-image-preview">
            <img src={postImage} alt="Хавсаргасан зураг" />
            <button type="button" className="btn-danger-ghost small" onClick={() => setPostImage(null)} title="Зураг хасах">
              ✕ Зураг хасах
            </button>
          </div>
        )}
        <input
          ref={imageFileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => void onPickPostImage(e)}
        />
        <div className="composer-actions">
          <button type="button" className="btn-ghost" onClick={() => setShowEmoji((v) => !v)}>
            😊 Эможи
          </button>
          <button type="button" className="btn-ghost" disabled={uploadingImage} onClick={() => imageFileRef.current?.click()}>
            {uploadingImage ? 'Ачааллаж байна…' : '🖼️ Зураг'}
          </button>
          <button type="submit" className="btn-primary" disabled={(!draft.trim() && !postImage) || uploadingImage}>
            Нийтлэх
          </button>
        </div>
        {showEmoji && (
          <EmojiPicker onPick={(e) => setDraft((d) => d + e)} onClose={() => setShowEmoji(false)} />
        )}
      </form>
      <p className="muted small">Зураг автоматаар 1200px хүртэл жижигрэнэ. Зөвхөн JPEG, PNG, WebP — 1 MB хүртэл. Пост хэзээ ч устахгүй.</p>
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
              <span className="post-time">
                {timeAgo(post.createdAt)}
                <EditedMark editedAt={post.editedAt} />
              </span>
            </div>
            {post.author.id === user.id && editingPostId !== post.id && (
              <button type="button" className="btn-ghost small" onClick={() => startEditPost(post)} title="Засах">
                ✏️
              </button>
            )}
            {canDelete(post) && (
              <button type="button" className="btn-danger-ghost" onClick={() => void onDeletePost(post)}>
                Устгах
              </button>
            )}
          </header>
          {editingPostId === post.id ? (
            <div className="edit-box">
              <textarea
                value={editingPostDraft}
                onChange={(e) => setEditingPostDraft(e.target.value)}
                rows={3}
                autoFocus
              />
              <div className="edit-actions">
                <button type="button" className="btn-primary small" onClick={() => void saveEditPost(post)} disabled={!editingPostDraft.trim()}>
                  Хадгалах
                </button>
                <button type="button" className="btn-ghost small" onClick={() => setEditingPostId(null)}>
                  Цуцлах
                </button>
              </div>
            </div>
          ) : (
            <>
              {post.content && <p className="post-content">{post.content}</p>}
              {post.image && (
                <button
                  type="button"
                  className="post-image-btn"
                  onClick={() => setLightboxSrc(post.image)}
                  aria-label="Зургийг томруулж харах"
                >
                  <img className="post-image" src={post.image} alt="Постын зураг" />
                </button>
              )}
            </>
          )}
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
                  {c.replyTo && <ReplyQuoteView quote={c.replyTo} />}
                  {editingCommentId === c.id ? (
                    <div className="edit-box">
                      <textarea
                        value={editingCommentDraft}
                        onChange={(e) => setEditingCommentDraft(e.target.value)}
                        rows={2}
                        autoFocus
                      />
                      <div className="edit-actions">
                        <button type="button" className="btn-primary small" onClick={() => void saveEditComment(post.id, c)} disabled={!editingCommentDraft.trim()}>
                          Хадгалах
                        </button>
                        <button type="button" className="btn-ghost small" onClick={() => setEditingCommentId(null)}>
                          Цуцлах
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p>{c.content}</p>
                  )}
                  <span className="message-time">
                    {timeAgo(c.createdAt)}
                    <EditedMark editedAt={c.editedAt} />
                  </span>
                  <ReactionBar reactions={c.reactions} onToggle={(e) => void onReactComment(post.id, c.id, e)} />
                  <div className="comment-actions">
                    <button
                      type="button"
                      className="btn-ghost small"
                      onClick={() => setReplyToComment((prev) => ({ ...prev, [post.id]: c }))}
                      title="Хариулах"
                    >
                      ↩️ Хариулах
                    </button>
                    {c.author.id === user.id && editingCommentId !== c.id && (
                      <button type="button" className="btn-ghost small" onClick={() => startEditComment(c)} title="Засах">
                        ✏️ Засах
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {replyToComment[post.id] && (
              <div className="reply-bar">
                <span>
                  ↩️ <strong>{replyToComment[post.id]!.author.name}</strong>-д хариулах:{' '}
                  {replyToComment[post.id]!.content.length > 80
                    ? `${replyToComment[post.id]!.content.slice(0, 80)}…`
                    : replyToComment[post.id]!.content}
                </span>
                <button type="button" className="btn-ghost small" onClick={() => setReplyToComment((prev) => ({ ...prev, [post.id]: null }))} title="Цуцлах">
                  ✕
                </button>
              </div>
            )}
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
                placeholder={replyToComment[post.id] ? 'Хариу бичих…' : 'Сэтгэгдэл бичих…'}
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
      {lightboxSrc && <Lightbox src={lightboxSrc} alt="Постын зураг" onClose={() => setLightboxSrc(null)} />}
    </div>
  );
}
