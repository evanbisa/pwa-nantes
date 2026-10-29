-- =============================================================================
-- Avis des clients et notifications (promos et stories des restaurants suivis, avis, réponses).
--
-- Avis : un par client et par restaurant en ligne ; publics ; le restaurateur peut répondre et signaler.
-- Notifications : créées par la base uniquement (déclencheurs), chacun ne voit que les siennes.
-- Aucune suppression d'objet existant (migration non destructive).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Préférences de notification (profil)
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column notify_promos  boolean not null default true,
  add column notify_stories boolean not null default true,
  add column notify_reviews boolean not null default true;
comment on column public.profiles.notify_promos is 'Notifier les nouvelles promotions des restaurants suivis.';
comment on column public.profiles.notify_stories is 'Notifier les nouvelles stories des restaurants suivis.';
comment on column public.profiles.notify_reviews is 'Restaurateur : nouveaux avis ; client : réponses à ses avis.';
grant update (notify_promos, notify_stories, notify_reviews) on public.profiles to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Avis
-- -----------------------------------------------------------------------------
create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  comment     text check (comment is null or char_length(btrim(comment)) between 3 and 600),
  -- nom affiché (« Léa M. »), fixé par la base à partir du profil : jamais l'e-mail
  author_name text not null default 'Client FlashMiam' check (char_length(author_name) between 1 and 40),
  reply       text check (reply is null or char_length(btrim(reply)) between 2 and 600),
  replied_at  timestamptz,
  reported_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (merchant_id, user_id)
);
create index reviews_user_idx on public.reviews (user_id);
comment on table public.reviews is 'Avis des clients (1 à 5 étoiles). Un par client et par restaurant ; réponse et signalement par le restaurateur.';

-- Peut laisser un avis : compte client, restaurant en ligne, pas le sien
create function private.can_review(p_merchant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.merchants m
    join public.profiles p on p.id = (select auth.uid())
    where m.id = p_merchant_id and m.status = 'published' and m.is_open and m.user_id <> p.id and p.role = 'student'
  )
$$;

-- Règles serveur : nom affiché, champs réservés à l'auteur ou au restaurateur, dates
create function private.reviews_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  from_client boolean := current_user in ('anon', 'authenticated');
  v_first text;
  v_last text;
begin
  if tg_op = 'INSERT' then
    select p.first_name, p.last_name into v_first, v_last from public.profiles p where p.id = new.user_id;
    new.author_name := coalesce(nullif(btrim(coalesce(v_first, '') || coalesce(' ' || upper(left(btrim(v_last), 1)) || '.', '')), ''), 'Client FlashMiam');
    new.author_name := left(new.author_name, 40);
    new.comment := nullif(btrim(new.comment), '');
    new.reply := null; new.replied_at := null; new.reported_at := null;
    new.created_at := now(); new.updated_at := now();
    return new;
  end if;

  new.comment := nullif(btrim(new.comment), '');
  new.reply := nullif(btrim(new.reply), '');
  if from_client then
    if v_uid = old.user_id then
      if new.reply is distinct from old.reply or new.reported_at is distinct from old.reported_at then
        raise exception 'Seul le restaurateur peut répondre à un avis ou le signaler.' using errcode = '42501';
      end if;
    elsif private.is_merchant_owner(old.merchant_id) then
      if new.rating is distinct from old.rating or new.comment is distinct from old.comment then
        raise exception 'Un restaurateur ne peut pas modifier l''avis d''un client.' using errcode = '42501';
      end if;
      -- signalement : daté par la base, définitif (la modération décide)
      if new.reported_at is distinct from old.reported_at then
        new.reported_at := coalesce(old.reported_at, now());
      end if;
    else
      raise exception 'Avis non modifiable.' using errcode = '42501';
    end if;
  end if;
  if new.rating is distinct from old.rating or new.comment is distinct from old.comment then
    new.updated_at := now();
  end if;
  if new.reply is distinct from old.reply then
    new.replied_at := case when new.reply is null then null else now() end;
  end if;
  return new;
end;
$$;
create trigger reviews_guard before insert or update on public.reviews for each row execute function private.reviews_guard();

-- Note moyenne et nombre d'avis des restaurants en ligne (lecture soumise à la RLS des avis)
create function public.merchant_ratings()
returns table (merchant_id uuid, average numeric, total integer)
language sql stable security invoker set search_path = '' as $$
  select r.merchant_id, round(avg(r.rating), 1), count(*)::int
  from public.reviews r
  group by r.merchant_id
$$;

