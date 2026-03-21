// ============================================================
// PIREEL - api/generate.js
// Route API Vercel — Générateur de Vidéos avec Protection Anti-Blocage
// Rotation 30 clés | 1 région Vercel (cdg1) | Multi-modèles | Headers aléatoires
// ============================================================

import { createClient } from "@supabase/supabase-js";
import { buildHumanHeaders, jitteredDelay } from "./_utils/userAgent.js";

// ------------------------------------------------------------------
// CONFIGURATION SUPABASE
// ------------------------------------------------------------------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ------------------------------------------------------------------
// POOL DE CLÉS API (variables d'environnement Vercel)
// Format : GROQ_KEY_01 … GROQ_KEY_30, OPENAI_KEY_01 … OPENAI_KEY_10, MISTRAL_KEY_01 … MISTRAL_KEY_10
// ------------------------------------------------------------------
function buildKeyPool() {
  const pool = [];
  for (let i = 1; i <= 30; i++) {
    const key = process.env[`GROQ_KEY_${String(i).padStart(2, "0")}`];
    if (key) pool.push({ provider: "groq", key, index: i });
  }
  for (let i = 1; i <= 10; i++) {
    const key = process.env[`OPENAI_KEY_${String(i).padStart(2, "0")}`];
    if (key) pool.push({ provider: "openai", key, index: i });
  }
  for (let i = 1; i <= 10; i++) {
    const key = process.env[`MISTRAL_KEY_${String(i).padStart(2, "0")}`];
    if (key) pool.push({ provider: "mistral", key, index: i });
  }
  return pool;
}

// ------------------------------------------------------------------
// ROUND ROBIN — Index de départ aléatoire (par cold start)
// ------------------------------------------------------------------
let rrIndex = Math.floor(Math.random() * 30);

function getNextKey(pool) {
  if (pool.length === 0) throw new Error("POOL_VIDE: Aucune clé API disponible.");
  const entry = pool[rrIndex % pool.length];
  rrIndex = (rrIndex + 1) % pool.length;
  return entry;
}

// ------------------------------------------------------------------
// APPELS API avec rotation headers (via utilitaire partagé)
// ------------------------------------------------------------------
async function callGroq(apiKey, prompt) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: buildHumanHeaders(apiKey),
    body: JSON.stringify({
      model: "llama3-8b-8192",
      messages: [
        { role: "system", content: "Tu es un expert en création de scripts vidéo courts et percutants pour les réseaux sociaux africains." },
        { role: "user", content: prompt },
      ],
      max_tokens: 600,
      temperature: 0.85,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`GROQ_${res.status}: ${err?.error?.message || res.statusText}`);
  }
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

async function callOpenAI(apiKey, prompt) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: buildHumanHeaders(apiKey),
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Tu es un expert en création de scripts vidéo courts et percutants pour les réseaux sociaux africains." },
        { role: "user", content: prompt },
      ],
      max_tokens: 600,
      temperature: 0.85,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`OPENAI_${res.status}: ${err?.error?.message || res.statusText}`);
  }
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

async function callMistral(apiKey, prompt) {
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: buildHumanHeaders(apiKey),
    body: JSON.stringify({
      model: "mistral-small-latest",
      messages: [
        { role: "system", content: "Tu es un expert en création de scripts vidéo courts et percutants pour les réseaux sociaux africains." },
        { role: "user", content: prompt },
      ],
      max_tokens: 600,
      temperature: 0.85,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`MISTRAL_${res.status}: ${err?.error?.message || res.statusText}`);
  }
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

// ------------------------------------------------------------------
// DISPATCH MULTI-MODÈLES avec fallback + jitter anti-bot
// ------------------------------------------------------------------
async function generateWithFallback(pool, prompt) {
  const tried = new Set();
  let lastError = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const entry = getNextKey(pool);
    const uniqKey = `${entry.provider}_${entry.index}`;
    if (tried.has(uniqKey)) continue;
    tried.add(uniqKey);

    try {
      console.log(`[PIREEL] Tentative ${attempt + 1} — Clé: ${entry.provider.toUpperCase()}_${String(entry.index).padStart(2, "0")}`);

      // Jitter entre tentatives pour éviter le fingerprinting de délai
      if (attempt > 0) await jitteredDelay(300 + Math.random() * 400);

      if (entry.provider === "groq")    return { result: await callGroq(entry.key, prompt),    provider: entry.provider, keyIndex: entry.index };
      if (entry.provider === "openai")  return { result: await callOpenAI(entry.key, prompt),  provider: entry.provider, keyIndex: entry.index };
      if (entry.provider === "mistral") return { result: await callMistral(entry.key, prompt), provider: entry.provider, keyIndex: entry.index };

    } catch (err) {
      lastError = err;
      console.error(`[PIREEL] Clé ${uniqKey} échouée: ${err.message}`);
      if (err.message.includes("429")) await jitteredDelay(1500);
    }
  }

  throw new Error(`TOUTES_CLES_ECHOUEES: ${lastError?.message}`);
}

// ------------------------------------------------------------------
// RÈGLES MACHINES
// ------------------------------------------------------------------
const MACHINE_RULES = {
  bronze: { limite: 2, points_parrainage: 200, label: "Bronze" },
  argent: { limite: 3, points_parrainage: 300, label: "Argent" },
  or:     { limite: 4, points_parrainage: 400, label: "Or"     },
};

