// ============================================================
//  PIREEL Studio — api/studio-generate.js
//  Génération vidéo 3×10s avec même SEED
//  Moteurs supportés : Kling | Luma | Runway | Pika
//  Fusion FFmpeg avec cross-fade 0.5s
// ============================================================

export const config = { maxDuration: 300 }; // 5 min timeout Vercel

// ── MOTEUR ACTIF (changer ici pour basculer) ──
const ACTIVE_ENGINE = process.env.VIDEO_ENGINE || 'kling'; // kling | luma | runway | pika

const PROMPT_SUFFIX = ', Cinematic 4K, realistic, slow zoom-in';

// ── CORS ──
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin',  process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ============================================================
//  MOTEURS DE GÉNÉRATION
// ============================================================

// ── KLING ──
async function generateWithKling(prompt, seed, durationSeconds) {
  const r = await fetch('https://api.klingai.com/v1/videos/text2video', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.KLING_API_KEY}`,
    },
    body: JSON.stringify({
      prompt:         prompt + PROMPT_SUFFIX,
      negative_prompt:'blur, low quality, watermark, text',
      cfg_scale:      0.5,
      duration:       durationSeconds,
      seed:           seed,
      aspect_ratio:   '9:16',
      mode:           'std',
    }),
  });
  if (!r.ok) throw new Error(`Kling ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return { task_id: d.data?.task_id, engine: 'kling' };
}

// ── LUMA ──
async function generateWithLuma(prompt, seed, durationSeconds) {
  const r = await fetch('https://api.lumalabs.ai/dream-machine/v1/generations', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.LUMA_API_KEY}`,
    },
    body: JSON.stringify({
      prompt:   prompt + PROMPT_SUFFIX,
      duration: durationSeconds + 's',
      seed:     seed,
      aspect_ratio: '9:16',
    }),
  });
  if (!r.ok) throw new Error(`Luma ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return { task_id: d.id, engine: 'luma' };
}

// ── RUNWAY ──
async function generateWithRunway(prompt, seed, durationSeconds) {
  const r = await fetch('https://api.dev.runwayml.com/v1/image_to_video', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.RUNWAY_API_KEY}`,
      'X-Runway-Version': '2024-11-06',
    },
    body: JSON.stringify({
      promptText:  prompt + PROMPT_SUFFIX,
      duration:    durationSeconds,
      seed:        seed,
      ratio:       '720:1280',
      model:       'gen4_turbo',
    }),
  });
  if (!r.ok) throw new Error(`Runway ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return { task_id: d.id, engine: 'runway' };
}

// ── PIKA ──
async function generateWithPika(prompt, seed, durationSeconds) {
  const r = await fetch('https://api.pika.art/v1/generate', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.PIKA_API_KEY}`,
    },
    body: JSON.stringify({
      promptText:  prompt + PROMPT_SUFFIX,
      seed:        seed,
      frameRate:   24,
      duration:    durationSeconds,
      aspectRatio: '9:16',
    }),
  });
  if (!r.ok) throw new Error(`Pika ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return { task_id: d.generation?.id, engine: 'pika' };
}

// ── DISPATCH selon moteur actif ──
async function generateClip(prompt, seed, durationSeconds) {
  switch (ACTIVE_ENGINE) {
    case 'luma':   return generateWithLuma(prompt, seed, durationSeconds);
    case 'runway': return generateWithRunway(prompt, seed, durationSeconds);
    case 'pika':   return generateWithPika(prompt, seed, durationSeconds);
    default:       return generateWithKling(prompt, seed, durationSeconds);
  }
}

// ── POLLING : attendre que le clip soit prêt ──
async function pollForResult(taskId, engine, maxWait = 120000) {
  const endpoints = {
    kling:  `https://api.klingai.com/v1/videos/text2video/${taskId}`,
    luma:   `https://api.lumalabs.ai/dream-machine/v1/generations/${taskId}`,
    runway: `https://api.dev.runwayml.com/v1/tasks/${taskId}`,
    pika:   `https://api.pika.art/v1/generations/${taskId}`,
  };
  const headers = {
    kling:  { Authorization: `Bearer ${process.env.KLING_API_KEY}` },
    luma:   { Authorization: `Bearer ${process.env.LUMA_API_KEY}` },
    runway: { Authorization: `Bearer ${process.env.RUNWAY_API_KEY}`, 'X-Runway-Version': '2024-11-06' },
    pika:   { Authorization: `Bearer ${process.env.PIKA_API_KEY}` },
  };
  const url = endpoints[engine];
  const hdr = headers[engine];
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 4000));
    const r = await fetch(url, { headers: hdr });
    const d = await r.json();
    // Normaliser selon le moteur
    let status, videoUrl;
    if (engine === 'kling')  { status = d.data?.task_status; videoUrl = d.data?.task_result?.videos?.[0]?.url; }
    if (engine === 'luma')   { status = d.state;             videoUrl = d.assets?.video; }
    if (engine === 'runway') { status = d.status;            videoUrl = d.output?.[0]; }
    if (engine === 'pika')   { status = d.status;            videoUrl = d.videos?.[0]?.url; }
    if (['succeed','completed','succeeded','finished'].includes(status) && videoUrl) {
      return videoUrl;
    }
    if (['failed','error'].includes(status)) {
      throw new Error(`${engine} task failed: ${JSON.stringify(d)}`);
    }
  }
  throw new Error('Timeout: clip not ready after ' + (maxWait/1000) + 's');
}