-- -----------------------------------------------------------------------------
-- 3. Notifications
-- -----------------------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  merchant_id uuid references public.merchants (id) on delete cascade,
  kind        text not null check (kind in ('promo', 'story', 'review', 'reply')),
  title       text not null check (char_length(title) between 1 and 120),
  body        text check (body is null or char_length(body) <= 200),
  ref_id      uuid,                -- promotion, story ou avis concerné
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_created_idx on public.notifications (created_at);
create index notifications_merchant_idx on public.notifications (merchant_id);
comment on table public.notifications is 'Notifications de chaque compte, créées uniquement par la base. Conservées 60 jours.';

-- Les notifications de plus de 60 jours sont effacées au fil de l'eau
create function private.purge_notifications()
returns void language sql security definer set search_path = '' as $$
  delete from public.notifications where created_at < now() - interval '60 days'
$$;

-- Nouvelle promotion → abonnés qui le souhaitent (au plus 10 par restaurant et par jour : pas de rafale publier / retirer)
create function private.notify_promotion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, merchant_id, kind, title, body, ref_id)
  select f.user_id, new.merchant_id, 'promo', left(m.name, 120),
         left(case new.kind when 'day' then 'Promo du jour' when 'week' then 'Promo de la semaine'
                            when 'student' then 'Offre étudiante' else 'Bon plan' end || ' : ' || new.title, 200),
         new.id
  from public.follows f
  join public.merchants m on m.id = f.merchant_id
  join public.profiles p on p.id = f.user_id
  where f.merchant_id = new.merchant_id and m.status = 'published' and m.is_open and p.notify_promos
    and (new.ends_at is null or new.ends_at > now())
    and (select count(*) from public.notifications n where n.user_id = f.user_id and n.merchant_id = new.merchant_id
         and n.kind = 'promo' and n.created_at > now() - interval '24 hours') < 10;
  perform private.purge_notifications();
  return null;
end;
$$;
create trigger notify_promotion after insert on public.promotions for each row execute function private.notify_promotion();

-- Nouvelle story → abonnés qui le souhaitent (au plus une notification par restaurant toutes les 6 heures)
create function private.notify_story()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, merchant_id, kind, title, body, ref_id)
  select f.user_id, new.merchant_id, 'story', left(m.name, 120),
         left('A publié une story' || coalesce(' : ' || nullif(btrim(new.caption), ''), ''), 200), new.id
  from public.follows f
  join public.merchants m on m.id = f.merchant_id
  join public.profiles p on p.id = f.user_id
  where f.merchant_id = new.merchant_id and m.status = 'published' and m.is_open and p.notify_stories
    and new.expires_at > now()
    and not exists (select 1 from public.notifications n where n.user_id = f.user_id and n.merchant_id = new.merchant_id
                    and n.kind = 'story' and n.created_at > now() - interval '6 hours');
  perform private.purge_notifications();
  return null;
end;
$$;
create trigger notify_story after insert on public.stories for each row execute function private.notify_story();

-- Nouvel avis → restaurateur ; réponse du restaurateur → auteur de l'avis
create function private.notify_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, merchant_id, kind, title, body, ref_id)
    select m.user_id, new.merchant_id, 'review', left('Nouvel avis sur ' || m.name, 120),
           left(repeat('★', new.rating) || repeat('☆', 5 - new.rating) || ' ' || new.author_name
                || coalesce(' : ' || new.comment, ''), 200), new.id
    from public.merchants m join public.profiles p on p.id = m.user_id
    where m.id = new.merchant_id and p.notify_reviews;
  else
    insert into public.notifications (user_id, merchant_id, kind, title, body, ref_id)
    select new.user_id, new.merchant_id, 'reply', left(m.name || ' a répondu à votre avis', 120), left(new.reply, 200), new.id
    from public.merchants m join public.profiles p on p.id = new.user_id
    where m.id = new.merchant_id and p.notify_reviews;
  end if;
  perform private.purge_notifications();
  return null;
end;
$$;
create trigger notify_review after insert on public.reviews for each row execute function private.notify_review();
create trigger notify_review_reply after update of reply on public.reviews for each row
  when (new.reply is not null and new.reply is distinct from old.reply) execute function private.notify_review();

-- -----------------------------------------------------------------------------
-- 4. Privilèges et RLS
-- -----------------------------------------------------------------------------
revoke execute on function private.can_review(uuid), private.reviews_guard(), private.purge_notifications(),
  private.notify_promotion(), private.notify_story(), private.notify_review(), public.merchant_ratings() from public, anon, authenticated;
grant execute on function private.can_review(uuid) to authenticated;
grant execute on function public.merchant_ratings() to anon, authenticated;

revoke all on public.reviews, public.notifications from anon, authenticated;
grant all on public.reviews, public.notifications to service_role;
grant select on public.reviews to anon, authenticated;
grant insert (merchant_id, rating, comment) on public.reviews to authenticated;
grant update (rating, comment, reply, reported_at) on public.reviews to authenticated;
grant delete on public.reviews to authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

