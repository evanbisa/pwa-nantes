"use client";

import { useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { siteClient } from "@/lib/supabase/site-session";

/**
 * Décision de l'équipe sur un avis : « Garder » (signalement levé, l'avis reste en ligne) ou « Supprimer » (après
 * confirmation). La base vérifie que le compte fait partie de l'équipe et note chaque décision (team_actions).
 */
export function ModerationButtons({ reviewId, reported, onDone }: { reviewId: string; reported: boolean; onDone: () => void | Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const act = async (action: "keep" | "delete") => {
    if (action === "delete" && !window.confirm("Supprimer définitivement cet avis ? Il disparaît de la fiche et de la note du restaurant.")) return;
    setBusy(true);
    setError(false);
    const { error: e } = await siteClient().rpc("team_moderate_review", { p_review_id: reviewId, p_action: action });
    setBusy(false);
    if (e) setError(true);
    else await onDone();
  };
  const btn = "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 disabled:opacity-50";
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {reported && (
        <button type="button" disabled={busy} onClick={() => act("keep")} className={`${btn} ring-slate-300 hover:bg-slate-100 dark:ring-white/15 dark:hover:bg-white/10`}>
          <Check className="h-3.5 w-3.5" aria-hidden /> Garder l&apos;avis
        </button>
      )}
      <button type="button" disabled={busy} onClick={() => act("delete")} className={`${btn} text-[#a82626] ring-[#d03b3b]/40 hover:bg-[#d03b3b]/10 dark:text-[#ff9b9b]`}>
        <Trash2 className="h-3.5 w-3.5" aria-hidden /> Supprimer
      </button>
      {error && <span role="alert" className="text-xs text-[#a82626] dark:text-[#ff9b9b]">Action impossible pour le moment, réessayez.</span>}
    </div>
  );
}
