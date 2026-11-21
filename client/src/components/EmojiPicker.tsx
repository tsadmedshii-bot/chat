// 3D эможи сонгогч — 5 бүлэг, том эможи + 3D сүүдэр, тэмдэгтүүд.
import { useState } from 'react';

export interface EmojiGroup {
  label: string;
  icon: string;
  emojis: string[];
}

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    label: 'Сэтгэл хөдлөл',
    icon: '😊',
    emojis: ['😀', '😂', '😍', '🥰', '😎', '🤩', '😭', '😡', '🤔', '😴', '🥳', '😇', '🤗', '😋', '🙃', '😱'],
  },
  {
    label: 'Амьтан',
    icon: '🐾',
    emojis: ['🐶', '🐱', '🦊', '🐻', '🦁', '🐼', '🐨', '🐸', '🦄', '🐴', '🦅', '🐺', '🦉', '🐳', '🦋', '🐝'],
  },
  {
    label: 'Хоол',
    icon: '🍔',
    emojis: ['🍕', '🍔', '🍟', '🍩', '🍦', '🍰', '🍓', '🍇', '🥭', '☕', '🧋', '🍵', '🍿', '🌮', '🍜', '🥟'],
  },
  {
    label: 'Спорт ба зугаа',
    icon: '⚽',
    emojis: ['⚽', '🏀', '🎾', '🏆', '🎮', '🎲', '🎸', '🎤', '🎬', '🎨', '🚀', '✈️', '🏕️', '🎣', '⛷️', '🏇'],
  },
  {
    label: 'Тэмдэгт ба гялалзсан',
    icon: '✨',
    emojis: ['⚔️', '🛡️', '👑', '♛', '💎', '🔥', '🌟', '✨', '💜', '💙', '❤️', '💛', '🌈', '⚡', '🎉', '💫'],
  },
];

export default function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const [group, setGroup] = useState(0);
  const current = EMOJI_GROUPS[group];
  return (
    <div className="emoji-picker" role="dialog" aria-label="Эможи сонгох">
      <div className="emoji-picker-tabs">
        {EMOJI_GROUPS.map((g, i) => (
          <button
            key={g.label}
            type="button"
            className={i === group ? 'emoji-tab active' : 'emoji-tab'}
            onClick={() => setGroup(i)}
            title={g.label}
          >
            {g.icon}
          </button>
        ))}
        <button type="button" className="emoji-tab close" onClick={onClose} title="Хаах">
          ✕
        </button>
      </div>
      <div className="emoji-picker-label">{current.label}</div>
      <div className="emoji-grid">
        {current.emojis.map((e) => (
          <button key={e} type="button" className="emoji-btn" onClick={() => onPick(e)}>
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
