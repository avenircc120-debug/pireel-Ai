// ============================================================
//  PIREEL Studio — api/studio-generate.js
//  Universal API — Clé fournie par le client OU variable env
//  Moteurs : Kling | Luma | Runway | Pika | OpenAI (Sora)
// ============================================================

export const config = { maxDuration: 300 };

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
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
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
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
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
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'X-Runway-Version': '2024-11-06'
    },
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
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
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
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'sora-1.0-turbo', prompt: prompt + PROMPT_SUFFIX, n: 1, size: '720x1280', duration }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return { task_id: d.id || d.data?.[0]?.id, engine: 'openai' };
}

// ── DISPATCH ──
async function generateClip(engine, apiKey, prompt, seed, duration) {
  switch (engine) {
    case 'kling':   return generateWithKling(apiKey, prompt, seed, duration);
    case 'luma':    return generateWithLuma(apiKey, prompt, seed, duration);
    case 'runway':  return generateWithRunway(apiKey, prompt, seed, duration);
    case 'pika':    return generateWithPika(apiKey, prompt, seed, duration);
    case 'openai':  return generateWithOpenAI(apiKey, prompt, seed, duration);
    default: throw new Error(`Moteur inconnu : ${engine}. Supportés : kling, luma, runway, pika, openai`);
  }
}

// ── POLLING résultat ──
async function pollForResult(taskId, engine, apiKey, maxWait = 240000) {
  const start = Date.now();
  const INTERVAL = 4000;

  const endpoints = {
    kling:  `https://api.klingai.com/v1/videos/text2video/${taskId}`,
    luma:   `https://api.lumalabs.ai/dream-machine/v1/generations/${taskId}`,
    runway: `https://api.dev.runwayml.com/v1/tasks/${taskId}`,
    pika:   `https://api.pika.art/v1/generations/${taskId}`,
    openai: `https://api.openai.com/v1/video/generations/${taskId}`,
  };

  const headers = { 'Authorization': `Bearer ${apiKey}` };
  if (engine === 'runway') headers['X-Runway-Version'] = '2024-11-06';

  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, INTERVAL));
    try {
      const resp = await fetch(endpoints[engine], { headers });
      if (!resp.ok) continue;
      const data = await resp.json();

      const status = data.status || data.data?.task_status || data.state;
      const url =
        data.video_url || data.assets?.video ||
        data.data?.task_result?.videos?.[0]?.url ||
        data.output?.[0] || data.data?.[0]?.url;

      if ((status === 'completed' || status === 'succeed' || status === 'finished') && url) return url;
      if (status === 'failed' || status === 'error') throw new Error(`Clip échoué (${engine})`);
    } catch(e) {
      if (e.message.includes('échoué')) throw e;
    }
  }
  throw new Error(`Timeout polling (${engine}) après ${maxWait / 1000}s`);
}

// ── HANDLER PRINCIPAL ──
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const {
    seed,
    segments,
    prompt_suffix,
    api_key,
    engine = 'kling',
    duration = 10,
  } = req.body || {};

  if (!segments || !Array.isArray(segments) || segments.length === 0) {
    return res.status(400).json({ success: false, error: 'segments requis (array de strings).' });
  }

  // Clé API : priorité au client, puis variable env
  const apiKey = api_key ||
    process.env[`${engine.toUpperCase()}_API_KEY`] ||
    process.env.UNIVERSAL_API_KEY;

  // Mode démo si aucune clé
  if (!apiKey) {
    return res.status(200).json({
      success: true,
      test_mode: true,
      seed,
      engine,
      clips: segments.map((s, i) => ({
        index: i + 1,
        prompt: s.substring(0, 60) + '…',
        status: 'demo',
        url: null,
      })),
      video_url: null,
      message: 'Mode démo actif — entrez votre clé API pour générer de vraies vidéos.',
    });
  }

  try {
    console.log(`[STUDIO] SEED:${seed} | Moteur:${engine} | ${segments.length} segments`);

    const tasks = await Promise.all(
      segments.map((seg, i) => {
        const prompt = seg + (prompt_suffix || '');
        console.log(`[STUDIO] Clip ${i + 1}: "${seg.substring(0, 50)}…"`);
        return generateClip(engine, apiKey, prompt, seed, duration);
      })
    );

    const clipUrls = await Promise.all(
      tasks.map(task => pollForResult(task.task_id, task.engine, apiKey))
    );

    return res.status(200).json({
      success: true,
      test_mode: false,
      seed,
      engine,
      clips: tasks.map((t, i) => ({
        index: i + 1,
        task_id: t.task_id,
        url: clipUrls[i],
        status: 'ready',
      })),
      video_url: clipUrls[0],
      all_clips: clipUrls,
      message: `${clipUrls.length} clip(s) générés avec succès via ${engine}.`,
    });

  } catch (err) {
    console.error('[STUDIO] Erreur:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message,
      engine,
    });
  }
}
