# Notes pour Claude

- **Rappel nom « FlashMiam »** : la vérification et la protection du nom (noms de domaine,
  dépôt de marque INPI, pseudos) ont été repoussées à plus tard. Voir `docs/nom-flashmiam.md`.
  Rappelle-le à l'utilisateur, avec les étapes restantes, dès qu'une tâche touche à l'un de ces
  moments : achat ou branchement d'un nom de domaine, mise en ligne publique / lancement,
  démarchage de commerçants, supports imprimés ou logo, création d'entreprise. Ne le rappelle
  pas à chaque tâche sans rapport.
- **Skill `modern-web-guidance`** : lance toujours ses commandes avec `DISABLE_TELEMETRY=1` devant
  (par exemple `DISABLE_TELEMETRY=1 npx -y modern-web-guidance@latest search "…"`). Sans cela, le
  programme envoie des statistiques d'usage à Google. Voir `.claude/skills/README.md`.
