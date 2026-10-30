"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { ArrowLeft, Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { setRemember, siteClient } from "@/lib/supabase/site-session";
import { CAPTCHA_FAILED, captchaRefused, captchaToken } from "@/lib/captcha";
import AgePicker from "@/components/signup/AgePicker";
import GoogleSignup from "@/components/signup/GoogleSignup";
import { useKeyboardInset } from "@/components/signup/useKeyboardInset";
import {
  EMAIL_RE, MIN_AGE, PASSWORD_RULES, TERMS_VERSION, capitalize, passwordScore, suggestEmail,
} from "@/lib/signup/validation";

/**
 * Inscription d'un client, une question par écran : prénom, sexe et âge (facultatifs), e-mail (ou Google), relecture de
 * l'adresse, mot de passe. « S'inscrire avec Google » est aussi proposé dès le premier écran : le compte est créé par
 * Google, puis seules les deux questions facultatives restent (sexe, âge). Le compte est créé par la fonction serveur client-signup (adresse vérifiée, plafond
 * anti-robots), puis la session est ouverte avec le mot de passe choisi, dans le stockage de la carte : la personne
 * arrive ensuite sur la carte déjà connectée (?bienvenue=1 : accueil et localisation).
 * Si la confirmation par e-mail est activée (réglage du serveur), un code à 6 chiffres est envoyé à l'adresse : la
 * session ne s'ouvre qu'avec ce code. La réponse est la même que l'adresse ait déjà un compte ou non (aucune fuite).
 */

type Step = "name" | "gender" | "age" | "email" | "confirm" | "password" | "code" | "done";
type Gender = "female" | "male" | "other" | "";   // "" : préfère ne pas le dire
type Reply = { ok: true; confirm: boolean } | { ok: false; code: string; message: string };
/** Délai avant de pouvoir redemander un code (comme Supabase : un envoi par minute). */
const RESEND_DELAY = 60;

const FLOW: Step[] = ["name", "gender", "age", "email", "confirm", "password"];
/** Questions comptées dans la barre de progression (la relecture fait partie de la question de l'e-mail). */
const QUESTIONS: Step[] = ["name", "gender", "age", "email", "password"];
/** Compte créé avec Google dès le premier écran : il ne reste que les questions facultatives. */
const GOOGLE_FLOW: Step[] = ["name", "gender", "age"];
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
  password: "su-password", code: "su-code", done: "su-done",
};

/** Appel à la fonction serveur ; ses refus arrivent sous la forme { error, message }. */
async function callSignup(body: Record<string, string>): Promise<Reply> {
  const { data, error } = await siteClient().functions.invoke("client-signup", { body });
  if (!error) return { ok: true, confirm: !!(data && (data as { confirm?: unknown }).confirm) };
  if (error instanceof FunctionsHttpError) {
    try {
      const j = await error.context.json();
      return { ok: false, code: String(j.error ?? "server"), message: String(j.message ?? "Inscription impossible pour le moment.") };
    } catch { /* réponse illisible : traitée comme une panne réseau */ }
  }
  return { ok: false, code: "network", message: "Connexion impossible. Vérifiez votre réseau, puis réessayez." };
}

/**
 * Page prête (JavaScript chargé) : avant, un champ validé par Entrée enverrait le formulaire au navigateur, qui
 * rechargerait la page et perdrait la réponse. L'export statique affiche donc d'abord une attente, puis les questions.
 */
const noSubscribe = () => () => {};
const useHydrated = () => useSyncExternalStore(noSubscribe, () => true, () => false);

export default function SignupWizard() {
  return useHydrated() ? <Wizard /> : (
    <div className="grid min-h-full place-items-center bg-slate-50 dark:bg-night" aria-busy="true">
      <Loader2 className="h-8 w-8 animate-spin text-brand dark:text-brand-night" aria-label="Chargement" />
    </div>
  );
}

