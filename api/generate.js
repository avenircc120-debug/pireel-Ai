// ============================================================
// PIREEL - api/generate.js
// Route API Vercel — Générateur de Scripts Vidéo
// Provider : Google Gemini (GEMINI_KEY_01 … GEMINI_KEY_10)
// ============================================================

import { createClient } from "@supabase/supabase-js";

// ------------------------------------------------------------------
// CONFIGURATION SUPABASE
// ------------------------------------------------------------------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ------------------------------------------------------------------
// POOL DE CLÉS GEMINI — GEMINI_KEY_01 … GEMINI_KEY_10
// ------------------------------------------------------------------
function buildGeminiPool() {
  const pool = [];
  for (let i = 1; i <= 10; i++) {
    const key = process.env[`GEMINI_KEY_${String(i).padStart(2, "0")}`];
    if (key) pool.push({ provider: "gemini", key, index: i });
  }
  // Clé unique si définie sans numéro
  if (pool.length === 0 && process.env.GEMINI_API_KEY) {
    pool.push({ provider: "gemini", key: process.env.GEMINI_API_KEY, index: 1 });
  }
  return pool;
}

// ------------------------------------------------------------------
// ROUND ROBIN
// ------------------------------------------------------------------
let rrIndex = Math.floor(Math.random() * 10);

function getNextKey(pool) {
  if (pool.length === 0) throw new Error("POOL_VIDE: Aucune clé Gemini disponible. Ajoutez GEMINI_API_KEY dans Vercel.");
  const entry = pool[rrIndex % pool.length];
  rrIndex = (rrIndex + 1) % pool.length;
  return entry;
}

// ------------------------------------------------------------------
// APPEL GEMINI
// ------------------------------------------------------------------
const GEMINI_MODEL = "gemini-2.0-flash";

async function callGemini(apiKey, systemPrompt, userPrompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: `${systemPrompt}\n\n${userPrompt}` }
          ]
        }
      ],
      generationConfig: {
        temperature:     0.85,
        maxOutputTokens: 800,
        topP:            0.95,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`GEMINI_${res.status}: ${err?.error?.message || res.statusText}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

// ------------------------------------------------------------------
// HANDLER PRINCIPAL
// ------------------------------------------------------------------
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée." });

  const { code_acces, sujet, style, duree, langue } = req.body;

  if (!code_acces || typeof code_acces !== "string" || code_acces.trim().length !== 6) {
    return res.status(400).json({ error: "Code d'accès invalide (6 caractères requis)." });
  }

  if (!sujet || sujet.trim().length < 3) {
    return res.status(400).json({ error: "Sujet manquant ou trop court." });
  }

  const today = new Date().toISOString().split("T")[0];

  // ── Récupérer l'utilisateur Supabase ──
  const { data: user, error } = await supabase
    .from("users")
    .select("id, email, nom, prenom, type_machine, points_solde, daily_video_count, last_active_date")
    .eq("code_acces", code_acces.trim().toUpperCase())
    .single();

  if (error || !user) {
    return res.status(401).json({ error: "Code d'accès invalide. Vérifiez votre code PIREEL." });
  }

  // ── Réinitialiser compteur si nouveau jour ──
  if (!user.last_active_date || user.last_active_date !== today) {
    await supabase
      .from("users")
      .update({ daily_video_count: 0, last_active_date: today })
      .eq("id", user.id);
    user.daily_video_count = 0;
  }

  // ── Vérifier les points ──
  if ((user.points_solde || 0) < 10) {
    return res.status(402).json({ error: "Points insuffisants. Rechargez votre compte PIREEL." });
  }

  try {
    // ── Sélectionner une clé Gemini ──
    const pool  = buildGeminiPool();
    const entry = getNextKey(pool);

    const systemPrompt =
      "Tu es un expert en création de scripts vidéo courts et percutants pour les réseaux sociaux africains. " +
      "Crée des scripts dynamiques, culturellement adaptés et engageants.";

    const userPrompt =
      `Crée un script vidéo court (${duree || "30 secondes"}) sur : "${sujet.trim()}"\n` +
      `Style : ${style || "dynamique et moderne"}\n` +
      `Langue : ${langue || "français"}\n` +
      `Format : 3 segments de texte à l'écran, séparés par ---\n` +
      `Chaque segment : 1-2 phrases percutantes, adaptées aux réseaux sociaux africains.`;

    const script = await callGemini(entry.key, systemPrompt, userPrompt);

    // ── Déduire les points ──
    await supabase
      .from("users")
      .update({
        points_solde:      Math.max(0, (user.points_solde || 0) - 10),
        daily_video_count: (user.daily_video_count || 0) + 1,
        last_active_date:  today,
      })
      .eq("id", user.id);

    // ── Logger la génération ──
    await supabase.from("generations").insert({
      user_id:        user.id,
      sujet:          sujet.substring(0, 200),
      categorie:      "script",
      contenu:        script.substring(0, 500),
      points_debites: 10,
      provider_used:  `gemini:${GEMINI_MODEL}:key_${String(entry.index).padStart(2, "0")}`,
      vercel_region:  process.env.VERCEL_REGION || "cdg1",
      created_at:     new Date().toISOString(),
    });

    return res.status(200).json({
      success:  true,
      script,
      provider: `gemini:${GEMINI_MODEL}`,
      key_used: `GEMINI_KEY_${String(entry.index).padStart(2, "0")}`,
      user: {
        nom:               user.nom,
        prenom:            user.prenom,
        points_solde:      Math.max(0, (user.points_solde || 0) - 10),
        daily_video_count: (user.daily_video_count || 0) + 1,
      },
    });

  } catch (err) {
    console.error("[PIREEL generate] Erreur Gemini:", err.message);
    return res.status(500).json({ error: err.message || "Erreur serveur Gemini." });
  }
}
