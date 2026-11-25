// Жижиг админы ёс зүйн гэрээ — бүтэн текст + хоёр талын зөвшөөрөл.
// Гэрээг нэг удаа хийнэ: жижиг админ өөрөө check хийж зөвшөөрч, том админ
// check хийж зөвшөөрсний дараа (хоёр дахь check орох мөчид) жижиг админы
// бүх эрх (бандах + өнгө/фонт + бусдын бичлэг устгах) автоматаар идэвхжинэ.
import { useEffect, useState } from 'react';
import type { User } from '../../../shared/src/types';
import { AGREEMENT_CLAUSES, AGREEMENT_PREAMBLE, AGREEMENT_TITLE } from '../../../shared/src/types';
import { ApiError, agreeAdminAgreement, agreeMiniAgreement, getAgreementAdmin } from '../api';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('mn-MN', {
    timeZone: 'Asia/Ulaanbaatar',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AgreementModal({
  mini,
  viewer,
  onAgreed,
  onClose,
}: {
  /** Гэрээ байгуулах жижиг админ. */
  mini: User;
  /** Цонхыг нээж буй хэрэглэгч (жижиг админ өөрөө эсвэл том админ). */
  viewer: User;
  /** Зөвшөөрсний дараа шинэчлэгдсэн хэрэглэгчийг дээш дамжуулна. */
  onAgreed: (updated: User) => void;
  onClose: () => void;
}) {
  const [admin, setAdmin] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);
  const [agreeing, setAgreeing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    void getAgreementAdmin()
      .then((a) => {
        if (alive) setAdmin(a);
      })
      .catch(() => {
        // Том админы нэр ачааллахад алдаа гарвал нэргүйгээр харуулна.
      });
    return () => {
      alive = false;
    };
  }, []);

  // Escape: цонхыг хаана.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isMiniViewer = viewer.id === mini.id;
  const isAdminViewer = viewer.role === 'admin';
  // Энэ үзэгчийн зөвшөөрөл хүлээгдэж байгаа эсэх.
  const myCheckPending = isMiniViewer
    ? mini.agreementMiniAt === null
    : isAdminViewer
      ? mini.agreementAdminAt === null
      : false;
  const completed = mini.agreementActive;
  const completedAt =
    mini.agreementMiniAt && mini.agreementAdminAt
      ? new Date(Math.max(new Date(mini.agreementMiniAt).getTime(), new Date(mini.agreementAdminAt).getTime()))
      : null;

  async function onAgree(): Promise<void> {
    if (!checked || !myCheckPending) return;
    setError('');
    setAgreeing(true);
    try {
      const updated = isMiniViewer ? await agreeMiniAgreement() : await agreeAdminAgreement(mini.id);
      setChecked(false);
      onAgreed(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Зөвшөөрөхөд алдаа гарлаа.');
    } finally {
      setAgreeing(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="agreement-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Хаах">
          ✕
        </button>
        <h2>📜 {AGREEMENT_TITLE}</h2>
        <p className="agreement-parties">
          Чатны нэр: <strong>Чат</strong>
          <br />
          Том админ: <strong>{admin ? `${admin.name} (@${admin.username})` : '…'}</strong>
          <br />
          Жижиг админ: <strong>{mini.name} (@{mini.username})</strong>
        </p>
        <p className="agreement-preamble">{AGREEMENT_PREAMBLE}</p>
        <ol className="agreement-clauses">
          {AGREEMENT_CLAUSES.map((clause, i) => (
            <li key={clause.title}>
              <strong>
                {i + 1}. {clause.title}
              </strong>
              <ul>
                {clause.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
        <div className="agreement-sign">
          <p>
            <strong>Зөвшөөрсөн:</strong>
          </p>
          <p>
            Жижиг админ: <strong>{mini.name}</strong> —{' '}
            {mini.agreementMiniAt ? `✅ ${formatDateTime(mini.agreementMiniAt)}` : '⏳ хүлээгдэж байна'}
          </p>
          <p>
            Том админ: <strong>{admin ? admin.name : '…'}</strong> —{' '}
            {mini.agreementAdminAt ? `✅ ${formatDateTime(mini.agreementAdminAt)}` : '⏳ хүлээгдэж байна'}
          </p>
          {completed && completedAt && (
            <p className="agreement-done">
              ✅ Гэрээ бүрэн баталгаажсан: {formatDateTime(completedAt.toISOString())} — жижиг админы бүх эрх
              (бандах, өнгө/фонт, бусдын бичлэг устгах) идэвхтэй боллоо.
            </p>
          )}
          {!completed && (
            <p className="muted small">
              Хоёр тал хоёул зөвшөөрөхөд жижиг админы бүх эрх автоматаар идэвхжинэ. Гэрээг нэг удаа хийнэ.
            </p>
          )}
        </div>
        {error && <p className="error">{error}</p>}
        {myCheckPending && (
          <label className="agreement-check">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            <span>
              Би дээрх ёс зүйн гэрээг уншиж, ойлгож, зөвшөөрч байна.
              {isMiniViewer
                ? ' Зөвшөөрсний дараа том админ ч зөвшөөрвөл миний бүх эрх автоматаар идэвхжинэ.'
                : ' Зөвшөөрсний дараа жижиг админ ч зөвшөөрсөн бол түүний бүх эрх автоматаар идэвхжинэ.'}
            </span>
          </label>
        )}
        {myCheckPending && (
          <button
            type="button"
            className="btn-primary"
            disabled={!checked || agreeing}
            onClick={() => void onAgree()}
          >
            {agreeing ? 'Хадгалж байна…' : '✅ Зөвшөөрөх'}
          </button>
        )}
      </div>
    </div>
  );
}
