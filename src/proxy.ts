import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/two-factor"];
const isProd = process.env.NODE_ENV === "production";
const forceHttps = isProd && process.env.FORCE_HTTPS !== "false";

function buildCsp(nonce: string) {
  return [
    "default-src 'self'",
    // Script: chỉ chấp nhận script có nonce của request này.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isProd ? "" : " 'unsafe-eval'"}`,
    // Style: thư viện giao diện chèn style nội tuyến để định vị popup nên phải cho phép.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(forceHttps ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

function applySecurityHeaders(response: NextResponse, csp: string) {
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  if (forceHttps) response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // btoa có ở cả Node lẫn môi trường edge (Netlify chạy proxy trên edge, không có Buffer).
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  // Ép HTTPS khi triển khai (mặc định bật ở production; FORCE_HTTPS=false chỉ để thử bản build trên máy).
  if (forceHttps && request.headers.get("x-forwarded-proto") === "http") {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    return applySecurityHeaders(NextResponse.redirect(url, 308), csp);
  }

  // Kiểm tra lạc quan: chưa có cookie phiên thì về trang đăng nhập.
  // Việc xác thực và phân quyền thật sự luôn được làm lại ở máy chủ (layout, action, service).
  const isApi = pathname.startsWith("/api/");
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && pathname !== "/two-factor/setup";
  if (!isApi && !isPublic && !getSessionCookie(request)) {
    return applySecurityHeaders(NextResponse.redirect(new URL("/login", request.url)), csp);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  return applySecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), csp);
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
