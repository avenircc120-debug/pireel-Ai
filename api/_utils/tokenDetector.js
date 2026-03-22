// ============================================================
// PIREEL — Détecteur universel de tokens
// Identifie automatiquement le service à partir du token
// ============================================================

export const TOKEN_PROFILES = {
  github: {
    name: "GitHub",
    prefixes: ["ghp_", "github_pat_", "gho_", "ghs_", "ghu_"],
    patterns: [/^ghp_[a-zA-Z0-9]{36}$/, /^github_pat_/],
    baseUrl: "https://api.github.com",
    testEndpoint: "/user",
    authHeader: (token) => `token ${token}`,
    color: "#24292e",
  },

  vercel: {
    name: "Vercel",
    prefixes: [],
    patterns: [/^[a-zA-Z0-9]{24}$/, /^vc_/],
    baseUrl: "https://api.vercel.com",
    testEndpoint: "/v2/user",
    authHeader: (token) => `Bearer ${token}`,
    color: "#000000",
  },

  netlify: {
    name: "Netlify",
    prefixes: [],
    patterns: [/^[a-zA-Z0-9_-]{40,50}$/],
    baseUrl: "https://api.netlify.com/api/v1",
    testEndpoint: "/user",
    authHeader: (token) => `Bearer ${token}`,
    color: "#00C7B7",
  },

  openai: {
    name: "OpenAI",
    prefixes: ["sk-"],
    patterns: [/^sk-[a-zA-Z0-9]{48}$/, /^sk-proj-/],
    baseUrl: "https://api.openai.com/v1",
    testEndpoint: "/models",
    authHeader: (token) => `Bearer ${token}`,
    color: "#10a37f",
  },

  groq: {
    name: "Groq",
    prefixes: ["gsk_"],
    patterns: [/^gsk_[a-zA-Z0-9]{50,}$/],
    baseUrl: "https://api.groq.com/openai/v1",
    testEndpoint: "/models",
    authHeader: (token) => `Bearer ${token}`,
    color: "#f55036",
  },

  xai: {
    name: "xAI (Grok)",
    prefixes: ["xai-"],
    patterns: [/^xai-[a-zA-Z0-9]{40,}$/],
    baseUrl: "https://api.x.ai/v1",
    testEndpoint: "/models",
    authHeader: (token) => `Bearer ${token}`,
    color: "#1DA1F2",
  },

  mistral: {
    name: "Mistral AI",
    prefixes: [],
    patterns: [/^[a-zA-Z0-9]{32}$/],
    baseUrl: "https://api.mistral.ai/v1",
    testEndpoint: "/models",
    authHeader: (token) => `Bearer ${token}`,
    color: "#ff7000",
  },

  huggingface: {
    name: "HuggingFace",
    prefixes: ["hf_"],
    patterns: [/^hf_[a-zA-Z0-9]{34,}$/],
    baseUrl: "https://huggingface.co/api",
    testEndpoint: "/whoami-v2",
    authHeader: (token) => `Bearer ${token}`,
    color: "#FFD21E",
  },

  supabase_anon: {
    name: "Supabase (Anon Key)",
    prefixes: ["eyJ"],
    patterns: [/^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/],
    baseUrl: null,
    testEndpoint: null,
    authHeader: (token) => `Bearer ${token}`,
    color: "#3ECF8E",
  },

  kling: {
    name: "Kling AI",
    prefixes: [],
    patterns: [/^[a-zA-Z0-9_-]{32,64}$/],
    baseUrl: "https://api.klingai.com",
    testEndpoint: null,
    authHeader: (token) => `Bearer ${token}`,
    color: "#6366f1",
  },
};

/**
 * Détecte automatiquement le type de service d'un token.
 * Retourne le profil correspondant ou null si inconnu.
 */
export function detectTokenType(token) {
  if (!token || typeof token !== "string") return null;
  token = token.trim();

  for (const [serviceKey, profile] of Object.entries(TOKEN_PROFILES)) {
    // Vérification par préfixe (rapide)
    if (profile.prefixes.some((p) => token.startsWith(p))) {
      return { serviceKey, ...profile };
    }
    // Vérification par pattern regex
    if (profile.patterns.some((p) => p.test(token))) {
      return { serviceKey, ...profile };
    }
  }
  return null;
}

/**
 * Teste si un token est valide en appelant le endpoint de test.
 * Retourne { valid, user, service } ou { valid: false, error }
 */
export async function validateToken(token, profile) {
  if (!profile.testEndpoint) {
    return { valid: true, service: profile.name, user: null, note: "Validation directe non disponible" };
  }

  try {
    const res = await fetch(`${profile.baseUrl}${profile.testEndpoint}`, {
      headers: {
        Authorization: profile.authHeader(token),
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      return { valid: false, service: profile.name, error: `HTTP ${res.status}` };
    }

    const data = await res.json();
    const user =
      data.login ||      // GitHub
      data.email ||      // Vercel / Netlify
      data.name ||       // OpenAI models list
      data.id ||
      "Authentifié";

    return { valid: true, service: profile.name, user, raw: data };
  } catch (err) {
    return { valid: false, service: profile.name, error: err.message };
  }
}
