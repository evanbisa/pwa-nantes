# Fonctions communes à sauvegarder.sh et restaurer.sh (chargé par « source »).

# Nombre de lignes de chaque table d'une copie pg_dump (format personnalisé) : « schéma.table<TAB>lignes », trié.
comptes_archive() {
  pg_restore --data-only --file=- "$1" | awk '
    /^COPY / { t = $2; n = 0; dedans = 1; next }
    dedans && $0 == "\\." { print t "\t" n; dedans = 0; next }
    dedans { n++ }' | LC_ALL=C sort
}
