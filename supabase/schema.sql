-- =====================================================================
--  Overdevest App – database (Supabase / PostgreSQL)
--  Plak dit hele bestand in Supabase > SQL Editor en klik op "Run".
--  Pas eerst de twee regels onder "INSTELLINGEN" aan.
-- =====================================================================

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------
--  Instellingen
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  key   text primary key,
  value jsonb not null
);

insert into public.settings (key, value) values
  -- INSTELLINGEN: alleen e-mailadressen met dit domein mogen inloggen
  ('allowed_domain', '"overdevestadviseurs.nl"'),
  -- INSTELLINGEN: deze adressen worden automatisch beheerder (Lucas en Dennis)
  ('admin_emails',   '["lucas@overdevestadviseurs.nl", "dennis@overdevestadviseurs.nl"]'),
  ('lunch_deadline', '"11:30"'),
  ('roulette_time',  '"10:30"'),
  ('snack_day',      '5'),
  ('tv_key',         to_jsonb(substr(md5(random()::text || clock_timestamp()::text), 1, 24))),
  ('linkedin_url',   '""'),
  ('instagram_url',  '""')
on conflict (key) do nothing;

create or replace function public.setting(k text) returns jsonb
language sql stable security definer set search_path = public as $$
  select value from public.settings where key = k
$$;

create or replace function public.now_nl() returns timestamp
language sql stable as $$ select (now() at time zone 'Europe/Amsterdam') $$;

create or replace function public.today_nl() returns date
language sql stable as $$ select (now() at time zone 'Europe/Amsterdam')::date $$;

create or replace function public.week_code(d date default null) returns text
language sql stable as $$ select to_char(coalesce(d, public.today_nl()), 'IYYY-"W"IW') $$;

-- ---------------------------------------------------------------------
--  Profielen
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users on delete cascade,
  email         text not null unique,
  full_name     text not null default '',
  is_admin      boolean not null default false,
  active        boolean not null default true,
  in_roulette   boolean not null default true,
  show_birthday boolean not null default true,
  notify        jsonb not null default '{"lunch":true,"social":true,"verjaardag":true,"werknemer":true}',
  created_at    timestamptz not null default now()
);

-- Verjaardag apart, zodat collega's alleen zien wat iemand wil delen
create table if not exists public.private_profiles (
  user_id  uuid primary key references public.profiles on delete cascade,
  birthday date
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- Ingelogd én actief account
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select active from public.profiles where id = auth.uid()), false)
$$;

-- Nieuwe gebruiker: domein controleren en profiel aanmaken
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  dom    text := public.setting('allowed_domain') #>> '{}';
  admins jsonb := coalesce(public.setting('admin_emails'), '[]');
  local  text := split_part(new.email, '@', 1);
  nm     text;
begin
  if dom is not null and dom <> '' and lower(split_part(new.email, '@', 2)) <> lower(dom) then
    raise exception 'Alleen e-mailadressen van @% hebben toegang', dom;
  end if;
  nm := initcap(replace(replace(local, '.', ' '), '-', ' '));
  insert into public.profiles (id, email, full_name, is_admin)
  values (new.id, lower(new.email), nm, admins ? lower(new.email))
  on conflict (id) do nothing;
  insert into public.private_profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Gewone medewerkers mogen hun eigen rechten niet aanpassen
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() and auth.uid() is not null then
    new.is_admin    := old.is_admin;
    new.active      := old.active;
    new.in_roulette := old.in_roulette;
    new.email       := old.email;
  end if;
  return new;
end $$;

drop trigger if exists guard_profile on public.profiles;
create trigger guard_profile before update on public.profiles
  for each row execute function public.guard_profile();

-- ---------------------------------------------------------------------
--  Aanwezigheid
-- ---------------------------------------------------------------------
create table if not exists public.presence (
  user_id uuid not null references public.profiles on delete cascade default auth.uid(),
  day     date not null default public.today_nl(),
  status  text not null check (status in ('kantoor', 'thuis', 'vrij')),
  primary key (user_id, day)
);

-- ---------------------------------------------------------------------
--  Lunch, snacks en boodschappen
-- ---------------------------------------------------------------------
create table if not exists public.snacks (
  id     bigint generated always as identity primary key,
  name   text not null,
  active boolean not null default true,
  sort   int not null default 0
);

