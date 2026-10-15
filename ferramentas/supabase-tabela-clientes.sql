-- =====================================================================
--  Style Relo Barber · tabela "clientes" no Supabase
--  Cole tudo aqui no SQL Editor do seu projeto e clique em RUN (1x só).
-- =====================================================================
--
--  Para que serve: cada pessoa que se cadastra no site já entra no banco
--  do servidor (data/db.json) e, em seguida, o servidor manda uma cópia
--  para ESTA tabela. Assim o cadastro fica num banco central, que você
--  abre de qualquer computador (e o painel admin mostra o status de cada
--  envio na aba "Banco de Dados").
--
--  O site usa a API REST do Postgres (PostgREST), por isso os nomes das
--  colunas são em minúsculo com "_" e o e-mail precisa ser UNIQUE:
--  é isso que permite ATUALIZAR o cadastro do mesmo cliente em vez de
--  criar uma linha repetida.
-- =====================================================================

create table if not exists public.clientes (
  id              uuid primary key default gen_random_uuid(),
  id_cliente      text,                       -- id interno do banco do site (cli_xxxxx)
  nome            text not null,
  email           text not null unique,        -- login do cliente (UNIQUE = sem duplicados)
  perfil          text not null default 'cliente',
  origem          text not null default 'cadastro',
  telefone        text,
  criado_em       timestamptz not null default now(),
  ultimo_login    timestamptz,
  total_logins    integer not null default 0,
  sincronizado_em timestamptz not null default now()
);

create index if not exists clientes_criado_em_idx on public.clientes (criado_em desc);

-- ---------------------------------------------------------------------
--  Permissões (Row Level Security)
--  A Senha NUNCA é enviada para o Supabase — nem hash, nada. O espelho
--  serve para você ter a carteira de clientes na nuvem, não para autenticar.
-- ---------------------------------------------------------------------
alter table public.clientes enable row level security;

drop policy if exists "site grava cadastro" on public.clientes;
create policy "site grava cadastro"
  on public.clientes for insert
  to anon, service_role
  with check (true);

drop policy if exists "site atualiza cadastro" on public.clientes;
create policy "site atualiza cadastro"
  on public.clientes for update
  to anon, service_role
  using (true)
  with check (true);

drop policy if exists "painel consulta cadastros" on public.clientes;
create policy "painel consulta cadastros"
  on public.clientes for select
  to anon, authenticated, service_role
  using (true);

-- ---------------------------------------------------------------------
--  Opcional: conferir quantos clientes entraram hoje (rode quando quiser)
-- ---------------------------------------------------------------------
-- select date_trunc('day', criado_em) as dia, count(*)
--   from public.clientes group by 1 order by 1 desc limit 14;

-- ---------------------------------------------------------------------
--  Depois de criar a tabela, confirme no painel:
--    Admin → Banco de Dados → "Testar conexão"  (deve dar OK)
--    Admin → Banco de Dados → "Reenviar fila"   (manda os cadastros que ficaram parados)
-- ---------------------------------------------------------------------
