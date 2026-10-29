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
insert into auth.users (id, email, raw_user_meta_data) values ('44444444-4444-4444-4444-444444444444', 'camille@gmail.com', '{"full_name":"Camille Martin","role":"merchant_no"}');
select t.ok((select role = 'student' and first_name = 'Camille' from profiles where id = '44444444-4444-4444-4444-444444444444'), 'compte Google : profil étudiant, prénom repris de Google');
delete from auth.users where id = '44444444-4444-4444-4444-444444444444';

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
  lat = 46.6706, lng = -1.4268, photos_urls = '{https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/photos/aaaaaaaa-0000-0000-0000-000000000001/a.jpg}',
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
select t.fails($$update merchants set status = 'published' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'publication refusée sans attestation sur l''honneur');
update merchants set honor_at = now() where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select t.fails($$update merchants set status = 'published' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'publication refusée sans abonnement');
select t.fails($$insert into merchant_subscriptions (merchant_id, mode) values ('aaaaaaaa-0000-0000-0000-000000000001', 'stripe')$$, 'abonnement « payé » impossible à déclarer soi-même');
select t.fails($$insert into merchant_subscriptions (merchant_id) values ('aaaaaaaa-0000-0000-0000-000000000002')$$, 'abonnement sur la fiche d''un autre refusé');
select t.ok(t.affected($$insert into merchant_subscriptions (merchant_id) values ('aaaaaaaa-0000-0000-0000-000000000001')$$) = 1, 'abonnement de démonstration souscrit');
select t.fails($$update merchants set is_test = true where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'restaurateur : ne peut pas modifier le marquage « fiche de test »');
select t.ok(t.affected($$update merchants set status = 'published' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$) = 1, 'publication acceptée : SIRET vérifié, attestation, abonnement et fiche complète');
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
select track_visit('aaaaaaaa-0000-0000-0000-000000000001', 'view');
select track_visit('aaaaaaaa-0000-0000-0000-000000000001', 'view');
select track_visit('aaaaaaaa-0000-0000-0000-000000000001', 'walk');
select track_visit('aaaaaaaa-0000-0000-0000-000000000001', 'car');
select track_visit('aaaaaaaa-0000-0000-0000-000000000001', 'menu');
select t.fails($$select track_merchant_event('aaaaaaaa-0000-0000-0000-000000000001', 'view')$$, 'étudiante : l''ancien compteur direct n''est plus appelable (seul track_visit compte)');
select t.ok((select count(*) = 0 from merchant_stats), 'étudiante : ne voit aucune statistique');
select t.ok((select count(*) = 0 from my_merchant_stats(7)), 'étudiante : my_merchant_stats ne renvoie rien');
select t.fails($$select * from merchant_visitors$$, 'étudiante : liste des visiteurs inaccessible');
reset role;
select set_config('request.jwt.claims', '', false);
set role anon;
select t.fails($$select track_visit('aaaaaaaa-0000-0000-0000-000000000001', 'view')$$, 'visiteur sans compte : ne peut pas faire compter de visite');
select t.fails($$select track_merchant_event('aaaaaaaa-0000-0000-0000-000000000001', 'view')$$, 'visiteur sans compte : compteur direct inappelable');
select t.ok((select merchant_follower_count('aaaaaaaa-0000-0000-0000-000000000001') = 1), 'anonyme : nombre d''abonnés visible (1)');
select t.fails($$select * from follows$$, 'anonyme : liste des abonnés inaccessible');
select t.fails($$select track_visit('aaaaaaaa-0000-0000-0000-000000000001', 'hack')$$, 'visiteur sans compte : évènement inconnu refusé');
select t.fails($$update merchant_stats set views = 9999$$, 'anonyme : compteurs non modifiables');
select t.fails($$select * from my_merchant_stats(7)$$, 'anonyme : tableau de bord inaccessible');
select t.fails($$select * from private.my_merchant_stats(7)$$, 'anonyme : fonction privée du tableau de bord inappelable');
select t.fails($$select private.can_follow('aaaaaaaa-0000-0000-0000-000000000001')$$, 'anonyme : fonction privée d''abonnement inappelable');
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
set role authenticated;
select track_visit('aaaaaaaa-0000-0000-0000-000000000001', 'view');   -- le propriétaire : non compté
select t.fails($$insert into follows (merchant_id) values ('aaaaaaaa-0000-0000-0000-000000000001')$$, 'restaurateur : ne peut pas suivre sa propre fiche');
select t.ok((select count(*) = 0 from follows), 'restaurateur : ne voit PAS qui le suit');
select t.fails($$select * from merchant_visitors$$, 'restaurateur : ne voit PAS qui l''a consulté');
select t.ok((select views = 2 and visitors = 1 and walk_clicks = 1 and car_clicks = 1 and menu_views = 1 and new_followers = 1
  from my_merchant_stats(7) order by day desc limit 1), 'restaurateur : 2 vues (la sienne et celle sans compte non comptées), 1 personne, 1 à pied, 1 en voiture, 1 menu, 1 nouvel abonné');
select t.ok((select count(*) = 7 from my_merchant_stats(7)) and (select count(*) = 30 from my_merchant_stats(30)) and (select count(*) = 90 from my_merchant_stats(500)), 'tableau de bord : 7, 30 jours, plafonné à 90');
select t.ok((select followers = 1 and visitors = 1 from my_merchant_totals(7)), 'totaux : 1 abonné, 1 personne');
reset role;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false);
set role authenticated;
select t.ok(t.affected($$delete from follows where merchant_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$) = 1, 'étudiante : se désabonne');
select t.ok(merchant_follower_count('aaaaaaaa-0000-0000-0000-000000000001') = 0, 'après désabonnement : 0 abonné');
insert into follows (merchant_id) values ('aaaaaaaa-0000-0000-0000-000000000001');
reset role;

