// ============================================================
// PIREEL Studio — api/studio-generate.js
// Universal API — Clé fournie par le client OU variable env
// Moteurs : Kling | Luma | Runway | Pika | OpenAI (Sora)
// Protection : Rotation User-Agent + Headers anti-bot
// ============================================================

export const config = { maxDuration: 300 };

import { buildHumanHeaders, randomUA, jitteredDelay } from './_utils/userAgent.js';

const PROMPT_SUFFIX = ', Cinematic 4K, realistic, slow zoom-in, professional grade';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ── KLING ──
async function generateWithKling(apiKey, prompt, seed, duration) {
  const r = await fetch('https://api.klingai.com/v1/videos/text2video', {
    method: 'POST',
    headers: buildHumanHeaders(apiKey, {
      'X-Client-Info': `pireel-studio/1.0 (${randomUA().split(' ')[0]})`,
    }),
    body: JSON.stringify({
      prompt: prompt + PROMPT_SUFFIX,
      negative_prompt: 'blur, low quality, watermark, text',
      cfg_scale: 0.5, duration, seed, aspect_ratio: '9:16', mode: 'std',
    }),
  });
  if (!r.ok) throw new Error(`Kling ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return { task_id: d.data?.task_id, engine: 'kling' };
}

// ── LUMA ──
async function generateWithLuma(apiKey, prompt, seed, duration) {
  const r = await fetch('https://api.lumalabs.ai/dream-machine/v1/generations', {
    method: 'POST',
    headers: buildHumanHeaders(apiKey),
    body: JSON.stringify({ prompt: prompt + PROMPT_SUFFIX, duration: duration + 's', seed, aspect_ratio: '9:16' }),
  });
  if (!r.ok) throw new Error(`Luma ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return { task_id: d.id, engine: 'luma' };
}

// ── RUNWAY ──
async function generateWithRunway(apiKey, prompt, seed, duration) {
  const r = await fetch('https://api.dev.runwayml.com/v1/image_to_video', {
    method: 'POST',
    headers: buildHumanHeaders(apiKey, {
      'X-Runway-Version': '2024-11-06',
    }),
    body: JSON.stringify({ promptText: prompt + PROMPT_SUFFIX, duration, seed, ratio: '720:1280', model: 'gen4_turbo' }),
  });
  if (!r.ok) throw new Error(`Runway ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return { task_id: d.id, engine: 'runway' };
}

// ── PIKA ──
async function generateWithPika(apiKey, prompt, seed, duration) {
  const r = await fetch('https://api.pika.art/v1/generate', {
    method: 'POST',
    headers: buildHumanHeaders(apiKey),
    body: JSON.stringify({ promptText: prompt + PROMPT_SUFFIX, seed, frameRate: 24, duration, aspectRatio: '9:16' }),
  });
  if (!r.ok) throw new Error(`Pika ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return { task_id: d.generation?.id, engine: 'pika' };
}

// ── OPENAI / SORA ──
async function generateWithOpenAI(apiKey, prompt, seed, duration) {
  const r = await fetch('https://api.openai.com/v1/video/generations', {
    method: 'POST',
    headers: buildHumanHeaders(apiKey),
    body: JSON.stringify({ model: 'sora-1.0-turbo', prompt: prompt + PROMPT_SUFFIX, n: 1, size: '720x1280', duration }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return { task_id: d.data?.[0]?.id, engine: 'openai' };
}

// ── POLLING STATUS ──
const STATUS_HEADERS = () => ({
  'Authorization': `Bearer __KEY__`,
  'User-Agent': randomUA(),
  'Accept': 'application/json',
});

async function pollKling(apiKey, taskId, maxWait = 280000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await jitteredDelay(4000);
    const r = await fetch(`https://api.klingai.com/v1/videos/text2video/${taskId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'User-Agent': randomUA() },
    });
    if (!r.ok) throw new Error(`Kling poll ${r.status}`);
    const d = await r.json();
    const st = d.data?.task_status;
    if (st === 'succeed') return d.data?.task_result?.videos?.[0]?.url;
    if (st === 'failed') throw new Error(`Kling génération échouée: ${d.data?.task_status_msg}`);
  }
  throw new Error('Kling timeout après 280s');
}

async function pollLuma(apiKey, taskId, maxWait = 280000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await jitteredDelay(5000);
    const r = await fetch(`https://api.lumalabs.ai/dream-machine/v1/generations/${taskId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'User-Agent': randomUA() },
    });
    if (!r.ok) throw new Error(`Luma poll ${r.status}`);
    const d = await r.json();
    if (d.state === 'completed') return d.assets?.video;
    if (d.state === 'failed') throw new Error(`Luma génération échouée: ${d.failure_reason}`);
  }
  throw new Error('Luma timeout après 280s');
}

async function pollRunway(apiKey, taskId, maxWait = 280000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await jitteredDelay(5000);
    const r = await fetch(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'X-Runway-Version': '2024-11-06', 'User-Agent': randomUA() },
    });
    if (!r.ok) throw new Error(`Runway poll ${r.status}`);
    const d = await r.json();
    if (d.status === 'SUCCEEDED') return d.output?.[0];
    if (d.status === 'FAILED') throw new Error(`Runway génération échouée`);
  }
  throw new Error('Runway timeout après 280s');
}

