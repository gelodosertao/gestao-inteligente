# Segurança P0 — conclusão em produção

## Objetivo
Concluir o corte seguro de autenticação e autorização sem interromper o sistema atual.

## Tarefas
- [x] Criar a tabela de auditoria mínima para as Edge Functions → RLS ativo, sem DML para `anon`/`authenticated` e usuários preservados.
- [x] Configurar `ALLOWED_ORIGINS` para o localhost → secret presente; origem local `204` e origem desconhecida `403`.
- [x] Implantar `admin-users` e `change-password` → ambas ativas, versão 1, JWT obrigatório e chamadas sem autenticação retornando `401`.
- [ ] Testar fluxos autenticados de usuários e senha → verificar tenant, último administrador e auditoria.
- [ ] Endurecer Auth remotamente sem sobrescrever MFA/Twilio → verificar signup, senha mínima e proteção contra vazamentos.
- [ ] Publicar e testar o frontend P0 → verificar login, módulos, Financeiro e administração.
- [ ] Aplicar a fundação RLS restante e remover RPCs legadas → verificar advisors e isolamento por tenant.
- [ ] Registrar, revisar e entregar via Git → verificar diff, commit e PR.

## Concluído quando
- [ ] Nenhuma função administrativa legada estiver exposta e os fluxos críticos funcionarem com auditoria.

## Notas
- O ambiente Supabase de homologação foi adiado; mudanças remotas serão pequenas, transacionais e verificadas individualmente.
- As RPCs antigas permanecem até as Edge Functions e o frontend novo estarem comprovadamente operacionais.
- `ALLOWED_ORIGINS` ainda precisa receber o domínio público antes do deploy do frontend.
