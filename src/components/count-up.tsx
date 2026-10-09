"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const noSubscription = () => () => {};

/**
 * Số KPI đếm tăng dần từ 0 khi xuất hiện. HTML từ máy chủ luôn chứa số thật; hiệu ứng chỉ chạy ở trình duyệt
 * và tắt khi người dùng bật "giảm chuyển động".
 */
export function CountUp({ value, duration = 700 }: { value: number; duration?: number }) {
  // false khi đang hydrate trang do máy chủ dựng, true khi thành phần được dựng ngay ở trình duyệt (chuyển trang).
  const onClient = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const [mountedOnClient] = useState(onClient);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (value <= 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Trang tải lần đầu mà hydrate chậm thì người dùng đã thấy số thật: không đếm lại từ 0 nữa.
    if (!mountedOnClient && performance.now() > 1500) return;
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const progress = Math.min(1, (now - start) / duration);
      setShown(Math.round(value * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
      setShown(value);
    };
  }, [value, duration, mountedOnClient]);

  return <>{shown}</>;
}
