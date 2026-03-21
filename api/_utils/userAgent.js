// ============================================================
// PIREEL — api/_utils/userAgent.js
// Utilitaire partagé : Rotation User-Agent & Headers anti-bot
// Importé par generate.js, studio-generate.js, me.js
// ============================================================

// Pool de 40 User-Agents réels (navigateurs Desktop + Mobile)
export const USER_AGENTS = [
  // Chrome Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.91 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  // Chrome macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.124 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 12_7_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.36",
  // Safari macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 12_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15",
  // Firefox Desktop
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
  "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:124.0) Gecko/20100101 Firefox/124.0",
  // Edge Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
  // Chrome Android
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 13; Samsung Galaxy S23) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.40 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 12; Redmi Note 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.105 Mobile Safari/537.36",
  // Safari iOS
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  // Firefox Android
  "Mozilla/5.0 (Android 14; Mobile; rv:124.0) Gecko/124.0 Firefox/124.0",
  "Mozilla/5.0 (Android 13; Mobile; rv:123.0) Gecko/123.0 Firefox/123.0",
  // Opera
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 OPR/110.0.0.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 OPR/109.0.0.0",
  // Brave
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  // Chrome Linux
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0",
  // Navigateurs africains courants
  "Mozilla/5.0 (Linux; Android 10; Tecno Camon 16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.5845.92 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 11; Infinix X6823) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.57 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 12; Itel A663L) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.5481.154 Mobile Safari/537.36",
];

// Pool Accept-Language diversifié
const ACCEPT_LANGUAGES = [
  "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  "fr-BJ,fr;q=0.9,en;q=0.8",
  "fr-CI,fr;q=0.9,en;q=0.7",
  "fr-SN,fr;q=0.9,en;q=0.8",
  "en-US,en;q=0.9,fr;q=0.8",
  "en-GB,en;q=0.9,fr;q=0.8",
  "fr-CA,fr;q=0.9,en-CA;q=0.8,en;q=0.7",
  "fr-BE,fr;q=0.9,nl;q=0.5,en;q=0.4",
];

// Pool Accept diversifié
const ACCEPT_VALUES = [
  "application/json, text/plain, */*",
  "application/json, */*;q=0.9",
  "*/*",
  "application/json",
];

// Pool SEC-CH-UA (client hints Chrome)
const SEC_CH_UA = [
  '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
  '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
];

/**
 * Retourne un User-Agent aléatoire du pool
 */
export function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Retourne un Accept-Language aléatoire
 */
export function randomAcceptLanguage() {
  return ACCEPT_LANGUAGES[Math.floor(Math.random() * ACCEPT_LANGUAGES.length)];
}

/**
 * Génère un ensemble complet de headers réalistes pour un appel API LLM
 * (Groq, OpenAI, Mistral, etc.)
 */
export function buildHumanHeaders(apiKey, extraHeaders = {}) {
  const ua = randomUA();
  const isMobile = ua.includes("Mobile") || ua.includes("Android") || ua.includes("iPhone");

  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`,
    "User-Agent": ua,
    "Accept": ACCEPT_VALUES[Math.floor(Math.random() * ACCEPT_VALUES.length)],
    "Accept-Language": randomAcceptLanguage(),
    "Accept-Encoding": "gzip, deflate, br",
    "X-Request-ID": crypto.randomUUID(),
    "X-Forwarded-For": randomIPv4(),
    ...(ua.includes("Chrome") && {
      "sec-ch-ua": SEC_CH_UA[Math.floor(Math.random() * SEC_CH_UA.length)],
      "sec-ch-ua-mobile": isMobile ? "?1" : "?0",
      "sec-ch-ua-platform": isMobile ? '"Android"' : '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "cross-site",
    }),
    ...extraHeaders,
  };
}

/**
 * Génère une IP aléatoire plausible (non-bot)
 * Utilisée dans X-Forwarded-For pour varier les traces réseau
 */
export function randomIPv4() {
  // Plages IP résidentielles courantes (Afrique + Europe)
  const ranges = [
    () => `41.${r(0,255)}.${r(0,255)}.${r(1,254)}`,   // Afrique
    () => `154.${r(0,255)}.${r(0,255)}.${r(1,254)}`,  // Afrique
    () => `196.${r(0,255)}.${r(0,255)}.${r(1,254)}`,  // Afrique
    () => `197.${r(0,255)}.${r(0,255)}.${r(1,254)}`,  // Afrique
    () => `82.${r(0,255)}.${r(0,255)}.${r(1,254)}`,   // Europe
    () => `91.${r(0,255)}.${r(0,255)}.${r(1,254)}`,   // Europe
    () => `78.${r(0,255)}.${r(0,255)}.${r(1,254)}`,   // Europe
  ];
  return ranges[Math.floor(Math.random() * ranges.length)]();
}

function r(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Délai anti-pattern (évite les intervalles trop réguliers entre requêtes)
 * @param {number} baseMs - Délai de base en ms
 */
export function jitteredDelay(baseMs = 500) {
  const jitter = Math.random() * baseMs * 0.5; // ±25% de jitter
  return new Promise(r => setTimeout(r, baseMs + jitter));
}