// ------------------------------------------------------------------
// HANDLER PRINCIPAL
// ------------------------------------------------------------------
export default async function handler(req, res) {

  // CORS
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Méthode non autorisée." });

  try {
    const { code_acces, sujet, categorie } = req.body;

    if (!code_acces || typeof code_acces !== "string") {
      return res.status(400).json({ success: false, error: "Code d'accès manquant." });
    }
    if (!sujet || sujet.trim().length < 3) {
      return res.status(400).json({ success: false, error: "Le sujet de la vidéo est requis (min. 3 caractères)." });
    }

    // 1. Récupérer l'utilisateur
    const { data: user, error: fetchErr } = await supabase
      .from("users")
      .select("id, email, nom, type_machine, points_solde, daily_video_count, last_active_date")
      .eq("code_acces", code_acces.trim().toUpperCase())
      .single();

    if (fetchErr || !user) {
      return res.status(401).json({ success: false, error: "Code d'accès invalide. Vérifiez votre code PIREEL." });
    }

    // 2. Réinitialiser le compteur journalier si nouveau jour
    const today = new Date().toISOString().split("T")[0];
    let dailyCount = user.daily_video_count;

    if (!user.last_active_date || user.last_active_date !== today) {
      await supabase.from("users").update({ daily_video_count: 0, last_active_date: today }).eq("id", user.id);
      dailyCount = 0;
    }

    // 3. Vérifier le type de machine
    const machine = MACHINE_RULES[user.type_machine?.toLowerCase()];
    if (!machine) {
      return res.status(403).json({ success: false, error: "Machine non reconnue. Contactez le support PIREEL." });
    }

    // 4. Vérifier la limite journalière
    if (dailyCount >= machine.limite) {
      return res.status(429).json({
        success: false,
        error: `Limite journalière atteinte pour la Machine ${machine.label} (${machine.limite} vidéos/jour). Revenez demain !`,
        limite: machine.limite,
        compteur: dailyCount,
      });
    }

    // 5. Vérifier le solde de points
    if (user.points_solde < 100) {
      return res.status(402).json({
        success: false,
        error: "Solde de points insuffisant. Minimum 100 points requis.",
        solde_actuel: user.points_solde,
        redirect_achat: process.env.APP1_URL || "https://votre-app1.com/packs",
        packs_disponibles: [
          { nom: "Pack Starter",  prix: "500 FCFA",  points: 500  },
          { nom: "Pack Pro",      prix: "1500 FCFA", points: 1600 },
          { nom: "Pack Premium",  prix: "3000 FCFA", points: 3500 },
        ],
      });
    }

    // 6. Construire le prompt
    const categorieLabel = categorie || "général";
    const prompt = `Génère un script de vidéo courte de 30 secondes (environ 75 mots à lire à voix haute) sur le sujet suivant : "${sujet.trim()}".

Contexte : vidéo pour les réseaux sociaux (TikTok / Reels / YouTube Shorts) destinée au public africain, notamment béninois.
Catégorie : ${categorieLabel}
Machine PIREEL : ${machine.label}

Format de réponse OBLIGATOIRE :
🎬 TITRE : [Titre accrocheur]
📢 SCRIPT : [Le texte à lire, 70-80 mots maximum]
🏷️ HASHTAGS : [5-7 hashtags pertinents]
💡 CONSEIL TOURNAGE : [1 astuce concrète]`;

    // 7. Générer avec rotation de clés
    const keyPool = buildKeyPool();
    if (keyPool.length === 0) {
      console.error("[PIREEL] ERREUR CRITIQUE: Aucune clé API configurée.");
      return res.status(500).json({ success: false, error: "Service temporairement indisponible. Réessayez dans quelques minutes." });
    }

    const { result: contenu, provider, keyIndex } = await generateWithFallback(keyPool, prompt);

    // 8. Mettre à jour points + compteur
    const nouveauSolde    = user.points_solde - 100;
    const nouveauCompteur = dailyCount + 1;

    const { error: updateErr } = await supabase
      .from("users")
      .update({ points_solde: nouveauSolde, daily_video_count: nouveauCompteur, last_active_date: today })
      .eq("id", user.id);

    if (updateErr) console.error("[PIREEL] Erreur mise à jour Supabase:", updateErr);

    // 9. Historique (optionnel)
    await supabase.from("generations").insert({
      user_id: user.id,
      sujet: sujet.trim(),
      categorie: categorieLabel,
      contenu,
      points_debites: 100,
      provider_used: provider,
      vercel_region: process.env.VERCEL_REGION || "cdg1",
      created_at: new Date().toISOString(),
    }).select();

    // 10. Réponse finale
    return res.status(200).json({
      success: true,
      contenu,
      meta: {
        machine:           machine.label,
        points_debites:    100,
        solde_restant:     nouveauSolde,
        videos_aujourd_hui: nouveauCompteur,
        limite_jour:       machine.limite,
        videos_restantes:  machine.limite - nouveauCompteur,
        provider_ia:       provider,
      },
    });

  } catch (err) {
    console.error("[PIREEL] Erreur serveur:", err);
    return res.status(500).json({
      success: false,
      error: "Erreur serveur inattendue. Réessayez dans quelques instants.",
      detail: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
}
