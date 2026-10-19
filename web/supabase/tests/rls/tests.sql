-- Scénarios de sécurité : visiteur anonyme, étudiant, restaurateur propriétaire, autre restaurateur, serveur (service_role).
\set ON_ERROR_STOP on
\set QUIET on
create schema t; grant usage on schema t to public;
create table t.results (n serial, ok boolean, label text); grant all on t.results, t.results_n_seq to public;
create function t.ok(cond boolean, label text) returns void language plpgsql as $$
begin insert into t.results(ok, label) values (coalesce(cond, false), label); end $$;
-- exécute une requête qui DOIT échouer (avec le rôle courant)
create function t.fails(q text, label text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then insert into t.results(ok, label) values (true, label || '  [' || sqlerrm || ']'); return; end;
  insert into t.results(ok, label) values (false, label || '  [aucune erreur]');
end $$;
-- nombre de lignes affectées (0 = bloqué silencieusement par RLS)
create function t.affected(q text) returns int language plpgsql as $$ declare n int; begin execute q; get diagnostics n = row_count; return n; end $$;
grant execute on all functions in schema t to public;

-- Comptes créés par Supabase Auth (mot de passe haché par Supabase)
insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'karim@resto.fr', '$2a$10$hash', '{"role":"merchant","first_name":"Karim","last_name":"Benali","phone":"06 12 34 56 78"}'),
  ('22222222-2222-2222-2222-222222222222', 'nina@resto.fr',  '$2a$10$hash', '{"role":"merchant","first_name":"Nina"}'),
  ('33333333-3333-3333-3333-333333333333', 'lea@etu.fr',     '$2a$10$hash', '{"role":"admin","first_name":"Léa"}');
select t.ok((select role = 'merchant' and phone = '06 12 34 56 78' from profiles where id = '11111111-1111-1111-1111-111111111111'), 'inscription : profil restaurateur créé automatiquement');
select t.ok((select role = 'student' from profiles where id = '33333333-3333-3333-3333-333333333333'), 'inscription : rôle inconnu (« admin ») → étudiant');
select t.ok(not exists (select 1 from information_schema.columns where table_schema = 'public' and column_name in ('email', 'password', 'encrypted_password')), 'aucune table publique ne contient d''e-mail ni de mot de passe');

-- Le serveur crée les fiches après vérification du SIRET
set role service_role;
insert into merchants (id, user_id, name, category) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Le Bon Burger', 'burger'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Chez Nina', 'pizza');
insert into merchant_private (merchant_id, siret, siret_verified_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '12345678900017', null),
  ('aaaaaaaa-0000-0000-0000-000000000002', '98765432100019', now());
select t.fails($$insert into merchants (user_id, name) values ('33333333-3333-3333-3333-333333333333', 'Faux resto')$$, 'un compte étudiant ne peut pas posséder de fiche');
reset role;

-- ===== Restaurateur propriétaire (Karim) =====
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
set role authenticated;
select t.fails($$insert into merchants (user_id, name) values ('11111111-1111-1111-1111-111111111111', 'Doublon')$$, 'restaurateur : création directe de fiche interdite (passe par le serveur)');
select t.ok((select count(*) = 1 and bool_and(name = 'Le Bon Burger') from my_merchant()), 'restaurateur : retrouve sa fiche en brouillon (my_merchant)');
select t.ok(t.affected($$update merchants set description = 'Burgers smashés maison, pain brioché du boulanger voisin.', address = '12 Place Napoléon 85000 La Roche-sur-Yon',
  lat = 46.6706, lng = -1.4268, photos_urls = '{https://x.supabase.co/storage/v1/object/public/photos/a.jpg}',
  opening_hours = '{"services":[["11:30","14:30"]],"closed_on":[1]}',
  menu_json = '[{"section":"Burgers","name":"Le Classique","price":9.5,"desc":"Cheddar"}]' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$) = 1, 'restaurateur : modifie le contenu de sa fiche');
