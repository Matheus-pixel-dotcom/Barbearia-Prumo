# Barbearia-Prumo — Style Relo Barber

Site para auxiliar o barbeiro sobre o corte e ajudar o cliente a tomar a melhor decisão do corte.

## Como rodar

```bash
npm run serve      # inicia o site + banco de dados de clientes (Node puro, sem instalações)
```

Depois abra **http://localhost:8000/index.html**
(painel administrativo em http://localhost:8000/admin.html)

> Para o cadastro também subir no banco da nuvem (Supabase), rode uma vez o SQL de
> `ferramentas/supabase-tabela-clientes.sql` no seu projeto. O resto é automático
> (config opcional no `.env` ou na aba **Banco de Dados** do painel).

> Sem servidor também funciona: abrindo o `index.html` direto, o login e o cadastro passam a
> usar um banco local do navegador. Os detalhes estão em **LOGIN_E_BANCO_DE_DADOS.md**.

## O que tem no site

* **Início / Serviços / Equipe / Contato** — vitrine de preços, pacote **Dia do Noivo (R$ 250)**, planos e agendamento via WhatsApp.
* **Corte Style Relo** — card com foto própria em `assets/cortes/corte-style-relo.jpg`
  (degradê, social ou tesoura, com lavagem e finalização).
* **Experimente com IA** — simulador de visagismo: o cliente sobe uma foto ou usa a
  câmera (leitura facial com face-api.js), escolhe o estilo e o volume e recebe na hora
  a recomendação montada, com o botão de agendar já preenchido. O chat da **Relo IA**
  responde sobre cortes, preços, barba e agendamento. Tudo roda **no navegador**, sem
  chave de API e sem serviço pago (veja `IMPLEMENTACAO_IA.md`).
* **Menu** — o mesmo em todas as páginas; o item **Admin** é uma pílula dourada que fecha em
  ouro quando você entra com uma conta de administrador.
* **Equipe** — quem é quem na barbearia, com a função de cada profissional (inclui o Marcos na gerência de vendas de produtos).
* **Feedback** — avaliações dos barbeiros.
* **Login / Criar conta** — caixinha de login que abre em todas as páginas. Quem se cadastra
  (nome, e-mail e senha protegida) **entra na hora no banco de dados da barbearia** e recebe
  uma cópia automática no Supabase (nuvem) — sem importar nada, mesmo se o site for aberto sem
  servidor ou a internet cair (a fila reenvia sozinha).
* **Admin (premium)** — painel exclusivo para os e-mails de administrador de `admin-accounts.js`:
  dashboard com KPIs e gráficos, banco de clientes com busca/filtro/paginação/ficha/CSV,
  **estoque, manutenção e despesas agora no banco do servidor** (compartilhados entre os admins),
  aba **Banco de Dados** com o status do espelho na nuvem e aba da IA. Faixa **"Hoje na
  barbearia"** (cadastros e acessos do dia, estoque abaixo do mínimo, despesas em aberto, fila da
  nuvem), cartões de KPI que abrem a tela do assunto com um clique e o chip de quem está logado
  no cabeçalho. Para ligar o Supabase, basta **colar o bloco inteiro** que o painel dele mostra —
  a URL e a chave são separadas sozinhas.

### Testes (sem instalar nada)

```bash
npm run demo          # dados de vitrine (18 clientes, estoque, despesas) para o painel abrir com número
npm test              # sobe um servidor descartável e checa o banco, as rotas e a segurança (95 verificações)
npm run test:nuvem    # idem, mas exige que a linha do cadastro chegue de fato no seu Supabase
npm run test:render   # roda o admin.js inteiro num DOM falso: quebrando o painel, quebra o teste
npm run test:painel   # idem, mas contra o servidor de pé (usa o login da semente em localhost:8000)
```

## Documentação

| Arquivo | Conteúdo |
| --- | --- |
| `LOGIN_E_BANCO_DE_DADOS.md` | Login, banco de clientes, espelho no Supabase, lista de admins, API e como rodar |
| `ATUALIZACOES.md` | Histórico de atualizações anteriores do projeto |
| `IMPLEMENTACAO_IA.md` | Recursos de IA (câmera/visagismo) |
| `RELATORIO_FINAL.md` | Relatório geral das entregas |
| `novos_precos.md` | Tabela de preços e planos (inclui o Dia do Noivo) |

## Estrutura principal

```
server.js            servidor do site + API (/api/auth/*, /api/admin/*)
db.js                banco de dados em data/db.json
auth-hash.js         SHA-256 com sal (usado no navegador e no servidor)
admin-accounts.js    lista oficial de administradores (somente hashes)
auth-core.js         ReloAuth: login, cadastro, sessão (servidor ou modo local)
                     + perfis de acesso (cliente, supervisor, administrador)
login-modal.js       caixinha de login injetada em todas as páginas
ia-camera.js         câmera + leitura facial (face-api.js)
ia-tryon.js          simulador: estilo escolhido → card de resultado → WhatsApp
chat-ia.js           chat da Relo IA (respostas locais, sem chave de API)
.env.example         modelo do .env (porta, host e Supabase — não sobe pro GitHub)
admin.html / admin.js   painel administrativo
dashboard.html       área do cliente
ferramentas/gerar-senha.js   gerador de hash para novos admins
```
