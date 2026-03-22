// ============================================================
// PIREEL Studio — api/studio-generate.js
// 3 segments × 10s | SEED partagé | Polling parallèle
// Moteurs : Kling | Luma | Runway | Pika
// Texte IA : Google Gemini (GEMINI_KEY_01 … GEMINI_KEY_10)
// ============================================================

export const config = { maxDuration: 300 };

import { createClient } from "@supabase/supabase-js";
import { buildHumanHeaders, randomUA, jitteredDelay } from "./_utils/userAgent.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── CORS ──
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

// ══════════════════════════════════════════════════════════════
// POOL DE CLÉS GEMINI
// ══════════════════════════════════════════════════════════════
function buildGeminiPool() {
  const pool = [];
  for (let i = 1; i <= 10; i++) {
    const key = process.env[`GEMINI_KEY_${String(i).padStart(2, "0")}`];
    if (key) pool.push({ key, index: i });
  }
  if (pool.length === 0 && process.env.GEMINI_API_KEY) {
    pool.push({ key: process.env.GEMINI_API_KEY, index: 1 });
  }
  return pool;
}

function pickRandomKeys(pool, n) {
  if (pool.length === 0) return [];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

// ── Améliore un prompt de clip avec Gemini ──
const GEMINI_MODEL = "gemini-2.0-flash";

async function enhanceWithGemini(geminiKey, segment, clipIndex) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text:
            "Tu es un expert en génération de vidéos IA cinématographiques. " +
            "Améliore le prompt vidéo fourni pour le rendre plus précis, visuel et adapté " +
            "à une vidéo de 10 secondes en format portrait 9:16. " +
            "Réponds UNIQUEMENT avec le prompt amélioré, sans explication ni ponctuation supplémentaire.\n\n" +
            `Clip ${clipIndex + 1}/3 — Améliore ce prompt pour une vidéo 10s cinématographique 4K :\n"${segment}"`
        }]
      }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 300 },
    }),
  });

  if (!r.ok) throw new Error(`Gemini ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || segment;
}

// ══════════════════════════════════════════════════════════════
// MOTEURS VIDÉO : SOUMISSION
// ══════════════════════════════════════════════════════════════
async function submitKling(apiKey, prompt, seed, duration) {
  const r = await fetch("https://api.klingai.com/v1/videos/text2video", {
    method: "POST",
    headers: buildHumanHeaders(apiKey),
    body: JSON.stringify({
      prompt,
      negative_prompt: "blur, low quality, watermark, text, logo",
      cfg_scale: 0.5, duration, seed,
      aspect_ratio: "9:16", mode: "std",
    }),
  });
  if (!r.ok) throw new Error(`Kling ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return { task_id: d.data?.task_id, engine: "kling" };
}

