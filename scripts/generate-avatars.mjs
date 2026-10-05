// Sinh bộ avatar robot SVG vào public/avatars. Chạy: node scripts/generate-avatars.mjs
// Thiết kế: nét đậm 3px, khối lớn, ít chi tiết để vẫn rõ khi thu nhỏ còn 32px.
import { mkdirSync, writeFileSync } from "node:fs";

const INK = "#1f2937";
const S = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;

const heads = {
  square: (c) => `<rect x="14" y="20" width="36" height="30" rx="6" fill="${c}" ${S}/>`,
  round: (c) => `<circle cx="32" cy="35" r="18" fill="${c}" ${S}/>`,
  wide: (c) => `<rect x="10" y="24" width="44" height="26" rx="13" fill="${c}" ${S}/>`,
  hex: (c) => `<path d="M21 19h22l10 16-10 16H21L11 35z" fill="${c}" ${S}/>`,
  dome: (c) => `<path d="M14 50V34a18 18 0 0 1 36 0v16z" fill="${c}" ${S}/>`,
  tall: (c) => `<rect x="18" y="16" width="28" height="36" rx="9" fill="${c}" ${S}/>`,
};

const eyes = {
  dots: (c) => `<circle cx="25" cy="33" r="4" fill="${c}" ${S}/><circle cx="39" cy="33" r="4" fill="${c}" ${S}/>`,
  squares: (c) => `<rect x="20" y="29" width="8" height="8" rx="1.5" fill="${c}" ${S}/><rect x="36" y="29" width="8" height="8" rx="1.5" fill="${c}" ${S}/>`,
  visor: (c) => `<rect x="18" y="28" width="28" height="9" rx="4.5" fill="${c}" ${S}/>`,
  cyclops: (c) => `<circle cx="32" cy="33" r="7" fill="${c}" ${S}/><circle cx="32" cy="33" r="2" fill="${INK}"/>`,
  happy: () => `<path d="M21 34q4-6 8 0M35 34q4-6 8 0" fill="none" ${S}/>`,
  big: (c) => `<circle cx="24" cy="33" r="6" fill="#fff" ${S}/><circle cx="40" cy="33" r="6" fill="#fff" ${S}/><circle cx="25" cy="34" r="2.5" fill="${c}"/><circle cx="41" cy="34" r="2.5" fill="${c}"/>`,
};

const mouths = {
  line: () => `<path d="M26 43h12" fill="none" ${S}/>`,
  smile: () => `<path d="M25 42q7 6 14 0" fill="none" ${S}/>`,
  grill: () => `<rect x="24" y="40" width="16" height="6" rx="2" fill="#fff" ${S}/><path d="M29.5 40v6M34.5 40v6" ${S}/>`,
  dot: () => `<circle cx="32" cy="43" r="2" fill="${INK}"/>`,
  none: () => "",
};

const tops = {
  antenna: (c) => `<path d="M32 20v-8" ${S}/><circle cx="32" cy="9" r="3.5" fill="${c}" ${S}/>`,
  twin: (c) => `<path d="M24 21l-3-9M40 21l3-9" ${S}/><circle cx="20.500" cy="10" r="3" fill="${c}" ${S}/><circle cx="43.500" cy="10" r="3" fill="${c}" ${S}/>`,
  bolt: (c) => `<path d="M34 5l-7 9h6l-3 8 8-10h-6z" fill="${c}" ${S}/>`,
  ears: (c) => `<rect x="6" y="30" width="6" height="12" rx="2" fill="${c}" ${S}/><rect x="52" y="30" width="6" height="12" rx="2" fill="${c}" ${S}/>`,
  propeller: (c) => `<path d="M32 19v-6" ${S}/><path d="M18 11q7-5 14 0 7 5 14 0" fill="none" ${S}/><circle cx="32" cy="12" r="2.500" fill="${c}" ${S}/>`,
  headphones: (c) => `<path d="M12 36V30a20 20 0 0 1 40 0v6" fill="none" ${S}/><rect x="7" y="32" width="8" height="13" rx="3" fill="${c}" ${S}/><rect x="49" y="32" width="8" height="13" rx="3" fill="${c}" ${S}/>`,
  crown: (c) => `<path d="M19 20l-2-12 8 6 7-9 7 9 8-6-2 12z" fill="${c}" ${S}/>`,
  star: (c) => `<path d="M32 2l3 6.500 7 .8-5.200 4.800 1.500 7-6.300-3.600-6.300 3.600 1.500-7L22 9.300l7-.8z" fill="${c}" ${S}/>`,
  flame: (c) => `<path d="M32 3c5 5 8 8 6 13-1 3-4 5-6 5s-5-2-6-5c-1-3 1-5 3-7 0 3 2 3 3 1 1-2 1-4 0-7z" fill="${c}" ${S}/>`,
  none: () => "",
};