async function pollPika(apiKey, taskId, maxWait = 280000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await jitteredDelay(5000);
    const r = await fetch(`https://api.pika.art/v1/generations/${taskId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'User-Agent': randomUA() },
    });
    if (!r.ok) throw new Error(`Pika poll ${r.status}`);
    const d = await r.json();
    if (d.status === 'finished') return d.videos?.[0]?.url;
    if (d.status === 'failed') throw new Error(`Pika génération échouée`);
  }
  throw new Error('Pika timeout après 280s');
}

async function pollOpenAI(apiKey, taskId, maxWait = 280000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await jitteredDelay(8000);
    const r = await fetch(`https://api.openai.com/v1/video/generations/${taskId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'User-Agent': randomUA() },
    });
    if (!r.ok) throw new Error(`OpenAI poll ${r.status}`);
    const d = await r.json();
    if (d.status === 'completed') return d.data?.[0]?.url;
    if (d.status === 'failed') throw new Error(`OpenAI génération échouée`);
  }
  throw new Error('OpenAI timeout après 280s');
}

// ── HANDLER PRINCIPAL ──
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });

  try {
    const { engine, apiKey: clientKey, prompt, seed = Math.floor(Math.random() * 9999), duration = 5 } = req.body;

    if (!prompt || prompt.trim().length < 3) {
      return res.status(400).json({ error: 'Le prompt est requis (minimum 3 caractères).' });
    }

    // Résolution clé : client en priorité, puis variable env
    const engineMap = {
      kling:  { envKey: process.env.KLING_API_KEY,   gen: generateWithKling,  poll: pollKling  },
      luma:   { envKey: process.env.LUMA_API_KEY,    gen: generateWithLuma,   poll: pollLuma   },
      runway: { envKey: process.env.RUNWAY_API_KEY,  gen: generateWithRunway, poll: pollRunway },
      pika:   { envKey: process.env.PIKA_API_KEY,    gen: generateWithPika,   poll: pollPika   },
      openai: { envKey: process.env.OPENAI_KEY_01,   gen: generateWithOpenAI, poll: pollOpenAI },
    };

    const selected = engineMap[engine?.toLowerCase()];
    if (!selected) {
      return res.status(400).json({ error: `Moteur "${engine}" non supporté. Choix : kling, luma, runway, pika, openai` });
    }

    const apiKey = clientKey || selected.envKey;
    if (!apiKey) {
      return res.status(400).json({ error: `Clé API requise pour ${engine}. Fournissez-la dans le body ou configurez la variable d'environnement.` });
    }

    // Jitter initial anti-fingerprint (50–200ms)
    await jitteredDelay(50 + Math.random() * 150);

    // Étape 1 — Soumettre la génération
    const { task_id, engine: usedEngine } = await selected.gen(apiKey, prompt.trim(), seed, duration);
    console.log(`[PIREEL Studio] ${usedEngine.toUpperCase()} task_id=${task_id}`);

    // Étape 2 — Polling jusqu'au résultat
    const videoUrl = await selected.poll(apiKey, task_id);

    return res.status(200).json({
      success: true,
      video_url: videoUrl,
      engine: usedEngine,
      task_id,
    });

  } catch (err) {
    console.error('[PIREEL Studio] Erreur:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message || 'Erreur serveur inattendue.',
    });
  }
}
