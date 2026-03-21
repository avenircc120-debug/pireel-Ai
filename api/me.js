// ============================================================
//  PIREEL - api/me.js
//  Vérifie le code d'accès et retourne le profil utilisateur
// ============================================================

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée." });

  const { code_acces } = req.body;

  if (!code_acces || typeof code_acces !== "string" || code_acces.trim().length !== 6) {
    return res.status(400).json({ error: "Code d'accès invalide (6 caractères requis)." });
  }

  const today = new Date().toISOString().split("T")[0];

  // Récupérer l'utilisateur
  const { data: user, error } = await supabase
    .from("users")
    .select("id, email, nom, prenom, type_machine, points_solde, daily_video_count, last_active_date")
    .eq("code_acces", code_acces.trim().toUpperCase())
    .single();

  if (error || !user) {
    return res.status(401).json({ error: "Code d'accès invalide. Vérifiez votre code PIREEL." });
  }

  // Réinitialiser le compteur si nouveau jour
  if (!user.last_active_date || user.last_active_date !== today) {
    await supabase
      .from("users")
      .update({ daily_video_count: 0, last_active_date: today })
      .eq("id", user.id);
    user.daily_video_count = 0;
    user.last_active_date  = today;
  }

  // Ne pas exposer l'ID Supabase en prod — retirer si nécessaire
  return res.status(200).json({
    success: true,
    user: {
      email:             user.email,
      nom:               user.nom,
      prenom:            user.prenom,
      type_machine:      user.type_machine,
      points_solde:      user.points_solde,
      daily_video_count: user.daily_video_count,
      last_active_date:  user.last_active_date,
    },
  });
}
