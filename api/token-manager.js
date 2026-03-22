// ============================================================
// PIREEL — api/token-manager.js
// Gestionnaire universel de tokens
// Accepte n'importe quel token, détecte le service,
// lit le code, configure ou déploie automatiquement.
// ============================================================

import { detectTokenType, validateToken } from "./_utils/tokenDetector.js";

// ── Actions disponibles par service ─────────────────────────
const ACTIONS = {
  github: {
    read_repo:     readGitHubRepo,
    list_files:    listGitHubFiles,
    read_file:     readGitHubFile,
    push_file:     pushGitHubFile,
    list_repos:    listGitHubRepos,
  },
  vercel: {
    list_projects: listVercelProjects,
    get_env:       getVercelEnvVars,
    set_env:       setVercelEnvVar,
    deploy:        triggerVercelDeploy,
  },
  netlify: {
    list_sites:    listNetlifySites,
    get_env:       getNetlifyEnvVars,
    set_env:       setNetlifyEnvVar,
    deploy:        triggerNetlifyDeploy,
  },
  openai:      { list_models: listModels },
  groq:        { list_models: listModels },
  xai:         { list_models: listModels },
  mistral:     { list_models: listModels },
  huggingface: { whoami: huggingFaceWhoAmI },
};

// ============================================================
// HANDLER PRINCIPAL
// ============================================================
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée." });

  const { token, action = "validate", params = {} } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Token manquant." });
  }

  // 1. Détection automatique du service
  const profile = detectTokenType(token.trim());
  if (!profile) {
    return res.status(400).json({
      error: "Type de token non reconnu.",
      hint: "Services supportés : GitHub, Vercel, Netlify, OpenAI, Groq, xAI, Mistral, HuggingFace, Kling, Supabase",
    });
  }

  // 2. Validation du token
  const validation = await validateToken(token.trim(), profile);
  if (!validation.valid && action !== "validate") {
    return res.status(401).json({
      error: `Token ${profile.name} invalide.`,
      detail: validation.error,
    });
  }

  // 3. Exécution de l'action demandée
  const serviceActions = ACTIONS[profile.serviceKey] || {};

  if (action === "validate") {
    return res.status(200).json({
      success: true,
      service: profile.name,
      serviceKey: profile.serviceKey,
      valid: validation.valid,
      user: validation.user,
      available_actions: Object.keys(serviceActions),
    });
  }

  const actionFn = serviceActions[action];
  if (!actionFn) {
    return res.status(400).json({
      error: `Action '${action}' non disponible pour ${profile.name}.`,
      available_actions: Object.keys(serviceActions),
    });
  }

  try {
    const result = await actionFn(token.trim(), params);
    return res.status(200).json({
      success: true,
      service: profile.name,
      action,
      result,
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message,
      service: profile.name,
      action,
    });
  }
}

// ============================================================
// ACTIONS GITHUB
// ============================================================
async function listGitHubRepos(token) {
  const res = await fetch("https://api.github.com/user/repos?per_page=50&sort=updated", {
    headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json" },
  });
  const data = await res.json();
  return data.map((r) => ({ name: r.full_name, private: r.private, url: r.html_url, updated: r.updated_at }));
}

