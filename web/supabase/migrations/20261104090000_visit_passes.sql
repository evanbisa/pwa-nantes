-- QR code de visite : le client prouve qu'il est venu (et profite d'une offre) en montrant un QR code au restaurateur.
--
--  1. visit_passes : QR codes à usage unique. Le client en tire un pour UN restaurant (et, s'il le veut, une offre en
--     cours de ce restaurant) ; il vaut 75 secondes et l'application en tire un nouveau chaque minute (le précédent
--     cesse alors de valoir 10 secondes plus tard). Jeton de 10 caractères (50 bits tirés au hasard) : impossible à
--     deviner, et seul le propriétaire de la fiche peut le valider. Jamais lisible depuis le site ; effacé après un jour.
--  2. visits : visites validées. Le client voit les siennes ; le restaurateur ne voit que des totaux (jamais de nom ni
--     de liste de personnes). Effacées après 13 mois par la fonction serveur « purge ».
--  3. Fonctions :
--     - issue_visit_pass(restaurant, offre)  : client connecté ; renvoie le jeton et son heure de fin ;
--     - redeem_visit_pass(jeton)              : restaurateur ; valide le passage (une seule fois) ;
--     - visit_pass_status(jeton)              : client ; le QR affiché passe à « Validé ! » dès le scan ;
--     - merchant_visit_summary()              : restaurateur ; totaux du jour, de 7 et 30 jours.
-- Migration additive : aucune table ni donnée existante modifiée.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. QR codes à usage unique
-- ---------------------------------------------------------------------------------------------------------------------
create table public.visit_passes (
  token       text primary key check (token ~ '^[0-9A-HJKMNP-TV-Z]{10}$'),   -- alphabet de Crockford (sans I, L, O, U)
  user_id     uuid not null references auth.users (id) on delete cascade,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  promo_id    uuid references public.promotions (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '2 minutes')
);
create index visit_passes_user_idx on public.visit_passes (user_id, created_at desc);
create index visit_passes_expires_idx on public.visit_passes (expires_at);
comment on table public.visit_passes is 'QR codes de visite à usage unique (75 secondes). Jamais lisibles depuis le site ; effacés après un jour.';
revoke all on public.visit_passes from anon, authenticated;
grant all on public.visit_passes to service_role;
alter table public.visit_passes enable row level security;
create policy "visit_passes : aucun accès direct" on public.visit_passes for all to anon, authenticated using (false) with check (false);

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Visites validées
-- ---------------------------------------------------------------------------------------------------------------------
create table public.visits (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  promo_id    uuid references public.promotions (id) on delete set null,
  promo_title text check (promo_title is null or char_length(promo_title) <= 60),   -- gardé si l'offre est retirée
  visited_at  timestamptz not null default now()
);
create index visits_merchant_idx on public.visits (merchant_id, visited_at desc);
create index visits_user_idx on public.visits (user_id, merchant_id, visited_at desc);
create index visits_visited_idx on public.visits (visited_at);
comment on table public.visits is 'Visites validées par QR code. Le client voit les siennes ; le restaurateur, des totaux seulement. Effacées après 13 mois.';
revoke all on public.visits from anon, authenticated;
grant all on public.visits to service_role;
grant select on public.visits to authenticated;
alter table public.visits enable row level security;
create policy "visits : le client voit les siennes" on public.visits for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Fonctions (dans « private », appelées par de simples relais publics)
-- ---------------------------------------------------------------------------------------------------------------------
-- Jeton de 10 caractères tirés au hasard (50 bits, alphabet de Crockford : lisible et sans confusion 0/O, 1/I/L)
create function private.new_visit_token() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  b bytea := uuid_send(gen_random_uuid());   -- octets 0 à 5 et 9 : tirés au hasard (6 et 8 portent la version)
  v bigint := 0;
  out text := '';
begin
  for i in 0..5 loop v := v * 256 + get_byte(b, i); end loop;
  v := v * 4 + (get_byte(b, 9) & 3);
  for i in 1..10 loop
    out := substr(alphabet, (v % 32)::int + 1, 1) || out;
    v := v / 32;
  end loop;
  return out;
end $$;