alter table public.reviews       enable row level security;
alter table public.notifications enable row level security;

create policy "reviews : lecture des avis des commerces en ligne (visiteurs)" on public.reviews
  for select to anon using (private.merchant_is_live(merchant_id));
create policy "reviews : lecture (en ligne, les siens, ceux de sa fiche)" on public.reviews
  for select to authenticated
  using (private.merchant_is_live(merchant_id) or user_id = (select auth.uid()) or private.is_merchant_owner(merchant_id));
create policy "reviews : un client donne son avis" on public.reviews
  for insert to authenticated with check (user_id = (select auth.uid()) and private.can_review(merchant_id));
create policy "reviews : l'auteur modifie, le restaurateur répond" on public.reviews
  for update to authenticated
  using (user_id = (select auth.uid()) or private.is_merchant_owner(merchant_id))
  with check (user_id = (select auth.uid()) or private.is_merchant_owner(merchant_id));
create policy "reviews : l'auteur supprime le sien" on public.reviews
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "notifications : lecture des siennes" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "notifications : marquer comme lues" on public.notifications
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notifications : effacer les siennes" on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));

-- Temps réel : nouvelles notifications et nouveaux avis sans recharger la page
alter publication supabase_realtime add table public.reviews, public.notifications;

-- -----------------------------------------------------------------------------
-- 5. Alertes « push » (appareil prévenu même quand FlashMiam est fermé)
--    Envoi par la fonction serveur send-push : elle ne fait que transmettre les notifications déjà créées par la base.
-- -----------------------------------------------------------------------------
alter table public.notifications add column pushed_at timestamptz;   -- alerte envoyée aux appareils (serveur uniquement)

create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  endpoint     text not null unique check (endpoint ~ '^https?://[^/]+/' and char_length(endpoint) <= 1000),
  p256dh       text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth         text not null check (auth ~ '^[A-Za-z0-9_-]{16,30}$'),
  user_agent   text check (user_agent is null or char_length(user_agent) <= 200),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
comment on table public.push_subscriptions is 'Appareils abonnés aux alertes push. Chacun ne voit que les siens ; lus par le serveur pour envoyer les alertes.';

-- Clés VAPID du serveur d'alertes : créées par la fonction send-push, lisibles par le serveur uniquement
create table public.push_config (
  id          integer primary key default 1 check (id = 1),
  public_key  text not null,
  private_jwk jsonb not null,
  created_at  timestamptz not null default now()
);
comment on table public.push_config is 'Clés VAPID (alertes push). Serveur uniquement : aucune lecture possible depuis le site.';

-- Un appareil n'appartient qu'à un compte : l'abonnement passe au compte connecté
create function private.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  if (select count(*) from public.push_subscriptions s where s.user_id = v_uid and s.endpoint <> p_endpoint) >= 10 then
    delete from public.push_subscriptions s
    where s.id = (select s2.id from public.push_subscriptions s2 where s2.user_id = v_uid order by coalesce(s2.last_used_at, s2.created_at) limit 1);
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (v_uid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 200))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    user_agent = excluded.user_agent, created_at = now();
end;
$$;
create function public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void language sql security invoker set search_path = '' as $$
  select private.register_push_subscription(p_endpoint, p_p256dh, p_auth, p_user_agent)
$$;

-- File d'envoi : réserve les notifications récentes pas encore transmises (deux appels simultanés n'envoient jamais deux fois)
create function public.claim_pending_pushes(p_merchant_id uuid default null)
returns setof public.notifications language sql security invoker set search_path = '' as $$
  update public.notifications n set pushed_at = now()
  where n.id in (
    select x.id from public.notifications x
    where x.pushed_at is null and x.created_at > now() - interval '10 minutes'
      and (p_merchant_id is null or x.merchant_id = p_merchant_id)
    order by x.created_at
    limit 500
    for update skip locked
  )
  returning n.*
$$;

revoke execute on function private.register_push_subscription(text, text, text, text),
  public.register_push_subscription(text, text, text, text), public.claim_pending_pushes(uuid) from public, anon, authenticated;
grant execute on function private.register_push_subscription(text, text, text, text), public.register_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.claim_pending_pushes(uuid) to service_role;

revoke all on public.push_subscriptions, public.push_config from anon, authenticated;
grant all on public.push_subscriptions, public.push_config to service_role;
grant select, delete on public.push_subscriptions to authenticated;

alter table public.push_subscriptions enable row level security;
alter table public.push_config        enable row level security;   -- aucune politique : serveur (service_role) uniquement

create policy "push : lecture de ses appareils" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "push : retrait de ses appareils" on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));