const svg = (a) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${a.name}">` +
  `<circle cx="32" cy="32" r="32" fill="${a.bg}"/>` +
  (tops[a.top] ?? tops.none)(a.accent) +
  heads[a.head](a.body) +
  eyes[a.eyes](a.accent) +
  mouths[a.mouth]() +
  `</svg>\n`;

// level = cấp yêu cầu (1–5); gifted = avatar Admin tặng riêng.
export const AVATARS = [
  { file: "bolt", name: "Bu Lông", level: 1, head: "square", eyes: "dots", mouth: "line", top: "antenna", bg: "#dbeafe", body: "#93c5fd", accent: "#fde047" },
  { file: "pico", name: "Pico", level: 1, head: "round", eyes: "dots", mouth: "smile", top: "none", bg: "#dcfce7", body: "#86efac", accent: "#ffffff" },
  { file: "gizmo", name: "Gizmo", level: 1, head: "wide", eyes: "squares", mouth: "none", top: "ears", bg: "#fef3c7", body: "#fcd34d", accent: "#fb923c" },
  { file: "sprocket", name: "Bánh Răng", level: 2, head: "hex", eyes: "dots", mouth: "grill", top: "antenna", bg: "#ffedd5", body: "#fdba74", accent: "#38bdf8" },
  { file: "beep", name: "Bíp Bíp", level: 2, head: "dome", eyes: "big", mouth: "dot", top: "twin", bg: "#fce7f3", body: "#f9a8d4", accent: "#7c3aed" },
  { file: "visor", name: "Kính Thép", level: 2, head: "square", eyes: "visor", mouth: "line", top: "ears", bg: "#e0e7ff", body: "#a5b4fc", accent: "#22d3ee" },
  { file: "rotor", name: "Cánh Quạt", level: 3, head: "round", eyes: "happy", mouth: "smile", top: "propeller", bg: "#cffafe", body: "#67e8f9", accent: "#f43f5e" },
  { file: "cyclo", name: "Mắt Thần", level: 3, head: "tall", eyes: "cyclops", mouth: "grill", top: "bolt", bg: "#ede9fe", body: "#c4b5fd", accent: "#facc15" },
  { file: "dj", name: "DJ Mạch", level: 4, head: "dome", eyes: "visor", mouth: "smile", top: "headphones", bg: "#fee2e2", body: "#fca5a5", accent: "#34d399" },
  { file: "titan", name: "Titan", level: 4, head: "hex", eyes: "squares", mouth: "grill", top: "bolt", bg: "#e2e8f0", body: "#94a3b8", accent: "#fbbf24" },
  { file: "king", name: "Vua Robot", level: 5, head: "square", eyes: "big", mouth: "smile", top: "crown", bg: "#fef9c3", body: "#facc15", accent: "#ef4444" },
  { file: "nova", name: "Nova", level: 5, head: "round", eyes: "visor", mouth: "line", top: "star", bg: "#1e293b", body: "#818cf8", accent: "#fde047" },
  { file: "gift-blaze", name: "Lửa Thiêng", gifted: true, head: "tall", eyes: "happy", mouth: "smile", top: "flame", bg: "#ffedd5", body: "#fb923c", accent: "#fde047" },
  { file: "gift-champ", name: "Nhà Vô Địch", gifted: true, head: "wide", eyes: "big", mouth: "smile", top: "star", bg: "#d1fae5", body: "#34d399", accent: "#0ea5e9" },
  { file: "gift-buddy", name: "Bạn Tốt", gifted: true, head: "dome", eyes: "happy", mouth: "dot", top: "twin", bg: "#fce7f3", body: "#f472b6", accent: "#fef08a" },
];

if (process.argv[1]?.endsWith("generate-avatars.mjs")) {
  mkdirSync("public/avatars", { recursive: true });
  for (const a of AVATARS) writeFileSync(`public/avatars/${a.file}.svg`, svg(a), "utf8");
  console.log(`Đã sinh ${AVATARS.length} avatar vào public/avatars`);
}