async function submitLuma(apiKey, prompt, seed, duration) {
  const r = await fetch("https://api.lumalabs.ai/dream-machine/v1/generations", {
    method: "POST",
    headers: buildHumanHeaders(apiKey),
    body: JSON.stringify({ prompt, duration: duration + "s", seed, aspect_ratio: "9:16" }),
  });
  if (!r.ok) throw new Error(`Luma ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return { task_id: d.id, engine: "luma" };
}

async function submitRunway(apiKey, prompt, seed, duration) {
  const r = await fetch("https://api.dev.runwayml.com/v1/image_to_video", {
    method: "POST",
    headers: buildHumanHeaders(apiKey),
    body: JSON.stringify({ promptText: prompt, duration, seed, ratio: "720:1280" }),
  });
  if (!r.ok) throw new Error(`Runway ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return { task_id: d.id, engine: "runway" };
}

async function submitPika(apiKey, prompt, seed, duration) {
  const r = await fetch("https://api.pika.art/v1/generate", {
    method: "POST",
    headers: buildHumanHeaders(apiKey),
    body: JSON.stringify({ prompt, duration, seed, aspectRatio: "9:16", resolution: "1080p" }),
  });
  if (!r.ok) throw new Error(`Pika ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return { task_id: d.id || d.taskId, engine: "pika" };
}

// ══════════════════════════════════════════════════════════════
// POLLING (commun à tous les moteurs)
// ══════════════════════════════════════════════════════════════
async function pollVideo(engine, taskId, apiKey, timeout = 240000) {
  const endpoints = {
    kling:  `https://api.klingai.com/v1/videos/text2video/${taskId}`,
    luma:   `https://api.lumalabs.ai/dream-machine/v1/generations/${taskId}`,
    runway: `https://api.dev.runwayml.com/v1/tasks/${taskId}`,
    pika:   `https://api.pika.art/v1/generations/${taskId}`,
  };

  const url = endpoints[engine];
  if (!url) throw new Error(`Moteur inconnu : ${engine}`);

  const start = Date.now();
  while (Date.now() - start < timeout) {
    await jitteredDelay(5000);
    const r = await fetch(url, { headers: buildHumanHeaders(apiKey) });
    if (!r.ok) continue;
    const d = await r.json();

    // Kling
    if (engine === "kling") {
      const status = d.data?.task_status;
      if (status === "succeed") return d.data?.task_result?.videos?.[0]?.url;
      if (status === "failed")  throw new Error(`Kling échoué: ${d.data?.task_status_msg}`);
    }
    // Luma
    if (engine === "luma") {
      if (d.state === "completed") return d.assets?.video;
      if (d.state === "failed")    throw new Error(`Luma échoué: ${d.failure_reason}`);
    }
    // Runway
    if (engine === "runway") {
      if (d.status === "SUCCEEDED") return d.output?.[0];
      if (d.status === "FAILED")    throw new Error(`Runway échoué`);
    }
    // Pika
    if (engine === "pika") {
      if (d.status === "finished") return d.videos?.[0]?.url || d.url;
      if (d.status === "failed")   throw new Error(`Pika échoué`);
    }
  }
  throw new Error(`Timeout ${engine} après ${timeout / 1000}s`);
}

// ══════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée." });

  const {
    code_acces,
    segments,
    engine = process.env.DEFAULT_ENGINE || "kling",
    seed: seedInput,
    duration = 10,
  } = req.body;

  if (!code_acces || code_acces.trim().length !== 6) {
    return res.status(400).json({ error: "Code d'accès invalide." });
  }

  const rawSegments = Array.isArray(segments)
    ? segments.filter(Boolean)
    : typeof segments === "string"
      ? segments.split("---").map(s => s.trim()).filter(Boolean)
      : [];

  if (rawSegments.length === 0) {
    return res.status(400).json({ error: "Segments vidéo manquants." });
  }

  const segCount  = Math.min(rawSegments.length, 3);
  const finalSeed = seedInput ?? Math.floor(Math.random() * 2_147_483_647);

  // ── Auth Supabase ──
  const { data: userRow } = await supabase
    .from("users")
    .select("id, points_solde, daily_video_count, last_active_date")
    .eq("code_acces", code_acces.trim().toUpperCase())
    .single();

  if (!userRow) return res.status(401).json({ error: "Code d'accès invalide." });
  if ((userRow.points_solde || 0) < 100) {
    return res.status(402).json({ error: "Points insuffisants (100 requis)." });
  }

  // ── Clé moteur vidéo ──
  const engineKeys = {
    kling:  process.env.KLING_API_KEY,
    luma:   process.env.LUMA_API_KEY,
    runway: process.env.RUNWAY_API_KEY,
    pika:   process.env.PIKA_API_KEY,
  };
  const videoKey = engineKeys[engine];
  if (!videoKey) return res.status(400).json({ error: `Moteur '${engine}' non configuré.` });

  // ── Clés Gemini pour amélioration des prompts ──
  const geminiPool = buildGeminiPool();
  const geminiKeys = pickRandomKeys(geminiPool, segCount);

  try {
    // Amélioration parallèle des segments avec Gemini
    const enhancedSegments = await Promise.all(
      rawSegments.slice(0, segCount).map(async (seg, i) => {
        if (geminiKeys[i]) {
          try {
            return await enhanceWithGemini(geminiKeys[i].key, seg, i);
          } catch (e) {
            console.warn(`[PIREEL] Gemini amélioration clip ${i + 1} échouée, utilisation du segment original:`, e.message);
            return seg;
          }
        }
        return seg;
      })
    );

    // Soumission parallèle des clips au moteur vidéo
    const clipPromises = enhancedSegments.map(async (prompt, i) => {
      await jitteredDelay(i * 800);
      try {
        const { task_id } = await {
          kling:  submitKling,
          luma:   submitLuma,
          runway: submitRunway,
          pika:   submitPika,
        }[engine](videoKey, prompt, finalSeed + i, duration);

        const url = await pollVideo(engine, task_id, videoKey);
        return { index: i, url, status: "ok", prompt_used: prompt };
      } catch (err) {
        console.error(`[PIREEL] Clip ${i + 1} échoué:`, err.message);
        return { index: i, url: null, status: "failed", error: err.message };
      }
    });

    const results     = await Promise.allSettled(clipPromises);
    const clips       = results.map(r => r.value || r.reason);
    const successUrls = clips.filter(c => c.status === "ok").map(c => c.url);

    if (successUrls.length === 0) {
      return res.status(500).json({ success: false, error: "Tous les clips ont échoué.", details: clips });
    }

    // ── Déduire les points ──
    if (userRow) {
      const today = new Date().toISOString().split("T")[0];
      await supabase.from("users").update({
        points_solde:      Math.max(0, (userRow.points_solde || 0) - 100),
        daily_video_count: (userRow.daily_video_count || 0) + 1,
        last_active_date:  today,
      }).eq("id", userRow.id);

      await supabase.from("generations").insert({
        user_id:        userRow.id,
        sujet:          rawSegments[0].substring(0, 200),
        categorie:      "studio",
        contenu:        `${successUrls.length} clips | SEED ${finalSeed} | Gemini ${geminiKeys.length} clé(s)`,
        points_debites: 100,
        provider_used:  `${engine}+gemini:${GEMINI_MODEL}`,
        vercel_region:  process.env.VERCEL_REGION || "cdg1",
        created_at:     new Date().toISOString(),
      });
    }

    return res.status(200).json({
      success:           true,
      video_urls:        successUrls,
      seed:              finalSeed,
      engine,
      gemini_keys_used:  geminiKeys.map(k => `GEMINI_KEY_${String(k.index).padStart(2, "0")}`),
      clips_total:       segCount,
      clips_success:     successUrls.length,
    });

  } catch (err) {
    console.error("[PIREEL Studio] Erreur:", err.message);
    return res.status(500).json({ success: false, error: err.message || "Erreur serveur." });
  }
}
