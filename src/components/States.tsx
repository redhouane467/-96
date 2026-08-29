export function LoadingState({ label = "جاري التحميل…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3 text-slate-500">
      <div className="w-8 h-8 border-4 border-green-200 border-t-green-600 rounded-full animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ icon = "📭", label }: { icon?: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-400">
      <span className="text-4xl">{icon}</span>
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center space-y-2">
      <p className="text-red-700 text-sm font-bold">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="text-red-700 underline text-sm">
          إعادة المحاولة
        </button>
      )}
    </div>
  );
}