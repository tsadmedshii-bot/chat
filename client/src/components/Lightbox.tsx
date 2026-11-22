// Профайл зургийг дэлгэц дүүрэн харуулдаг давхарга — хаашаа ч дарж хаана.
// Escape товчийг эцэг компонент нь хариуцна (нэг Escape = нэг хаалт).
export default function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`${alt} — том зураг`}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <img className="lightbox-img" src={src} alt={alt} />
      <span className="lightbox-hint">Хаахын тулд дарна уу</span>
    </div>
  );
}