function Wizard() {
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
  const [viaGoogle, setViaGoogle] = useState(false);
  const [terms, setTerms] = useState(false);   // « J'ai 15 ans ou plus et j'accepte les conditions »
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);   // secondes avant de pouvoir redemander un code
  const [errors, setErrors] = useState<Partial<Record<Step, ReactNode>>>({});
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestedFor = useRef("");
  const checkedEmail = useRef("");
  const keyboard = useKeyboardInset();   // clavier ouvert : marge sous la page, emoji masqué pour gagner de la place

  const firstName = capitalize(name.trim().split(/\s+/)[0] ?? "");
  const cleanEmail = email.trim().toLowerCase();
  const emailValid = EMAIL_RE.test(cleanEmail);
  const score = passwordScore(password);
  const flow = viaGoogle ? GOOGLE_FLOW : FLOW;
  const questions = viaGoogle ? GOOGLE_FLOW : QUESTIONS;
  const question = questions.indexOf(step === "confirm" ? "email" : step === "code" ? "password" : step) + 1;

  // Arrivée sur un écran : focus sur sa réponse (sans faire défiler pendant le glissement)
  useEffect(() => {
    document.getElementById(FOCUS[step])?.focus({ preventScroll: true });
  }, [step]);
  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current); }, []);
  // Compte à rebours avant de pouvoir redemander un code
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);
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
    const i = flow.indexOf(step);
    if (i > 0) go(flow[i - 1], "prev");
  };

  /* ---------- Réponses ---------- */
  function submitName(ev: FormEvent) {
    ev.preventDefault();
    const clean = name.trim().replace(/\s+/g, " ");
    if (clean.length < 2) return setError("name", "Indiquez votre prénom (2 caractères minimum).");
    if (!terms) return termsMissing();
    setName(capitalize(clean));
    setError("name", null);
    go("gender");
  }
  /** Case des conditions pas cochée : on le dit et on l'amène sous les yeux. */
  function termsMissing() {
    setError("name", `Cochez la case : FlashMiam est réservé aux ${MIN_AGE} ans et plus, qui acceptent ses conditions.`);
    document.getElementById("su-terms")?.focus();
  }
  function pickGender(value: Gender) {
    setGender(value);
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(() => go("age"), 320);   // le temps de voir la carte se cocher
  }
  function submitAge(ev: FormEvent) {
    ev.preventDefault();
    answerAge(true);
  }
  /** Âge donné (ou question passée) : question suivante, ou fin de l'inscription avec Google. */
  function answerAge(given: boolean) {
    if (given && age < MIN_AGE) return;
    setAgeSet(given);
    if (viaGoogle) finishGoogle(given);
    else go("email");
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
    const body: Record<string, string> = { action: "signup", email: cleanEmail, password, first_name: name.trim(), accept_terms: TERMS_VERSION };
    if (gender) body.gender = gender;
    if (ageSet) body.birth_year = String(new Date().getFullYear() - age);
    try {
      const token = await captchaToken();
      if (token) body.captcha_token = token;
    } catch {
      setBusy(false);
      return setError("password", CAPTCHA_FAILED);
    }
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
    // Confirmation par e-mail activée : le code part vers l'adresse, la session s'ouvrira avec lui
    if (res.confirm) {
      setBusy(false);
      setCode("");
      setResendIn(RESEND_DELAY);
      return go("code");
    }
    // Compte créé et confirmé : ouverture de la session, retrouvée ensuite par la carte
    setRemember(remember);
    let loginToken: string | undefined;
    try { loginToken = await captchaToken(); } catch { loginToken = undefined; }
    const { error } = await siteClient().auth.signInWithPassword({ email: cleanEmail, password, options: { captchaToken: loginToken } });
    setBusy(false);
    if (error) return setError("password", <>Votre compte est créé, mais la connexion a échoué. <button type="button" className={linkClass} onClick={() => openLogin(cleanEmail)}>Se connecter sur la carte</button></>);
    go("done");
  }

  /** Code reçu par e-mail : il confirme l'adresse et ouvre la session (rien ne dit si l'adresse avait déjà un compte). */
  async function verifyCode(ev?: FormEvent) {
    ev?.preventDefault();
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) return setError("code", "Saisissez les 6 chiffres reçus par e-mail.");
    if (busy) return;
    setBusy(true);
    setError("code", null);
    setRemember(remember);
    const sb = siteClient();
    let { data, error } = await sb.auth.verifyOtp({ email: cleanEmail, token: digits, type: "signup" });
    if (error) ({ data, error } = await sb.auth.verifyOtp({ email: cleanEmail, token: digits, type: "email" }));
    setBusy(false);
    if (error || !data.session) {
      return setError("code", error?.status === 429
        ? "Trop d'essais en peu de temps. Patientez quelques minutes, puis réessayez."
        : "Code incorrect ou expiré. Vérifiez le dernier e-mail reçu, ou demandez un nouveau code.");
    }
    go("done");
  }
  /** Nouvel envoi du code : seules les erreurs utiles sont montrées (jamais « adresse déjà confirmée », qui trahirait un compte). */
  async function resendCode() {
    if (resendIn > 0 || busy) return;
    setError("code", null);
    let token: string | undefined;
    try { token = await captchaToken(); } catch { return setError("code", CAPTCHA_FAILED); }
    const { error } = await siteClient().auth.resend({ type: "signup", email: cleanEmail, options: { captchaToken: token } });
    if (error && (captchaRefused(error) || error.status === 429 || !error.status || error.status >= 500)) {
      return setError("code", captchaRefused(error) ? CAPTCHA_FAILED : error.status === 429
        ? "Trop de demandes en peu de temps. Patientez quelques minutes, puis réessayez."
        : "Envoi impossible pour le moment. Vérifiez votre connexion, puis réessayez.");
    }
    setResendIn(RESEND_DELAY);
  }

  /**
   * Inscription avec Google : Supabase vérifie le jeton et crée le compte client (ou ouvre celui qui existe). Compte tout
   * neuf : le prénom, le sexe et l'âge déjà répondus sont enregistrés. Un compte restaurateur ne passe pas par Google.
   */
  async function googleSignIn(credential: string) {
    const at: Step = step === "name" ? "name" : "email";   // écran où le bouton a été touché
    setBusy(true);
    setError(at, null);
    const sb = siteClient();
    const fail = (message: ReactNode) => { setBusy(false); setError(at, message); };
    let token: string | undefined;
    try { token = await captchaToken(); } catch { return fail(CAPTCHA_FAILED); }
    const { data, error } = await sb.auth.signInWithIdToken({ provider: "google", token: credential, options: { captchaToken: token } });
    if (error || !data.user) return fail(captchaRefused(error) ? CAPTCHA_FAILED : "La connexion avec Google a échoué. Réessayez.");
    const { data: profile } = await sb.from("profiles").select("role, created_at, first_name").eq("id", data.user.id).single();
    if (profile?.role === "merchant") {
      await sb.auth.signOut().catch(() => null);
      return fail(<>Cette adresse est celle d&apos;un compte restaurateur : <button type="button" className={linkClass} onClick={() => openLogin(data.user.email ?? "", "pro")}>connectez-vous sur la carte</button> avec votre mot de passe.</>);
    }
    const fresh = !!profile && isFresh(profile.created_at);
    // Compte créé à l'instant par Google : l'acceptation des conditions (case cochée) est enregistrée sur le compte
    if (fresh) await sb.rpc("accept_terms", { p_version: TERMS_VERSION });
    if (fresh && at === "name") {
      // Compte créé par Google : prénom tapé, sinon celui de Google ; puis les deux questions facultatives
      setName(name.trim().length >= 2 ? capitalize(name.trim().replace(/\s+/g, " ")) : profile.first_name ?? "");
      setError("name", null);
      setViaGoogle(true);
      setBusy(false);
      return go("gender");
    }
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
  /** Fin de l'inscription avec Google : prénom, sexe et âge enregistrés sur le compte (réponses facultatives). */
  async function finishGoogle(withAge: boolean) {
    setBusy(true);
    const sb = siteClient();
    const { data } = await sb.auth.getUser();
    if (data.user) {
      await sb.from("profiles").update({
        first_name: name.trim() || undefined,
        gender: gender || null,
        birth_year: withAge ? new Date().getFullYear() - age : null,
      }).eq("id", data.user.id);
    }
    setBusy(false);
    go("done");
  }

  /* ---------- Rendu ---------- */
  return (
    <div
      data-kb={keyboard ? "" : undefined} style={keyboard ? { paddingBottom: keyboard } : undefined}
      className="group/page relative isolate flex min-h-full flex-col bg-slate-50 text-slate-900 antialiased dark:bg-night dark:text-zinc-50 dark:[color-scheme:dark]"
    >
      <div aria-hidden className="su-glow pointer-events-none fixed inset-0 -z-10" />
      <header className="mx-auto flex w-full max-w-md items-center gap-3 px-5 pt-[max(16px,env(safe-area-inset-top))] pb-2">
        <button
          type="button"
          onClick={back}
          aria-label="Question précédente"
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:bg-white/[0.05] dark:text-zinc-200 dark:ring-white/10 dark:backdrop-blur-xl dark:hover:bg-white/10 dark:focus-visible:ring-brand-night ${flow.indexOf(step) > 0 && step !== "done" ? "" : "invisible"}`}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
        {step !== "done" && (
          <>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10" aria-hidden>
              <div
                className="su-gradient h-full rounded-full bg-gradient-to-r from-brand to-orange-400 transition-[width] duration-500 ease-out"
                style={{ width: `${(question / questions.length) * 100}%` }}
              />
            </div>
            <p className="w-10 text-right text-sm font-medium tabular-nums text-slate-500 dark:text-zinc-400">
              <span aria-hidden>{question}/{questions.length}</span>
              <span className="sr-only">Question {question} sur {questions.length}</span>
            </p>
          </>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-x-hidden px-5 pt-6 pb-[max(24px,env(safe-area-inset-bottom))]">
        <div key={step} className={`su-cascade flex flex-1 flex-col ${dir === "next" ? "motion-safe:animate-step-next" : "motion-safe:animate-step-prev"}`}>
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
              <p className="mt-3 min-h-6 text-base font-medium text-brand-strong" aria-live="polite">
                {firstName.length >= 2 && <><span className="su-em">Bienvenue, {firstName} !</span> 😊</>}
              </p>
              <label className="mt-auto flex cursor-pointer items-start gap-3 pt-4 text-[14px] leading-relaxed text-slate-700 dark:text-zinc-300">
                <input
                  id="su-terms" type="checkbox" checked={terms} onChange={(e) => { setTerms(e.target.checked); setError("name", null); }}
                  // Entrée sur la case passe à la suite, comme dans les champs (sinon il faut traverser les deux liens)
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
                  className="mt-0.5 h-5 w-5 flex-none rounded accent-brand dark:accent-brand-night"
                />
                <span>
                  J&apos;ai {MIN_AGE} ans ou plus et j&apos;accepte les{" "}
                  <a className="font-medium underline" href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/legal/cgu/`} target="_blank" rel="noopener">conditions d&apos;utilisation</a>{" "}
                  et la <a className="font-medium underline" href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/legal/confidentialite/`} target="_blank" rel="noopener">politique de confidentialité</a>.
                </span>
              </label>
              <Primary className="mt-4">Continuer</Primary>
              {!viaGoogle && <GoogleSignup onCredential={googleSignIn} locked={!terms} onLocked={termsMissing} />}
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
                      className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border-2 px-3 py-4 text-center text-[15px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:ring-offset-night dark:focus-visible:ring-brand-night ${checked
                        ? "su-picked border-brand bg-brand/10 text-brand dark:text-white"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:backdrop-blur-xl dark:hover:border-white/20 dark:hover:bg-white/[0.07]"}`}
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
              <AgePicker value={age} onChange={(v) => { setAge(v); setError("age", null); }} labelledBy="q-age" onEnter={() => answerAge(true)} />
              <p className={`mt-3 min-h-6 text-sm ${age < MIN_AGE || errors.age ? "font-medium text-red-600 dark:text-red-400" : "text-slate-500"}`} aria-live="polite">
                {age < MIN_AGE ? `FlashMiam est réservé aux ${MIN_AGE} ans et plus.` : errors.age}
              </p>
              <Primary busy={busy} disabled={age < MIN_AGE}>{age < MIN_AGE ? "Continuer" : `J'ai ${age} ans`}</Primary>
              <button type="button" disabled={busy} onClick={() => answerAge(false)} className="mt-3 self-center rounded-full px-4 py-2 text-sm font-medium text-slate-500 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-zinc-400">
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
                    <button id="su-keep-email" type="button" onClick={() => checkAndConfirm(cleanEmail)} className="rounded-full px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-zinc-200 dark:ring-white/15 dark:hover:bg-white/[0.06]">
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
              <p className="mt-6 rounded-2xl bg-white px-5 py-6 text-center text-2xl font-semibold break-all shadow-sm ring-1 ring-slate-200 dark:bg-white/[0.04] dark:ring-white/10 dark:backdrop-blur-xl">
                {cleanEmail.slice(0, cleanEmail.lastIndexOf("@"))}
                <span className="text-slate-400">@</span>
                <span className="su-em text-brand">{cleanEmail.slice(cleanEmail.lastIndexOf("@") + 1)}</span>
              </p>
              <Hint>Relisez-la lettre par lettre : sans elle, impossible de retrouver votre compte si vous oubliez votre mot de passe.</Hint>
              <div className="mt-auto flex flex-col gap-3 pt-8">
                <button id="su-confirm-yes" type="button" onClick={() => go("password")} className={primaryClass}>Oui, c&apos;est la bonne</button>
                <button type="button" onClick={() => go("email", "prev")} className="h-14 rounded-full text-base font-medium text-slate-700 ring-1 ring-slate-300 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-zinc-200 dark:ring-white/15 dark:hover:bg-white/[0.06] dark:focus-visible:ring-brand-night">
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
                  <span key={r.id} className={`h-1.5 rounded-full transition-colors duration-300 ${i < score ? (score <= 2 ? "bg-red-500" : score < 5 ? "bg-amber-500" : "bg-emerald-600") : "bg-slate-200 dark:bg-white/10"}`} />
                ))}
              </div>
              <p className={`mt-2 min-h-5 text-sm font-medium ${score === 5 ? "text-emerald-700 dark:text-emerald-400" : "text-slate-500 dark:text-zinc-400"}`}>
                {password ? STRENGTH[score] : ""}
              </p>
              <ul id="su-rules" aria-label="Le mot de passe doit contenir" className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
                {PASSWORD_RULES.map((r) => {
                  const ok = r.test(password);
                  return (
                    <li key={r.id} className={`flex items-center gap-2 text-[15px] transition-colors duration-300 ${ok ? "text-emerald-700 dark:text-emerald-400" : "text-slate-500 dark:text-zinc-400"}`}>
                      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full transition-colors duration-300 ${ok ? "bg-emerald-600 text-white" : "border-2 border-slate-300 dark:border-zinc-600"}`}>
                        {ok && <Check className="h-3.5 w-3.5 motion-safe:animate-pop" strokeWidth={3} aria-hidden />}
                      </span>
                      {r.label}
                      <span className="sr-only">{ok ? " : respecté" : " : manquant"}</span>
                    </li>
                  );
                })}
              </ul>
              <label className="mt-auto flex items-center gap-3 pt-6 pb-4 text-[15px] text-slate-700 dark:text-zinc-300">
                <input id="su-remember" type="checkbox" checked={remember} onChange={(e) => setRememberChoice(e.target.checked)} className="h-5 w-5 rounded accent-brand dark:accent-brand-night" />
                Rester connecté sur cet appareil
              </label>
              <Primary busy={busy} disabled={score < PASSWORD_RULES.length} className="mt-0">{busy ? "Création du compte…" : "Créer mon compte 🎉"}</Primary>
              <p className="mt-4 text-center text-xs leading-relaxed text-slate-500 dark:text-zinc-400">
                En créant un compte, vous acceptez les{" "}
                <a className="underline" href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/legal/cgu/`}>conditions d&apos;utilisation</a> et la{" "}
                <a className="underline" href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/legal/confidentialite/`}>politique de confidentialité</a>.
              </p>
            </form>
          )}

          {step === "code" && (
            <form onSubmit={verifyCode} noValidate className="flex flex-1 flex-col">
              <Title emoji="✉️" id="q-code">Vérifiez votre <Em>adresse e-mail</Em></Title>
              <Hint>
                Un code à 6 chiffres vient d&apos;être envoyé à <strong className="break-all text-slate-900 dark:text-zinc-50">{cleanEmail}</strong>.
                Saisissez-le pour activer votre compte (pensez à regarder dans les courriers indésirables).
              </Hint>
              <Field label="Code reçu par e-mail" errorId="err-code" error={errors.code}>
                <input
                  id="su-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} enterKeyHint="go"
                  placeholder="––––––" value={code} aria-describedby="err-code"
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setCode(digits);
                    setError("code", null);
                    if (digits.length === 6) setTimeout(() => (document.getElementById("su-code") as HTMLInputElement | null)?.form?.requestSubmit(), 0);
                  }}
                  className={`${inputClass(!!errors.code)} text-center text-2xl tracking-[0.5em] tabular-nums`}
                />
              </Field>
              <p className="text-sm leading-relaxed text-slate-500 dark:text-zinc-400">
                Vous avez déjà un compte avec cette adresse ? Aucun code n&apos;est envoyé dans ce cas :{" "}
                <button type="button" className={linkClass} onClick={() => openLogin(cleanEmail)}>connectez-vous</button>.
              </p>
              <Primary busy={busy} disabled={code.length !== 6}>{busy ? "Vérification…" : "Valider le code"}</Primary>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
                <button id="su-resend" type="button" disabled={resendIn > 0 || busy} onClick={resendCode}
                  className="rounded-full px-3 py-2 font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:text-slate-400 disabled:no-underline dark:text-brand-night">
                  {resendIn > 0 ? `Renvoyer le code (${resendIn} s)` : "Renvoyer le code"}
                </button>
                <button type="button" onClick={() => go("email", "prev")}
                  className="rounded-full px-3 py-2 font-medium text-slate-500 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-zinc-400">
                  Modifier l&apos;adresse
                </button>
              </div>
            </form>
          )}

          {step === "done" && (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <span aria-hidden className="text-7xl motion-safe:animate-pop">🎉</span>
              <h1 id="su-done" tabIndex={-1} className="mt-6 text-3xl font-bold tracking-tight text-balance focus:outline-none">
                Bienvenue sur <Em>FlashMiam</Em>, {firstName} !
              </h1>
              <p className="mt-3 text-slate-600 dark:text-zinc-400">Votre compte est prêt. Les bons plans food de La Roche-sur-Yon vous attendent.</p>
              <p className="mt-10 inline-flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-zinc-400" aria-live="polite">
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
  "su-cta h-14 rounded-full bg-brand text-base font-semibold text-white shadow-lg shadow-brand/25 transition hover:bg-brand-strong active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none dark:ring-offset-night dark:focus-visible:ring-brand-night";

const inputClass = (invalid: boolean) =>
  `h-14 w-full rounded-2xl border-2 bg-white px-4 text-lg text-slate-900 transition placeholder:text-slate-400 focus:outline-none dark:bg-white/[0.04] dark:text-zinc-50 dark:backdrop-blur-xl dark:placeholder:text-zinc-500 ${invalid
    ? "border-red-500 focus:border-red-500"
    : "border-slate-200 focus:border-brand dark:border-white/10 dark:focus:border-brand-night dark:focus:shadow-[0_0_0_4px_rgb(167_139_250/0.18)]"}`;

function Title({ emoji, id, children }: { emoji: string; id: string; children: ReactNode }) {
  return (
    <>
      <span aria-hidden className="text-5xl leading-none group-data-[kb]/page:hidden">{emoji}</span>
      <h1 id={id} className="mt-5 text-[28px] group-data-[kb]/page:mt-0 leading-tight font-bold tracking-tight text-balance">{children}</h1>
    </>
  );
}
const Em = ({ children }: { children: ReactNode }) => <span className="su-em text-brand">{children}</span>;
const Hint = ({ children }: { children: ReactNode }) => <p className="mt-3 text-[15px] leading-relaxed text-slate-600 dark:text-zinc-400">{children}</p>;

function Field({ label, errorId, error, children }: { label: string; errorId: string; error?: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-6">
      <label className="block text-sm font-medium text-slate-600 dark:text-zinc-400">
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