async function readGitHubRepo(token, { owner, repo }) {
  if (!owner || !repo) throw new Error("owner et repo requis.");
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents`, {
    headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json" },
  });
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error(data.message || "Dépôt introuvable.");
  return data.map((f) => ({ name: f.name, type: f.type, size: f.size, path: f.path }));
}

async function listGitHubFiles(token, { owner, repo, path = "" }) {
  if (!owner || !repo) throw new Error("owner et repo requis.");
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json" },
  });
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error(data.message || "Chemin introuvable.");
  return data.map((f) => ({ name: f.name, type: f.type, path: f.path, size: f.size }));
}

async function readGitHubFile(token, { owner, repo, path }) {
  if (!owner || !repo || !path) throw new Error("owner, repo et path requis.");
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json" },
  });
  const data = await res.json();
  if (data.message) throw new Error(data.message);
  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return { path: data.path, content, sha: data.sha, size: data.size };
}

async function pushGitHubFile(token, { owner, repo, path, content, message = "Update via Pireel Token Manager", sha }) {
  if (!owner || !repo || !path || !content) throw new Error("owner, repo, path et content requis.");
  const body = {
    message,
    content: Buffer.from(content).toString("base64"),
  };
  if (sha) body.sha = sha;

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    method: "PUT",
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Erreur push GitHub.");
  return { path: data.content.path, sha: data.content.sha, url: data.content.html_url };
}

// ============================================================
// ACTIONS VERCEL
// ============================================================
async function listVercelProjects(token) {
  const res = await fetch("https://api.vercel.com/v9/projects?limit=50", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return (data.projects || []).map((p) => ({ name: p.name, id: p.id, framework: p.framework, url: p.link?.repo }));
}

async function getVercelEnvVars(token, { projectId }) {
  if (!projectId) throw new Error("projectId requis.");
  const res = await fetch(`https://api.vercel.com/v9/projects/${projectId}/env`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return (data.envs || []).map((e) => ({ key: e.key, type: e.type, target: e.target, id: e.id }));
}

async function setVercelEnvVar(token, { projectId, key, value, target = ["production", "preview", "development"] }) {
  if (!projectId || !key || !value) throw new Error("projectId, key et value requis.");
  const res = await fetch(`https://api.vercel.com/v10/projects/${projectId}/env`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ key, value, type: "encrypted", target }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return { key: data.key, id: data.id, created: true };
}

async function triggerVercelDeploy(token, { projectId }) {
  if (!projectId) throw new Error("projectId requis.");
  const res = await fetch(`https://api.vercel.com/v13/deployments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: projectId, target: "production" }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return { deploymentId: data.id, url: data.url, state: data.readyState };
}

// ============================================================
// ACTIONS NETLIFY
// ============================================================
async function listNetlifySites(token) {
  const res = await fetch("https://api.netlify.com/api/v1/sites", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (data.message) throw new Error(data.message);
  return (data || []).map((s) => ({ name: s.name, id: s.id, url: s.ssl_url, state: s.state }));
}

async function getNetlifyEnvVars(token, { siteId }) {
  if (!siteId) throw new Error("siteId requis.");
  const res = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/env`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data;
}

async function setNetlifyEnvVar(token, { siteId, key, value }) {
  if (!siteId || !key || !value) throw new Error("siteId, key et value requis.");
  const res = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/env`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ [key]: { value } }),
  });
  const data = await res.json();
  return data;
}

async function triggerNetlifyDeploy(token, { siteId }) {
  if (!siteId) throw new Error("siteId requis.");
  const res = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/deploys`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ clear_cache: false }),
  });
  const data = await res.json();
  if (data.message) throw new Error(data.message);
  return { deployId: data.id, state: data.state, url: data.deploy_ssl_url };
}

// ============================================================
// ACTIONS COMMUNES (OpenAI / Groq / xAI / Mistral)
// ============================================================
async function listModels(token, params, profile) {
  const baseUrls = {
    openai:  "https://api.openai.com/v1",
    groq:    "https://api.groq.com/openai/v1",
    xai:     "https://api.x.ai/v1",
    mistral: "https://api.mistral.ai/v1",
  };
  const { detectTokenType } = await import("./_utils/tokenDetector.js");
  const prof = detectTokenType(token);
  const baseUrl = baseUrls[prof?.serviceKey] || baseUrls.openai;
  const res = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return (data.data || data.models || []).map((m) => m.id || m);
}

async function huggingFaceWhoAmI(token) {
  const res = await fetch("https://huggingface.co/api/whoami-v2", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return { name: data.name, email: data.email, type: data.type, orgs: (data.orgs || []).map((o) => o.name) };
}
