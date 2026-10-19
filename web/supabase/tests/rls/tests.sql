-- Scénarios de sécurité : étudiant, commerçant propriétaire, autre commerçant, anonyme, serveur (service_role).
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

-- Comptes : 1 commerçant, 1 second commerçant, 1 étudiant
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'karim@resto.fr', '{"role":"merchant","first_name":"Karim","last_name":"Benali","phone":"06 12 34 56 78"}'),
  ('22222222-2222-2222-2222-222222222222', 'nina@resto.fr',  '{"role":"merchant","first_name":"Nina"}'),
  ('33333333-3333-3333-3333-333333333333', 'lea@etu.fr',     '{"role":"admin","first_name":"Léa"}');
select t.ok((select role = 'merchant' and phone = '06 12 34 56 78' from profiles where id = '11111111-1111-1111-1111-111111111111'), 'inscription : profil commerçant créé automatiquement');
select t.ok((select role = 'student' from profiles where id = '33333333-3333-3333-3333-333333333333'), 'inscription : rôle inconnu (« admin ») → étudiant');

-- Le serveur (service_role) crée les fiches après vérification Sirene
set role service_role;
insert into merchants (id, user_id, name, category) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Le Bon Burger', 'burger'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Chez Nina', 'pizza');
insert into merchant_private (merchant_id, siret, siret_verified_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '12345678900017', now()),
  ('aaaaaaaa-0000-0000-0000-000000000002', '98765432100019', now());
select t.fails($$insert into merchants (user_id, name) values ('33333333-3333-3333-3333-333333333333', 'Faux resto')$$, 'un compte étudiant ne peut pas posséder de fiche');
reset role;

-- ===== Commerçant propriétaire =====
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
set role authenticated;
select t.fails($$insert into merchants (user_id, name) values ('11111111-1111-1111-1111-111111111111', 'Doublon')$$, 'commerçant : création directe de fiche interdite (passe par le serveur)');
select t.ok(t.affected($$update merchants set description = 'Burgers smashés maison, pain brioché du boulanger voisin.', address = '12 Place Napoléon 85000 La Roche-sur-Yon',
  lat = 46.6706, lng = -1.4268, photos_urls = '{https://x.supabase.co/storage/v1/object/public/merchant-photos/1111/a.jpg}',
  opening_hours = '{"services":[["11:30","14:30"]],"closed_on":[1]}',
  menu_json = '[{"section":"Burgers","name":"Le Classique","price":9.5,"desc":"Cheddar"}]' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$) = 1, 'commerçant : modifie le contenu de sa fiche');
select t.ok(t.affected($$update merchants set name = 'Piratage' where id = 'aaaaaaaa-0000-0000-0000-000000000002'$$) = 0, 'commerçant : la fiche d''un autre est intouchable (0 ligne)');
select t.fails($$update merchants set subscription_active = true where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'commerçant : ne peut pas se déclarer abonné');
select t.fails($$update merchants set user_id = '22222222-2222-2222-2222-222222222222' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'commerçant : ne peut pas changer le propriétaire');
select t.fails($$update merchant_private set siret = '00000000000000'$$, 'commerçant : ne peut pas modifier son SIRET');
select t.fails($$update merchant_private set stripe_subscription_status = 'active'$$, 'commerçant : ne peut pas modifier son statut Stripe');
select t.ok((select count(*) = 1 and bool_and(siret = '12345678900017') from merchant_private), 'commerçant : voit SES données privées, et seulement les siennes');
select t.fails($$update merchants set lat = 47.2184, lng = -1.5536 where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'adresse hors de La Roche-sur-Yon refusée (Nantes)');
select t.fails($$update merchants set menu_json = '[{"name":"X","price":-2}]' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'carte invalide refusée (nom trop court, prix négatif)');
select t.fails($$update merchants set opening_hours = '{"services":[["25:00","14:00"]]}' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'horaires invalides refusés');
select t.fails($$update merchants set photos_urls = array_fill('u'::text, array[11]) where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, '11 photos refusées (10 au maximum)');
select t.fails($$update merchants set status = 'published' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'publication refusée sans justificatifs ni abonnement');
select t.fails($$update profiles set role = 'student' where id = '11111111-1111-1111-1111-111111111111'$$, 'profil : le rôle ne peut pas être changé');
select t.ok(t.affected($$update profiles set phone = '06 00 00 00 00' where id = '11111111-1111-1111-1111-111111111111'$$) = 1, 'profil : modifie son téléphone');
select t.ok((select count(*) = 1 from profiles), 'profil : ne voit que le sien');
-- Stockage
select t.ok(t.affected($$insert into storage.objects (bucket_id, name) values ('merchant-photos', '11111111-1111-1111-1111-111111111111/burger.jpg')$$) = 1, 'stockage : dépose une photo dans son dossier');
select t.fails($$insert into storage.objects (bucket_id, name) values ('merchant-photos', '22222222-2222-2222-2222-222222222222/burger.jpg')$$, 'stockage : impossible de déposer dans le dossier d''un autre');
select t.ok(t.affected($$insert into storage.objects (bucket_id, name) values ('merchant-documents', '11111111-1111-1111-1111-111111111111/kbis.pdf')$$) = 1, 'stockage : dépose son Kbis (bucket privé)');
reset role;

