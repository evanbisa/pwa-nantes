# Skills du projet FlashMiam

Ces skills sont chargés automatiquement par Claude Code dans toutes les sessions ouvertes sur ce dépôt.
Ils viennent de dépôts publics officiels, copiés tels quels (seule une licence a été ajoutée à côté des skills
Supabase). Ils ont été relus avant l'installation (25/11/2026) : ce sont des conseils en texte, plus un petit script
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
| `apple-design` | Interfaces « comme sur iPhone » : réactivité, gestes, ressorts, fiches qu'on glisse, typographie, accessibilité ; a servi aux gestes du 27/11/2026 (voir `DESIGN.md`) | [emilkowalski/skills](https://github.com/emilkowalski/skills) (`64eb3de`) | MIT |
| `animation-performance` | Animations fluides sur téléphone (propriétés à animer, saccades) ; référencé par `apple-design` | [emilkowalski/skills](https://github.com/emilkowalski/skills) (`64eb3de`) | MIT |

## Ce qui prime sur les skills

Les règles du projet passent avant les conseils génériques des skills :

- Migrations : un fichier par changement dans `web/supabase/migrations/`, appliqué en production par l'outil
  Supabase `apply_migration`, puis tests RLS (`web/supabase/tests/rls/run.sh`). Le conseil du skill `supabase`
  (« itérer avec `execute_sql` ») vaut pour une base locale de développement.
- Tests navigateur : le projet utilise Playwright en JavaScript (Node). Les exemples de `webapp-testing` sont en
  Python : s'en servir pour la méthode, pas forcément pour le langage.
- `apple-design` conseille le verre dépoli et la police du système : pour FlashMiam, `DESIGN.md` prime (surfaces
  pleines, police Archivo) ; on en retient les gestes, les ressorts, la réactivité et l'accessibilité.
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
