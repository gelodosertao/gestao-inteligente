create table if not exists app_users (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  email text not null unique,
  password text not null,
  role text not null,
  avatar_initials text,
  created_at timestamp with time zone default now()
);

-- Habilitar RLS (Row Level Security) para segurança básica
alter table app_users enable row level security;

-- Política para permitir leitura pública (ou restrita, dependendo da necessidade)
-- Para simplificar neste momento e garantir que funcione:
create policy "Enable read access for all users" on app_users for select using (true);
create policy "Enable insert access for all users" on app_users for insert with check (true);
create policy "Enable update access for all users" on app_users for update using (true);
create policy "Enable delete access for all users" on app_users for delete using (true);
