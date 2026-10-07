# Liberação da NF-e modelo 55

Estado em 07/10/2026: as migrações fiscais `202609250001`, `202610060001` e `202610060002` constam no histórico remoto do Supabase. O usuário relatou uma NF-e autorizada pelo emissor próprio em homologação; a autorização ainda precisa ser conferida no XML, protocolo e consulta à SEFAZ. O cancelamento não foi homologado: após corrigir a validação local do evento, a SEFAZ retornou rejeição referente ao CNPJ do autor. Consultar a situação da nota antes de repetir o pedido e revisar o caso com o contador. O XML emitido no Sebrae serve apenas para comparação fora do Git.

## O que já existe no código

- PDV Atacado vincula cliente por ID e guarda o contexto comercial na operação atômica da venda.
- Rascunho pode ser salvo sem número; somente ADMIN pode emitir, consultar e cancelar.
- Regra fiscal e perfil de produto vivem em tabelas distintas, com vigência e aprovação. Ausência de configuração impede emissão.
- Operação automática inicial restrita a venda B2B interna BA, produto próprio, CRT 1, CFOP 5101, CSOSN 102, `indFinal=0`.
- O emissor exige presença, frete e condição de pagamento informados; PIX usa `tPag=17` configurável.
- Reserva número por CNPJ, série e ambiente; o XML assinado é persistido antes do envio; resultado incerto exige consulta.
- Venda a prazo pode ser emitida antes da saída sem alterar `amount_paid`, quando a regra de prazo estiver aprovada.
- IBS/CBS de 2026 tem vigência até 31/12/2026; 2027 exige regra própria e implementação homologada.
- O cadastro local de municípios contém os 417 municípios da Bahia publicados pela API de localidades do IBGE em 06/10/2026.

## Dados que precisam de confirmação

1. Contador: confirmar que a **série 2 nunca foi usada em produção**. Se foi, escolher outra livre; homologação tem contador separado.
2. Contador: conferir a aprovação vigente de PIS/COFINS no banco e no XML autorizado. A referência fornecida usa `PISOutr/COFINSOutr` CST 49.
3. Contador: aprovar representação de venda a prazo e vencimento na NF-e (`indPag`, `cobr`, `fat`, `dup`). `creditApproved` inicia `false`.
4. Fiscal: aprovar NCM, CEST, origem e unidade por produto. Gelo saborizado 22019000/2806200 é uma decisão administrativa provisória, não classificação universal.
5. Fiscal: confirmar dados do emitente, inscrição estadual, demais CFOPs e regras futuras de IBS/CBS. Cenários não aprovados seguem bloqueados.

## Implantação e homologação

1. Antes de qualquer nova implantação, comparar o catálogo e o histórico remoto com as migrações versionadas. As três migrações fiscais acima já constam como aplicadas; não reaplicá-las. Testar RLS, chaves estrangeiras, concorrência, dupla emissão, imutabilidade e sequência crescente.
2. Inserir configuração do emitente por tenant/ambiente com série confirmada apenas após checagem. Aprovar regra e perfis com data, referência do contador e sem sobreposição. Os meios de pagamento têm vigência própria.
3. Configurar certificado A1, CNPJ, `NFE_TENANT_ID`, chaves service_role e anon, `SERVER_CORS_ORIGIN`, `VITE_NFE_SERVICE_URL` e HTTPS fora do Git.
4. Homologar com o contador: rascunho, crédito/PIX, descontos/frete, autorização, consulta após timeout, duplicidade, XML, DANFE e cancelamento. Conferir XML assinado e protocolo contra a SEFAZ.
5. Só depois habilitar produção e fazer uma emissão controlada. A série 1 pertence ao Sebrae.

### Verificação local executada

Em 07/10/2026: `nfe_service` passou no typecheck, build e 16 testes; o aplicativo passou no typecheck, build e 28 testes. Estes testes não substituem a homologação de todos os fluxos na SEFAZ nem a inspeção do banco remoto.
