export default function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
        <p className="text-sm text-[var(--text-muted)]">טוען נתונים...</p>
      </div>
    </div>
  )
}
