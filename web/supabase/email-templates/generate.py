#!/usr/bin/env python3
"""
Modèles des e-mails envoyés par Supabase Auth (codes de vérification), aux couleurs de FlashMiam.
À coller dans Supabase › Authentication › Emails › Templates (voir README.md). Regénérer : python3 generate.py
Mise en page en tableaux et styles en ligne : lue correctement par Gmail, Outlook, Apple Mail.
"""
import html, json, pathlib

SITE = "https://flashmiam.fr"
ACCENT, INK, MUTED, LINE, BG = "#c2410c", "#1c1917", "#6b6460", "#ece6e1", "#f6f3f0"
FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

def code_block(note):
    return f"""
          <tr><td style="padding:8px 32px 4px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff7f2;border:1px solid #f3d9cc;border-radius:14px">
              <tr><td align="center" style="padding:22px 12px 8px;font:600 13px {FONT};color:{MUTED};letter-spacing:.02em">Votre code</td></tr>
              <tr><td align="center" style="padding:0 12px 20px;font:700 36px/1.1 'SF Mono',Menlo,Consolas,monospace;color:{INK};letter-spacing:10px">{{{{ .Token }}}}</td></tr>
            </table>
          </td></tr>
          <tr><td style="padding:10px 32px 0;font:14px/1.55 {FONT};color:{MUTED}">{note}</td></tr>"""

def button(label, url="{{ .ConfirmationURL }}"):
    return f"""
          <tr><td style="padding:22px 32px 4px">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:999px;background:{ACCENT}">
              <a href="{url}" style="display:inline-block;padding:14px 28px;font:600 16px {FONT};color:#ffffff;text-decoration:none;border-radius:999px">{label}</a>
            </td></tr></table>
          </td></tr>"""

def page(preheader, title, intro, middle, why):
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>{html.escape(title)}</title>
</head>
<body style="margin:0;padding:0;background:{BG}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">{html.escape(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{BG}">
    <tr><td align="center" style="padding:28px 12px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
        <tr><td style="padding:0 8px 18px">
          <a href="{SITE}" style="text-decoration:none">
            <img src="{SITE}/icon-192.png" width="36" height="36" alt="" style="vertical-align:middle;border-radius:9px;border:0" />
            <span style="vertical-align:middle;margin-left:8px;font:700 19px {FONT};color:{INK}">FlashMiam</span>
          </a>
        </td></tr>
        <tr><td style="background:#ffffff;border:1px solid {LINE};border-radius:20px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:30px 32px 6px;font:700 24px/1.25 {FONT};color:{INK}">{title}</td></tr>
          <tr><td style="padding:6px 32px 10px;font:16px/1.55 {FONT};color:{INK}">{intro}</td></tr>{middle}
          <tr><td style="padding:24px 32px 28px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid {LINE};padding-top:16px;font:13px/1.55 {FONT};color:{MUTED}">{why}</td></tr></table>
          </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:18px 12px 0;font:12.5px/1.6 {FONT};color:{MUTED}">
          FlashMiam · les restaurants et les bons plans de La Roche-sur-Yon<br />
          <a href="{SITE}" style="color:{MUTED}">flashmiam.fr</a> · <a href="https://www.instagram.com/flashmiam85/" style="color:{MUTED}">Instagram @flashmiam85</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""

NOT_YOU = "Vous n'avez rien demandé ? Ignorez simplement cet e-mail : sans accès à votre boîte mail, personne ne peut utiliser ce code."
TEMPLATES = [
  ("confirmation", "Confirm signup", "Votre code FlashMiam : {{ .Token }}",
   page("Votre code pour activer votre compte FlashMiam.", "Bienvenue sur FlashMiam !",
        "Il ne reste qu'une étape : saisissez ce code dans FlashMiam pour confirmer votre adresse e-mail.",
        code_block("Le code est valable pour une durée limitée. Vous pouvez aussi confirmer en un geste avec le bouton ci-dessous.") + button("Confirmer mon adresse"),
        "Vous recevez cet e-mail parce qu'un compte FlashMiam vient d'être créé avec cette adresse. " + NOT_YOU)),
  ("magic_link", "Magic Link", "Votre code de connexion FlashMiam : {{ .Token }}",
   page("Votre code pour vous connecter à FlashMiam.", "Votre code de connexion",
        "Saisissez ce code dans FlashMiam pour vous connecter. Par sécurité, il est demandé quand votre compte n'a pas servi depuis un moment.",
        code_block("Le code est valable pour une durée limitée et ne sert qu'une fois.") + button("Me connecter"),
        NOT_YOU)),
  ("recovery", "Reset password", "Votre code pour changer de mot de passe : {{ .Token }}",
   page("Votre code pour choisir un nouveau mot de passe FlashMiam.", "Mot de passe oublié ?",
        "Pas de souci. Saisissez ce code dans FlashMiam, puis choisissez votre nouveau mot de passe.",
        code_block("Le code est valable pour une durée limitée et ne sert qu'une fois."),
        "Vous n'avez pas demandé à changer de mot de passe ? Ignorez cet e-mail : votre mot de passe actuel reste valable.")),
  ("email_change", "Change Email Address", "Confirmez votre nouvelle adresse FlashMiam",
   page("Confirmez votre nouvelle adresse e-mail FlashMiam.", "Nouvelle adresse e-mail",
        "Vous avez demandé à utiliser <b>{{ .NewEmail }}</b> pour votre compte FlashMiam (au lieu de {{ .Email }}). Touchez le bouton pour confirmer.",
        button("Confirmer ma nouvelle adresse"),
        "Vous n'êtes pas à l'origine de cette demande ? Ne touchez pas le bouton et changez votre mot de passe dans FlashMiam (Profil › Mot de passe).")),
  ("reauthentication", "Reauthentication", "Votre code de sécurité FlashMiam : {{ .Token }}",
   page("Votre code pour confirmer une modification de votre compte FlashMiam.", "Confirmez que c'est bien vous",
        "Vous modifiez une information sensible de votre compte (votre mot de passe, par exemple). Saisissez ce code dans FlashMiam pour continuer.",
        code_block("Le code est valable pour une durée limitée et ne sert qu'une fois."),
        "Vous n'êtes pas à l'origine de cette demande ? Changez votre mot de passe dès que possible : " + NOT_YOU)),
]

here = pathlib.Path(__file__).parent
index = []
for key, name, subject, body in TEMPLATES:
    (here / f"{key}.html").write_text(body, encoding="utf-8")
    index.append({"key": key, "name": name, "subject": subject, "html": body})
(here / "templates.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"{len(TEMPLATES)} modèles écrits dans {here}")
