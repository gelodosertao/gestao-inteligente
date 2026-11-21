-- Pré-requisito aditivo para admin-users e change-password.
-- Não remove funções, policies ou dados existentes.

begin;

create table if not exists public.security_audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists security_audit_log_tenant_created_idx
  on public.security_audit_log (tenant_id, created_at desc);

alter table public.security_audit_log enable row level security;
revoke all on table public.security_audit_log from public, anon, authenticated;

commit;
