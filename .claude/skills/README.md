# Skills du projet FlashMiam

Ces skills sont chargés automatiquement par Claude Code dans toutes les sessions ouvertes sur ce dépôt.
Ils viennent de dépôts publics officiels, copiés tels quels (seule une licence a été ajoutée à côté des skills
Supabase). Ils ont été relus avant l'installation (25/11/2026 ; skills de sécurité le 28/11/2026) : ce sont des conseils en texte, plus un petit script
Python (`webapp-testing/scripts/with_server.py`) qui démarre un serveur local le temps d'un test. Aucun n'envoie de
données ailleurs.

| Skill | À quoi il sert pour FlashMiam | Source (commit) | Licence |
|---|---|---|---|
| `supabase` | Base Supabase, sécurité (RLS, SECURITY DEFINER, clés), fonctions, débogage | [supabase/agent-skills](https://github.com/supabase/agent-skills) (`c9be0e9`) | MIT |
| `supabase-postgres-best-practices` | Index, requêtes, RLS rapides, connexions : utile pour tenir 100–300+ utilisateurs | [supabase/agent-skills](https://github.com/supabase/agent-skills) (`c9be0e9`) | MIT |
| `web-design-guidelines` | Relecture de l'interface : accessibilité, formulaires, focus, téléphone | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) (`5a37a63`) | MIT |
| `react-best-practices` | Performance de la partie Next.js (`web/` : pages juridiques, espace web) | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) (`5a37a63`) | MIT |
| `webapp-testing` | Tester le site dans un navigateur automatique (Playwright) | [anthropics/skills](https://github.com/anthropics/skills) (`e4bb5d9`) | Apache 2.0 |
| `frontend-design` | Nouveaux écrans : choix visuels assumés, textes clairs | [anthropics/skills](https://github.com/anthropics/skills) (`e4bb5d9`) | Apache 2.0 |
| `impeccable` | Design « comme un vrai designer » : refonte, critique, finitions ; a servi à la refonte du 26/11/2026 (voir `DESIGN.md`) | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) (`2fc5e14`) — **guides seulement** : son programme (`scripts/`, qui télécharge un binaire) n'est pas installé, le skill lit alors directement `PRODUCT.md` et `DESIGN.md` | Apache 2.0 |
| `apple-design` | Interfaces « comme sur iPhone » : réactivité, gestes, ressorts, fiches qu'on glisse, typographie, accessibilité ; a servi aux gestes et à la typographie du 27/11/2026 (voir `DESIGN.md`) | [emilkowalski/skills](https://github.com/emilkowalski/skills) (`64eb3de`) | MIT |
| `animation-performance` | Animations fluides sur téléphone (propriétés à animer, saccades) ; référencé par `apple-design` | [emilkowalski/skills](https://github.com/emilkowalski/skills) (`64eb3de`) | MIT |
| `security-audit` | Audit de sécurité en 6 étapes (reconnaissance, chasse par classe d'attaque, validation, rapport) ; a servi à l'audit du 28/11/2026 (`web/docs/SECURITE-ETAT.md`) | [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill) (`c1c8a8c`) — 2 petits scripts Node de validation, sans réseau | MIT |
| `sharp-edges` | Repère les réglages et API « pièges » (valeurs par défaut dangereuses, erreurs faciles) | [trailofbits/skills](https://github.com/trailofbits/skills) (`149d7b2`) | CC BY-SA 4.0 |
| `fp-check` | Vérifie qu'une faille supposée est réelle (et pas un faux positif) avant de la corriger | [trailofbits/skills](https://github.com/trailofbits/skills) (`149d7b2`) — sans ses « hooks » (non installés) | CC BY-SA 4.0 |
| `variant-analysis` | Une faille trouvée : cherche les autres endroits du code qui ont la même | [trailofbits/skills](https://github.com/trailofbits/skills) (`149d7b2`) | CC BY-SA 4.0 |
| `differential-review` | Relecture de sécurité d'une modification (PR, commit) | [trailofbits/skills](https://github.com/trailofbits/skills) (`149d7b2`) | CC BY-SA 4.0 |
| `audit-context-building` | Comprendre le code (hypothèses, garanties) avant de chercher des failles | [trailofbits/skills](https://github.com/trailofbits/skills) (`149d7b2`) | CC BY-SA 4.0 |
| `supply-chain-risk-auditor` | Risque des dépendances (failles connues, paquets abandonnés, scripts d'installation) ; ses scripts Python interrogent les bases publiques (osv.dev, npm, GitHub) avec les seuls noms des paquets | [trailofbits/skills](https://github.com/trailofbits/skills) (`149d7b2`) | CC BY-SA 4.0 |

## Ce qui prime sur les skills

Les règles du projet passent avant les conseils génériques des skills :

- Migrations : un fichier par changement dans `web/supabase/migrations/`, appliqué en production par l'outil
  Supabase `apply_migration`, puis tests RLS (`web/supabase/tests/rls/run.sh`). Le conseil du skill `supabase`
  (« itérer avec `execute_sql` ») vaut pour une base locale de développement.
- Tests navigateur : le projet utilise Playwright en JavaScript (Node). Les exemples de `webapp-testing` sont en
  Python : s'en servir pour la méthode, pas forcément pour le langage.
- `apple-design` conseille le verre dépoli et la police du système. Depuis le 27/11/2026 (demande de l'utilisateur), on
  suit sa typographie : police du système, styles de texte d'iOS, espacement des lettres laissé au système. Le verre
  dépoli reste écarté : `DESIGN.md` garde des surfaces pleines. On en retient aussi les gestes, les ressorts, la
  réactivité et l'accessibilité.
- `web-design-guidelines` parle anglais (« Title Case », guillemets) : l'interface FlashMiam est en français, donc
  majuscule au premier mot seulement et guillemets « ».
- Le site principal (`index.html`) est en JavaScript sans React : `react-best-practices` ne concerne que `web/`.

## Mettre à jour

Recopier le dossier du skill depuis son dépôt d'origine, relire les changements (`git diff`), puis mettre à jour le
commit dans le tableau ci-dessus.

## Non retenus

- `vercel-optimize`, `vercel-cli-with-tokens`, `deploy-to-vercel` : demandent un jeton Vercel ou doublent le
  déploiement automatique déjà en place (chaque fusion part sur Vercel).
- `react-native-skills`, `react-view-transitions`, `composition-patterns` : pas d'appli React Native, très peu de React.
- Word, PowerPoint, Excel, PDF, `skill-creator`, `claude-api` : déjà disponibles dans Claude sans installation.
