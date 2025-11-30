import { AvatarCategory } from "./types";

export interface AvatarItem {
  id: string;
  name: string;
  svg: string; // The SVG content string
  category: AvatarCategory;
}

// Helper to create simple SVG strings
const createSvg = (content: string, viewBox = "0 0 200 200") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none">${content}</svg>`;

export const BACKGROUNDS = [
  { id: "bg-blue", color: "#e0f2fe" },
  { id: "bg-green", color: "#dcfce7" },
  { id: "bg-yellow", color: "#fef9c3" },
  { id: "bg-purple", color: "#f3e8ff" },
  { id: "bg-red", color: "#fee2e2" },
  { id: "bg-gray", color: "#f1f5f9" },
];

// --- BODY PARTS ---

const BODY_BASE = `
  <path d="M60 140 L60 200 L140 200 L140 140 C140 140 160 140 160 110 C160 80 140 80 140 80 L140 60 C140 30 130 10 100 10 C70 10 60 30 60 60 L60 80 C60 80 40 80 40 110 C40 140 60 140 60 140 Z" fill="#ffdbac"/>
`;

const BODY_PALE = `
  <path d="M60 140 L60 200 L140 200 L140 140 C140 140 160 140 160 110 C160 80 140 80 140 80 L140 60 C140 30 130 10 100 10 C70 10 60 30 60 60 L60 80 C60 80 40 80 40 110 C40 140 60 140 60 140 Z" fill="#f1c27d"/>
`;

const BODY_DARK = `
  <path d="M60 140 L60 200 L140 200 L140 140 C140 140 160 140 160 110 C160 80 140 80 140 80 L140 60 C140 30 130 10 100 10 C70 10 60 30 60 60 L60 80 C60 80 40 80 40 110 C40 140 60 140 60 140 Z" fill="#8d5524"/>
`;

// --- EYES ---

const EYES_NORMAL = `
  <circle cx="85" cy="70" r="5" fill="#1e293b"/>
  <circle cx="115" cy="70" r="5" fill="#1e293b"/>
`;

const EYES_HAPPY = `
  <path d="M80 70 Q85 65 90 70" stroke="#1e293b" stroke-width="3" stroke-linecap="round"/>
  <path d="M110 70 Q115 65 120 70" stroke="#1e293b" stroke-width="3" stroke-linecap="round"/>
`;

const EYES_WINK = `
  <circle cx="85" cy="70" r="5" fill="#1e293b"/>
  <path d="M110 70 Q115 75 120 70" stroke="#1e293b" stroke-width="3" stroke-linecap="round"/>
`;

const EYES_SUNGLASSES = `
  <path d="M75 65 H95 L95 75 Q95 80 85 80 Q75 80 75 75 Z" fill="#1e293b"/>
  <path d="M105 65 H125 L125 75 Q125 80 115 80 Q105 80 105 75 Z" fill="#1e293b"/>
  <line x1="95" y1="68" x2="105" y2="68" stroke="#1e293b" stroke-width="2"/>
`;

// --- MOUTH ---

const MOUTH_SMILE = `
  <path d="M90 90 Q100 100 110 90" stroke="#1e293b" stroke-width="3" stroke-linecap="round" fill="none"/>
`;

const MOUTH_OPEN = `
  <path d="M90 90 Q100 105 110 90 Z" fill="#ef4444"/>
`;

const MOUTH_SERIOUS = `
  <line x1="90" y1="95" x2="110" y2="95" stroke="#1e293b" stroke-width="3" stroke-linecap="round"/>
`;

// --- CLOTHES (TOP) ---

const TOP_TSHIRT_RED = `
  <path d="M60 140 L60 200 L140 200 L140 140 C140 140 160 140 160 110 L140 110 L140 140 L60 140 L60 110 L40 110 C40 140 60 140 60 140 Z" fill="#ef4444"/>
  <path d="M60 140 L140 140 L140 110 L60 110 Z" fill="#ef4444"/> 
  <!-- Simple T-shape overlay -->
  <path d="M50 110 L150 110 L150 130 L130 130 L130 180 L70 180 L70 130 L50 130 Z" fill="#ef4444"/>
`;

