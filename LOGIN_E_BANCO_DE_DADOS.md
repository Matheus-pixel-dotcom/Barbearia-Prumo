# Login, Banco de Dados de Clientes e Área Admin — Style Relo Barber

Documento rápido sobre o que foi implementado nesta etapa: **a foto que faltava no card
"Corte Style Relo"**, o **banco de dados de clientes**, a **caixinha de login** que abre no
site e o **acesso especial de administrador**.

---

## 1. Foto do card "Corte Style Relo"

O card estava sem foto porque as imagens do site apontavam para endereços externos
(Unsplash) que não carregavam mais. Todas as imagens externas foram trocadas por fotos
salvas dentro do próprio projeto, na pasta `assets/cortes/`:

| Arquivo | Onde aparece |
| --- | --- |
| `assets/cortes/corte-style-relo.jpg` | Card **Corte Style Relo** (degradê/social/tesoura, lavagem e finalização) — a foto que faltava |
| `assets/cortes/hero-barbearia.jpg` | Card grande da página inicial (Combo Experience) |
| `assets/cortes/barboterapia.jpg` | Card **Barboterapia** |
| `assets/cortes/visagismo-digital.jpg` | Card **Visagismo Digital** |
| `assets/cortes/dia-do-noivo.jpg` | Pacote **Dia do Noivo** (início e serviços) |
| `assets/cortes/ambiente-barbearia.jpg` | Foto do ambiente na página **Equipe** |

Como agora as fotos são locais, o site não depende mais de internet para exibi-las.

---

## 2. Como rodar o site com o banco de dados

```bash
# na pasta do projeto
npm run serve          # equivale a: node server.js

# depois abra no navegador
http://localhost:8000/index.html      # site
http://localhost:8000/admin.html      # painel administrativo
http://localhost:8000/api/health      # conferir se a API está no ar
```

Não precisa instalar nada: o servidor usa apenas recursos nativos do Node.
O banco de dados é o arquivo **`data/db.json`**, criado automaticamente na primeira execução.

### Também funciona sem servidor (modo local)

Se alguém abrir o site direto pelo arquivo (duplo clique em `index.html`) ou hospedar em
um serviço estático, o sistema percebe que não existe servidor e passa a usar um banco
**dentro do navegador** (localStorage). Tudo continua funcionando — login, cadastro, painel
admin — só que os cadastros ficam salvos naquele computador, sem compartilhar com outros.
O rodapé da caixinha de login e o painel admin sempre mostram em qual modo o site está.

---

## 3. Caixinha de login (abre em todas as páginas)

* Ao abrir qualquer página do site, quem não está logado recebe a **caixinha de login**
  automaticamente (aparece uma vez por aba, para não incomodar).
* Tem duas abas: **Entrar** e **Criar conta**.
* Depois de entrar:
  * **administrador** → vai para `admin.html` (painel);
  * **cliente** → vai para `dashboard.html` (área do cliente, com os dados do cadastro).
* O botão do menu troca de `Entrar` para `Sair (nome)`.
* Clicar em **Admin** sem ser administrador abre a caixinha explicando que a área é restrita.
* As páginas `login.html` e `signup.html` antigas continuam funcionando, agora gravando no
  mesmo banco de dados.

---

## 4. Banco de dados de clientes

Cada pessoa que se cadastra (ou entra) fica registrada com:

| Campo | Exemplo |
| --- | --- |
| `nome` | Cliente Teste |
| `email` | cliente@teste.com (usado como login) |
| `perfil` | `cliente` ou `admin` |
| `origem` | `cadastro`, `admin` ou `semente` (contas de admin já existentes) |
| `salt` + `senhaHash` | senha protegida — **nunca** é salva em texto puro |
| `criadoEm`, `ultimoLogin`, `totalLogins` | histórico de uso |

Também é gravado um **histórico de acessos** (`logins`): e-mail, perfil, data/hora e se o
acesso deu certo ou falhou. Os últimos 60 aparecem no painel admin.

**Segurança:** a senha passa por SHA-256 com "sal" por e-mail (`auth-hash.js`), então nem o
arquivo do banco nem o código guardam a senha legível. O acesso à lista de clientes pela API
só funciona com o token de um administrador logado (testado: cliente comum recebe `403`,
visitante recebe `401`).

---

## 4.5 Cadastro → banco de dados, automático (e o espelho na nuvem)

É o caminho que um cadastro percorre, sem ninguém precisar mover nada:

```
cliente cria a conta (signup.html ou a caixinha de login)
        │
        ▼
1) POST /api/auth/registrar  → grava em data/db.json  (APARECE NO PAINEL NA HORA)
        │
        ▼
2) servidor envia cópia → Supabase, tabela "clientes"   (ReloSync / sync-supabase.js)
        │
        ├── deu certo  → sync.estado = "ok"  (badge verde no painel)
        └── falhou     → sync.estado = "erro" + cadastro entra na fila (db.sync.fila)
                          o servidor tenta sozinho a cada 3 min (espera crescente)
                          e o painel tem "Reenviar fila" para forçar agora
```