-- ===== Photos des fiches et justificatifs =====
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
set role authenticated;
select t.ok(t.affected($$insert into storage.objects (bucket_id, name) values ('photos', 'aaaaaaaa-0000-0000-0000-000000000001/burger.jpg')$$) = 1, 'photo déposée dans le dossier de sa fiche');
select t.fails($$insert into storage.objects (bucket_id, name) values ('photos', 'aaaaaaaa-0000-0000-0000-000000000002/pirate.jpg')$$, 'photo dans le dossier d''une autre fiche refusée');
select t.ok(t.affected($$insert into storage.objects (bucket_id, name) values ('documents', 'aaaaaaaa-0000-0000-0000-000000000001/kbis.pdf')$$) = 1, 'justificatif déposé (stockage privé)');
select t.ok((select count(*) = 1 from storage.objects where bucket_id = 'documents'), 'restaurateur : voit ses justificatifs');
select t.ok(t.affected($$insert into storage.objects (bucket_id, name) values ('photos', 'aaaaaaaa-0000-0000-0000-000000000001/retiree.jpg')$$) = 1
  and t.affected($$delete from storage.objects where bucket_id = 'photos' and name = 'aaaaaaaa-0000-0000-0000-000000000001/retiree.jpg'$$) = 1, 'restaurateur : supprime une photo retirée de sa fiche');
reset role;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false);
set role authenticated;
select t.ok((select count(*) = 0 from storage.objects where bucket_id = 'documents'), 'étudiante : ne voit AUCUN justificatif');
select t.ok(t.affected($$delete from storage.objects where bucket_id in ('photos', 'documents')$$) = 0, 'étudiante : ne peut supprimer ni photo ni justificatif');
reset role;
set role anon;
select t.ok((select count(*) = 0 from storage.objects where bucket_id = 'documents'), 'visiteur : aucun justificatif lisible');
reset role;
select t.ok((select not public from storage.buckets where id = 'documents') and (select public from storage.buckets where id = 'photos'), 'stockage : photos publiques, justificatifs privés');