-- Le serveur enregistre justificatifs + abonnement (webhook Stripe)
set role service_role;
update merchant_private set documents = '{"kbis":"1111/kbis.pdf","hygiene":"1111/haccp.pdf"}', honor_statement_at = now(),
  stripe_customer_id = 'cus_123', stripe_subscription_status = 'active' where merchant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
select t.ok((select subscription_active from merchants where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'webhook Stripe « active » → fiche marquée abonnée');
insert into storage.objects (bucket_id, name) values ('merchant-documents', '22222222-2222-2222-2222-222222222222/kbis.pdf');
reset role;

set role authenticated;
select t.ok(t.affected($$update merchants set status = 'published' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$) = 1, 'publication acceptée : SIRET vérifié + justificatifs + abonnement actif');
select t.ok((select published_at is not null from merchants where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'date de publication renseignée');
select t.fails($$update merchants set photos_urls = '{}' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'fiche publiée : impossible de retirer toutes les photos');
select t.ok(t.affected($$insert into offers (merchant_id, title, price, original_price) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Menu étudiant', 8.90, 11.50)$$) = 1, 'offres : crée une offre');
select t.fails($$insert into offers (merchant_id, title, price) values ('aaaaaaaa-0000-0000-0000-000000000002', 'Fausse offre', 1)$$, 'offres : impossible d''en créer pour un autre commerce');
select t.fails($$insert into offers (merchant_id, title, price, original_price) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Promo bidon', 10, 8)$$, 'offres : prix barré inférieur au prix refusé');
select t.ok((select count(*) = 1 from storage.objects where bucket_id = 'merchant-documents'), 'stockage : ne voit que ses propres justificatifs');
reset role;

-- ===== Étudiant connecté =====
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false);
set role authenticated;
select t.ok((select array_agg(name) = '{Le Bon Burger}' from merchants), 'étudiant : voit uniquement les commerces publiés (pas le brouillon de Nina)');
select t.ok((select count(*) = 0 from merchant_private), 'étudiant : SIRET et Stripe invisibles');
select t.ok((select count(*) = 1 from offers), 'étudiant : voit l''offre du commerce publié');
select t.ok(t.affected($$update merchants set name = 'Tag' $$) = 0, 'étudiant : aucune fiche modifiable');
select t.fails($$insert into storage.objects (bucket_id, name) values ('merchant-photos', '33333333-3333-3333-3333-333333333333/x.jpg')$$, 'étudiant : ne peut pas déposer de photo');
select t.ok((select count(*) = 0 from analytics), 'étudiant : ne voit aucune statistique');
reset role;

-- ===== Visiteur anonyme =====
select set_config('request.jwt.claims', '', false);
set role anon;
select t.ok((select count(*) = 1 from merchants), 'anonyme : voit les commerces publiés');
select t.fails($$select siret from merchant_private$$, 'anonyme : table privée inaccessible');
select t.fails($$select * from profiles$$, 'anonyme : profils inaccessibles');
select track_merchant_event('aaaaaaaa-0000-0000-0000-000000000001', 'view');
select track_merchant_event('aaaaaaaa-0000-0000-0000-000000000001', 'view');
select track_merchant_event('aaaaaaaa-0000-0000-0000-000000000001', 'route_click');
select track_merchant_event('aaaaaaaa-0000-0000-0000-000000000002', 'view');   -- brouillon : ignoré
select t.fails($$select track_merchant_event('aaaaaaaa-0000-0000-0000-000000000001', 'hack')$$, 'statistiques : évènement inconnu refusé');
select t.fails($$update analytics set view_count = 9999$$, 'anonyme : statistiques non modifiables directement');
reset role;

-- ===== Propriétaire : statistiques ; fin d'abonnement =====
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
set role authenticated;
select t.ok((select view_count = 2 and route_click_count = 1 from analytics), 'propriétaire : 2 vues et 1 clic « Y aller » comptés (brouillon ignoré)');
reset role;
set role service_role;
update merchant_private set stripe_subscription_status = 'past_due' where merchant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
reset role;
select set_config('request.jwt.claims', '', false);
set role anon;
select t.ok((select count(*) = 0 from merchants) and (select count(*) = 0 from offers), 'abonnement impayé : fiche et offres retirées de la carte automatiquement');
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
set role authenticated;
select t.ok((select count(*) = 1 from merchants), 'propriétaire : garde l''accès à sa fiche pendant l''impayé');
update merchants set status = 'draft' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select t.fails($$update merchants set status = 'published' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'impayé : republication refusée tant que l''abonnement n''est pas réglé');
update merchants set status = 'published' where false;
update merchants set is_open = false where id = 'aaaaaaaa-0000-0000-0000-000000000001';
reset role;
set role service_role; update merchant_private set stripe_subscription_status = 'active'; reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
set role authenticated; update merchants set status = 'published' where id = 'aaaaaaaa-0000-0000-0000-000000000001'; reset role;
select set_config('request.jwt.claims', '', false);
set role anon;
select t.ok((select count(*) = 0 from merchants), 'fiche masquée par le commerçant (is_open = false) : invisible même abonnée');
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
set role authenticated; update merchants set is_open = true; reset role;
set role service_role; update merchants set status = 'suspended' where id = 'aaaaaaaa-0000-0000-0000-000000000001'; reset role;
set role authenticated;
select t.fails($$update merchants set status = 'published' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'fiche suspendue par la modération : le commerçant ne peut pas la republier');
reset role;
-- Suppression du compte : tout est supprimé en cascade
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select t.ok((select count(*) = 0 from merchants where id = 'aaaaaaaa-0000-0000-0000-000000000001') and (select count(*) = 0 from merchant_private where merchant_id = 'aaaaaaaa-0000-0000-0000-000000000001')
  and (select count(*) = 0 from offers) and (select count(*) = 0 from analytics), 'suppression du compte : fiche, données privées, offres et statistiques supprimées');
select t.ok((select count(*) = 2 from pg_publication_tables where pubname = 'supabase_realtime'), 'temps réel activé sur merchants et offers');
select t.ok((select bool_and(relrowsecurity) from pg_class where oid in ('profiles'::regclass, 'merchants'::regclass, 'merchant_private'::regclass, 'offers'::regclass, 'analytics'::regclass)), 'RLS activée sur les 5 tables');

\set QUIET off
select (case when ok then '  ✔ ' else '  ✘ ' end) || label as resultat from t.results order by n;
select count(*) filter (where not ok) as echecs, count(*) as total from t.results;
