import { useState } from 'react';
import type { User } from '../../../shared/src/types';
import { ApiError, login, register } from '../api';

export default function Auth({ onDone }: { onDone: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user =
        mode === 'register'
          ? await register(name, username, password)
          : await login(username, password);
      onDone(user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Алдаа гарлаа. Дахин оролдоно уу.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">💬</div>
        <h1>Чат</h1>
        <p className="auth-sub">
          Пост оруулж, 2 өрөөнд чатлаарай.
          <br />
          Хамгийн түрүүнд бүртгүүлсэн хүн 👑 том админ болно.
        </p>
        <div className="auth-tabs">
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
            Бүртгүүлэх
          </button>
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            Нэвтрэх
          </button>
        </div>
        <form onSubmit={submit} className="auth-form">
          {mode === 'register' && (
            <label>
              Нэр
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Таны нэр" autoComplete="name" />
            </label>
          )}
          <label>
            Нэвтрэх нэр
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="жишээ: tsoogii" autoComplete="username" />
          </label>
          <label>
            Нууц үг
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Хамгийн багадаа 4 тэмдэгт" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Түр хүлээнэ үү…' : mode === 'register' ? 'Бүртгүүлэх' : 'Нэвтрэх'}
          </button>
        </form>
      </div>
    </div>
  );
}
