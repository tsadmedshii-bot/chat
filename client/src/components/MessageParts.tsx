// Хариултын эшлэл + эможи урвал — өрөөний мессеж, хувь чат, сэтгэгдэлд
// адилхан хэрэглэнэ.
import { useState } from 'react';
import { REACTION_EMOJIS, STYLE_FONTS } from '../../../shared/src/types';
import type { ReactionCount, ReplyQuote, User } from '../../../shared/src/types';

/** Зохиогчийн бичлэгийн фонтын CSS класс — том админ Playfair Display,
    canStyle эрхтэй жижиг админ өөрийн сонгосон фонт, бусад нь энгийн.
    Сервер нь эрхгүй хүнд textFont-ийг null гэж буцаадаг тул энд нэмэлт
    шалгалт хэрэггүй. */
export function authorFontClass(author: User): string | undefined {
  if (author.role === 'admin') return 'message-admin';
  if (author.role === 'moderator' && author.textFont) {
    const known = STYLE_FONTS.find((f) => f.key === author.textFont);
    return known ? known.cssClass : undefined;
  }
  return undefined;
}

/** Эшлэл (snapshot) — эх нь устсан ч нэр + текст нь харагдана. */
export function ReplyQuoteView({ quote }: { quote: ReplyQuote }) {
  const text = quote.text.length > 120 ? `${quote.text.slice(0, 120)}…` : quote.text;
  return (
    <div className="reply-quote">
      <span className="reply-quote-author">{quote.authorName}</span>
      <span className="reply-quote-text">{text}</span>
    </div>
  );
}

/** Эможи урвал: тоотой чипүүд + 😊 товчоор нээгдэх жижиг сонгогч.
    Чип дарвал өөрийн урвал арилна, өөр эможи дарвал солигдоно. */
export function ReactionBar({
  reactions,
  onToggle,
}: {
  reactions: ReactionCount[];
  onToggle: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="reactions">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          className={r.reactedByMe ? 'reaction-chip mine' : 'reaction-chip'}
          onClick={() => onToggle(r.emoji)}
          title={r.reactedByMe ? 'Урвал арилгах' : 'Урвал нэмэх'}
        >
          {r.emoji} {r.count}
        </button>
      ))}
      <button
        type="button"
        className="reaction-add"
        onClick={() => setOpen((v) => !v)}
        title="Эможи урвал нэмэх"
      >
        😊
      </button>
      {open && (
        <span className="reaction-picker">
          {REACTION_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                onToggle(e);
                setOpen(false);
              }}
            >
              {e}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}

/** "зассан" тэмдэг — засагдсан бичлэг дээр харуулна. */
export function EditedMark({ editedAt }: { editedAt: string | null }) {
  if (!editedAt) return null;
  return <span className="edited-mark"> · зассан</span>;
}
