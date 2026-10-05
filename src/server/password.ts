import { hash, verify } from "@node-rs/argon2";

// Argon2id, tham số theo khuyến nghị OWASP (m=19 MiB, t=2, p=1).
const OPTIONS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export const hashPassword = (password: string) => hash(password, OPTIONS);

export async function verifyPassword(data: { hash: string; password: string }) {
  try {
    return await verify(data.hash, data.password);
  } catch {
    return false;
  }
}
