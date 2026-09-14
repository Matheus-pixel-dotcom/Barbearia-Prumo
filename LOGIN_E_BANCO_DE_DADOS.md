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
| `assets/cortes/ambiente-barbearia.jpg` | Foto do ambiente na página **Sobre** |

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
  * **Estoque (Entrada/Saída)**, **Manutenção** e **Despesas** — como antes, salvos no
    navegador usado pelo admin.

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
| `index.html`, `sobre.html` | fotos locais (fim das imagens quebradas) |
| `feedback.js` | não trava mais esperando um CDN; usa a sessão do site |
| `style.css` | estilos da caixinha de login e da área do usuário |
| `package.json` | `npm run serve` |
| `.gitignore` | ignora a pasta `data/` (banco gerado localmente) |

---

## 8. Testes rápidos

```bash
# servidor no ar?
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

Todos os fluxos (login de admin, login de cliente, senha errada, cadastro de cliente, bloqueio
do painel para não-admin, modo local sem servidor) foram validados em testes automatizados
com navegador simulado — 25 verificações, todas passando.
