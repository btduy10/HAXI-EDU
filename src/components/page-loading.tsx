/** Khung chờ hiện ngay khi chuyển trang, trong lúc máy chủ tải dữ liệu. */
export function PageLoading() {
  return (
    <div className="grid animate-pulse gap-4" role="status" aria-label="Đang tải">
      <div className="h-8 w-48 rounded-full bg-foreground/8" />
      <div className="h-10 rounded-full bg-foreground/8 sm:max-w-sm" />
      <div className="grid gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-12 rounded-2xl bg-foreground/6" />
        ))}
      </div>
    </div>
  );
}
