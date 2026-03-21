// ============================================================
// PIREEL — cloudflare-worker.js
// Cloudflare Worker : Proxy transparent devant Vercel
// But : Masquer l'IP Vercel, ajouter headers de sécurité,
//       rate-limiting basique, anti-scraping
//
// DÉPLOIEMENT :
//   1. Créez un Worker sur https://workers.cloudflare.com
//   2. Collez ce script dans l'éditeur
//   3. Ajoutez la variable VERCEL_URL = "votre-projet.vercel.app"
//   4. Liez votre domaine pireel.com → ce Worker dans DNS (orange cloud)
// ============================================================

// ──────────────────────────────────────────────────────────────
// CONFIGURATION (modifiez via Variables Cloudflare Workers)
// ──────────────────────────────────────────────────────────────
// Variables d'environnement à définir dans Cloudflare Dashboard :
//   VERCEL_URL    = "pireel-studio.vercel.app"  (sans https://)
//   SECRET_TOKEN  = "un-token-secret-partagé"   (optionnel)

// ──────────────────────────────────────────────────────────────
// RATE LIMITING BASIQUE (par IP, en mémoire — se réinitialise par instance)
// Pour un rate limiting persistant, utilisez Cloudflare KV ou Durable Objects
// ──────────────────────────────────────────────────────────────
const ipCounts = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30;           // max 30 requêtes / minute / IP

function isRateLimited(ip) {
  const now = Date.now();
  const entry = ipCounts.get(ip) || { count: 0, reset: now + RATE_LIMIT_WINDOW_MS };

  if (now > entry.reset) {
    ipCounts.set(ip, { count: 1, reset: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  ipCounts.set(ip, entry);
  return entry.count > RATE_LIMIT_MAX;
}

// ──────────────────────────────────────────────────────────────
// HANDLER PRINCIPAL
// ──────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const country  = request.headers.get('CF-IPCountry') || 'XX';

    // 1. Rate limiting
    if (isRateLimited(clientIP)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Trop de requêtes. Réessayez dans 1 minute.' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '60',
            'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
          },
        }
      );
    }

    // 2. Construire l'URL de destination Vercel (origine masquée)
    const vercelHost = env.VERCEL_URL || 'pireel-studio.vercel.app';
    const destUrl = `https://${vercelHost}${url.pathname}${url.search}`;

    // 3. Cloner les headers en retirant les infos qui exposent Cloudflare
    const newHeaders = new Headers(request.headers);

    // Transmettre l'IP réelle du client à Vercel (pour logs côté serveur)
    newHeaders.set('X-Real-IP', clientIP);
    newHeaders.set('X-Forwarded-For', clientIP);
    newHeaders.set('X-Country', country);

    // Retirer les headers Cloudflare qui révèlent l'infrastructure
    newHeaders.delete('CF-Connecting-IP');
    newHeaders.delete('CF-IPCountry');
    newHeaders.delete('CF-Ray');
    newHeaders.delete('CF-Visitor');

    // Ajouter un token secret partagé avec Vercel
    // → Côté Vercel, vérifiez que req.headers['x-pireel-origin'] === SECRET_TOKEN
    if (env.SECRET_TOKEN) {
      newHeaders.set('X-Pireel-Origin', env.SECRET_TOKEN);
    }

    // 4. Proxy vers Vercel
    let response;
    try {
      response = await fetch(destUrl, {
        method:  request.method,
        headers: newHeaders,
        body:    ['GET', 'HEAD'].includes(request.method) ? null : await request.arrayBuffer(),
        redirect: 'follow',
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ success: false, error: 'Service temporairement indisponible.' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 5. Cloner la réponse en ajoutant des headers de sécurité
    const respHeaders = new Headers(response.headers);

    // Masquer que l'origine est Vercel
    respHeaders.delete('x-vercel-id');
    respHeaders.delete('x-vercel-cache');
    respHeaders.delete('server');

    // Headers de sécurité
    respHeaders.set('X-Content-Type-Options', 'nosniff');
    respHeaders.set('X-Frame-Options', 'DENY');
    respHeaders.set('Referrer-Policy', 'no-referrer');
    respHeaders.set('X-Robots-Tag', 'noindex, nofollow');
    respHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate');

    // CORS : n'autoriser que votre domaine
    respHeaders.set('Access-Control-Allow-Origin', 'https://pireel.com');
    respHeaders.set('Vary', 'Origin');

    return new Response(response.body, {
      status:  response.status,
      headers: respHeaders,
    });
  },
};
