-- Run this in Supabase SQL Editor before using Boardly.
create table if not exists public.boards (
  id text primary key,
  title text not null default 'Untitled board',
  created_at timestamptz not null default now()
);
create table if not exists public.board_items (
  id text primary key,
  board_id text not null references public.boards(id) on delete cascade,
  kind text not null check (kind in ('text','image','note')),
  x numeric not null default 120,
  y numeric not null default 120,
  w numeric not null default 240,
  h numeric not null default 150,
  content text not null default '',
  color text not null default '#fff0a8',
  updated_at timestamptz not null default now()
);
create index if not exists board_items_board_id_idx on public.board_items(board_id);
alter table public.boards enable row level security;
alter table public.board_items enable row level security;

-- Starter mode: anyone who knows a board link can read/write that board.
-- For private/invite-only boards, replace these policies with authenticated-user
-- membership policies before using sensitive information.
create policy "link users can read boards" on public.boards for select using (true);
create policy "link users can create boards" on public.boards for insert with check (true);
create policy "link users can update boards" on public.boards for update using (true);
create policy "link users can read items" on public.board_items for select using (true);
create policy "link users can add items" on public.board_items for insert with check (true);
create policy "link users can update items" on public.board_items for update using (true);
create policy "link users can delete items" on public.board_items for delete using (true);

-- Enable Realtime for board changes. If already included, ignore duplicate errors.
alter publication supabase_realtime add table public.boards;
alter publication supabase_realtime add table public.board_items;

-- Image bucket: public URLs make sharing easy; do not upload sensitive images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('boardly-images', 'boardly-images', true, 10485760, array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do nothing;
create policy "anyone can upload boardly images" on storage.objects for insert with check (bucket_id = 'boardly-images');
create policy "anyone can view boardly images" on storage.objects for select using (bucket_id = 'boardly-images');
