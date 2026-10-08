# Gelo Premiado: estado remoto em 08/10/2026

Consulta somente leitura ao Supabase vinculado confirmou a tabela `public.gelo_premiado_codes`, a coluna `participant_name` e as RPCs de validação, criação, listagem e entrega. O papel `anon` pode executar a validação pública e não pode executar a criação administrativa; o papel `authenticated` pode chamar a criação, que confere o administrador dentro da função.

As migrações locais `202609300001` a `202609300004` não aparecem no histórico remoto da CLI, embora os objetos existam. Não reaplicar esses arquivos sem comparar seu conteúdo com o catálogo remoto e reconciliar o histórico. Nenhum SQL de alteração foi executado nesta conferência.