-- ===== Stories et promotions =====
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
set role authenticated;
select t.ok(t.affected($$insert into promotions (merchant_id, kind, title, details) values ('aaaaaaaa-0000-0000-0000-000000000001', 'student', 'Menu étudiant à 8,90 €', 'Sur présentation de la carte')$$) = 1, 'restaurateur : publie une offre étudiante');
select t.ok(t.affected($$insert into promotions (merchant_id, kind, title, ends_at) values ('aaaaaaaa-0000-0000-0000-000000000001', 'day', '2e burger à -50 %', now() + interval '30 days')$$) = 1, 'restaurateur : publie une promo du jour');
select t.ok((select ends_at <= now() + interval '24 hours' and ends_at > now() from promotions where kind = 'day'), 'promo du jour : fin forcée à ce soir minuit (date choisie ignorée)');
insert into promotions (merchant_id, kind, title) values ('aaaaaaaa-0000-0000-0000-000000000001', 'week', 'Formule semaine');
select t.ok((select extract(isodow from (ends_at - interval '1 second') at time zone 'Europe/Paris') = 7 from promotions where kind = 'week'), 'promo de la semaine : jusqu''à dimanche soir');
select t.fails($$insert into promotions (merchant_id, kind, title) values ('aaaaaaaa-0000-0000-0000-000000000002', 'other', 'Pirate')$$, 'restaurateur : promotion sur la fiche d''un autre refusée');
select t.fails($$insert into promotions (merchant_id, kind, title) values ('aaaaaaaa-0000-0000-0000-000000000001', 'other', 'x')$$, 'promotion : titre trop court refusé');
select t.fails($$insert into promotions (merchant_id, kind, title, created_at) values ('aaaaaaaa-0000-0000-0000-000000000001', 'other', 'Antidatée', now() - interval '1 year')$$, 'promotion : date de création non modifiable');
insert into promotions (merchant_id, kind, title) select 'aaaaaaaa-0000-0000-0000-000000000001', 'other', 'Bon plan ' || g from generate_series(1, 3) g;
select t.fails($$insert into promotions (merchant_id, kind, title) values ('aaaaaaaa-0000-0000-0000-000000000001', 'other', 'Septième')$$, '7e promotion en cours refusée (6 au maximum)');
delete from promotions where title like 'Bon plan %';
select t.ok(t.affected($$insert into stories (merchant_id, background, caption) values ('aaaaaaaa-0000-0000-0000-000000000001', 'ocean', 'Nouveau burger au chèvre ce soir !')$$) = 1, 'restaurateur : publie une story texte');
select t.ok(t.affected($$insert into stories (merchant_id, image_path, caption) values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001/salle.jpg', 'Notre salle')$$) = 1, 'restaurateur : publie une story photo (dans le dossier de sa fiche)');
select t.ok((select bool_and(expires_at = created_at + interval '24 hours') from stories), 'story : expire automatiquement au bout de 24 h');
select t.fails($$insert into stories (merchant_id, background, caption, expires_at) values ('aaaaaaaa-0000-0000-0000-000000000001', 'ocean', 'Éternelle', now() + interval '1 year')$$, 'story : durée de vie non modifiable');
select t.fails($$insert into stories (merchant_id, image_path) values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002/vol.jpg')$$, 'story : photo prise dans le dossier d''un autre refusée');
select t.fails($$insert into stories (merchant_id, image_path) values ('aaaaaaaa-0000-0000-0000-000000000001', '../../etc/passwd')$$, 'story : chemin de fichier invalide refusé');
select t.fails($$insert into stories (merchant_id, background) values ('aaaaaaaa-0000-0000-0000-000000000001', 'ocean')$$, 'story texte sans message refusée');
select t.fails($$insert into stories (merchant_id, background, caption) values ('aaaaaaaa-0000-0000-0000-000000000002', 'ocean', 'Story pirate')$$, 'story sur la fiche d''un autre refusée');
select t.fails($$update stories set expires_at = now() + interval '10 days'$$, 'story : prolongation interdite');
select t.ok(t.affected($$insert into storage.objects (bucket_id, name) values ('stories', 'aaaaaaaa-0000-0000-0000-000000000001/salle.jpg')$$) = 1, 'stockage : dépôt dans le dossier de sa fiche');
select t.fails($$insert into storage.objects (bucket_id, name) values ('stories', 'aaaaaaaa-0000-0000-0000-000000000002/vol.jpg')$$, 'stockage : dépôt dans le dossier d''un autre refusé');
select t.ok(t.affected($$insert into storage.objects (bucket_id, name) values ('stories', 'aaaaaaaa-0000-0000-0000-000000000001/expiree.jpg')$$) = 1
  and t.affected($$delete from storage.objects where bucket_id = 'stories' and name = 'aaaaaaaa-0000-0000-0000-000000000001/expiree.jpg'$$) = 1, 'stockage : le restaurateur supprime l''image d''une story');
reset role;
select t.ok((select count(*) = 1 from storage.buckets where id = 'stories' and public and file_size_limit = 5242880), 'stockage « stories » créé (public, 5 Mo, images)');
-- Une story expirée (insérée par le serveur pour le test)
set role service_role;
insert into stories (merchant_id, background, caption, created_at, expires_at) values ('aaaaaaaa-0000-0000-0000-000000000001', 'night', 'Story d''hier', now() - interval '30 hours', now() - interval '6 hours');
insert into promotions (merchant_id, kind, title, created_at, ends_at) values ('aaaaaaaa-0000-0000-0000-000000000001', 'other', 'Offre terminée', now() - interval '10 days', now() - interval '1 day');
reset role;
select set_config('request.jwt.claims', '', false);
set role anon;
select t.ok((select count(*) = 2 from stories) and (select count(*) = 3 from promotions), 'visiteur sans compte : voit les 2 stories et 3 promotions en cours, sans abonnement');
select t.ok(not exists (select 1 from stories where caption = 'Story d''hier') and not exists (select 1 from promotions where title = 'Offre terminée'), 'story expirée et promotion terminée : invisibles');
select t.fails($$insert into stories (merchant_id, background, caption) values ('aaaaaaaa-0000-0000-0000-000000000001', 'ocean', 'Anonyme')$$, 'visiteur : ne peut pas publier de story');
select t.fails($$delete from promotions$$, 'visiteur : ne peut pas supprimer de promotion');
select t.fails($$select track_visit('aaaaaaaa-0000-0000-0000-000000000001', 'story')$$, 'visiteur sans compte : vue de story non comptée');
reset role;
select t.ok((select count(*) = 4 from promotions), 'aucune promotion supprimée (3 en cours + 1 terminée)');
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false);
set role authenticated;
select track_visit('aaaaaaaa-0000-0000-0000-000000000001', 'story');
select t.ok(t.affected($$delete from stories$$) = 0, 'étudiante : ne peut pas supprimer les stories d''un restaurant');
select t.fails($$insert into promotions (merchant_id, kind, title) values ('aaaaaaaa-0000-0000-0000-000000000001', 'other', 'Fausse promo')$$, 'étudiante : ne peut pas publier de promotion');
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
set role authenticated;
select track_visit('aaaaaaaa-0000-0000-0000-000000000001', 'story');   -- le propriétaire : non compté
select t.ok((select story_views = 1 from merchant_stats order by day desc limit 1), 'statistiques : 1 affichage de story (ni le restaurateur ni le visiteur sans compte)');
select t.ok((select count(*) = 3 from stories), 'restaurateur : voit toutes ses stories, y compris l''expirée');
select t.ok(t.affected($$delete from stories where caption = 'Story d''hier'$$) = 1 and t.affected($$delete from promotions where title = 'Formule semaine'$$) = 1, 'restaurateur : supprime une story et une promotion');
reset role;

-- ===== Notifications (promos et stories des restaurants suivis) =====
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false);
set role authenticated;
select t.ok((select count(*) filter (where kind = 'promo') = 6 and count(*) filter (where kind = 'story') = 1 from notifications),
  'abonnée : 6 notifications de promos et 1 seule de story (regroupées sur 6 h) ; rien pour l''offre terminée ni la story expirée');
select t.ok((select bool_and(title = 'Le Bon Burger' and merchant_id = 'aaaaaaaa-0000-0000-0000-000000000001') from notifications)
  and exists (select 1 from notifications where body = 'Offre étudiante : Menu étudiant à 8,90 €')
  and exists (select 1 from notifications where body = 'A publié une story : Nouveau burger au chèvre ce soir !'), 'notification : nom du restaurant et texte de l''offre ou de la story');
select t.fails($$insert into notifications (user_id, kind, title) values ('33333333-3333-3333-3333-333333333333', 'promo', 'Fausse')$$, 'impossible de créer soi-même une notification');
select t.ok(t.affected($$update notifications set read_at = now() where read_at is null$$) = 7, 'marque toutes ses notifications comme lues');
select t.fails($$update notifications set title = 'Modifié'$$, 'texte d''une notification non modifiable');
select t.fails($$update notifications set user_id = '22222222-2222-2222-2222-222222222222'$$, 'notification : destinataire non modifiable');
select t.ok(t.affected($$update profiles set notify_promos = false where id = '33333333-3333-3333-3333-333333333333'$$) = 1, 'préférences : désactive les notifications de promos');
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
set role authenticated;
select t.ok((select count(*) = 0 from notifications), 'restaurateur : ne voit pas les notifications de ses abonnés');
insert into promotions (merchant_id, kind, title) values ('aaaaaaaa-0000-0000-0000-000000000001', 'other', 'Frites offertes');
reset role;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false);
set role authenticated;
select t.ok((select count(*) = 7 from notifications), 'promos désactivées : aucune nouvelle notification');
update profiles set notify_promos = true where id = '33333333-3333-3333-3333-333333333333';
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
set role authenticated; insert into promotions (merchant_id, kind, title) values ('aaaaaaaa-0000-0000-0000-000000000001', 'other', 'Dessert offert'); reset role;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false);
set role authenticated;
select t.ok((select count(*) = 1 from notifications where read_at is null and body = 'Bon plan : Dessert offert'), 'promos réactivées : nouvelle notification non lue');
select t.ok(t.affected($$delete from notifications where body = 'Bon plan : Dessert offert'$$) = 1, 'efface une de ses notifications');
reset role;
-- Rafale publier / retirer : 8 promotions de suite
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
set role authenticated;
do $$ begin for i in 1..8 loop
  insert into public.promotions (merchant_id, kind, title) values ('aaaaaaaa-0000-0000-0000-000000000001', 'other', 'Rafale ' || i);
  delete from public.promotions where title = 'Rafale ' || i;
end loop; end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false);
set role authenticated;
select t.ok((select count(*) = 10 from notifications where kind = 'promo'), 'anti-rafale : 10 notifications de promos au plus par restaurant et par jour');
reset role;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);
set role authenticated;
select t.ok((select count(*) = 0 from notifications) and t.affected($$update notifications set read_at = null$$) = 0 and t.affected($$delete from notifications$$) = 0,
  'autre compte : ne voit, ne modifie ni n''efface les notifications d''autrui');
