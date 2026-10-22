create extension if not exists pgcrypto;

-- Ensure the app stores product categories and order management metadata.
alter table public.products
  add column if not exists category text not null default 'Premium Collection',
  add column if not exists updated_at timestamptz default now();

alter table public.orders
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists exclude_from_revenue boolean not null default false;

-- Product gallery for multiple images per product.
create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

-- Customer reviews visible to storefront guests only when published.
create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  reviewer_name text not null,
  rating smallint not null check (rating between 1 and 5),
  review_text text not null,
  published boolean not null default false,
  review_date timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Keep a dedicated admin roster for authorized dashboard users.
create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now()
);

-- Helpful indexes for category and dashboard queries.
create index if not exists idx_products_category on public.products(category);
create index if not exists idx_products_in_stock on public.products(in_stock);
create index if not exists idx_product_images_product on public.product_images(product_id, sort_order);
create index if not exists idx_product_reviews_product on public.product_reviews(product_id, published, review_date desc);
create index if not exists idx_orders_deleted on public.orders(is_deleted, exclude_from_revenue, status);

-- Enable row level security.
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_reviews enable row level security;
alter table public.orders enable row level security;
alter table public.admin_users enable row level security;

-- Public storefront access: everyone can read products and published reviews.
drop policy if exists "products_select_public" on public.products;
create policy "products_select_public"
on public.products
for select
using (true);

drop policy if exists "product_images_select_public" on public.product_images;
create policy "product_images_select_public"
on public.product_images
for select
using (true);

drop policy if exists "product_reviews_select_public" on public.product_reviews;
create policy "product_reviews_select_public"
on public.product_reviews
for select
using (published = true or exists (
  select 1
  from public.admin_users au
  where au.user_id = auth.uid()
));

-- Admin-only mutation access.
create or replace function public.is_admin_user()
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
  );
$$;

drop policy if exists "products_manage_admin" on public.products;
create policy "products_manage_admin"
on public.products
for all
using (public.is_admin_user())
with check (public.is_admin_user());

drop policy if exists "product_images_manage_admin" on public.product_images;
create policy "product_images_manage_admin"
on public.product_images
for all
using (public.is_admin_user())
with check (public.is_admin_user());

drop policy if exists "product_reviews_manage_admin" on public.product_reviews;
create policy "product_reviews_manage_admin"
on public.product_reviews
for all
using (public.is_admin_user())
with check (public.is_admin_user());

drop policy if exists "admin_users_manage_admin" on public.admin_users;
create policy "admin_users_manage_admin"
on public.admin_users
for all
using (public.is_admin_user())
with check (public.is_admin_user());

-- Orders: allow public checkout inserts, but keep dashboard writes/reads restricted.
drop policy if exists "orders_insert_public" on public.orders;
create policy "orders_insert_public"
on public.orders
for insert
with check (true);

drop policy if exists "orders_manage_admin" on public.orders;
create policy "orders_manage_admin"
on public.orders
for select
using (public.is_admin_user());

create policy "orders_update_admin"
on public.orders
for update
using (public.is_admin_user())
with check (public.is_admin_user());

drop policy if exists "orders_delete_admin" on public.orders;
create policy "orders_delete_admin"
on public.orders
for delete
using (public.is_admin_user());

-- Example: add the authenticated admin account after user creation.
-- insert into public.admin_users (user_id, email)
-- select id, email
-- from auth.users
-- where email = 'admin@yourdomain.com';
