// ============================================================
// PIREEL — api/daily-reset.js
// Cron Vercel — Réinitialisation quotidienne à 00h00 UTC
// - Remet daily_video_count à 0 pour tous les utilisateurs
// - Crédite 300 points aux abonnés Premium actifs
// Configurer dans vercel.json : "crons": [{"path":"/api/daily-reset","schedule":"0 0 * * *"}]
// ============================================================

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // Vérifier que l'appel vient bien de Vercel Cron (ou d'un token interne)
  const cronSecret = req.headers['authorization'];
  const expected   = `Bearer ${process.env.CRON_SECRET || 'pireel-cron-2026'}`;
  if (cronSecret !== expected) {
    return res.status(401).json({ error: 'Non autorisé.' });
  }

  const today = new Date().toISOString().split('T')[0];
  const log   = [];

  try {
    // 1. Réinitialiser le compteur vidéo journalier pour TOUS les utilisateurs
    const { error: resetErr, count: resetCount } = await supabase
      .from('users')
      .update({ daily_video_count: 0, last_active_date: today })
      .neq('id', '00000000-0000-0000-0000-000000000000'); // tous les users

    if (resetErr) {
      log.push({ step: 'reset_daily_count', status: 'error', error: resetErr.message });
    } else {
      log.push({ step: 'reset_daily_count', status: 'ok', count: resetCount });
    }

    // 2. Créditer 300 points aux abonnés Premium actifs
    // Condition : is_premium = true ET abonnement non expiré (subscription_end >= today)
    const { data: premiumUsers, error: premErr } = await supabase
      .from('users')
      .select('id, points_solde, nom, email')
      .eq('is_premium', true)
      .gte('subscription_end', today);

    if (premErr) {
      log.push({ step: 'fetch_premium', status: 'error', error: premErr.message });
    } else {
      const PREMIUM_DAILY_POINTS = 300;
      let credited = 0;

      for (const user of (premiumUsers || [])) {
        const { error: creditErr } = await supabase
          .from('users')
          .update({
            points_solde: (user.points_solde || 0) + PREMIUM_DAILY_POINTS,
          })
          .eq('id', user.id);

        if (!creditErr) {
          credited++;
          // Enregistrer la transaction
          await supabase.from('transactions').insert({
            user_id:     user.id,
            type:        'daily_premium_credit',
            montant:     PREMIUM_DAILY_POINTS,
            description: `Crédit journalier Premium — ${today}`,
            created_at:  new Date().toISOString(),
          });
        }
      }
      log.push({ step: 'credit_premium', status: 'ok', users_credited: credited, points_each: PREMIUM_DAILY_POINTS });
    }

    console.log('[PIREEL CRON] Reset journalier effectué:', JSON.stringify(log));
    return res.status(200).json({ success: true, date: today, log });

  } catch (err) {
    console.error('[PIREEL CRON] Erreur:', err.message);
    return res.status(500).json({ success: false, error: err.message, log });
  }
}
