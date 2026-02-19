
ALTER TABLE app_users 
ADD COLUMN IF NOT EXISTS allowed_modules TEXT[] DEFAULT NULL;

-- Optional: Migrate existing users based on roles (One-off)
-- UPDATE app_users SET allowed_modules = ARRAY['INVENTORY', 'SALES', 'ORDER_CENTER', 'CUSTOMERS'] WHERE role = 'OPERATOR' AND allowed_modules IS NULL;
-- UPDATE app_users SET allowed_modules = ARRAY['PRODUCTION'] WHERE role = 'FACTORY' AND allowed_modules IS NULL;
