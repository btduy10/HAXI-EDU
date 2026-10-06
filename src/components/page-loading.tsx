/** Khung chờ hiện ngay khi chuyển trang, trong lúc máy chủ tải dữ liệu. */
export function PageLoading() {
  return (
    <div className="grid animate-pulse gap-4" role="status" aria-label="Đang tải">
      <div className="h-7 w-40 rounded-md bg-muted" />
      <div className="h-10 rounded-lg bg-muted sm:max-w-sm" />
      <div className="grid gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-12 rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  );
}
