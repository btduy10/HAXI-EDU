// Giới hạn tốc độ dạng token bucket, lưu trong bộ nhớ tiến trình.
// Đủ cho triển khai một instance; nhiều instance cần chuyển sang kho dùng chung.
type Bucket = { tokens: number; updatedAt: number };

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000;

export function consumeToken(key: string, capacity: number, refillPerSecond: number, now = Date.now()): boolean {
  const bucket = buckets.get(key) ?? { tokens: capacity, updatedAt: now };
  bucket.tokens = Math.min(capacity, bucket.tokens + ((now - bucket.updatedAt) / 1000) * refillPerSecond);
  bucket.updatedAt = now;
  const allowed = bucket.tokens >= 1;
  if (allowed) bucket.tokens -= 1;
  if (!buckets.has(key) && buckets.size >= MAX_KEYS) buckets.clear();
  buckets.set(key, bucket);
  return allowed;
}

export const resetRateLimits = () => buckets.clear();