create table if not exists public.lunch_orders (
  user_id    uuid not null references public.profiles on delete cascade default auth.uid(),
  day        date not null,
  joins      boolean not null default true,
  items      jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create or replace function public.lunch_open(d date) returns boolean
language sql stable as $$
  select d > public.today_nl()
      or (d = public.today_nl()
          and public.now_nl()::time < (public.setting('lunch_deadline') #>> '{}')::time)
$$;

create table if not exists public.duties (
  day     date not null,
  kind    text not null check (kind in ('tafel', 'airfryer')),
  user_id uuid not null references public.profiles on delete cascade,
  done    boolean not null default false,
  primary key (day, kind)
);

-- Lunchroulette: eerlijk loten onder wie op kantoor is (vanaf roulette_time)
create or replace function public.assign_duty(d date, k text) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select user_id into uid from public.duties where day = d and kind = k;
  if found then return uid; end if;
  if auth.uid() is null then return null; end if;
  if d <> public.today_nl() then return null; end if;
  if extract(isodow from d) > 5 then return null; end if;
  if k = 'airfryer' and extract(isodow from d) <> (public.setting('snack_day') #>> '{}')::int then
    return null;
  end if;
  if public.now_nl()::time < (public.setting('roulette_time') #>> '{}')::time and not public.is_admin() then
    return null;
  end if;

  select p.id into uid
  from public.profiles p
  where p.active and p.in_roulette
    and (exists (select 1 from public.presence pr where pr.user_id = p.id and pr.day = d and pr.status = 'kantoor')
         or exists (select 1 from public.lunch_orders lo where lo.user_id = p.id and lo.day = d and lo.joins))
    and not exists (select 1 from public.presence pr where pr.user_id = p.id and pr.day = d and pr.status <> 'kantoor')
  order by (select count(*) from public.duties x where x.user_id = p.id and x.kind = k), random()
  limit 1;

  if uid is null then return null; end if;
  insert into public.duties (day, kind, user_id) values (d, k, uid) on conflict do nothing;
  select user_id into uid from public.duties where day = d and kind = k;
  return uid;
end $$;

create table if not exists public.shopping_items (
  id         bigint generated always as identity primary key,
  name       text not null,
  status     text not null default 'op' check (status in ('bijna', 'op', 'gekocht')),
  added_by   uuid references public.profiles on delete set null default auth.uid(),
  bought_by  uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  bought_at  timestamptz
);

-- ---------------------------------------------------------------------
--  Social
-- ---------------------------------------------------------------------
create table if not exists public.posts (
  id         bigint generated always as identity primary key,
  author     uuid not null references public.profiles on delete cascade default auth.uid(),
  category   text not null default 'algemeen'
             check (category in ('algemeen', 'projecten', 'kantoor', 'activiteiten', 'foto')),
  body       text not null default '',
  image_path text,
  pinned     boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.guard_post() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() and new.pinned is distinct from old.pinned then
    new.pinned := old.pinned;
  end if;
  return new;
end $$;
drop trigger if exists guard_post on public.posts;
create trigger guard_post before update on public.posts
  for each row execute function public.guard_post();

create table if not exists public.likes (
  post_id bigint not null references public.posts on delete cascade,
  user_id uuid not null references public.profiles on delete cascade default auth.uid(),
  primary key (post_id, user_id)
);

create table if not exists public.comments (
  id         bigint generated always as identity primary key,
  post_id    bigint not null references public.posts on delete cascade,
  author     uuid not null references public.profiles on delete cascade default auth.uid(),
  body       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.social_highlights (
  id         bigint generated always as identity primary key,
  platform   text not null check (platform in ('linkedin', 'instagram')),
  url        text not null default '',
  body       text not null default '',
  image_url  text not null default '',
  posted_on  date not null default public.today_nl(),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
--  Werknemer van de week
-- ---------------------------------------------------------------------
create table if not exists public.nominations (
  id         bigint generated always as identity primary key,
  week       text not null default public.week_code(),
  nominator  uuid not null references public.profiles on delete cascade default auth.uid(),
  nominee    uuid not null references public.profiles on delete cascade,
  reason     text not null default '',
  created_at timestamptz not null default now(),
  unique (week, nominator),
  check (nominator <> nominee)
);

-- ---------------------------------------------------------------------
--  Ruimtes, reserveringen en koffie
-- ---------------------------------------------------------------------
create table if not exists public.rooms (
  id       bigint generated always as identity primary key,
  name     text not null,
  capacity int not null default 4,
  features text not null default '',
  sort     int not null default 0,
  active   boolean not null default true
);

create table if not exists public.bookings (
  id         bigint generated always as identity primary key,
  room_id    bigint not null references public.rooms on delete cascade,
  user_id    uuid not null references public.profiles on delete cascade default auth.uid(),
  title      text not null default 'Overleg',
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  constraint geen_dubbele_boeking exclude using gist (
    room_id with =, tstzrange(starts_at, ends_at) with &&
  )
);

create table if not exists public.coffee_requests (
  id         bigint generated always as identity primary key,
  room_id    bigint references public.rooms on delete set null,
  requester  uuid not null references public.profiles on delete cascade default auth.uid(),
  items      jsonb not null default '{}',
  note       text not null default '',
  status     text not null default 'nieuw'
             check (status in ('nieuw', 'geaccepteerd', 'onderweg', 'gebracht', 'geannuleerd')),
  handler    uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Status van een koffieverzoek veilig doorzetten (voorkomt dubbel uitvoeren)
create or replace function public.coffee_advance(req bigint, new_status text) returns text
language plpgsql security definer set search_path = public as $$
declare r public.coffee_requests;
begin
  select * into r from public.coffee_requests where id = req for update;
  if not found then raise exception 'Verzoek bestaat niet'; end if;

  if new_status = 'geaccepteerd' then
    if r.status <> 'nieuw' then raise exception 'Iemand anders heeft dit verzoek al opgepakt'; end if;
    update public.coffee_requests set status = 'geaccepteerd', handler = auth.uid(), updated_at = now() where id = req;
  elsif new_status in ('onderweg', 'gebracht') then
    if r.handler is distinct from auth.uid() then raise exception 'Alleen wie het verzoek oppakte kan dit doen'; end if;
    update public.coffee_requests set status = new_status, updated_at = now() where id = req;
  elsif new_status = 'geannuleerd' then
    if r.requester is distinct from auth.uid() and not public.is_admin() then raise exception 'Niet toegestaan'; end if;
    update public.coffee_requests set status = 'geannuleerd', updated_at = now() where id = req;
  else
    raise exception 'Onbekende status';
  end if;
  return new_status;
end $$;

-- ---------------------------------------------------------------------
--  Activiteiten en polls
-- ---------------------------------------------------------------------
create table if not exists public.activities (
  id          bigint generated always as identity primary key,
  title       text not null,
  description text not null default '',
  location    text not null default '',
  starts_at   timestamptz not null,
  created_by  uuid references public.profiles on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.rsvps (
  activity_id bigint not null references public.activities on delete cascade,
  user_id     uuid not null references public.profiles on delete cascade default auth.uid(),
  answer      text not null check (answer in ('ja', 'misschien', 'nee')),
  primary key (activity_id, user_id)
);

create table if not exists public.polls (
  id         bigint generated always as identity primary key,
  question   text not null,
  closes_at  timestamptz,
  created_by uuid references public.profiles on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.poll_options (
  id      bigint generated always as identity primary key,
  poll_id bigint not null references public.polls on delete cascade,
  label   text not null,
  sort    int not null default 0
);

create table if not exists public.poll_votes (
  poll_id   bigint not null references public.polls on delete cascade,
  user_id   uuid not null references public.profiles on delete cascade default auth.uid(),
  option_id bigint not null references public.poll_options on delete cascade,
  primary key (poll_id, user_id)
);

-- ---------------------------------------------------------------------
--  Verjaardagen (alleen wie dat wil)
-- ---------------------------------------------------------------------
-- Eerstvolgende verjaardag (29 februari valt in gewone jaren op 28 februari)
create or replace function public.next_birthday(b date) returns date
language sql stable as $$
  select case when x < public.today_nl() then (b + make_interval(years => (extract(year from public.today_nl()) - extract(year from b))::int + 1))::date
              else x end
  from (select (b + make_interval(years => (extract(year from public.today_nl()) - extract(year from b))::int))::date as x) s
$$;

create or replace function public.upcoming_birthdays(days int default 14)
returns table (user_id uuid, full_name text, birthday date)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, public.next_birthday(pp.birthday)
  from public.profiles p join public.private_profiles pp on pp.user_id = p.id
  where public.is_member() and p.active and p.show_birthday and pp.birthday is not null
    and public.next_birthday(pp.birthday) <= public.today_nl() + days
  order by 3
$$;

-- ---------------------------------------------------------------------
--  Beveiliging (Row Level Security)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['settings','profiles','private_profiles','presence','snacks','lunch_orders',
    'duties','shopping_items','posts','likes','comments','social_highlights','nominations','rooms',
    'bookings','coffee_requests','activities','rsvps','polls','poll_options','poll_votes']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

drop policy if exists "lezen" on public.settings;
create policy "lezen" on public.settings for select to authenticated using (public.is_member() and key <> 'tv_key' or public.is_admin());
drop policy if exists "beheer" on public.settings;
create policy "beheer" on public.settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "lezen" on public.profiles;
create policy "lezen" on public.profiles for select to authenticated using (public.is_member() or id = auth.uid());
drop policy if exists "eigen of beheer" on public.profiles;
create policy "eigen of beheer" on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

drop policy if exists "eigen" on public.private_profiles;
create policy "eigen" on public.private_profiles for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Tabellen waar iedereen leest en eigen rijen schrijft
do $$
declare r record;
begin
  for r in select * from (values
      ('presence', 'user_id'), ('likes', 'user_id'), ('rsvps', 'user_id'), ('poll_votes', 'user_id')
    ) as v(tbl, col)
  loop
    execute format('drop policy if exists "lezen" on public.%I', r.tbl);
    execute format('create policy "lezen" on public.%I for select to authenticated using (public.is_member())', r.tbl);
    execute format('drop policy if exists "eigen" on public.%I', r.tbl);
    execute format('create policy "eigen" on public.%I for all to authenticated using (%I = auth.uid()) with check (%I = auth.uid() and public.is_member())', r.tbl, r.col, r.col);
  end loop;
end $$;

-- Lunchbestellingen: alleen eigen bestelling en alleen tot de sluitingstijd
drop policy if exists "lezen" on public.lunch_orders;
create policy "lezen" on public.lunch_orders for select to authenticated using (public.is_member());
drop policy if exists "eigen tot sluiting" on public.lunch_orders;
create policy "eigen tot sluiting" on public.lunch_orders for all to authenticated
  using (user_id = auth.uid() and public.lunch_open(day))
  with check (user_id = auth.uid() and public.lunch_open(day) and public.is_member());

-- Alleen-lezen voor iedereen, beheer voor admins
do $$
declare t text;
begin
  foreach t in array array['snacks', 'rooms', 'social_highlights'] loop
    execute format('drop policy if exists "lezen" on public.%I', t);
    execute format('create policy "lezen" on public.%I for select to authenticated using (public.is_member())', t);
    execute format('drop policy if exists "beheer" on public.%I', t);
    execute format('create policy "beheer" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Taken: lezen; de aangewezen collega (of beheer) mag afvinken of overdragen
drop policy if exists "lezen" on public.duties;
create policy "lezen" on public.duties for select to authenticated using (public.is_member());
drop policy if exists "toegewezen of beheer" on public.duties;
create policy "toegewezen of beheer" on public.duties for update to authenticated
  using (user_id = auth.uid() or public.is_admin()) with check (public.is_member());
drop policy if exists "beheer" on public.duties;
create policy "beheer" on public.duties for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Boodschappen: iedereen mag toevoegen en afvinken
drop policy if exists "iedereen" on public.shopping_items;
create policy "iedereen" on public.shopping_items for select to authenticated using (public.is_member());
drop policy if exists "toevoegen" on public.shopping_items;
create policy "toevoegen" on public.shopping_items for insert to authenticated with check (public.is_member());
drop policy if exists "bijwerken" on public.shopping_items;
create policy "bijwerken" on public.shopping_items for update to authenticated using (public.is_member()) with check (public.is_member());
drop policy if exists "verwijderen" on public.shopping_items;
create policy "verwijderen" on public.shopping_items for delete to authenticated using (added_by = auth.uid() or public.is_admin());

-- Berichten, reacties, activiteiten, polls, reserveringen: eigen of beheer
do $$
declare r record;
begin
  for r in select * from (values
      ('posts', 'author'), ('comments', 'author'), ('activities', 'created_by'),
      ('polls', 'created_by'), ('bookings', 'user_id')
    ) as v(tbl, col)
  loop
    execute format('drop policy if exists "lezen" on public.%I', r.tbl);
    execute format('create policy "lezen" on public.%I for select to authenticated using (public.is_member())', r.tbl);
    execute format('drop policy if exists "plaatsen" on public.%I', r.tbl);
    execute format('create policy "plaatsen" on public.%I for insert to authenticated with check (%I = auth.uid() and public.is_member())', r.tbl, r.col);
    execute format('drop policy if exists "wijzigen" on public.%I', r.tbl);
    execute format('create policy "wijzigen" on public.%I for update to authenticated using (%I = auth.uid() or public.is_admin()) with check (%I = auth.uid() or public.is_admin())', r.tbl, r.col, r.col);
    execute format('drop policy if exists "verwijderen" on public.%I', r.tbl);
    execute format('create policy "verwijderen" on public.%I for delete to authenticated using (%I = auth.uid() or public.is_admin())', r.tbl, r.col);
  end loop;
end $$;

drop policy if exists "lezen" on public.poll_options;
create policy "lezen" on public.poll_options for select to authenticated using (public.is_member());
drop policy if exists "maker" on public.poll_options;
create policy "maker" on public.poll_options for all to authenticated
  using (exists (select 1 from public.polls p where p.id = poll_id and (p.created_by = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.polls p where p.id = poll_id and (p.created_by = auth.uid() or public.is_admin())));

-- Nominaties: eigen nominatie, alleen in de lopende week
drop policy if exists "lezen" on public.nominations;
create policy "lezen" on public.nominations for select to authenticated using (public.is_member());
drop policy if exists "eigen deze week" on public.nominations;
create policy "eigen deze week" on public.nominations for all to authenticated
  using (nominator = auth.uid() and week = public.week_code())
  with check (nominator = auth.uid() and week = public.week_code() and public.is_member());
drop policy if exists "beheer" on public.nominations;
create policy "beheer" on public.nominations for delete to authenticated using (public.is_admin());

-- Koffie: lezen en aanvragen; status alleen via coffee_advance()
drop policy if exists "lezen" on public.coffee_requests;
create policy "lezen" on public.coffee_requests for select to authenticated using (public.is_member());
drop policy if exists "aanvragen" on public.coffee_requests;
create policy "aanvragen" on public.coffee_requests for insert to authenticated
  with check (requester = auth.uid() and status = 'nieuw' and handler is null and public.is_member());

-- ---------------------------------------------------------------------
--  TV-scherm: één functie die alles teruggeeft, beveiligd met tv_key
-- ---------------------------------------------------------------------
create or replace function public.tv_feed(k text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  d   date := public.today_nl();
  res jsonb;
begin
  if k is null or k <> (public.setting('tv_key') #>> '{}') then
    raise exception 'Ongeldige TV-sleutel';
  end if;

  select jsonb_build_object(
    'today', d,
    'snack_day', extract(isodow from d) = (public.setting('snack_day') #>> '{}')::int,
    'lunch_deadline', public.setting('lunch_deadline') #>> '{}',
    'lunch_count', (select count(*) from public.lunch_orders where day = d and joins),
    'snack_totals', (select coalesce(jsonb_object_agg(s.name, t.qty), '{}') from (
        select key::bigint as sid, sum(value::int) as qty
        from public.lunch_orders lo, jsonb_each_text(lo.items)
        where lo.day = d and lo.joins group by key) t join public.snacks s on s.id = t.sid where t.qty > 0),
    'duties', (select coalesce(jsonb_object_agg(du.kind, p.full_name), '{}')
               from public.duties du join public.profiles p on p.id = du.user_id where du.day = d),
    'rooms', (select coalesce(jsonb_agg(jsonb_build_object(
                'name', r.name,
                'busy_until', (select b.ends_at from public.bookings b where b.room_id = r.id
                               and now() between b.starts_at and b.ends_at limit 1),
                'busy_title', (select b.title from public.bookings b where b.room_id = r.id
                               and now() between b.starts_at and b.ends_at limit 1),
                'next_start', (select min(b.starts_at) from public.bookings b where b.room_id = r.id
                               and b.starts_at > now() and (b.starts_at at time zone 'Europe/Amsterdam')::date = d)
              ) order by r.sort, r.id), '[]') from public.rooms r where r.active),
    'agenda', (select coalesce(jsonb_agg(jsonb_build_object('time', a.starts_at, 'title', a.title, 'location', a.location,
                 'going', (select count(*) from public.rsvps v where v.activity_id = a.id and v.answer = 'ja'))
               order by a.starts_at), '[]')
               from public.activities a where (a.starts_at at time zone 'Europe/Amsterdam')::date = d),
    'next_activity', (select jsonb_build_object('time', a.starts_at, 'title', a.title, 'location', a.location,
                 'going', (select count(*) from public.rsvps v where v.activity_id = a.id and v.answer = 'ja'))
               from public.activities a where a.starts_at > now() order by a.starts_at limit 1),
    'ranking', (select coalesce(jsonb_agg(x order by x.votes desc, x.name), '[]') from (
                 select p.full_name as name, count(*) as votes
                 from public.nominations n join public.profiles p on p.id = n.nominee
                 where n.week = public.week_code() group by p.full_name order by count(*) desc limit 5) x),
    'last_winner', (select jsonb_build_object('name', p.full_name, 'votes', count(*),
                   'reason', (select n2.reason from public.nominations n2 where n2.week = public.week_code(d - 7)
                              and n2.nominee = p.id and n2.reason <> '' order by n2.created_at limit 1))
                   from public.nominations n join public.profiles p on p.id = n.nominee
                   where n.week = public.week_code(d - 7) group by p.id, p.full_name order by count(*) desc limit 1),
    'birthdays', (select coalesce(jsonb_agg(jsonb_build_object('name', p.full_name, 'date', public.next_birthday(pp.birthday))
                   order by public.next_birthday(pp.birthday)), '[]')
                   from public.private_profiles pp join public.profiles p on p.id = pp.user_id
                   where pp.birthday is not null and p.active and p.show_birthday
                     and public.next_birthday(pp.birthday) <= d + 2),
    'photo_of_week', (select jsonb_build_object('name', p.full_name, 'body', po.body,
                   'likes', (select count(*) from public.likes l where l.post_id = po.id))
                   from public.posts po join public.profiles p on p.id = po.author
                   where po.category = 'foto' and po.created_at > now() - interval '7 days'
                   order by (select count(*) from public.likes l where l.post_id = po.id) desc, po.created_at desc limit 1),
    'social', (select coalesce(jsonb_agg(h), '[]') from (
                 select distinct on (platform) platform, url, body, image_url, posted_on
                 from public.social_highlights order by platform, posted_on desc, id desc) h)
  ) into res;
  return res;
end $$;

grant execute on function public.tv_feed(text) to anon, authenticated;

-- ---------------------------------------------------------------------
--  Foto-opslag (privé, alleen voor ingelogde collega's)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public) values ('photos', 'photos', false) on conflict (id) do nothing;
    insert into storage.buckets (id, name, public) values ('public-media', 'public-media', true) on conflict (id) do nothing;

    drop policy if exists "fotos lezen" on storage.objects;
    create policy "fotos lezen" on storage.objects for select to authenticated
      using (bucket_id = 'photos' and public.is_member());
    drop policy if exists "fotos uploaden" on storage.objects;
    create policy "fotos uploaden" on storage.objects for insert to authenticated
      with check (bucket_id = 'photos' and public.is_member() and owner = auth.uid());
    drop policy if exists "fotos verwijderen" on storage.objects;
    create policy "fotos verwijderen" on storage.objects for delete to authenticated
      using (bucket_id in ('photos', 'public-media') and (owner = auth.uid() or public.is_admin()));
    drop policy if exists "media beheer" on storage.objects;
    create policy "media beheer" on storage.objects for insert to authenticated
      with check (bucket_id = 'public-media' and public.is_admin());
  end if;
end $$;

-- ---------------------------------------------------------------------
--  Live updates (koffieverzoeken, berichten, taken)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.coffee_requests; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.posts; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.duties; exception when duplicate_object then null; end;
  end if;
end $$;

-- ---------------------------------------------------------------------
--  Startgegevens
-- ---------------------------------------------------------------------
insert into public.snacks (name, sort)
select * from (values ('Kroket', 1), ('Frikandel', 2), ('Kaassoufflé', 3), ('Bamischijf', 4)) v(name, sort)
where not exists (select 1 from public.snacks);

insert into public.rooms (name, capacity, features, sort)
select * from (values
  ('Vergaderruimte 1', 8, 'scherm', 1),
  ('Vergaderruimte 2', 4, 'whiteboard', 2),
  ('Directiekamer', 6, '', 3),
  ('Teams-ruimte', 4, 'Teams-scherm en camera', 4)) v(name, capacity, features, sort)
where not exists (select 1 from public.rooms);
