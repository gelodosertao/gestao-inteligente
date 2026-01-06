-- Create categories table
create table if not exists categories (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  type text not null check (type in ('PRODUCT', 'FINANCIAL')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(name, type)
);

-- Insert default Product categories
insert into categories (name, type) values
('Água', 'PRODUCT'),
('Cerveja', 'PRODUCT'),
('Energético', 'PRODUCT'),
('Gelo Barra', 'PRODUCT'),
('Gelo Cubo', 'PRODUCT'),
('Gelo Escama', 'PRODUCT'),
('Gelo Sabor', 'PRODUCT'),
('Gin', 'PRODUCT'),
('Licor', 'PRODUCT'),
('Outros', 'PRODUCT'),
('Refrigerante', 'PRODUCT'),
('Vodka', 'PRODUCT'),
('Whisky', 'PRODUCT'),
('Drinks/Coquetéis', 'PRODUCT'),
('Insumo (Matéria-prima)', 'PRODUCT')
on conflict (name, type) do nothing;

-- Insert default Financial categories
insert into categories (name, type) values
('Fornecedores', 'FINANCIAL'),
('Manutenção', 'FINANCIAL'),
('Utilidades', 'FINANCIAL'),
('Pessoal', 'FINANCIAL'),
('Impostos', 'FINANCIAL'),
('Aluguel', 'FINANCIAL'),
('Equipamentos', 'FINANCIAL'),
('Outros', 'FINANCIAL')
on conflict (name, type) do nothing;
