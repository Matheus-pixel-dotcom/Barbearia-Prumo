-- =====================================================================
--  Style Relo Barber — tabela do banco de clientes no Supabase
-- =====================================================================
--  Use este arquivo quando quiser que os cadastros dos clientes fiquem
--  guardados de forma permanente e compartilhada entre todos os aparelhos,
--  mesmo em hospedagens gratuitas (Render, Railway, Koyeb...).
--
--  COMO USAR
--  1. Entre em https://supabase.com e abra o seu projeto.
--  2. No menu lateral, clique em "SQL Editor" → "New query".
--  3. Cole TODO este arquivo e clique em "Run".
--  4. Em "Project Settings" → "API", copie:
--        • Project URL           → vira a variável SUPABASE_URL
--        • service_role secret   → vira a variável SUPABASE_SERVICE_ROLE_KEY
--     (a chave service_role é secreta: só use no servidor, nunca em página web)
--  5. Configure essas duas variáveis no painel da hospedagem e reinicie o serviço.
--
--  IMPORTANTE: a chave service_role ignora as regras de segurança, por isso a
--  tabela fica com RLS ativado e SEM políticas: ninguém consegue ler ou escrever
--  direto do navegador. Só o servidor (com a chave secreta) acessa os dados.
-- =====================================================================

create table if not exists public.relo_db (
  id            text primary key,
  dados         jsonb       not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

comment on table public.relo_db is
  'Banco de dados do Style Relo Barber: cadastro de clientes, sessões e histórico de acessos (linha única "principal").';

-- Mantém apenas a linha principal (o servidor grava tudo dentro de "dados")
alter table public.relo_db enable row level security;

-- Nenhuma política é criada de propósito: com a chave "anon" (usada no navegador)
-- a tabela fica inacessível; só a chave service_role do servidor consegue entrar.

-- Índice para leitura rápida da linha principal
create index if not exists relo_db_atualizado_em_idx
  on public.relo_db (atualizado_em desc);

-- ---------------------------------------------------------------------
-- Conferência (opcional): rode depois do primeiro acesso ao site para ver
-- quantos usuários foram gravados.
-- ---------------------------------------------------------------------
-- select
--   (select count(*) from jsonb_array_elements(dados->'usuarios')) as usuarios,
--   (select count(*) from jsonb_array_elements(dados->'logins'))   as logins,
--   atualizado_em
-- from public.relo_db where id = 'principal';