reset role;
select set_config('request.jwt.claims', '', false);
set role anon;
select t.fails($$select * from notifications$$, 'visiteur : aucun accès aux notifications');
reset role;

-- ===== Avis =====
insert into auth.users (id, email, raw_user_meta_data) values ('55555555-5555-5555-5555-555555555555', 'hugo@etu.fr', '{"first_name":"Hugo","last_name":"petit"}');
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false);
set role authenticated;
select t.ok(t.affected($$insert into reviews (merchant_id, rating, comment) values ('aaaaaaaa-0000-0000-0000-000000000001', 5, '  Super burger, frites maison !  ')$$) = 1, 'client : donne son avis (5 étoiles)');
select t.ok((select author_name = 'Léa' and comment = 'Super burger, frites maison !' and reply is null from reviews where author_name = 'Léa'), 'avis : nom affiché tiré du profil (jamais l''e-mail), commentaire nettoyé');
select t.fails($$insert into reviews (merchant_id, rating) values ('aaaaaaaa-0000-0000-0000-000000000001', 3)$$, 'un seul avis par client et par restaurant');
select t.fails($$insert into reviews (merchant_id, rating) values ('aaaaaaaa-0000-0000-0000-000000000002', 4)$$, 'avis sur une fiche non publiée refusé');
select t.fails($$insert into reviews (merchant_id, user_id, rating) values ('aaaaaaaa-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', 1)$$, 'avis au nom d''un autre refusé');
select t.fails($$update reviews set reply = 'Je me réponds' where author_name = 'Léa'$$, 'l''auteur ne peut pas écrire la réponse du restaurateur');
select t.fails($$update reviews set author_name = 'Le patron'$$, 'nom affiché non modifiable');
reset role;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', false);
set role authenticated;
select t.fails($$insert into reviews (merchant_id, rating) values ('aaaaaaaa-0000-0000-0000-000000000001', 6)$$, 'note hors de 1 à 5 refusée');
select t.fails($$insert into reviews (merchant_id, rating, comment) values ('aaaaaaaa-0000-0000-0000-000000000001', 4, repeat('a', 601))$$, 'commentaire de plus de 600 caractères refusé');
select t.ok(t.affected($$insert into reviews (merchant_id, rating) values ('aaaaaaaa-0000-0000-0000-000000000001', 3)$$) = 1, 'client : avis sans commentaire');
select t.ok((select author_name = 'Hugo P.' and comment is null from reviews where author_name = 'Hugo P.'), 'avis : nom affiché « Hugo P. » (initiale du nom)');
select t.ok(t.affected($$update reviews set rating = 4 where author_name = 'Léa'$$) = 0
  and t.affected($$delete from reviews where author_name = 'Léa'$$) = 0, 'client : ne modifie ni ne supprime l''avis d''un autre');
select t.ok(t.affected($$update reviews set rating = 5, comment = 'Encore meilleur la 2e fois' where author_name = 'Hugo P.'$$) = 1, 'client : modifie son avis');
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
set role authenticated;
select t.fails($$insert into reviews (merchant_id, rating) values ('aaaaaaaa-0000-0000-0000-000000000001', 5)$$, 'restaurateur : ne peut pas noter sa propre fiche');
select t.ok((select count(*) = 2 from notifications where kind = 'review') and exists (select 1 from notifications where body = '★★★★★ Léa : Super burger, frites maison !'),
  'restaurateur : notifié de chaque nouvel avis (note et extrait)');