| Situação | O que acontece |
| --- | --- |
| Site com `npm run serve` | Cadastro no `data/db.json` + cópia no Supabase. Painel admin sempre mostra o cliente, sincronizado ou não. |
| Site aberto sem servidor | Cadastro no banco do navegador **+ tentativa direta no Supabase pelo navegador**; se falhar, fica na fila do navegador e é reenviado na próxima visita. |
| Supabase fora do ar / tabela sem SQL | Nada quebra: o cadastro continua no banco do site e fica "na fila" no painel, com o erro escrito. |
| `SUPABASE_ATIVO=0` | Espelhamento desligado; cadastro fica só no `data/db.json`. |

**O que vai para a nuvem:** `id_cliente`, `nome`, `email`, `perfil`, `origem`, `criado_em`,
`ultimo_login`, `total_logins`. **A senha não vai** — nem em texto puro, nem com hash.

### Ligar em outro projeto Supabase

1. Rode `ferramentas/supabase-tabela-clientes.sql` no SQL Editor do projeto (cria a tabela com
   `email` UNIQUE e as policies de INSERT/SELECT).
2. No `.env` do servidor (ou na aba **Banco de Dados** do painel admin): `SUPABASE_URL`,
   `SUPABASE_ANON_KEY`, `SUPABASE_TABELA`. O `.env` tem prioridade sobre o que for salvo pelo painel.
3. `npm run serve` → o console mostra `Nuvem: Supabase ativo → tabela "clientes"`.
4. Confirme no painel: **Banco de Dados → Testar conexão** (deve dizer OK).

### Rotas novas do painel (todas exigem token de admin)

| Rota | Para que |
| --- | --- |
| `GET /api/admin/metricas` | KPIs e séries de 14 dias do dashboard (calculados no servidor) |
| `GET /api/admin/usuarios/:id` | ficha do cliente + histórico de acessos dele |
| `GET \| POST /api/admin/estoque`, `POST /api/admin/estoque/mov`, `DELETE /api/admin/estoque/:id` | estoque compartilhado + entrada/saída |
| `GET \| POST /api/admin/manutencao`, `DELETE /api/admin/manutencao/:id` | ordens de manutenção (status pendente → andamento → concluído) |
| `GET \| POST /api/admin/despesas`, `DELETE /api/admin/despesas/:id` | despesas do mês, por categoria |
| `GET \| POST /api/admin/supabase` | status/config do espelho (a chave volta mascarada) |
| `POST /api/admin/supabase/teste` | testa conexão e a tabela |
| `POST /api/admin/supabase/reenviar` | força o reenvio da fila (ignora a espera do backoff) |

---

## 5. Acesso especial de administrador

Estes e-mails abrem o painel **Admin** (já vêm cadastrados no banco, com as senhas que foram
definidas — guardadas apenas como hash):

| Nome | E-mail de acesso |
| --- | --- |
| R. Gabriel | r.gabriel08@escola.pr.gov.br |
| Evelyn Coller | evelyn.coller@escola.pr.gov.br |
| Matheus Moura | matheus.moura14@escola.pr.gov.br |
| Marcos Rossa | marcos.rossa@escola.pr.gov.br |
| Professor | professor@gmail.com |
| Wevergton Sousa | wevergton.sousa@escola.pr.gov.br |
| Michel Lima | michel.lima30@escola.pr.gov.br |
| Victor Camargo Pereira | camargo.pereira.victor@escola.pr.gov.br |

Dois e-mails digitados com erro foram aceitos como apelido (alias) para não travar o acesso:
`r.grabriel08@escola.pr.gov.br` → conta do R. Gabriel e
`evelyn.coller@escoa.pr.gov.br` → conta da Evelyn. (Os dois levam para a conta oficial
correspondente.)

**Qualquer outro e-mail é tratado como cliente** e precisa se cadastrar para entrar.

### Adicionar um novo administrador

1. Gere o sal e o hash da senha:
   ```bash
   node ferramentas/gerar-senha.js novo.admin@escola.pr.gov.br SenhaDoNovoAdmin
   ```
2. Cole o bloco gerado dentro da lista `contas` em **`admin-accounts.js`**.
3. Reinicie o servidor (`npm run serve`). A conta aparece no banco automaticamente.

Para trocar a senha de um admin, gere o hash novo e substitua o `senhaHash` daquela conta.

---

## 6. Painel administrativo (`admin.html`)