-- Jeton tapé ou lu : majuscules, sans espaces ni tirets, confusions courantes corrigées (O→0, I/L→1)
create function private.normalize_visit_token(p_token text) returns text
language sql immutable set search_path = '' as $$
  select translate(regexp_replace(upper(coalesce(p_token, '')), '[^0-9A-Z]', '', 'g'), 'OIL', '011')
$$;

-- Client connecté : nouveau QR code pour ce restaurant (et cette offre). Le QR précédent du même client pour le même
-- restaurant cesse de valoir 10 secondes plus tard (le temps que le restaurateur finisse de scanner l'ancien).
create function private.issue_visit_pass(p_merchant_id uuid, p_promo_id uuid)
returns table (token text, expires_at timestamptz, promo_title text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  v_title text;
  v_token text;
  v_expires timestamptz := now() + interval '75 seconds';
begin
  if me is null then
    raise exception 'Connectez-vous pour valider une visite' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = me and p.role = 'student') then
    raise exception 'Le QR code de visite est réservé aux comptes clients' using errcode = '42501';
  end if;
  if not exists (select 1 from public.merchants m where m.id = p_merchant_id and m.status = 'published' and m.is_open) then
    raise exception 'Ce restaurant n''est pas disponible pour le moment' using errcode = 'P0001';
  end if;
  if p_promo_id is not null then
    select pr.title into v_title from public.promotions pr
     where pr.id = p_promo_id and pr.merchant_id = p_merchant_id and (pr.ends_at is null or pr.ends_at > now());
    if v_title is null then
      raise exception 'Cette offre est terminée' using errcode = 'P0001';
    end if;
  end if;
  -- Plafond anti-abus : 120 QR codes par heure et par client (un écran laissé ouvert une heure en tire 60)
  if (select count(*) from public.visit_passes vp where vp.user_id = me and vp.created_at > now() - interval '1 hour') >= 120 then
    raise exception 'Trop de QR codes demandés : réessayez dans quelques minutes' using errcode = 'P0001';
  end if;

  update public.visit_passes vp set expires_at = least(vp.expires_at, now() + interval '10 seconds')
   where vp.user_id = me and vp.merchant_id = p_merchant_id and vp.used_at is null and vp.expires_at > now();

  loop
    v_token := private.new_visit_token();
    begin
      insert into public.visit_passes (token, user_id, merchant_id, promo_id, expires_at)
      values (v_token, me, p_merchant_id, p_promo_id, v_expires);
      exit;
    exception when unique_violation then
      -- une chance sur un million de milliards : on tire un autre jeton
    end;
  end loop;

  -- Ménage au fil de l'eau (en plus du ménage nocturne) : QR codes de plus d'un jour
  if random() < 0.05 then
    delete from public.visit_passes vp where vp.expires_at < now() - interval '1 day';
  end if;

  return query select v_token, v_expires, v_title;
end $$;

-- Restaurateur : valide un QR code scanné (ou tapé). Une seule validation par QR code ; le QR doit être celui de SON
-- restaurant et encore valable. Renvoie seulement ce dont il a besoin au comptoir : l'offre, le numéro de la visite de
-- ce client chez lui, et si l'offre a déjà servi aujourd'hui (aucun nom, aucune donnée personnelle).
--   status : ok | duplicate (même client validé il y a moins de 20 min) | unknown | other_restaurant | used | expired
create function private.redeem_visit_pass(p_token text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  v_token text := private.normalize_visit_token(p_token);
  v_merchant uuid;
  p public.visit_passes;
  v_title text;
  v_recent timestamptz;
  v_count integer;
  v_promo_today boolean := false;
begin
  select m.id into v_merchant from public.merchants m where m.user_id = me;
  if me is null or v_merchant is null then
    raise exception 'Scanner réservé aux restaurateurs' using errcode = '42501';
  end if;
  if v_token !~ '^[0-9A-HJKMNP-TV-Z]{10}$' then
    return jsonb_build_object('status', 'unknown');
  end if;

  select * into p from public.visit_passes vp where vp.token = v_token for update;
  if not found then
    return jsonb_build_object('status', 'unknown');
  end if;
  if p.merchant_id <> v_merchant then
    return jsonb_build_object('status', 'other_restaurant');
  end if;
  if p.used_at is not null then
    return jsonb_build_object('status', 'used', 'used_at', p.used_at);
  end if;
  if p.expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;

  if p.promo_id is not null then
    select pr.title into v_title from public.promotions pr where pr.id = p.promo_id;
  end if;

  -- Même client, même offre (ou visite simple), validé il y a moins de 20 minutes : pas compté deux fois
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

  return jsonb_build_object('status', 'ok', 'visit_number', v_count, 'promo_title', v_title,
                            'promo_used_today', v_promo_today);
end $$;

-- Client : son QR code a-t-il été scanné ? (interrogé toutes les 2 secondes pendant que le QR est affiché)
--   status : pending | ok | expired | unknown ; visit_number quand c'est validé
create function private.visit_pass_status(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  p public.visit_passes;
begin
  select * into p from public.visit_passes vp where vp.token = private.normalize_visit_token(p_token) and vp.user_id = me;
  if not found then
    return jsonb_build_object('status', 'unknown');
  end if;
  if p.used_at is not null then
    return jsonb_build_object('status', 'ok', 'used_at', p.used_at,
      'visit_number', (select count(*)::int from public.visits v where v.merchant_id = p.merchant_id and v.user_id = me));
  end if;
  if p.expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;
  return jsonb_build_object('status', 'pending', 'expires_at', p.expires_at);
end $$;

-- Restaurateur : totaux des visites validées (jamais de liste de personnes)
create function private.merchant_visit_summary()
returns jsonb
language sql stable security definer set search_path = '' as $$
  with me as (select m.id from public.merchants m where m.user_id = (select auth.uid())),
  today as (select (now() at time zone 'Europe/Paris')::date as d),
  v as (
    select v.user_id, v.promo_id, (v.visited_at at time zone 'Europe/Paris')::date as day
    from public.visits v, me where v.merchant_id = me.id and v.visited_at > now() - interval '31 days'
  )
  select case when not exists (select 1 from me) then null else jsonb_build_object(
    'today',        (select count(*) from v, today where v.day = today.d),
    'today_offers', (select count(*) from v, today where v.day = today.d and v.promo_id is not null),
    'last_7d',      (select count(*) from v, today where v.day > today.d - 7),
    'last_30d',     (select count(*) from v, today where v.day > today.d - 30),
    'clients_30d',  (select count(distinct user_id) from v, today where v.day > today.d - 30),
    'returning_30d', (select count(*) from (select user_id from v, today where v.day > today.d - 30
                                             group by user_id having count(*) >= 2) r)
  ) end
$$;

revoke all on function private.new_visit_token(), private.normalize_visit_token(text),
  private.issue_visit_pass(uuid, uuid), private.redeem_visit_pass(text), private.visit_pass_status(text),
  private.merchant_visit_summary() from public, anon;
grant execute on function private.issue_visit_pass(uuid, uuid), private.redeem_visit_pass(text),
  private.visit_pass_status(text), private.merchant_visit_summary() to authenticated;

-- Relais publics (appelables via l'API : /rest/v1/rpc/…), réservés aux personnes connectées
create function public.issue_visit_pass(p_merchant_id uuid, p_promo_id uuid default null)
returns table (token text, expires_at timestamptz, promo_title text)
language sql volatile security invoker set search_path = '' as $$ select * from private.issue_visit_pass(p_merchant_id, p_promo_id) $$;
create function public.redeem_visit_pass(p_token text)
returns jsonb language sql volatile security invoker set search_path = '' as $$ select private.redeem_visit_pass(p_token) $$;
create function public.visit_pass_status(p_token text)
returns jsonb language sql stable security invoker set search_path = '' as $$ select private.visit_pass_status(p_token) $$;
create function public.merchant_visit_summary()
returns jsonb language sql stable security invoker set search_path = '' as $$ select private.merchant_visit_summary() $$;
revoke all on function public.issue_visit_pass(uuid, uuid), public.redeem_visit_pass(text), public.visit_pass_status(text),
  public.merchant_visit_summary() from public, anon;
grant execute on function public.issue_visit_pass(uuid, uuid), public.redeem_visit_pass(text), public.visit_pass_status(text),
  public.merchant_visit_summary() to authenticated;