select t.ok(t.affected($$update merchants set name = 'Piratage' where id = 'aaaaaaaa-0000-0000-0000-000000000002'$$) = 0, 'restaurateur : la fiche d''un autre est intouchable (0 ligne)');
select t.fails($$update merchants set user_id = '22222222-2222-2222-2222-222222222222' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'restaurateur : ne peut pas changer le propriétaire');
select t.fails($$update merchants set published_at = now() where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'restaurateur : ne peut pas modifier la date de publication');
select t.fails($$update merchant_private set siret = '00000000000000'$$, 'restaurateur : ne peut pas modifier son SIRET');
select t.fails($$update merchant_private set siret_verified_at = now()$$, 'restaurateur : ne peut pas se déclarer « SIRET vérifié »');
select t.fails($$insert into merchant_private (merchant_id, siret) values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111111111')$$, 'restaurateur : ne peut pas ajouter de SIRET lui-même');
select t.ok((select count(*) = 1 and bool_and(siret = '12345678900017') from merchant_private), 'restaurateur : voit SON SIRET, et seulement le sien');
select t.fails($$update merchants set status = 'published' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'publication refusée tant que le SIRET n''est pas vérifié');
select t.fails($$update merchants set lat = 47.2184, lng = -1.5536 where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'adresse hors de La Roche-sur-Yon refusée (Nantes)');
select t.fails($$update merchants set menu_json = '[{"name":"X","price":-2}]' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'carte invalide refusée (nom trop court, prix négatif)');
select t.fails($$update merchants set opening_hours = '{"services":[["25:00","14:00"]]}' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'horaires invalides refusés');
select t.fails($$update merchants set photos_urls = array_fill('u'::text, array[11]) where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, '11 photos refusées (10 au maximum)');
select t.fails($$update profiles set role = 'student' where id = '11111111-1111-1111-1111-111111111111'$$, 'profil : le rôle ne peut pas être changé');
select t.ok(t.affected($$update profiles set phone = '06 00 00 00 00' where id = '11111111-1111-1111-1111-111111111111'$$) = 1, 'profil : modifie son téléphone');
select t.ok((select count(*) = 1 from profiles), 'profil : ne voit que le sien');
select t.fails($$select email from auth.users$$, 'connecté : la table des comptes (e-mails, mots de passe) est inaccessible');
reset role;

-- Le serveur valide le SIRET (vérification Sirene)
set role service_role;
update merchant_private set siret_verified_at = now() where merchant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
reset role;

set role authenticated;
select t.ok(t.affected($$update merchants set status = 'published' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$) = 1, 'publication acceptée une fois le SIRET vérifié et la fiche complète');
select t.ok((select published_at is not null from merchants where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'date de publication renseignée automatiquement');
select t.fails($$update merchants set photos_urls = '{}' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'fiche publiée : impossible de retirer toutes les photos');
reset role;

-- ===== Étudiant connecté (Léa) =====
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false);
set role authenticated;
select t.ok((select array_agg(name) = '{Le Bon Burger}' from merchants), 'étudiant : voit uniquement les commerces publiés (pas le brouillon de Nina)');
select t.ok((select menu_json -> 0 ->> 'name' = 'Le Classique' from merchants), 'étudiant : lit le menu du commerce');
select t.ok((select count(*) = 0 from merchant_private), 'étudiant : aucun SIRET visible');
select t.ok((select count(*) = 1 from profiles), 'étudiant : ne voit que son propre profil');
select t.ok((select count(*) = 0 from my_merchant()), 'étudiant : my_merchant() ne renvoie rien');
select t.ok(t.affected($$update merchants set name = 'Tag'$$) = 0, 'étudiant : aucune fiche modifiable');
reset role;

-- ===== Visiteur anonyme (inspecteur web, clé publique) =====
select set_config('request.jwt.claims', '', false);
set role anon;
select t.ok((select count(*) = 1 from merchants), 'anonyme : voit les commerces publiés (nom, menu, statut)');
select t.fails($$select siret from merchant_private$$, 'anonyme : SIRET inaccessible');
select t.fails($$select * from profiles$$, 'anonyme : profils inaccessibles');
select t.fails($$select email, encrypted_password from auth.users$$, 'anonyme : e-mails et mots de passe inaccessibles');
select t.fails($$select * from my_merchant()$$, 'anonyme : my_merchant() refusé');
select t.fails($$update merchants set name = 'Tag'$$, 'anonyme : aucune écriture possible');
select t.fails($$delete from merchants$$, 'anonyme : aucune suppression possible');
reset role;

-- ===== Abonnements et statistiques =====
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false);
set role authenticated;
select t.ok(t.affected($$insert into follows (merchant_id) values ('aaaaaaaa-0000-0000-0000-000000000001')$$) = 1, 'étudiante : s''abonne à un commerce en ligne');
select t.fails($$insert into follows (merchant_id) values ('aaaaaaaa-0000-0000-0000-000000000001')$$, 'abonnement en double refusé');
select t.fails($$insert into follows (merchant_id) values ('aaaaaaaa-0000-0000-0000-000000000002')$$, 'abonnement à une fiche non publiée refusé');
select t.fails($$insert into follows (user_id, merchant_id) values ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001')$$, 'impossible d''abonner quelqu''un d''autre');
select t.ok((select count(*) = 1 from follows), 'étudiante : voit son abonnement');
select track_merchant_event('aaaaaaaa-0000-0000-0000-000000000001', 'view');
select track_merchant_event('aaaaaaaa-0000-0000-0000-000000000001', 'view');
select track_merchant_event('aaaaaaaa-0000-0000-0000-000000000001', 'walk');
select track_merchant_event('aaaaaaaa-0000-0000-0000-000000000001', 'car');
select track_merchant_event('aaaaaaaa-0000-0000-0000-000000000001', 'menu');
select t.ok((select count(*) = 0 from merchant_stats), 'étudiante : ne voit aucune statistique');
select t.ok((select count(*) = 0 from my_merchant_stats(7)), 'étudiante : my_merchant_stats ne renvoie rien');
select t.fails($$select * from merchant_visitors$$, 'étudiante : liste des visiteurs inaccessible');
reset role;
select set_config('request.jwt.claims', '', false);
set role anon;
select track_merchant_event('aaaaaaaa-0000-0000-0000-000000000001', 'view');
select track_merchant_event('aaaaaaaa-0000-0000-0000-000000000002', 'view');   -- brouillon : ignoré
select t.ok((select merchant_follower_count('aaaaaaaa-0000-0000-0000-000000000001') = 1), 'anonyme : nombre d''abonnés visible (1)');
select t.fails($$select * from follows$$, 'anonyme : liste des abonnés inaccessible');
select t.fails($$select track_merchant_event('aaaaaaaa-0000-0000-0000-000000000001', 'hack')$$, 'évènement inconnu refusé');
select t.fails($$update merchant_stats set views = 9999$$, 'anonyme : compteurs non modifiables');
select t.fails($$select * from my_merchant_stats(7)$$, 'anonyme : tableau de bord inaccessible');
select t.fails($$select * from private.my_merchant_stats(7)$$, 'anonyme : fonction privée du tableau de bord inappelable');
select t.fails($$select private.can_follow('aaaaaaaa-0000-0000-0000-000000000001')$$, 'anonyme : fonction privée d''abonnement inappelable');
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
set role authenticated;
select track_merchant_event('aaaaaaaa-0000-0000-0000-000000000001', 'view');   -- le propriétaire : non compté
select t.fails($$insert into follows (merchant_id) values ('aaaaaaaa-0000-0000-0000-000000000001')$$, 'restaurateur : ne peut pas suivre sa propre fiche');
select t.ok((select count(*) = 0 from follows), 'restaurateur : ne voit PAS qui le suit');
select t.fails($$select * from merchant_visitors$$, 'restaurateur : ne voit PAS qui l''a consulté');
select t.ok((select views = 3 and visitors = 1 and walk_clicks = 1 and car_clicks = 1 and menu_views = 1 and new_followers = 1
  from my_merchant_stats(7) order by day desc limit 1), 'restaurateur : 3 vues (sa visite non comptée), 1 personne, 1 à pied, 1 en voiture, 1 menu, 1 nouvel abonné');
select t.ok((select count(*) = 7 from my_merchant_stats(7)) and (select count(*) = 30 from my_merchant_stats(30)) and (select count(*) = 90 from my_merchant_stats(500)), 'tableau de bord : 7, 30 jours, plafonné à 90');
select t.ok((select followers = 1 and visitors = 1 from my_merchant_totals(7)), 'totaux : 1 abonné, 1 personne');
reset role;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false);
set role authenticated;
select t.ok(t.affected($$delete from follows where merchant_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$) = 1, 'étudiante : se désabonne');
select t.ok(merchant_follower_count('aaaaaaaa-0000-0000-0000-000000000001') = 0, 'après désabonnement : 0 abonné');
insert into follows (merchant_id) values ('aaaaaaaa-0000-0000-0000-000000000001');
reset role;