// ── FUSION FFmpeg (cross-fade 0.5s) ──
// En prod Vercel, appeler un service externe (AWS Lambda + FFmpeg, ou Cloudflare Worker)
// Ici on retourne la commande FFmpeg pour référence
function buildFfmpegCommand(clip1Url, clip2Url, clip3Url, outputPath) {
  return [
    `ffmpeg`,
    `-i "${clip1Url}" -i "${clip2Url}" -i "${clip3Url}"`,
    `-filter_complex`,
    `"[0:v][1:v]xfade=transition=fade:duration=0.5:offset=9.5[v01];`,
    `[v01][2:v]xfade=transition=fade:duration=0.5:offset=19[vfinal]"`,
    `-map "[vfinal]"`,
    `-c:v libx264 -crf 18 -preset fast`,
    `-t 30`,
    `"${outputPath}"`,
  ].join(' ');
}

// ============================================================
//  HANDLER PRINCIPAL
// ============================================================
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Méthode non autorisée' });

  const { seed, segments, prompt_suffix, code_acces } = req.body;

  if (!segments || segments.length !== 3) {
    return res.status(400).json({ error: '3 segments requis' });
  }
  if (!seed) {
    return res.status(400).json({ error: 'SEED requis' });
  }

  // Vérifier si une clé API est configurée
  const hasApiKey = !!(
    process.env.KLING_API_KEY  ||
    process.env.LUMA_API_KEY   ||
    process.env.RUNWAY_API_KEY ||
    process.env.PIKA_API_KEY
  );

  if (!hasApiKey) {
    // Mode test : retourner une réponse simulée
    return res.status(200).json({
      success:     true,
      test_mode:   true,
      seed:        seed,
      engine:      ACTIVE_ENGINE,
      clips: segments.map(function(seg, i) {
        return { index: i+1, status: 'simulated', segment: seg.substring(0,50) };
      }),
      ffmpeg_cmd:  buildFfmpegCommand('clip1.mp4','clip2.mp4','clip3.mp4','final_30s.mp4'),
      video_url:   null,
      message:     'Mode test. Ajoutez une clé API dans les variables Vercel pour activer la génération réelle.',
    });
  }

  try {
    console.log(`[STUDIO] Génération 3x10s — SEED: ${seed} — Moteur: ${ACTIVE_ENGINE}`);

    // Générer les 3 clips en parallèle avec le MÊME SEED
    const tasks = await Promise.all(
      segments.map(function(seg, i) {
        const prompt = seg + (prompt_suffix || PROMPT_SUFFIX);
        console.log(`[STUDIO] Clip ${i+1}: "${seg.substring(0,40)}…"`);
        return generateClip(prompt, seed, 10); // 10 secondes chacun
      })
    );

    console.log(`[STUDIO] Tasks lancées:`, tasks.map(t => t.task_id));

    // Attendre les 3 clips
    const clipUrls = await Promise.all(
      tasks.map(function(task) {
        return pollForResult(task.task_id, task.engine);
      })
    );

    console.log(`[STUDIO] Clips prêts:`, clipUrls);

    // Commande FFmpeg pour fusion
    const ffmpegCmd = buildFfmpegCommand(clipUrls[0], clipUrls[1], clipUrls[2], 'output_30s.mp4');

    return res.status(200).json({
      success:    true,
      seed:       seed,
      engine:     ACTIVE_ENGINE,
      clips:      tasks.map((t, i) => ({ index:i+1, task_id:t.task_id, url:clipUrls[i], status:'ready' })),
      ffmpeg_cmd: ffmpegCmd,
      video_url:  clipUrls[0], // En attendant la fusion FFmpeg
      message:    'Clips générés. Fusion FFmpeg à déclencher côté serveur.',
    });

  } catch(err) {
    console.error('[STUDIO] Erreur:', err.message);
    return res.status(500).json({
      success: false,
      error:   err.message,
      engine:  ACTIVE_ENGINE,
    });
  }
}
