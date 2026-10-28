"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { ArrowLeft, Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { setRemember, siteClient } from "@/lib/supabase/site-session";
import AgePicker from "@/components/signup/AgePicker";
import GoogleSignup from "@/components/signup/GoogleSignup";
import { useKeyboardInset } from "@/components/signup/useKeyboardInset";
import {
  EMAIL_RE, MIN_AGE, PASSWORD_RULES, capitalize, passwordScore, suggestEmail,
} from "@/lib/signup/validation";

/**
 * Inscription d'un client, une question par écran : prénom, sexe et âge (facultatifs), e-mail (ou Google), relecture de
 * l'adresse, mot de passe. Le compte est créé par la fonction serveur client-signup (adresse vérifiée, plafond
 * anti-robots), puis la session est ouverte avec le mot de passe choisi, dans le stockage de la carte : la personne
 * arrive ensuite sur la carte déjà connectée (?bienvenue=1 : accueil et localisation).
 */

type Step = "name" | "gender" | "age" | "email" | "confirm" | "password" | "done";
type Gender = "female" | "male" | "other" | "";   // "" : préfère ne pas le dire
type Reply = { ok: true } | { ok: false; code: string; message: string };

const FLOW: Step[] = ["name", "gender", "age", "email", "confirm", "password"];
/** Questions comptées dans la barre de progression (la relecture fait partie de la question de l'e-mail). */
const QUESTIONS: Step[] = ["name", "gender", "age", "email", "password"];
const GENDERS: { value: Gender; label: string; emoji: string }[] = [
  { value: "female", label: "Une femme", emoji: "👩" },
  { value: "male", label: "Un homme", emoji: "👨" },
  { value: "other", label: "Autre", emoji: "🌈" },
  { value: "", label: "Je préfère ne pas le dire", emoji: "🤐" },
];
const AGE_EMOJI: [number, string][] = [[15, "🧒"], [18, "🎒"], [25, "🎓"], [35, "💼"], [50, "😎"], [Infinity, "🌟"]];
const STRENGTH = ["", "Trop faible", "Trop faible", "Moyen", "Presque !", "Solide 💪"];
/** Carte (site principal), un niveau au-dessus de l'application : « /app/../ » → « / ». */
const APP_HOME = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/../`;
/** Délai de l'écran « Bienvenue » avant l'arrivée sur la carte. */
const WELCOME_MS = 1600;
/** La carte est une autre application (index.html) : navigation complète, pas celle de Next.js. */
const openMap = (query = "") => { window.location.href = new URL(APP_HOME + query, window.location.href).href; };
/** Écran de connexion de la carte, adresse préremplie (la carte la lit dans son propre stockage au démarrage). */
const openLogin = (email: string, role: "student" | "pro" = "student") => {
  try {
    const key = "roche-street-food:v2";
    const saved = JSON.parse(localStorage.getItem(key) ?? "{}");
    localStorage.setItem(key, JSON.stringify({ ...saved, lastEmail: email, lastRole: role }));
  } catch { /* stockage indisponible : la carte affichera l'accueil */ }
  openMap();
};
const linkClass = "font-semibold underline";
/** Compte créé il y a moins de 10 minutes (compte Google tout neuf). */
const isFresh = (createdAt: string) => Date.now() - new Date(createdAt).getTime() < 10 * 60 * 1000;
/** Élément qui reçoit le focus à l'arrivée sur chaque écran. */
const FOCUS: Record<Step, string> = {
  name: "su-name", gender: "su-gender-0", age: "su-age", email: "su-email", confirm: "su-confirm-yes",
  password: "su-password", done: "su-done",
};

/** Appel à la fonction serveur ; ses refus arrivent sous la forme { error, message }. */
async function callSignup(body: Record<string, string>): Promise<Reply> {
  const { error } = await siteClient().functions.invoke("client-signup", { body });
  if (!error) return { ok: true };
  if (error instanceof FunctionsHttpError) {
    try {
      const j = await error.context.json();
      return { ok: false, code: String(j.error ?? "server"), message: String(j.message ?? "Inscription impossible pour le moment.") };
    } catch { /* réponse illisible : traitée comme une panne réseau */ }
  }
  return { ok: false, code: "network", message: "Connexion impossible. Vérifiez votre réseau, puis réessayez." };
}

export default function SignupWizard() {
  const [step, setStep] = useState<Step>("name");
  const [dir, setDir] = useState<"next" | "prev">("next");
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender | undefined>(undefined);
  const [age, setAge] = useState(20);
  const [ageSet, setAgeSet] = useState(false);
  const [email, setEmail] = useState("");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRememberChoice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Step, ReactNode>>>({});
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestedFor = useRef("");
  const checkedEmail = useRef("");
  const keyboard = useKeyboardInset();   // clavier ouvert : marge sous la page, emoji masqué pour gagner de la place

  const firstName = capitalize(name.trim().split(/\s+/)[0] ?? "");
  const cleanEmail = email.trim().toLowerCase();
  const emailValid = EMAIL_RE.test(cleanEmail);
  const score = passwordScore(password);
  const question = QUESTIONS.indexOf(step === "confirm" ? "email" : step) + 1;

  // Arrivée sur un écran : focus sur sa réponse (sans faire défiler pendant le glissement)
  useEffect(() => {
    document.getElementById(FOCUS[step])?.focus({ preventScroll: true });
  }, [step]);
  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current); }, []);
  // Compte ouvert : un instant de fête, puis la carte (déjà connectée)
  useEffect(() => {
    if (step !== "done") return;
    const t = setTimeout(() => openMap("?bienvenue=1"), WELCOME_MS);
    return () => clearTimeout(t);
  }, [step]);

  const setError = (s: Step, message: ReactNode) => setErrors((e) => ({ ...e, [s]: message }));
  const go = (to: Step, direction: "next" | "prev" = "next") => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setDir(direction);
    setStep(to);
  };
  const back = () => {
    const i = FLOW.indexOf(step);
    if (i > 0) go(FLOW[i - 1], "prev");
  };

  /* ---------- Réponses ---------- */
  function submitName(ev: FormEvent) {
    ev.preventDefault();
    const clean = name.trim().replace(/\s+/g, " ");
    if (clean.length < 2) return setError("name", "Indiquez votre prénom (2 caractères minimum).");
    setName(capitalize(clean));
    setError("name", null);
    go("gender");
  }
  function pickGender(value: Gender) {
    setGender(value);
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(() => go("age"), 320);   // le temps de voir la carte se cocher
  }
  function submitAge(ev: FormEvent) {
    ev.preventDefault();
    if (age < MIN_AGE) return;
    setAgeSet(true);
    go("email");
  }
  async function submitEmail(ev: FormEvent) {
    ev.preventDefault();
    if (!emailValid) return setError("email", "Adresse e-mail invalide (ex. : prenom@gmail.com).");
    // Faute de frappe probable (« gmial.com ») : proposée une fois, sans bloquer
    const fix = suggestEmail(cleanEmail);
    if (fix && suggestedFor.current !== cleanEmail) {
      suggestedFor.current = cleanEmail;
      setSuggestion(fix);
      return;
    }
    await checkAndConfirm(cleanEmail);
  }
  async function checkAndConfirm(address: string) {
    setSuggestion(null);
    setError("email", null);
    if (checkedEmail.current !== address) {
      // Le domaine reçoit-il des e-mails ? (serveur : enregistrements DNS) Serveur injoignable : on continue,
      // la création du compte refera le contrôle.
      setBusy(true);
      const res = await callSignup({ action: "check", email: address });
      setBusy(false);
      if (!res.ok && ["email_domain", "email_invalid", "rate_limited"].includes(res.code)) return setError("email", res.message);
      if (res.ok) checkedEmail.current = address;
    }
    go("confirm");
  }
  async function createAccount(ev: FormEvent) {
    ev.preventDefault();
    if (score < PASSWORD_RULES.length || busy) return;
    setBusy(true);
    setError("password", null);
    const body: Record<string, string> = { action: "signup", email: cleanEmail, password, first_name: name.trim() };
    if (gender) body.gender = gender;
    if (ageSet) body.birth_year = String(new Date().getFullYear() - age);
    const res = await callSignup(body);
    if (!res.ok) {
      setBusy(false);
      if (res.code === "exists") {
        go("email", "prev");
        return setError("email", <>Un compte existe déjà avec cet e-mail. <button type="button" className={linkClass} onClick={() => openLogin(cleanEmail)}>Se connecter</button></>);
      }
      if (res.code === "email_domain" || res.code === "email_invalid") { go("email", "prev"); return setError("email", res.message); }
      if (res.code === "invalid_age") { go("age", "prev"); return setError("age", res.message); }
      if (res.code === "invalid_name") { go("name", "prev"); return setError("name", res.message); }
      return setError("password", res.message);
    }
    // Compte créé et confirmé : ouverture de la session, retrouvée ensuite par la carte
    setRemember(remember);
    const { error } = await siteClient().auth.signInWithPassword({ email: cleanEmail, password });
    setBusy(false);
    if (error) return setError("password", <>Votre compte est créé, mais la connexion a échoué. <button type="button" className={linkClass} onClick={() => openLogin(cleanEmail)}>Se connecter sur la carte</button></>);
    go("done");
  }

  /**
   * Inscription avec Google : Supabase vérifie le jeton et crée le compte client (ou ouvre celui qui existe). Compte tout
   * neuf : le prénom, le sexe et l'âge déjà répondus sont enregistrés. Un compte restaurateur ne passe pas par Google.
   */
  async function googleSignIn(credential: string) {
    setBusy(true);
    setError("email", null);
    const sb = siteClient();
    const fail = (message: ReactNode) => { setBusy(false); setError("email", message); };
    const { data, error } = await sb.auth.signInWithIdToken({ provider: "google", token: credential });
    if (error || !data.user) return fail("La connexion avec Google a échoué. Réessayez.");
    const { data: profile } = await sb.from("profiles").select("role, created_at, gender, birth_year").eq("id", data.user.id).single();
    if (profile?.role === "merchant") {
      await sb.auth.signOut().catch(() => null);
      return fail(<>Cette adresse est celle d&apos;un compte restaurateur : <button type="button" className={linkClass} onClick={() => openLogin(data.user.email ?? "", "pro")}>connectez-vous sur la carte</button> avec votre mot de passe.</>);
    }
    const fresh = !!profile && isFresh(profile.created_at);
    if (fresh) {
      await sb.from("profiles").update({
        first_name: name.trim() || undefined,
        gender: gender || null,
        birth_year: ageSet ? new Date().getFullYear() - age : null,
      }).eq("id", data.user.id);
    }
    setBusy(false);
    if (fresh) go("done");
    else openMap();   // compte déjà existant : directement la carte
  }

  /* ---------- Rendu ---------- */
  return (
    <div
      data-kb={keyboard ? "" : undefined} style={keyboard ? { paddingBottom: keyboard } : undefined}
      className="group/page flex min-h-full flex-col bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100"
    >
      <header className="mx-auto flex w-full max-w-md items-center gap-3 px-5 pt-[max(16px,env(safe-area-inset-top))] pb-2">
        <button
          type="button"
          onClick={back}
          aria-label="Question précédente"
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-800 dark:hover:bg-slate-800 ${FLOW.indexOf(step) > 0 && step !== "done" ? "" : "invisible"}`}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
        {step !== "done" && (
          <>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" aria-hidden>
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand to-orange-400 transition-[width] duration-500 ease-out"
                style={{ width: `${(question / QUESTIONS.length) * 100}%` }}
              />
            </div>
            <p className="w-10 text-right text-sm font-medium tabular-nums text-slate-500 dark:text-slate-400">
              <span aria-hidden>{question}/{QUESTIONS.length}</span>
              <span className="sr-only">Question {question} sur {QUESTIONS.length}</span>
            </p>
          </>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-x-hidden px-5 pt-6 pb-[max(24px,env(safe-area-inset-bottom))]">
        <div key={step} className={`flex flex-1 flex-col ${dir === "next" ? "motion-safe:animate-step-next" : "motion-safe:animate-step-prev"}`}>
          {step === "name" && (
            <form onSubmit={submitName} noValidate className="flex flex-1 flex-col">
              <Title emoji={name.trim().length >= 2 ? "👋" : "😊"} id="q-name">Comment vous <Em>appelez-vous</Em> ?</Title>
              <Hint>C&apos;est le nom que verront les restaurants quand vous laissez un avis.</Hint>
              <Field label="Prénom" errorId="err-name" error={errors.name}>
                <input
                  id="su-name" value={name} onChange={(e) => { setName(e.target.value); setError("name", null); }}
                  autoComplete="given-name" autoCapitalize="words" maxLength={40} enterKeyHint="next" placeholder="Camille"
                  aria-describedby="err-name" className={inputClass(!!errors.name)}
                />
              </Field>
              <p className="mt-3 min-h-6 text-base font-medium text-brand dark:text-brand-night" aria-live="polite">
                {firstName.length >= 2 ? `Bienvenue, ${firstName} ! 😊` : ""}
              </p>
              <Primary>Continuer</Primary>
            </form>
          )}

          {step === "gender" && (
            <div className="flex flex-1 flex-col">
              <Title emoji={GENDERS.find((g) => g.value === gender)?.emoji ?? "✨"} id="q-gender">
                {firstName ? `${firstName}, vous êtes…` : "Vous êtes…"}
              </Title>
              <Hint>Facultatif. Les restaurants voient seulement des statistiques globales, jamais votre réponse.</Hint>
              <div role="radiogroup" aria-labelledby="q-gender" className="mt-6 grid grid-cols-2 gap-3">
                {GENDERS.map((g, i) => {
                  const checked = gender === g.value;
                  return (
                    <button
                      key={g.label} id={`su-gender-${i}`} type="button" role="radio" aria-checked={checked}
                      onClick={() => pickGender(g.value)}
                      className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border-2 px-3 py-4 text-center text-[15px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:ring-offset-slate-950 ${checked
                        ? "border-brand bg-brand/10 text-brand dark:border-brand-night dark:bg-brand-night/10 dark:text-brand-night"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"}`}
                    >
                      <span aria-hidden className={`text-3xl ${checked ? "motion-safe:animate-pop" : ""}`}>{g.emoji}</span>
                      {g.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === "age" && (
            <form onSubmit={submitAge} noValidate className="flex flex-1 flex-col">
              <Title emoji={AGE_EMOJI.find(([max]) => age < max)?.[1] ?? "🎓"} id="q-age">Quel âge <Em>avez-vous</Em> ?</Title>
              <Hint>Facultatif. Les restaurants voient seulement des tranches d&apos;âge (18-24 ans…), jamais le vôtre.</Hint>
              <AgePicker value={age} onChange={(v) => { setAge(v); setError("age", null); }} labelledBy="q-age" onEnter={() => { if (age >= MIN_AGE) { setAgeSet(true); go("email"); } }} />
              <p className={`mt-3 min-h-6 text-sm ${age < MIN_AGE || errors.age ? "font-medium text-red-600 dark:text-red-400" : "text-slate-500"}`} aria-live="polite">
                {age < MIN_AGE ? `FlashMiam est réservé aux ${MIN_AGE} ans et plus.` : errors.age}
              </p>
              <Primary disabled={age < MIN_AGE}>{age < MIN_AGE ? "Continuer" : `J'ai ${age} ans`}</Primary>
              <button type="button" onClick={() => { setAgeSet(false); go("email"); }} className="mt-3 self-center rounded-full px-4 py-2 text-sm font-medium text-slate-500 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-slate-400">
                Passer cette question
              </button>
            </form>
          )}

          {step === "email" && (
            <form onSubmit={submitEmail} noValidate className="flex flex-1 flex-col">
              <Title emoji="📬" id="q-email">Votre adresse <Em>e-mail</Em> ?</Title>
              <Hint>Elle vous servira à vous connecter, et à retrouver votre compte si vous oubliez votre mot de passe.</Hint>
              <Field label="Adresse e-mail" errorId="err-email" error={errors.email}>
                <div className="relative">
                  <input
                    id="su-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="off" spellCheck={false}
                    maxLength={120} enterKeyHint="next" placeholder="prenom@exemple.fr" value={email}
                    onChange={(e) => { setEmail(e.target.value); setSuggestion(null); setError("email", null); }}
                    aria-describedby="err-email" className={`${inputClass(!!errors.email)} pr-14`}
                  />
                  {emailValid && !errors.email && (
                    <span aria-hidden className="absolute top-1/2 right-4 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-emerald-600 text-white motion-safe:animate-pop">
                      <Check className="h-4 w-4" strokeWidth={3} />
                    </span>
                  )}
                </div>
              </Field>
              {suggestion && (
                <div role="alert" className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-[15px] motion-safe:animate-step-next dark:border-amber-500/40 dark:bg-amber-500/10">
                  <p>Vouliez-vous dire <strong className="break-all">{suggestion}</strong> ?</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button id="su-fix-email" type="button" onClick={() => { setEmail(suggestion); checkAndConfirm(suggestion); }} className="rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600">
                      Oui, corriger
                    </button>
                    <button id="su-keep-email" type="button" onClick={() => checkAndConfirm(cleanEmail)} className="rounded-full px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-900">
                      Non, garder la mienne
                    </button>
                  </div>
                </div>
              )}
              <Primary busy={busy}>{busy ? "Vérification…" : "Continuer"}</Primary>
              <GoogleSignup onCredential={googleSignIn} />
            </form>
          )}

          {step === "confirm" && (
            <div className="flex flex-1 flex-col">
              <Title emoji="🔎" id="q-confirm">Confirmez votre <Em>adresse</Em></Title>
              <p className="mt-6 rounded-2xl bg-white px-5 py-6 text-center text-2xl font-semibold break-all shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                {cleanEmail.slice(0, cleanEmail.lastIndexOf("@"))}
                <span className="text-slate-400">@</span>
                <span className="text-brand dark:text-brand-night">{cleanEmail.slice(cleanEmail.lastIndexOf("@") + 1)}</span>
              </p>
              <Hint>Relisez-la lettre par lettre : sans elle, impossible de retrouver votre compte si vous oubliez votre mot de passe.</Hint>
              <div className="mt-auto flex flex-col gap-3 pt-8">
                <button id="su-confirm-yes" type="button" onClick={() => go("password")} className={primaryClass}>Oui, c&apos;est la bonne</button>
                <button type="button" onClick={() => go("email", "prev")} className="h-14 rounded-full text-base font-medium text-slate-700 ring-1 ring-slate-300 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-900">
                  Non, je la corrige
                </button>
              </div>
            </div>
          )}

          {step === "password" && (
            <form onSubmit={createAccount} noValidate className="flex flex-1 flex-col">
              <Title emoji={score === 5 ? "🛡️" : score >= 3 ? "🔑" : "🔒"} id="q-password">Choisissez un <Em>mot de passe</Em></Title>
              {/* Identifiant caché : les gestionnaires de mots de passe l'associent à la bonne adresse */}
              <input type="email" autoComplete="username" value={cleanEmail} readOnly hidden />
              <Field label="Mot de passe" errorId="err-password" error={errors.password}>
                <div className="relative">
                  <input
                    id="su-password" type={showPassword ? "text" : "password"} autoComplete="new-password" maxLength={72}
                    enterKeyHint="go" value={password} onChange={(e) => { setPassword(e.target.value); setError("password", null); }}
                    aria-describedby="su-rules err-password" className={`${inputClass(!!errors.password)} pr-28`}
                  />
                  <button
                    type="button" onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword}
                    className="absolute top-1/2 right-2 inline-flex -translate-y-1/2 items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-brand hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-brand-night"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                    {showPassword ? "Masquer" : "Afficher"}
                  </button>
                </div>
              </Field>
              <div className="mt-4 grid grid-cols-5 gap-1.5" aria-hidden>
                {PASSWORD_RULES.map((r, i) => (
                  <span key={r.id} className={`h-1.5 rounded-full transition-colors duration-300 ${i < score ? (score <= 2 ? "bg-red-500" : score < 5 ? "bg-amber-500" : "bg-emerald-600") : "bg-slate-200 dark:bg-slate-800"}`} />
                ))}
              </div>
              <p className={`mt-2 min-h-5 text-sm font-medium ${score === 5 ? "text-emerald-700 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"}`}>
                {password ? STRENGTH[score] : ""}
              </p>
              <ul id="su-rules" aria-label="Le mot de passe doit contenir" className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
                {PASSWORD_RULES.map((r) => {
                  const ok = r.test(password);
                  return (
                    <li key={r.id} className={`flex items-center gap-2 text-[15px] transition-colors duration-300 ${ok ? "text-emerald-700 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"}`}>
                      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full transition-colors duration-300 ${ok ? "bg-emerald-600 text-white" : "border-2 border-slate-300 dark:border-slate-600"}`}>
                        {ok && <Check className="h-3.5 w-3.5 motion-safe:animate-pop" strokeWidth={3} aria-hidden />}
                      </span>
                      {r.label}
                      <span className="sr-only">{ok ? " : respecté" : " : manquant"}</span>
                    </li>
                  );
                })}
              </ul>
              <label className="mt-auto flex items-center gap-3 pt-6 pb-4 text-[15px] text-slate-700 dark:text-slate-300">
                <input id="su-remember" type="checkbox" checked={remember} onChange={(e) => setRememberChoice(e.target.checked)} className="h-5 w-5 rounded accent-brand dark:accent-brand-night" />
                Rester connecté sur cet appareil
              </label>
              <Primary busy={busy} disabled={score < PASSWORD_RULES.length} className="mt-0">{busy ? "Création du compte…" : "Créer mon compte 🎉"}</Primary>
              <p className="mt-4 text-center text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                En créant un compte, vous acceptez les{" "}
                <a className="underline" href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/legal/cgu/`}>conditions d&apos;utilisation</a> et la{" "}
                <a className="underline" href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/legal/confidentialite/`}>politique de confidentialité</a>.
              </p>
            </form>
          )}

          {step === "done" && (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <span aria-hidden className="text-7xl motion-safe:animate-pop">🎉</span>
              <h1 id="su-done" tabIndex={-1} className="mt-6 text-3xl font-bold tracking-tight text-balance focus:outline-none">
                Bienvenue sur FlashMiam, {firstName} !
              </h1>
              <p className="mt-3 text-slate-600 dark:text-slate-400">Votre compte est prêt. Les bons plans food de La Roche-sur-Yon vous attendent.</p>
              <p className="mt-10 inline-flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400" aria-live="polite">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Ouverture de la carte…
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/* ---------- Petits composants de mise en page ---------- */

const primaryClass =
  "h-14 rounded-full bg-brand text-base font-semibold text-white shadow-lg shadow-brand/25 transition hover:bg-brand-strong active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none dark:ring-offset-slate-950";

const inputClass = (invalid: boolean) =>
  `h-14 w-full rounded-2xl border-2 bg-white px-4 text-lg text-slate-900 transition placeholder:text-slate-400 focus:outline-none dark:bg-slate-900 dark:text-slate-100 ${invalid
    ? "border-red-500 focus:border-red-500"
    : "border-slate-200 focus:border-brand dark:border-slate-800 dark:focus:border-brand-night"}`;

function Title({ emoji, id, children }: { emoji: string; id: string; children: ReactNode }) {
  return (
    <>
      <span aria-hidden className="text-5xl leading-none group-data-[kb]/page:hidden">{emoji}</span>
      <h1 id={id} className="mt-5 text-[28px] group-data-[kb]/page:mt-0 leading-tight font-bold tracking-tight text-balance">{children}</h1>
    </>
  );
}
const Em = ({ children }: { children: ReactNode }) => <span className="text-brand dark:text-brand-night">{children}</span>;
const Hint = ({ children }: { children: ReactNode }) => <p className="mt-3 text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">{children}</p>;

function Field({ label, errorId, error, children }: { label: string; errorId: string; error?: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-6">
      <label className="block text-sm font-medium text-slate-600 dark:text-slate-400">
        <span className="mb-2 block">{label}</span>
        {children}
      </label>
      <p id={errorId} aria-live="polite" className="mt-2 min-h-5 text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
    </div>
  );
}

function Primary({ children, busy = false, disabled = false, className = "mt-auto" }: { children: ReactNode; busy?: boolean; disabled?: boolean; className?: string }) {
  return (
    <button type="submit" disabled={busy || disabled} className={`${primaryClass} ${className} inline-flex items-center justify-center gap-2`}>
      {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
