# Painel fiscal em emissor.gelodosertao.com.br

1. Expor uma área administrativa própria no frontend, acessível pelo menu lateral e pelo host `emissor.gelodosertao.com.br`.
2. Consultar produtos do PDV Atacado, perfis fiscais, emitente, séries e regras por meio do `nfe_service`, com autenticação administrativa e isolamento por empresa.
3. Gravar mudanças fiscais em transação no banco. Perfis e regras recebem nova data de vigência; mudanças de emitente e série recebem auditoria. Regras sem aprovação continuam bloqueadas para emissão.
4. Verificar compilação, testes fiscais e configuração de hospedagem. Publicar o domínio e o serviço somente após conferir DNS, HTTPS, URL da API e CORS no ambiente de produção.

## Ativação da hospedagem

- A área `emissor.gelodosertao.com.br` usa o mesmo build Vite do sistema, mas apresenta somente o painel fiscal e o login quando acessada por esse host.
- Adicionar `emissor.gelodosertao.com.br` em **Vercel → projeto que hospeda o sistema → Settings → Domains**. Conferir o registro DNS solicitado pela Vercel para esse projeto; não presumir um CNAME genérico.
- Configurar `VITE_NFE_SERVICE_URL` no build do frontend com a URL HTTPS pública do `nfe_service`. O serviço fiscal precisa estar hospedado separadamente, com `SERVER_CORS_ORIGIN` contendo as origens exatas do sistema e do emissor.
- A migração `202610060002_nfe_configuration_console.sql` consta no histórico remoto do Supabase em 07/10/2026; conferir o catálogo antes de qualquer nova implantação. Verificar o endpoint administrativo `/api/nfe/configuracoes` com uma sessão de administrador e confirmar que um usuário comum recebe 403.
- O cancelamento utiliza `/api/nfe/cancelar/:sale_id`: o administrador seleciona uma nota autorizada, escreve justificativa de 15 a 255 caracteres, revisa o número/chave e confirma. Respostas incertas devem ser conciliadas pela consulta à SEFAZ antes de nova tentativa.
