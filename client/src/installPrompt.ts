/**
 * beforeinstallprompt үйл явдлыг эрт барьж хадгална.
 * Энэ үйл явдал хуудас ачаалагдахад нэг л удаа гардаг тул main.tsx-ээс
 * эрт бүртгэж, InstallApp компонент дараа нь асууж авна.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;

export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferred;
}

/** main.tsx-ээс нэг удаа дуудна. */
export function initInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new CustomEvent('chat:install-ready'));
  });
}