-- ===== Masquage, modération, suppression =====
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
set role authenticated;
select t.fails($$delete from merchants where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'restaurateur : suppression directe de la fiche impossible (passe par la suppression du compte)');
update merchants set is_open = false where id = 'aaaaaaaa-0000-0000-0000-000000000001';
reset role;
select set_config('request.jwt.claims', '', false);
set role anon;
select t.ok((select count(*) = 0 from merchants), 'fiche masquée par le restaurateur (is_open = false) : invisible');
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
set role authenticated; update merchants set is_open = true; reset role;
set role service_role; update merchants set status = 'suspended' where id = 'aaaaaaaa-0000-0000-0000-000000000001'; reset role;
set role authenticated;
select t.fails($$update merchants set status = 'published' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'fiche suspendue par la modération : le restaurateur ne peut pas la republier');
reset role;
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select t.ok((select count(*) = 0 from profiles where id = '11111111-1111-1111-1111-111111111111') and (select count(*) = 0 from merchants where id = 'aaaaaaaa-0000-0000-0000-000000000001')
  and (select count(*) = 0 from merchant_private where merchant_id = 'aaaaaaaa-0000-0000-0000-000000000001')
  and (select count(*) = 0 from follows) and (select count(*) = 0 from merchant_stats) and (select count(*) = 0 from merchant_visitors), 'suppression du compte : profil, fiche, SIRET, abonnés et statistiques supprimés');
select t.ok((select count(*) = 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'merchants'), 'temps réel activé sur merchants');
select t.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')), 'aucune fonction SECURITY DEFINER appelable par un visiteur via l''API');
select t.ok((select bool_and(c.relrowsecurity) and count(*) = (select count(*) from pg_tables where schemaname = 'public')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'), 'RLS activée sur TOUTES les tables publiques');

\set QUIET off
select (case when ok then '  ✔ ' else '  ✘ ' end) || label as resultat from t.results order by n;
select count(*) filter (where not ok) as echecs, count(*) as total from t.results;
