-- Carte de fidélité, comptes équipiers, carte des plats enrichie (audit du 25 novembre 2026).

-- ============================================================================================================
-- 1. Carte des plats : étiquettes, photo et « épuisé aujourd'hui » par plat (clés facultatives de menu_json)
--    tags     : jusqu'à 4 parmi vege, vegan, spicy, new, homemade, halal
--    photo    : photo envoyée depuis FlashMiam (stockage « photos », dossier de la fiche, fichier dish-…)
--    sold_out : date (heure de Paris) du jour où le plat est épuisé ; le lendemain, il redevient disponible
-- ============================================================================================================
create or replace function public.is_valid_menu(menu jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(menu) = 'array'
     and jsonb_array_length(menu) <= 80
     and not exists (
       select 1 from jsonb_array_elements(menu) as item
       where jsonb_typeof(item) <> 'object'
          or jsonb_typeof(item -> 'name') is distinct from 'string'
          or char_length(item ->> 'name') not between 2 and 60
          or jsonb_typeof(item -> 'price') is distinct from 'number'
          or (item ->> 'price')::numeric not between 0 and 999.99
          or char_length(coalesce(item ->> 'section', '')) > 30
          or char_length(coalesce(item ->> 'desc', '')) > 120
          or (item ? 'tags' and (jsonb_typeof(item -> 'tags') <> 'array' or jsonb_array_length(item -> 'tags') > 4
              or exists (select 1 from jsonb_array_elements(item -> 'tags') t
                         where jsonb_typeof(t) <> 'string' or (t #>> '{}') not in ('vege', 'vegan', 'spicy', 'new', 'homemade', 'halal'))))
          or (item ? 'photo' and (jsonb_typeof(item -> 'photo') <> 'string'
              or (item ->> 'photo') !~ '^https://[a-z0-9]{20}\.supabase\.co/storage/v1/object/public/photos/[0-9a-f-]{36}/dish-[A-Za-z0-9_-]{6,64}\.(jpg|jpeg|png|webp)$'))
          or (item ? 'sold_out' and (jsonb_typeof(item -> 'sold_out') <> 'string' or (item ->> 'sold_out') !~ '^\d{4}-\d{2}-\d{2}$'))
     )
$$;

-- ============================================================================================================
-- 2. Comptes équipiers : le restaurateur invite une adresse e-mail ; la personne (compte client) peut ensuite
--    scanner les QR codes de ce restaurant, et rien d'autre. 5 équipiers au plus.
-- ============================================================================================================
create table public.merchant_staff (
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  email       text not null check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  user_id     uuid references auth.users (id) on delete cascade,
  invited_at  timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (merchant_id, email)
);
create index merchant_staff_user_idx on public.merchant_staff (user_id);
comment on table public.merchant_staff is 'Équipiers d''un restaurant : autorisés à scanner ses QR codes de visite.';
alter table public.merchant_staff enable row level security;
revoke all on public.merchant_staff from anon, authenticated;
grant select, delete on public.merchant_staff to authenticated;
grant insert (merchant_id, email) on public.merchant_staff to authenticated;
create policy "équipiers : le restaurateur voit les siens" on public.merchant_staff for select to authenticated
  using (private.is_merchant_owner(merchant_id) or user_id = (select auth.uid()));
create policy "équipiers : le restaurateur invite" on public.merchant_staff for insert to authenticated
  with check (private.is_merchant_owner(merchant_id));
create policy "équipiers : le restaurateur retire, l'équipier part" on public.merchant_staff for delete to authenticated
  using (private.is_merchant_owner(merchant_id) or user_id = (select auth.uid()));

create or replace function private.merchant_staff_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.email := lower(btrim(new.email));
  new.user_id := null; new.accepted_at := null; new.invited_at := now();
  if (select count(*) from public.merchant_staff s where s.merchant_id = new.merchant_id) >= 5 then
    raise exception 'Cinq équipiers au maximum.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.merchants m join auth.users u on u.id = m.user_id
             where m.id = new.merchant_id and lower(u.email) = new.email) then
    raise exception 'C''est l''adresse de votre propre compte.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function private.merchant_staff_guard() from public;
create trigger merchant_staff_guard before insert on public.merchant_staff for each row execute function private.merchant_staff_guard();

-- Le restaurant scanne-t-il avec ce compte ? (propriétaire ou équipier)
create or replace function private.is_merchant_scanner(p_merchant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_merchant_owner(p_merchant_id)
      or exists (select 1 from public.merchant_staff s where s.merchant_id = p_merchant_id and s.user_id = (select auth.uid()))
$$;
revoke all on function private.is_merchant_scanner(uuid) from public;
grant execute on function private.is_merchant_scanner(uuid) to authenticated;

-- Invitations reçues : liées au compte connecté dont l'adresse est confirmée ; renvoie les restaurants où il est équipier
create or replace function private.accept_staff_invites()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  v_email text;
begin
  if me is null then return '[]'::jsonb; end if;
  select lower(u.email) into v_email from auth.users u where u.id = me and u.email_confirmed_at is not null;
  if v_email is not null then
    update public.merchant_staff s set user_id = me, accepted_at = now() where s.email = v_email and s.user_id is null;
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('merchant_id', m.id, 'name', m.name) order by m.name)
                   from public.merchant_staff s join public.merchants m on m.id = s.merchant_id where s.user_id = me), '[]'::jsonb);
end;
$$;
revoke all on function private.accept_staff_invites() from public;
grant execute on function private.accept_staff_invites() to authenticated;
create or replace function public.accept_staff_invites()
returns jsonb language sql volatile security invoker set search_path = '' as $$ select private.accept_staff_invites() $$;
revoke all on function public.accept_staff_invites() from public, anon;
grant execute on function public.accept_staff_invites() to authenticated;

-- ============================================================================================================
-- 3. Carte de fidélité : « N visites validées = une récompense ». Les tampons comptent les visites validées en
--    caisse depuis l'activation (loyalty_since) ; à la N-ième, une récompense est gagnée et le compteur repart.
-- ============================================================================================================
alter table public.merchants
  add column if not exists loyalty_goal smallint check (loyalty_goal is null or loyalty_goal between 3 and 20),
  add column if not exists loyalty_reward text check (loyalty_reward is null or char_length(loyalty_reward) between 3 and 60),
  add column if not exists loyalty_since timestamptz;
alter table public.merchants add constraint merchants_loyalty_check check ((loyalty_goal is null) = (loyalty_reward is null));
grant select (loyalty_goal, loyalty_reward) on public.merchants to anon, authenticated;
grant update (loyalty_goal, loyalty_reward) on public.merchants to authenticated;

-- Activation ou changement de règle : les tampons repartent de zéro (date tenue par la base)
create or replace function private.merchants_loyalty_since()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.loyalty_reward := nullif(btrim(new.loyalty_reward), '');
  if new.loyalty_goal is null then
    new.loyalty_since := null;
  elsif tg_op = 'INSERT' or old.loyalty_goal is distinct from new.loyalty_goal or old.loyalty_since is null then
    new.loyalty_since := now();
  else
    new.loyalty_since := old.loyalty_since;
  end if;
  return new;
end;
$$;
revoke all on function private.merchants_loyalty_since() from public;
grant execute on function private.merchants_loyalty_since() to anon, authenticated, service_role;
drop trigger if exists merchants_loyalty_since on public.merchants;
create trigger merchants_loyalty_since before insert or update of loyalty_goal, loyalty_reward, loyalty_since on public.merchants
  for each row execute function private.merchants_loyalty_since();

create table public.loyalty_rewards (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  reward      text not null check (char_length(reward) <= 60),
  earned_at   timestamptz not null default now(),
  used_at     timestamptz
);
create index loyalty_rewards_user_idx on public.loyalty_rewards (user_id, merchant_id);
create index loyalty_rewards_merchant_idx on public.loyalty_rewards (merchant_id);
comment on table public.loyalty_rewards is 'Récompenses de fidélité gagnées (et utilisées) par les clients.';
alter table public.loyalty_rewards enable row level security;
revoke all on public.loyalty_rewards from anon, authenticated;
grant select on public.loyalty_rewards to authenticated;
create policy "fidélité : le client voit les siennes" on public.loyalty_rewards for select to authenticated
  using (user_id = (select auth.uid()));

-- Tampons d'un client chez un restaurant (visites depuis l'activation, moins celles déjà converties en récompense)
create or replace function private.loyalty_stamps(p_merchant_id uuid, p_user_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select greatest(0,
    (select count(*)::int from public.visits v, public.merchants m
      where m.id = p_merchant_id and m.loyalty_since is not null and v.merchant_id = m.id and v.user_id = p_user_id and v.visited_at >= m.loyalty_since)
    - coalesce((select m.loyalty_goal from public.merchants m where m.id = p_merchant_id), 0)
      * (select count(*)::int from public.loyalty_rewards r, public.merchants m
          where m.id = p_merchant_id and r.merchant_id = m.id and r.user_id = p_user_id and r.earned_at >= m.loyalty_since))
$$;
revoke all on function private.loyalty_stamps(uuid, uuid) from public;

-- Ma carte de fidélité chez ce restaurant (client connecté)
create or replace function private.my_loyalty(p_merchant_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when m.loyalty_goal is null or (select auth.uid()) is null then null else jsonb_build_object(
    'goal', m.loyalty_goal, 'reward', m.loyalty_reward,
    'stamps', private.loyalty_stamps(m.id, (select auth.uid())),
    'available', (select count(*) from public.loyalty_rewards r where r.merchant_id = m.id and r.user_id = (select auth.uid()) and r.used_at is null))
  end
  from public.merchants m where m.id = p_merchant_id
$$;
revoke all on function private.my_loyalty(uuid) from public;
grant execute on function private.my_loyalty(uuid) to authenticated;
create or replace function public.my_loyalty(p_merchant_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$ select private.my_loyalty(p_merchant_id) $$;
revoke all on function public.my_loyalty(uuid) from public, anon;
grant execute on function public.my_loyalty(uuid) to authenticated;

-- Récompense remise en caisse : à partir du QR code qui vient d'être scanné (propriétaire ou équipier du restaurant)
create or replace function private.use_loyalty_reward(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_token text := private.normalize_visit_token(p_token);
  p public.visit_passes;
  v_id uuid;
begin
  select * into p from public.visit_passes vp where vp.token = v_token;
  if not found or not private.is_merchant_scanner(p.merchant_id) or p.used_at is null or p.used_at < now() - interval '30 minutes' then
    raise exception 'Récompense introuvable : scannez de nouveau le QR code du client.' using errcode = '42501';
  end if;
  select r.id into v_id from public.loyalty_rewards r
   where r.merchant_id = p.merchant_id and r.user_id = p.user_id and r.used_at is null order by r.earned_at limit 1 for update;
  if v_id is null then return jsonb_build_object('status', 'none'); end if;
  update public.loyalty_rewards set used_at = now() where id = v_id;
  return jsonb_build_object('status', 'ok', 'remaining',
    (select count(*) from public.loyalty_rewards r where r.merchant_id = p.merchant_id and r.user_id = p.user_id and r.used_at is null));
end;
$$;
revoke all on function private.use_loyalty_reward(text) from public;
grant execute on function private.use_loyalty_reward(text) to authenticated;
create or replace function public.use_loyalty_reward(p_token text)
returns jsonb language sql volatile security invoker set search_path = '' as $$ select private.use_loyalty_reward(p_token) $$;
revoke all on function public.use_loyalty_reward(text) from public, anon;
grant execute on function public.use_loyalty_reward(text) to authenticated;

-- ============================================================================================================
-- 4. Validation d'un QR code : par le restaurateur ou un de ses équipiers ; tampon de fidélité et récompense gagnée.
--    (Reprise de la version du 4 novembre ; ajouts : équipiers, carte de fidélité.)
-- ============================================================================================================
create or replace function private.redeem_visit_pass(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  v_token text := private.normalize_visit_token(p_token);
  v_merchant uuid;
  p public.visit_passes;
  v_title text;
  v_recent timestamptz;
  v_count integer;
  v_promo_today boolean := false;
  m public.merchants;
  v_stamps integer;
  v_earned boolean := false;
  v_available integer := 0;
begin
  if me is null or not exists (select 1 from public.merchants mm where mm.user_id = me)
     and not exists (select 1 from public.merchant_staff s where s.user_id = me) then
    raise exception 'Scanner réservé aux restaurateurs' using errcode = '42501';
  end if;
  if v_token !~ '^[0-9A-HJKMNP-TV-Z]{10}$' then
    return jsonb_build_object('status', 'unknown');
  end if;

  select * into p from public.visit_passes vp where vp.token = v_token for update;
  if not found then
    return jsonb_build_object('status', 'unknown');
  end if;
  if not private.is_merchant_scanner(p.merchant_id) then
    return jsonb_build_object('status', 'other_restaurant');
  end if;
  v_merchant := p.merchant_id;
  if p.used_at is not null then
    return jsonb_build_object('status', 'used', 'used_at', p.used_at);
  end if;
  if p.expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;

  if p.promo_id is not null then
    select pr.title into v_title from public.promotions pr where pr.id = p.promo_id;
  end if;

  select max(v.visited_at) into v_recent from public.visits v
   where v.merchant_id = v_merchant and v.user_id = p.user_id and v.promo_id is not distinct from p.promo_id
     and v.visited_at > now() - interval '20 minutes';
  update public.visit_passes vp set used_at = now() where vp.token = v_token;
  if v_recent is not null then
    return jsonb_build_object('status', 'duplicate', 'minutes_ago', floor(extract(epoch from now() - v_recent) / 60)::int,
                              'promo_title', v_title);
  end if;

  if p.promo_id is not null then
    v_promo_today := exists (
      select 1 from public.visits v
       where v.merchant_id = v_merchant and v.user_id = p.user_id and v.promo_id = p.promo_id
         and (v.visited_at at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date);
  end if;

  insert into public.visits (merchant_id, user_id, promo_id, promo_title)
  values (v_merchant, p.user_id, p.promo_id, v_title);
  select count(*)::int into v_count from public.visits v where v.merchant_id = v_merchant and v.user_id = p.user_id;

  -- Carte de fidélité : un tampon par visite validée ; à la N-ième, une récompense
  select * into m from public.merchants where id = v_merchant;
  if m.loyalty_goal is not null then
    v_stamps := private.loyalty_stamps(v_merchant, p.user_id);
    if v_stamps >= m.loyalty_goal then
      insert into public.loyalty_rewards (merchant_id, user_id, reward) values (v_merchant, p.user_id, m.loyalty_reward);
      v_earned := true;
      v_stamps := 0;
    end if;
    select count(*)::int into v_available from public.loyalty_rewards r
     where r.merchant_id = v_merchant and r.user_id = p.user_id and r.used_at is null;
  end if;

  return jsonb_build_object('status', 'ok', 'visit_number', v_count, 'promo_title', v_title,
                            'promo_used_today', v_promo_today,
                            'loyalty', case when m.loyalty_goal is null then null else jsonb_build_object(
                              'goal', m.loyalty_goal, 'reward', m.loyalty_reward, 'stamps', v_stamps,
                              'earned', v_earned, 'available', v_available) end);
end $$;
