-- Atualizar a restrição de verificação (Check Constraint) na tabela app_users
-- Primeiro, tentamos remover a constraint antiga se ela existir (o nome pode variar, mas geralmente é app_users_role_check)
ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;

-- Agora adicionamos a nova constraint permitindo 'FACTORY'
ALTER TABLE app_users ADD CONSTRAINT app_users_role_check 
CHECK (role IN ('ADMIN', 'OPERATOR', 'FACTORY'));

-- Caso não exista constraint e seja apenas texto, isso não fará mal.
-- Se houver um TYPE (ENUM) no Postgres, precisaríamos alterá-lo:
-- ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'FACTORY'; 
-- (Mas pelo código anterior, parece que estamos usando TEXT com Check Constraint ou apenas TEXT livre)
