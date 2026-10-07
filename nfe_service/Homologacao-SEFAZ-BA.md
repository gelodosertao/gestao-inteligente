# Roteiro de homologação SEFAZ-BA

Pré-condições: migrações aplicadas em banco de teste, issuer e regra aprovados para ambiente 2, certificado A1 de teste válido, CNPJ e tenant corretos, perfil fiscal por produto, serviço alcançável somente pelo domínio autorizado. O XML do Sebrae fica fora do repositório.

1. Criar uma venda B2B BA no PDV Atacado com cliente cadastrado por ID, presença/frete reais, produto fiscal aprovado e pagamento PIX. Salvar rascunho: confirmar ausência de número e chave.
2. Alterar cliente ou valor após salvar. A emissão deve exigir nova revisão. Duas edições concorrentes do rascunho devem resultar em conflito para a versão antiga.
3. Aprovar e testar venda a prazo: emitir antes da saída e conferir que a venda continua pendente de pagamento, com vencimento acordado no XML.
4. Forçar cenários sem regra (interestadual, consumidor final, NCM ausente, 2027 sem regra, série não confirmada) e conferir bloqueio antes de qualquer reserva.
5. Emitir uma NF-e controlada: comparar chave, série, número, XML assinado, protocolo, totais, itens, presença, frete, pagamento, PIS/COFINS e DANFE com o contador.
6. Simular queda após persistir o XML assinado. Consultar pela chave e conciliar protocolo; confirmar que nenhuma chamada de autorização foi repetida.
7. Testar rejeição, duplicidade, dois cliques e cancelamento. O contador não diminui. Persistir o evento assinado e o retorno de cancelamento; conferir casos incertos manualmente.
8. Validar RLS para operador de outro tenant, operador sem acesso ao PDV e ADMIN. Revisar XML ZIP e relatório por período e ambiente.

Registrar chave e número dos testes apenas em evidência operacional protegida, com dados de cliente ocultados. Produção requer checagem independente de que a série escolhida está livre.

## Recomeçar após erro local de schema

No Windows, `npm.cmd run dev` prepara os schemas e certificados que `@treeunfe/shared` procura em `node_modules/resources`. Reinicie o serviço após atualizar o código. Se uma emissão falhou com `ENOENT` antes de assinar ou transmitir o XML, consulte `nfe_documents` pelo ID da venda e confirme ambiente, série, número, estado e ausência de `signed_xml`/`access_key`. Uma reserva intacta pode ser retomada pelo mesmo rascunho e número; não apague a reserva nem force uma nova sequência. Se existir XML assinado ou chave, consulte e concilie a SEFAZ antes de tentar novamente.
