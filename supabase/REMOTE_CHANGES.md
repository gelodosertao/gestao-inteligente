# Registro de alterações remotas

## 2026-09-17 — Edge Functions administrativas P0

- Projeto: `licetziylggxtnoutjkn`.
- Pré-requisito aplicado: `migration_templates/security_p0_edge_prerequisites.sql`.
- Tabela `public.security_audit_log` criada vazia, com RLS ativo e sem privilégios DML para `anon` ou `authenticated`.
- Secret `ALLOWED_ORIGINS` configurado inicialmente para localhost e origens Capacitor; o domínio público ainda será incluído antes do deploy do frontend.
- Funções implantadas:
  - `admin-users`, versão 1, `verify_jwt=true`;
  - `change-password`, versão 1, `verify_jwt=true`.
- Verificações externas:
  - POST sem autenticação: `401`;
  - preflight de origem local: `204`;
  - preflight de origem desconhecida: `403`.
- Estado posterior: dois usuários no Auth, dois perfis e zero eventos de auditoria; nenhum usuário foi alterado durante o deploy.
- Rollback operacional: excluir as duas Edge Functions; a tabela aditiva pode permanecer sem afetar o frontend legado.

## 2026-09-17 — compatibilidade do login P0

- Projeto: `licetziylggxtnoutjkn`.
- Método: `supabase db query --linked`, em transação única.
- Dados removidos: nenhum.
- Alterações aditivas em `public.app_users`:
  - `is_active boolean not null default true`;
  - `must_change_password boolean not null default false`;
  - `temporary_password_expires_at timestamptz`.
- Motivo: o frontend P0 já consultava essas colunas após autenticar, mas elas ainda não existiam no banco remoto, impedindo o carregamento de qualquer perfil.
- Verificação posterior:
  - três colunas de segurança presentes;
  - dois perfis existentes preservados e ativos;
  - zero flags obrigatórias nulas;
  - nenhum usuário marcado para troca forçada de senha neste hotfix.

## 2026-09-17 — contenção emergencial Segurança P0

- Projeto: `licetziylggxtnoutjkn`.
- Script aplicado: `migration_templates/security_p0_emergency_lockdown.sql`.
- Método: `supabase db query --linked --file ...`, em transação única.
- Dados removidos: nenhum.
- Alterações: revogação de privilégios do papel `anon`, remoção de policies permissivas e restrição das funções de contador NF-e ao `service_role`.
- Verificação posterior:
  - zero privilégios de tabela para `anon` no schema `public`;
  - zero policies com `USING (true)`, `WITH CHECK (true)` ou bypass global autenticado;
  - dois registros em `auth.users` e dois perfis em `app_users`, sem alteração;
  - 69 policies autenticadas por tenant preservadas;
  - RPCs administrativas autenticadas mantidas temporariamente para compatibilidade com o frontend em produção.

### Pendências deliberadas

- Desativar signup remoto e elevar a política de senha no Auth.
- Validar e aplicar o restante de `security_p0_foundation.sql`; o ambiente Supabase de homologação foi adiado.
- Executar testes autenticados das Edge Functions antes do deploy do frontend.
- Remover definitivamente as RPCs administrativas legadas após o deploy do frontend.
- Ativar proteção contra senhas vazadas no painel do Supabase.
