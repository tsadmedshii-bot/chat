import { useEffect, useState } from 'react';
import { getInstallPrompt, type BeforeInstallPromptEvent } from '../installPrompt';

/**
 * Апп суулгах хэсэг: Chrome-ийн beforeinstallprompt гарсан үед «📲 Апп
 * суулгах» товч харуулж, гараагүй үед ч гараар суулгах зааврыг харуулна
 * (зарим хөтөч үйл явдлыг огт гаргадаггүй).
 */
export default function InstallApp() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(() => getInstallPrompt());
  const [done, setDone] = useState(false);

  useEffect(() => {
    function onReady(): void {
      setPromptEvent(getInstallPrompt());
    }
    window.addEventListener('chat:install-ready', onReady);
    return () => window.removeEventListener('chat:install-ready', onReady);
  }, []);

  async function install(): Promise<void> {
    const ev = promptEvent;
    if (!ev) return;
    await ev.prompt();
    await ev.userChoice.catch(() => undefined);
    setDone(true);
  }

  return (
    <div className="install-app">
      {promptEvent && !done && (
        <button type="button" className="btn-primary" onClick={() => void install()}>
          📲 Апп суулгах
        </button>
      )}
      <p className="muted small">
        Chrome-оос ⋮ → «Add to Home screen» гэж дарж болно — дараа нь дэлгэцэн дээрх дүрс
        дээрээ дараад шууд орно.
      </p>
    </div>
  );
}