select t.ok(t.affected($$update reviews set reply = 'Merci Léa, à très vite !' where author_name = 'Léa'$$) = 1, 'restaurateur : répond à un avis');
select t.ok((select replied_at is not null from reviews where author_name = 'Léa'), 'réponse : datée par la base');
select t.fails($$update reviews set rating = 1 where author_name = 'Léa'$$, 'restaurateur : ne peut pas modifier la note d''un client');
select t.ok(t.affected($$delete from reviews where author_name = 'Hugo P.'$$) = 0, 'restaurateur : ne peut pas supprimer un avis (0 ligne)');
select t.ok(t.affected($$update reviews set reported_at = '2000-01-01' where author_name = 'Hugo P.'$$) = 1, 'restaurateur : signale un avis');
select t.ok((select reported_at > now() - interval '1 minute' from reviews where author_name = 'Hugo P.'), 'signalement : daté par la base (date fournie ignorée)');
reset role;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false);
set role authenticated;
select t.ok(exists (select 1 from notifications where kind = 'reply' and title = 'Le Bon Burger a répondu à votre avis' and body = 'Merci Léa, à très vite !'), 'client : notifié de la réponse du restaurateur');
reset role;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);
set role authenticated;
select t.ok(t.affected($$update reviews set reply = 'Concurrence'$$) = 0, 'autre restaurateur : ne peut pas répondre aux avis d''une autre fiche');
select t.fails($$select user_id from reviews$$, 'connecté : l''identifiant des auteurs d''avis est illisible (avis d''une même personne non reliables)');
select t.fails($$select * from reviews where user_id = '33333333-3333-3333-3333-333333333333'$$, 'connecté : impossible de chercher les avis d''un compte donné');
select t.ok((select count(*) = 0 from my_reviews()), 'restaurateur sans avis : my_reviews vide');
reset role;
select set_config('request.jwt.claims', '', false);
set role anon;
select t.ok((select count(*) = 2 from reviews) and (select average = 5.0 and total = 2 from merchant_ratings() where merchant_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'visiteur : lit les avis et la note moyenne (5,0 sur 2 avis)');
select t.fails($$insert into reviews (merchant_id, rating) values ('aaaaaaaa-0000-0000-0000-000000000001', 1)$$, 'visiteur : ne peut pas donner d''avis');
select t.fails($$select user_id from reviews$$, 'visiteur : l''identifiant du compte des auteurs d''avis est illisible');
select t.fails($$select * from my_reviews()$$, 'visiteur : my_reviews inappelable');
select t.ok((select count(*) = 2 and bool_and(author_name is not null) from (select id, rating, author_name, reply from reviews) x), 'visiteur : lit les avis (note, nom affiché, réponse)');
reset role;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false);
set role authenticated;
select t.ok((select count(*) = 1 from my_reviews()) and (select merchant_id = 'aaaaaaaa-0000-0000-0000-000000000001' from my_reviews()), 'client : retrouve son avis (my_reviews), et seulement le sien');
select t.ok(t.affected($$delete from reviews where id = (select id from my_reviews())$$) = 1, 'client : supprime son avis');
select t.ok((select total = 1 from merchant_ratings() where merchant_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'note moyenne recalculée après suppression (1 avis)');
reset role;

-- ===== Alertes push =====
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false);
set role authenticated;
select register_push_subscription('https://fcm.googleapis.com/fcm/send/appareil-lea', 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg', 'Test');
select t.ok((select count(*) = 1 from push_subscriptions), 'client : enregistre son appareil pour les alertes push');
select t.fails($$insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ('33333333-3333-3333-3333-333333333333', 'https://x.test/a', 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg')$$, 'ajout direct d''un appareil interdit (passe par la fonction)');
select t.fails($$select register_push_subscription('javascript:alert(1)', 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg')$$, 'adresse d''alerte invalide refusée');
select t.fails($$select register_push_subscription('https://fcm.googleapis.com/fcm/send/x', 'cle<script>', 'tBHItJI5svbpez7KI4CCXg')$$, 'clé d''appareil invalide refusée');
select t.fails($$select * from push_config$$, 'clés du serveur d''alertes illisibles depuis le site');
select t.fails($$select * from claim_pending_pushes()$$, 'file d''envoi des alertes réservée au serveur');
select t.ok(not has_function_privilege('authenticated', 'public.claim_pending_pushes(uuid)', 'execute') and not has_function_privilege('anon', 'public.claim_pending_pushes(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.register_push_subscription(text, text, text, text)', 'execute'), 'fonctions d''alertes : droits d''exécution limités (serveur ; comptes connectés pour l''enregistrement)');
reset role;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);
set role authenticated;
select t.ok((select count(*) = 0 from push_subscriptions) and t.affected($$delete from push_subscriptions$$) = 0, 'autre compte : ne voit ni ne retire les appareils d''autrui');
select register_push_subscription('https://fcm.googleapis.com/fcm/send/appareil-lea', 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg', 'Test');
reset role;
select t.ok((select user_id = '22222222-2222-2222-2222-222222222222' from push_subscriptions where endpoint like '%appareil-lea'), 'appareil partagé : les alertes suivent le compte connecté');
select set_config('request.jwt.claims', '', false);
set role anon;
select t.fails($$select register_push_subscription('https://fcm.googleapis.com/fcm/send/anonyme', 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg')$$, 'visiteur : ne peut pas enregistrer d''appareil');
reset role;
set role service_role;
select t.ok((select count(*) > 0 from claim_pending_pushes()) and (select count(*) = 0 from claim_pending_pushes()), 'serveur : chaque notification récente n''est transmise qu''une fois');
reset role;

-- ===== Statistiques détaillées (interactions des clients) =====
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false);
set role authenticated;
select track_visit('aaaaaaaa-0000-0000-0000-000000000001', 'view', null, 'map');
select track_visit('aaaaaaaa-0000-0000-0000-000000000001', 'view', null, 'map');
select track_visit('aaaaaaaa-0000-0000-0000-000000000001', 'view', null, 'search');
select track_visit('aaaaaaaa-0000-0000-0000-000000000001', 'share');
select track_visit('aaaaaaaa-0000-0000-0000-000000000001', 'share');
select track_visit('aaaaaaaa-0000-0000-0000-000000000001', 'google');
select track_visit('aaaaaaaa-0000-0000-0000-000000000001', 'reviews');
select track_visit('aaaaaaaa-0000-0000-0000-000000000001', 'story', (select id from stories where caption like 'Nouveau burger%'));
select track_visit('aaaaaaaa-0000-0000-0000-000000000001', 'story_cta', (select id from stories where caption like 'Nouveau burger%'));
select track_visit('aaaaaaaa-0000-0000-0000-000000000001', 'story', gen_random_uuid());
select track_visit('aaaaaaaa-0000-0000-0000-000000000001', 'offer', (select id from promotions where kind = 'student'));
select t.ok(toggle_story_like((select id from stories where caption like 'Nouveau burger%')) = true, 'client : aime une story');
select t.ok(toggle_dish_like('aaaaaaaa-0000-0000-0000-000000000001', 'Le Classique') = true, 'client : aime un plat de la carte');
select t.fails($$select toggle_dish_like('aaaaaaaa-0000-0000-0000-000000000001', 'Plat inventé')$$, 'j''aime sur un plat absent de la carte refusé');
select t.fails($$select track_visit('aaaaaaaa-0000-0000-0000-000000000001', 'piratage')$$, 'évènement inconnu refusé');
select t.ok((select count(*) = 1 from story_likes) and (select count(*) = 1 from dish_likes), 'client : retrouve ses propres « j''aime »');
select t.fails($$select * from merchant_event_visitors$$, 'détail des actions par personne : illisible');
select t.fails($$select * from story_viewers$$, 'personnes ayant vu une story : illisible');
select t.fails($$select * from promo_clicks$$, 'personnes ayant cliqué une offre : illisible');
select t.fails($$insert into story_likes (story_id, user_id) values ((select id from stories where caption like 'Nouveau burger%'), '55555555-5555-5555-5555-555555555555')$$, '« j''aime » au nom d''un autre impossible');
select t.ok(my_merchant_analytics(7) is null, 'client : aucun tableau de bord restaurateur');
delete from follows where merchant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into follows (merchant_id) values ('aaaaaaaa-0000-0000-0000-000000000001');
reset role;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', false);
set role authenticated;
select track_visit('aaaaaaaa-0000-0000-0000-000000000001', 'view', null, 'offers');
select t.ok(toggle_story_like((select id from stories where caption like 'Nouveau burger%')) = true and toggle_story_like((select id from stories where caption like 'Nouveau burger%')) = false and toggle_story_like((select id from stories where caption like 'Nouveau burger%')) = true, '« j''aime » / « je n''aime plus » sur une story');
select t.ok(toggle_dish_like('aaaaaaaa-0000-0000-0000-000000000001', 'Le Classique') = true, 'un autre client aime le même plat');
select t.ok(not exists (select 1 from story_likes where user_id <> '55555555-5555-5555-5555-555555555555'), 'ne voit pas les « j''aime » des autres');
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
set role authenticated;
select track_visit('aaaaaaaa-0000-0000-0000-000000000001', 'view', null, 'map');
select t.fails($$select toggle_story_like((select id from stories where caption like 'Nouveau burger%'))$$, 'restaurateur : ne peut pas aimer sa propre story');
select t.fails($$select toggle_dish_like('aaaaaaaa-0000-0000-0000-000000000001', 'Le Classique')$$, 'restaurateur : ne peut pas aimer ses propres plats');
create temp table a as select my_merchant_analytics(7) j;
reset role;
select t.ok((select (j #>> '{sources,map}')::int = 1 and (j #>> '{sources,search}')::int = 1 and (j #>> '{sources,offers}')::int = 1 from a),
  'provenance des visites : carte 1, recherche 1, offres 1 (chaque personne comptée une fois ; restaurateur ignoré)');
select t.ok((select (j #>> '{totals,shares}')::int = 1 and (j #>> '{totals,google}')::int = 1 and (j #>> '{totals,reviews_tab}')::int = 1 from a),
  'partages, lien Google, onglet Avis : comptés une fois par personne');
select t.ok((select (j #>> '{totals,story_likes}')::int = 2 and (j #>> '{totals,story_cta}')::int = 1 and (j #>> '{totals,offer_clicks}')::int = 1
  and (j #>> '{totals,dish_likes}')::int = 2 and (j #>> '{totals,lost_followers}')::int = 1 from a),
  'totaux : 2 « j''aime » de story, 1 fiche ouverte depuis une story, 1 clic sur une offre, 2 « j''aime » de plat, 1 désabonnement');
select t.ok((select exists (select 1 from jsonb_array_elements(j -> 'stories') x where x ->> 'caption' like 'Nouveau burger%'
  and (x ->> 'views')::int = 1 and (x ->> 'likes')::int = 2 and (x ->> 'clicks')::int = 1) from a), 'par story : 1 vue, 2 « j''aime », 1 clic vers la fiche');
select t.ok((select exists (select 1 from jsonb_array_elements(j -> 'promos') x where x ->> 'kind' = 'student' and (x ->> 'clicks')::int = 1) from a), 'par offre : 1 clic');
select t.ok((select j -> 'dishes' = '[{"dish": "Le Classique", "likes": 2}]'::jsonb from a), 'plats les plus aimés : « Le Classique » (2)');
select t.ok((select jsonb_array_length(j -> 'hours') = 24 and (select sum(v::int) from jsonb_array_elements_text(j -> 'hours') v) = 6 from a), 'heures de consultation : 24 tranches, 6 vues (restaurateur exclu)');
select t.ok((select jsonb_array_length(j -> 'daily') = 7 and (j #>> '{period,days}')::int = 7 and j ? 'previous' from a), 'série de 7 jours et période précédente pour comparer');
drop table a;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
set role authenticated;
select t.ok((my_merchant_analytics(500) #>> '{period,days}')::int = 90, 'période limitée à 90 jours');
reset role;
select set_config('request.jwt.claims', '', false);
set role anon;
select t.fails($$select track_visit('aaaaaaaa-0000-0000-0000-000000000001', 'view', null, 'link')$$, 'visiteur sans compte : visite non comptée (appel refusé)');
select t.ok((select likes = 2 from dish_like_counts('aaaaaaaa-0000-0000-0000-000000000001') where dish = 'Le Classique'), 'nombre de « j''aime » des plats visible par tous');
select t.fails($$select toggle_story_like((select id from stories where caption like 'Nouveau burger%'))$$, 'visiteur : ne peut pas aimer');
select t.fails($$select my_merchant_analytics(7)$$, 'visiteur : aucun accès aux statistiques');
reset role;
select t.ok((select count(*) = 0 from merchant_event_visitors where event = 'from_link'), 'visite sans compte : aucune trace');
-- Compte supprimé alors qu'il suit un restaurant : suppression possible, pas compté comme désabonnement
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', false);
set role authenticated; insert into follows (merchant_id) values ('aaaaaaaa-0000-0000-0000-000000000001'); reset role;
delete from auth.users where id = '55555555-5555-5555-5555-555555555555';
select t.ok((select count(*) = 1 from merchant_event_visitors where event = 'unfollow') and not exists (select 1 from story_likes where user_id = '55555555-5555-5555-5555-555555555555'),
  'suppression d''un compte abonné : réussie, ses « j''aime » effacés, pas compté comme désabonnement');

-- ===== Sexe et âge (inscription en étapes) et public des restaurants =====
insert into auth.users (id, email, raw_user_meta_data) values
  ('66666666-6666-6666-6666-000000000001', 'v1@etu.fr', ('{"first_name":"Inès","gender":"female","birth_year":"' || (extract(year from now())::int - 20) || '"}')::jsonb),
  ('66666666-6666-6666-6666-000000000002', 'v2@etu.fr', ('{"first_name":"Tom","gender":"male","birth_year":"' || (extract(year from now())::int - 30) || '"}')::jsonb),
  ('66666666-6666-6666-6666-000000000003', 'v3@etu.fr', ('{"first_name":"Sam","gender":"robot","birth_year":"' || (extract(year from now())::int - 12) || '"}')::jsonb),
  ('66666666-6666-6666-6666-000000000004', 'v4@etu.fr', '{"first_name":"Lou","gender":"other","birth_year":"1800"}'),
  ('66666666-6666-6666-6666-000000000005', 'v5@etu.fr', '{"first_name":"Max","birth_year":"abc"}');
select t.ok((select gender = 'female' and birth_year = extract(year from now())::int - 20 from profiles where id = '66666666-6666-6666-6666-000000000001'), 'inscription : sexe et année de naissance repris');
select t.ok((select gender is null and birth_year is null from profiles where id = '66666666-6666-6666-6666-000000000003'), 'inscription : sexe inconnu et moins de 15 ans → non renseignés');
select t.ok((select gender = 'other' and birth_year is null from profiles where id = '66666666-6666-6666-6666-000000000004'), 'inscription : année absurde (1800) ignorée');
select t.ok((select gender is null and birth_year is null from profiles where id = '66666666-6666-6666-6666-000000000005'), 'inscription : valeurs mal formées ignorées');
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-000000000005","role":"authenticated"}', false);
set role authenticated;
select t.ok(t.affected($$update profiles set gender = 'male', birth_year = 2000 where id = '66666666-6666-6666-6666-000000000005'$$) = 1, 'chacun précise son sexe et son âge');
select t.fails($$update profiles set gender = 'robot' where id = '66666666-6666-6666-6666-000000000005'$$, 'sexe hors liste refusé');
select t.ok(t.affected($$update profiles set gender = 'female' where id = '66666666-6666-6666-6666-000000000001'$$) = 0, 'impossible de modifier le sexe de quelqu''un d''autre');
select t.ok((select count(*) = 1 from profiles), 'on ne lit que son propre profil (pas le sexe ni l''âge des autres)');
reset role;
-- Public d'un restaurant : rien en dessous de 5 personnes, puis des totaux
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
set role authenticated;
select t.ok((select my_merchant_analytics(7) -> 'audience' = 'null'::jsonb), 'public du restaurant : rien en dessous de 5 personnes');
reset role;
insert into merchant_visitors (merchant_id, day, visitor_id)
  select 'aaaaaaaa-0000-0000-0000-000000000001', (now() at time zone 'Europe/Paris')::date, id from profiles where id::text like '66666666-%' on conflict do nothing;
set role authenticated;
select t.ok((select a ->> 'female' = '1' and a ->> 'male' = '2' and a ->> 'other' = '1' and (a ->> 'age_18_24')::int = 1 and (a ->> 'age_25_34')::int >= 1 and (a ->> 'total')::int >= 5
  from (select my_merchant_analytics(7) -> 'audience' a) x), 'public du restaurant : totaux par sexe et tranche d''âge à partir de 5 personnes');
select t.ok((select not (my_merchant_analytics(7) -> 'audience' ? 'visitors') and jsonb_typeof(my_merchant_analytics(7) -> 'audience' -> 'total') = 'number'), 'public du restaurant : aucun identifiant, seulement des nombres');
reset role;
select set_config('request.jwt.claims', '', false);

-- ===== Revue de sécurité : photos des fiches, plafond des statistiques, tables internes =====
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
set role authenticated;
select t.fails($$update merchants set photos_urls = '{https://pistage.example/pixel.png}' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'photo : adresse d''un site tiers refusée (pas de pistage des visiteurs)');
select t.fails($$update merchants set photos_urls = '{https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/photos/aaaaaaaa-0000-0000-0000-000000000002/b.jpg}' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'photo : photo du dossier d''une autre fiche refusée');
select t.fails($$update merchants set photos_urls = '{javascript:alert(1)}' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'photo : adresse « javascript: » refusée');
select t.fails($$update merchants set photos_urls = '{https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/photos/aaaaaaaa-0000-0000-0000-000000000001/../x.jpg}' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'photo : chemin détourné (« ../ ») refusé');
select t.ok(t.affected($$update merchants set photos_urls = '{https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/photos/aaaaaaaa-0000-0000-0000-000000000001/c-2.webp,http://localhost:54321/storage/v1/object/public/photos/aaaaaaaa-0000-0000-0000-000000000001/d.jpg}' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$) = 1, 'photo : photos du dossier de sa fiche acceptées');
select t.ok(t.affected($$update merchants set description = description || ' ' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$) = 1, 'fiche : modification sans toucher aux photos acceptée');
select t.fails($$select * from visit_budget$$, 'restaurateur : plafond des statistiques illisible');
select t.fails($$select * from maintenance_runs$$, 'restaurateur : suivi du ménage illisible');
reset role;
create temporary table t_menu as select coalesce(sum(menu_views), 0) as n from merchant_stats where merchant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
grant select on t_menu to public;
insert into auth.users (id, email, raw_user_meta_data) values ('77777777-7777-7777-7777-777777777777', 'robot@etu.fr', '{"first_name":"Robot"}');
select set_config('request.jwt.claims', '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}', false);
set role authenticated;
do $$ begin perform track_visit('aaaaaaaa-0000-0000-0000-000000000001', 'menu') from generate_series(1, 80); end $$;
select t.fails($$select * from visit_budget$$, 'client : plafond des statistiques illisible');
select t.fails($$insert into visit_budget (merchant_id, day, visitor_id) values ('aaaaaaaa-0000-0000-0000-000000000001', current_date, '77777777-7777-7777-7777-777777777777')$$, 'client : plafond non modifiable');
reset role;
select t.ok((select coalesce(sum(menu_views), 0) from merchant_stats where merchant_id = 'aaaaaaaa-0000-0000-0000-000000000001') - (select n from t_menu) = 50, 'statistiques : 80 appels d''une même personne → 50 comptés au plus par jour (chiffres impossibles à gonfler)');
select set_config('request.jwt.claims', '', false);
set role anon;
select t.fails($$select * from visit_budget$$, 'visiteur : plafond des statistiques illisible');
select t.fails($$select * from maintenance_runs$$, 'visiteur : suivi du ménage illisible');
reset role;
delete from auth.users where id = '77777777-7777-7777-7777-777777777777';
select t.ok((select count(*) = 0 from visit_budget where visitor_id = '77777777-7777-7777-7777-777777777777'), 'compte supprimé : son plafond de statistiques aussi');

-- ===== Inscription des clients sans code (fonction client-signup) : plafond des tentatives =====
select set_config('request.jwt.claims', '', false);
set role anon;
select t.fails($$select * from signup_attempts$$, 'visiteur : tentatives d''inscription illisibles');
select t.fails($$select signup_attempt('empreinte-visiteur-0001', 'signup')$$, 'visiteur : ne peut pas enregistrer ou contourner le plafond des inscriptions');
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
set role authenticated;
select t.fails($$select * from signup_attempts$$, 'restaurateur : tentatives d''inscription illisibles');
select t.fails($$insert into signup_attempts (ip_hash, kind) values ('empreinte-connecte-001', 'signup')$$, 'compte connecté : tentatives non modifiables');
select t.fails($$select signup_attempt('empreinte-connecte-001', 'signup')$$, 'compte connecté : plafond des inscriptions réservé au serveur');
reset role;
set role service_role;
create temp table t_signup as select signup_attempt('empreinte-campus-0001', 'signup') as ok from generate_series(1, 32);
select t.ok((select count(*) filter (where ok) = 30 and count(*) filter (where not ok) = 2 from t_signup), 'serveur : 30 inscriptions par heure depuis une même connexion, puis refus (salle de cours derrière le wifi du campus : assez)');
select t.ok(signup_attempt('empreinte-autre-00001', 'signup') and signup_attempt('empreinte-campus-0001', 'check'), 'serveur : une autre connexion, ou une simple vérification d''adresse, reste possible');
select t.fails($$select signup_attempt('empreinte-campus-0001', 'admin')$$, 'serveur : type de tentative inconnu refusé');
reset role;
select t.ok(not has_table_privilege('anon', 'signup_attempts', 'select') and not has_function_privilege('anon', 'signup_attempt(text, text)', 'execute')
  and not has_function_privilege('authenticated', 'signup_attempt(text, text)', 'execute'), 'droits : table et plafond inaccessibles aux visiteurs et aux comptes');
delete from signup_attempts;

-- ===== Paiement Whop : formules, interrupteur démonstration / Whop, abonnement tenu par le serveur =====
set role anon;
select t.ok((select count(*) = 4 and sum(price_cents) = 2900 + 29000 + 7900 + 79000 from billing_plans), 'formules : 4 tarifs (Essentiel, Premium × mois, année) lisibles par tous');
select t.fails($$select whop_plan_id from billing_plans$$, 'formules : l''identifiant du tarif Whop n''est pas exposé');
select t.ok((select not whop_live from billing_settings), 'réglages : interrupteur « paiement Whop » lisible (fermé par défaut)');
select t.fails($$select whop_account_id from billing_settings$$, 'réglages : identifiant du compte Whop non exposé');
select t.fails($$update billing_plans set price_cents = 100$$, 'formules : prix non modifiables par un visiteur');
select t.fails($$select * from whop_events$$, 'notifications Whop : illisibles par un visiteur');
reset role;
set role service_role;
select t.fails($$update billing_settings set whop_live = true$$, 'réglages : paiement Whop impossible à ouvrir sans identifiant de compte « biz_… »');
select t.fails($$update billing_plans set whop_plan_id = 'prod_123456' where key = 'premium_year'$$, 'formules : identifiant Whop au mauvais format refusé');
update billing_plans set whop_plan_id = 'plan_PremYear1234' where key = 'premium_year';
update billing_settings set whop_live = true, whop_account_id = 'biz_Test123456';
insert into whop_events (id, type) values ('msg_1', 'membership.activated');
select t.fails($$insert into whop_events (id, type) values ('msg_1', 'membership.activated')$$, 'notification Whop rejouée : refusée (déjà traitée)');
reset role;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);
set role authenticated;
select t.fails($$insert into merchant_subscriptions (merchant_id, plan, period) values ('aaaaaaaa-0000-0000-0000-000000000002', 'premium', 'year')$$, 'paiement Whop ouvert : l''abonnement de démonstration n''est plus possible');
select t.fails($$insert into merchant_subscriptions (merchant_id, mode, whop_membership_id) values ('aaaaaaaa-0000-0000-0000-000000000002', 'whop', 'mem_Fake12345')$$, 'abonnement Whop impossible à déclarer soi-même');
reset role;
set role service_role;
insert into merchant_subscriptions (merchant_id, mode, plan, period, whop_membership_id, current_period_end, manage_url)
values ('aaaaaaaa-0000-0000-0000-000000000002', 'whop', 'premium', 'year', 'mem_Nina123456', now() + interval '1 year', 'https://whop.com/billing/manage');
reset role;
set role authenticated;
select t.ok((select plan = 'premium' and period = 'year' and mode = 'whop' and not cancel_at_period_end from merchant_subscriptions), 'restaurateur : voit son abonnement Whop (formule, période), et seulement le sien');
select t.fails($$update merchant_subscriptions set cancel_at_period_end = true$$, 'restaurateur : ne modifie pas son abonnement lui-même (passe par le serveur)');
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
set role service_role;
update merchant_subscriptions set status = 'past_due' where merchant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
select t.ok((select status = 'published' from merchants where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'paiement refusé (Whop réessaie) : la fiche reste en ligne');
update merchant_subscriptions set status = 'canceled' where merchant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
select t.ok((select status = 'draft' and published_at is not null from merchants where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'abonnement terminé : la fiche repasse en brouillon (retirée de la carte)');
reset role;
set role authenticated;
select t.fails($$update merchants set status = 'published' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'abonnement terminé : republication refusée');
reset role;
set role service_role;
update merchant_subscriptions set status = 'active' where merchant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
update billing_settings set whop_live = false;
reset role;
set role authenticated;
select t.ok(t.affected($$update merchants set status = 'published' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$) = 1, 'nouvel abonnement actif : le restaurateur republie sa fiche');
reset role;
select t.ok(not has_table_privilege('authenticated', 'merchant_subscriptions', 'update') and not has_table_privilege('authenticated', 'merchant_subscriptions', 'delete')
  and not has_table_privilege('authenticated', 'whop_events', 'insert') and not has_table_privilege('authenticated', 'billing_settings', 'update'), 'droits : abonnement, réglages et notifications Whop modifiables par le serveur seulement');

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
  and (select count(*) = 0 from follows) and (select count(*) = 0 from merchant_stats) and (select count(*) = 0 from merchant_visitors)
  and (select count(*) = 0 from stories) and (select count(*) = 0 from promotions) and (select count(*) = 0 from merchant_subscriptions where merchant_id = 'aaaaaaaa-0000-0000-0000-000000000001')
  and (select count(*) = 0 from reviews) and (select count(*) = 0 from notifications)
  and (select count(*) = 0 from merchant_event_visitors) and (select count(*) = 0 from merchant_view_hours) and (select count(*) = 0 from story_viewers)
  and (select count(*) = 0 from story_likes) and (select count(*) = 0 from dish_likes) and (select count(*) = 0 from promo_clicks) and (select count(*) = 0 from push_subscriptions where user_id = '11111111-1111-1111-1111-111111111111'), 'suppression du compte : profil, fiche, SIRET, abonnement, abonnés, statistiques, stories, promotions, avis et notifications supprimés');
select t.ok((select count(*) = 3 from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('merchants', 'stories', 'notifications'))
  and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'reviews'), 'temps réel : merchants, stories et notifications ; les avis ne sont plus diffusés en direct');
select t.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')), 'aucune fonction SECURITY DEFINER appelable par un visiteur via l''API');
select t.ok((select bool_and(c.relrowsecurity) and count(*) = (select count(*) from pg_tables where schemaname = 'public')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'), 'RLS activée sur TOUTES les tables publiques');

\set QUIET off
select (case when ok then '  ✔ ' else '  ✘ ' end) || label as resultat from t.results order by n;
select count(*) filter (where not ok) as echecs, count(*) as total from t.results;