* **Sem login / cliente comum:** o painel não abre — aparece uma tela explicando o motivo e,
  para quem não está logado, o convite para entrar como administrador.
* **Com login de admin:** libera as abas:
  * **Visão Geral** — resumo e botão de atualizar;
  * **Banco de Clientes** — todos os cadastros, perfil, data de cadastro, último acesso,
    quantidade de acessos, além do **histórico de logins**. O admin pode **cadastrar um
    cliente** manualmente (+ Novo Cliente) e **excluir** cadastros de clientes (as contas de
    administrador da lista oficial são protegidas contra exclusão);
  * **Estoque (Entrada/Saída)**, **Manutenção** e **Despesas** — agora gravados no **banco do
    servidor** (`data/db.json`), então todos os administradores veem o mesmo dado. Cada produto
    tem estoque mínimo (alerta de falta) e histórico de movimentações. Sem servidor, o painel cai
    no `localStorage` deste navegador e continua funcionando;
  * **Banco de Dados** — como o cadastro chega no banco, status do Supabase (enviados, fila,
    falhas), configuração do espelho (ligar/desligar, URL, tabela, chave), teste de conexão,
    reenvio da fila e o SQL para criar a tabela;
  * Visual premium: cartões de KPI com variação da semana, gráfico de área (cadastros/14 dias),
    barras (acessos), rosca (origem dos cadastros), fluxo de atividade, alertas de "precisa de
    atenção", busca + filtro + ordenação + paginação na tabela de clientes, ficha do cliente,
    exportar CSV e avisos (toast) no lugar de `alert()`.

---

## 7. Arquivos novos / alterados

| Arquivo | Função |
| --- | --- |
| `server.js` | **novo** — servidor do site + API do banco de clientes (`npm run serve`) |
| `db.js` | **novo** — leitura/gravação do banco em `data/db.json` |
| `auth-hash.js` | **novo** — SHA-256 com sal, usado pelo navegador e pelo servidor |
| `admin-accounts.js` | **novo** — lista oficial de administradores (só hashes) |
| `auth-core.js` | **novo** — ReloAuth: login, cadastro, sessão, modo servidor/local |
| `login-modal.js` | **novo** — a caixinha de login injetada em todas as páginas |
| `ferramentas/gerar-senha.js` | **novo** — gerador de hash para novos admins |
| `auth.js` | reescrito para usar o banco novo (login.html / signup.html) |
| `admin.js`, `admin.html` | painel com banco de clientes, logins e bloqueio de acesso |
| `dashboard.html` | área do cliente com os dados do próprio cadastro |
| `index.html` | início remodelado (vitrine de serviços, faixa animada e pacote Dia do Noivo) |
| `equipe.html` | equipe e funções (substitui o antigo `sobre.html`) |
| `script.js` | animação de rolagem (`data-reveal`) e contadores (`data-counter`) |
| `feedback.js` | não trava mais esperando um CDN; usa a sessão do site |
| `style.css` | estilos da caixinha de login e da área do usuário |
| `package.json` | `npm run serve` |
| `.gitignore` | ignora a pasta `data/` (banco gerado localmente) |

---

## 8. Testes rápidos

```bash
# servidor no ar? (mostra o estado do espelho na nuvem)
curl http://localhost:8000/api/health

# login de um administrador
curl -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"professor@gmail.com","senha":"professor2026"}'

# cadastro de um cliente novo
curl -X POST http://localhost:8000/api/auth/registrar \
  -H 'Content-Type: application/json' \
  -d '{"nome":"Cliente Novo","email":"cliente@teste.com","senha":"minhasenha"}'
```

```bash
# estoque / despesas / manutenção agora são do servidor (não do navegador)
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/admin/metricas
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/admin/supabase
curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/admin/supabase/reenviar
```

Todos os fluxos (login de admin, login de cliente, senha errada, cadastro de cliente aparecendo
no painel, espelho na nuvem com fila de reenvio, estoque/manutenção/despesas, bloqueio do painel
para não-admin, modo local sem servidor, senha só em hash e `data/` inacessível pelo navegador)
foram validados — 88 verificações ponta a ponta, todas passando.

---

## Como testar sem abrir o navegador

```bash
npm test               # sobe um servidor Node num diretório descartável e roda as 88 verificações
npm run test:nuvem     # idem, mas exige que a linha do cadastro chegue no Supabase de verdade
npm run test:render    # roda o admin.js num DOM falso (pega quebra de render, sem servidor)
npm run test:painel    # mesmo DOM falso, apontado para o servidor na porta 8000
```

`npm test` usa `SUPABASE_URL` inválida de propósito, para provar que o cadastro continua
seguro no `data/db.json` e entra na fila quando a nuvem falha. Ele nunca toca no seu
projeto real; para isso existe o `test:nuvem`.
