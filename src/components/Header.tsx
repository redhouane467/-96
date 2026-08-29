export default function Header({
  title,
  subtitle,
  onLogout,
}: {
  title: string;
  subtitle: string;
  onLogout: () => void;
}) {
  return (
    <header className="bg-green-600 text-white p-4 flex justify-between items-center">
      <div className="flex items-center gap-3">
        <img src="/icon-192.png" alt="وصلي" className="w-9 h-9 rounded-xl shadow-sm" />
        <div>
          <b className="text-xl">وصلي</b>
          <div className="text-sm opacity-90">
            {title} — {subtitle}
          </div>
        </div>
      </div>
      <button onClick={onLogout} className="bg-white/20 rounded-lg px-3 py-1.5 text-sm hover:bg-white/30">
        خروج
      </button>
    </header>
  );
}