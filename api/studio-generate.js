// ============================================================
// PIREEL Studio — api/studio-generate.js
// 3 segments × 10s | SEED partagé | Polling parallèle
// Moteurs : Kling | Luma | Runway | Pika | OpenAI (Sora)
// Protection : Rotation User-Agent + Headers anti-bot
// ============================================================

export const config = { maxDuration: 300 };

import { createClient } from "@supabase/supabase-js";
import { buildHumanHeaders, randomUA, jitteredDelay } from './_utils/userAgent.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── CORS ──
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ── MOTEURS : SOUMISSION ──
async function submitKling(apiKey, prompt, seed, duration) {
  const r = await fetch('https://api.klingai.com/v1/videos/text2video', {
    method: 'POST',
    headers: buildHumanHeaders(apiKey),
    body: JSON.stringify({
      prompt,
      negative_prompt: 'blur, low quality, watermark, text, logo',
      cfg_scale: 0.5, duration, seed,
      aspect_ratio: '9:16', mode: 'std',
    }),
  });
  if (!r.ok) throw new Error(`Kling ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return { task_id: d.data?.task_id, engine: 'kling' };
}

async function submitLuma(apiKey, prompt, seed, duration) {
  const r = await fetch('https://api.lumalabs.ai/dream-machine/v1/generations', {
    method: 'POST',
    headers: buildHumanHeaders(apiKey),
    body: JSON.stringify({ prompt, duration: duration + 's', seed, aspect_ratio: '9:16' }),
  });
  if (!r.ok) throw new Error(`Luma ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return { task_id: d.id, engine: 'luma' };
}

async function submitRunway(apiKey, prompt, seed, duration) {
  const r = await fetch('https://api.dev.runwayml.com/v1/image_to_video', {
    method: 'POST',
    headers: buildHumanHeaders(apiKey, { 'X-Runway-Version': '2024-11-06' }),
    body: JSON.stringify({ promptText: prompt, duration, seed, ratio: '720:1280', model: 'gen4_turbo' }),
  });
  if (!r.ok) throw new Error(`Runway ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return { task_id: d.id, engine: 'runway' };
}

async function submitPika(apiKey, prompt, seed, duration) {
  const r = await fetch('https://api.pika.art/v1/generate', {
    method: 'POST',
    headers: buildHumanHeaders(apiKey),
    body: JSON.stringify({ promptText: prompt, seed, frameRate: 24, duration, aspectRatio: '9:16' }),
  });
  if (!r.ok) throw new Error(`Pika ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return { task_id: d.generation?.id, engine: 'pika' };
}

async function submitOpenAI(apiKey, prompt, seed, duration) {
  const r = await fetch('https://api.openai.com/v1/video/generations', {
    method: 'POST',
    headers: buildHumanHeaders(apiKey),
    body: JSON.stringify({ model: 'sora-1.0-turbo', prompt, n: 1, size: '720x1280', duration }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return { task_id: d.data?.[0]?.id, engine: 'openai' };
}

// ── MOTEURS : POLLING ──
async function pollUntilDone(engine, apiKey, taskId, maxWait = 270000) {
  const start = Date.now();
  const pollInterval = { kling: 4000, luma: 5000, runway: 5000, pika: 5000, openai: 8000 }[engine] || 5000;

  while (Date.now() - start < maxWait) {
    await jitteredDelay(pollInterval);
    const headers = { 'Authorization': `Bearer ${apiKey}`, 'User-Agent': randomUA(), 'Accept': 'application/json' };

    let r, d;
    try {
      switch (engine) {
        case 'kling':
          r = await fetch(`https://api.klingai.com/v1/videos/text2video/${taskId}`, { headers });
          d = await r.json();
          if (d.data?.task_status === 'succeed') return d.data?.task_result?.videos?.[0]?.url;
          if (d.data?.task_status === 'failed')  throw new Error(`Kling failed: ${d.data?.task_status_msg}`);
          break;
        case 'luma':
          r = await fetch(`https://api.lumalabs.ai/dream-machine/v1/generations/${taskId}`, { headers });
          d = await r.json();
          if (d.state === 'completed') return d.assets?.video;
          if (d.state === 'failed')    throw new Error(`Luma failed: ${d.failure_reason}`);
          break;
        case 'runway':
          r = await fetch(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, { headers: { ...headers, 'X-Runway-Version': '2024-11-06' } });
          d = await r.json();
          if (d.status === 'SUCCEEDED') return d.output?.[0];
          if (d.status === 'FAILED')    throw new Error('Runway generation failed');
          break;
        case 'pika':
          r = await fetch(`https://api.pika.art/v1/generations/${taskId}`, { headers });
          d = await r.json();
          if (d.status === 'finished') return d.videos?.[0]?.url;
          if (d.status === 'failed')   throw new Error('Pika generation failed');
          break;
        case 'openai':
          r = await fetch(`https://api.openai.com/v1/video/generations/${taskId}`, { headers });
          d = await r.json();
          if (d.status === 'completed') return d.data?.[0]?.url;
          if (d.status === 'failed')    throw new Error('OpenAI generation failed');
          break;
      }
    } catch (err) {
      if (err.message.includes('failed')) throw err;
      console.error(`[PIREEL] poll ${engine} error:`, err.message);
    }
  }
  throw new Error(`${engine} timeout après ${maxWait/1000}s`);
}

// ── GÉNÉRER UN CLIP (submit + poll) ──
async function generateClip(engine, apiKey, prompt, seed, duration) {
  const submitFn = { kling: submitKling, luma: submitLuma, runway: submitRunway, pika: submitPika, openai: submitOpenAI }[engine];
  if (!submitFn) throw new Error(`Moteur inconnu: ${engine}`);

  await jitteredDelay(50 + Math.random() * 200); // anti-fingerprint
  const { task_id } = await submitFn(apiKey, prompt, seed, duration);
  console.log(`[PIREEL] Clip soumis — engine=${engine} task_id=${task_id}`);
  const url = await pollUntilDone(engine, apiKey, task_id);
  return url;
}

// ── HANDLER PRINCIPAL ──
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ success: false, error: 'Méthode non autorisée.' });

  const {
    segments,          // array de 3 prompts (1 par clip)
    seed,              // SEED partagé entre les 3 clips
    prompt_suffix = ', Cinematic 4K, realistic, slow zoom-in, professional grade',
    code_acces,
    engine: reqEngine, // moteur choisi par le client (optionnel)
  } = req.body || {};

  // ── Validation ──
  if (!segments || !Array.isArray(segments) || segments.length === 0) {
    return res.status(400).json({ success: false, error: 'Le champ "segments" (tableau de prompts) est requis.' });
  }

  // ── Auth Supabase (si code_acces fourni) ──
  let userRow = null;
  if (code_acces && supabase) {
    const { data } = await supabase
      .from('users')
      .select('id, points_solde, daily_video_count, last_active_date, type_machine')
      .eq('code_acces', code_acces.trim().toUpperCase())
      .single();
    userRow = data;

    if (!userRow) {
      return res.status(401).json({ success: false, error: 'Code d\'accès invalide.' });
    }
    if ((userRow.points_solde || 0) < 100) {
      return res.status(402).json({ success: false, error: 'Solde insuffisant (100 pts requis).' });
    }
  }

  // ── Résolution moteur + clé API ──
  const engine = (reqEngine || process.env.DEFAULT_ENGINE || 'kling').toLowerCase();
  const engineKeyMap = {
    kling:  process.env.KLING_API_KEY,
    luma:   process.env.LUMA_API_KEY,
    runway: process.env.RUNWAY_API_KEY,
    pika:   process.env.PIKA_API_KEY,
    openai: process.env.OPENAI_KEY_01,
  };
  const apiKey = engineKeyMap[engine];
  if (!apiKey) {
    return res.status(400).json({ success: false, error: `Clé API "${engine}" non configurée.` });
  }

  // ── Mode test si aucune vraie clé ──
  const TEST_MODE = !apiKey || apiKey.startsWith('TEST_');
  if (TEST_MODE) {
    return res.status(200).json({
      success: true,
      test_mode: true,
      video_urls: segments.map((_, i) => `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4`),
      seed,
      engine,
    });
  }

  try {
    const finalSeed = seed || Math.floor(Math.random() * 999999) + 100000;
    const segCount  = Math.min(segments.length, 3); // max 3 clips
    const duration  = 10; // 10s par clip = 30s total

    console.log(`[PIREEL] Génération ${segCount} clips | engine=${engine} | seed=${finalSeed}`);

    // ── Générer les 3 clips EN PARALLÈLE avec le même SEED ──
    const clipPromises = segments.slice(0, segCount).map((seg, i) => {
      const prompt = (seg || segments[0]).trim() + prompt_suffix;
      return generateClip(engine, apiKey, prompt, finalSeed, duration)
        .then(url  => ({ index: i, url, status: 'ok' }))
        .catch(err => { console.error(`[PIREEL] Clip ${i+1} échoué:`, err.message); return { index: i, url: null, status: 'failed', error: err.message }; });
    });

    const results = await Promise.allSettled(clipPromises);
    const clips   = results.map(r => r.value || r.reason);

    const successUrls = clips.filter(c => c.status === 'ok').map(c => c.url);
    if (successUrls.length === 0) {
      return res.status(500).json({ success: false, error: 'Tous les clips ont échoué.', details: clips });
    }

    // ── Déduire les points si auth ──
    if (userRow) {
      const today = new Date().toISOString().split('T')[0];
      await supabase.from('users').update({
        points_solde: Math.max(0, (userRow.points_solde || 0) - 100),
        daily_video_count: (userRow.daily_video_count || 0) + 1,
        last_active_date: today,
      }).eq('id', userRow.id);

      // Historique
      await supabase.from('generations').insert({
        user_id: userRow.id,
        sujet: segments[0].substring(0, 200),
        categorie: 'studio',
        contenu: `${successUrls.length} clips | SEED ${finalSeed}`,
        points_debites: 100,
        provider_used: engine,
        vercel_region: process.env.VERCEL_REGION || 'cdg1',
        created_at: new Date().toISOString(),
      });
    }

    return res.status(200).json({
      success: true,
      video_urls: successUrls,          // tableau des URLs des clips générés
      seed: finalSeed,
      engine,
      clips_total:   segCount,
      clips_success: successUrls.length,
    });

  } catch (err) {
    console.error('[PIREEL Studio] Erreur:', err.message);
    return res.status(500).json({ success: false, error: err.message || 'Erreur serveur.' });
  }
}
