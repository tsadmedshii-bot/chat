// Бандуулсан хэрэглэгчид харуулах мэдэгдэл — хугацаатай бол хэзээ дуусахыг,
// байнга бол «Байнга» гэж харуулна. Нэвтрэх хуудас болон App-ын дэлгэц
// дүүрэн мэдэгдэлд хоёуланд нь хэрэглэнэ.
export function formatBanUntil(iso: string | null): string {
  if (!iso) return 'Байнга';
  return new Date(iso).toLocaleString('mn-MN', {
    timeZone: 'Asia/Ulaanbaatar',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function BanNotice({ bannedUntil }: { bannedUntil: string | null }) {
  return (
    <div className="ban-notice">
      <div className="ban-notice-icon">⛔</div>
      <h2>Та бандуулсан байна</h2>
      <p>
        {bannedUntil
          ? `Таны хаяг ${formatBanUntil(bannedUntil)} хүртэл бантай байна.`
          : 'Таны хаяг байнга бантай байна.'}
      </p>
      <p className="muted">Бан тайлуулах бол том админтай холбогдоно уу.</p>
    </div>
  );
}