const TOP_HOODIE_GRAY = `
  <path d="M45 110 L155 110 L155 135 L135 135 L135 185 L65 185 L65 135 L45 135 Z" fill="#64748b"/>
  <path d="M85 110 L115 110 L115 125 L85 125 Z" fill="#475569"/>
`;

const TOP_SUIT_BLUE = `
  <path d="M50 110 L150 110 L150 130 L130 130 L130 180 L70 180 L70 130 L50 130 Z" fill="#1e3a8a"/>
  <path d="M95 110 L105 110 L105 180 L95 180 Z" fill="#ffffff"/>
  <path d="M95 110 L105 110 L100 120 Z" fill="#ef4444"/>
`;

// --- CLOTHES (BOTTOM) ---
// Positioned lower down

const BOTTOM_JEANS = `
  <path d="M70 180 L130 180 L130 200 L70 200 Z" fill="#1d4ed8"/>
  <line x1="100" y1="180" x2="100" y2="200" stroke="#1e3a8a" stroke-width="1"/>
`;

const BOTTOM_SHORTS = `
  <path d="M70 180 L130 180 L130 190 L70 190 Z" fill="#d97706"/>
`;

// --- ACCESSORIES ---

const ACC_HAT_CAP = `
  <path d="M70 40 L130 40 L130 60 L70 60 Z" fill="#ef4444"/>
  <path d="M70 60 L150 60 L150 65 L70 65 Z" fill="#ef4444"/>
`;

const ACC_HEADPHONES = `
  <path d="M55 60 C55 30 145 30 145 60" stroke="#1e293b" stroke-width="5" fill="none"/>
  <rect x="50" y="55" width="10" height="20" rx="2" fill="#334155"/>
  <rect x="140" y="55" width="10" height="20" rx="2" fill="#334155"/>
`;

export const ASSETS: AvatarItem[] = [
  // Body
  { id: "body-light", name: "Light", category: "body", svg: createSvg(BODY_BASE) },
  { id: "body-pale", name: "Pale", category: "body", svg: createSvg(BODY_PALE) },
  { id: "body-dark", name: "Dark", category: "body", svg: createSvg(BODY_DARK) },

  // Eyes
  { id: "eyes-normal", name: "Normal", category: "eyes", svg: createSvg(EYES_NORMAL) },
  { id: "eyes-happy", name: "Happy", category: "eyes", svg: createSvg(EYES_HAPPY) },
  { id: "eyes-wink", name: "Wink", category: "eyes", svg: createSvg(EYES_WINK) },
  { id: "eyes-sunglasses", name: "Cool", category: "eyes", svg: createSvg(EYES_SUNGLASSES) },

  // Mouth
  { id: "mouth-smile", name: "Smile", category: "mouth", svg: createSvg(MOUTH_SMILE) },
  { id: "mouth-open", name: "Open", category: "mouth", svg: createSvg(MOUTH_OPEN) },
  { id: "mouth-serious", name: "Serious", category: "mouth", svg: createSvg(MOUTH_SERIOUS) },

  // Top
  { id: "top-tshirt", name: "Red Tee", category: "top", svg: createSvg(TOP_TSHIRT_RED) },
  { id: "top-hoodie", name: "Hoodie", category: "top", svg: createSvg(TOP_HOODIE_GRAY) },
  { id: "top-suit", name: "Suit", category: "top", svg: createSvg(TOP_SUIT_BLUE) },

  // Bottom
  { id: "bottom-jeans", name: "Jeans", category: "bottom", svg: createSvg(BOTTOM_JEANS) },
  { id: "bottom-shorts", name: "Shorts", category: "bottom", svg: createSvg(BOTTOM_SHORTS) },

  // Accessories
  { id: "acc-hat", name: "Cap", category: "accessories", svg: createSvg(ACC_HAT_CAP) },
  { id: "acc-headphones", name: "Headphones", category: "accessories", svg: createSvg(ACC_HEADPHONES) },
];

export const getAsset = (id: string) => ASSETS.find(a => a.id === id);
