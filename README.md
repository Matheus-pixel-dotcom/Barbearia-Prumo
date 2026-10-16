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
* **Hierarquia de acesso (3 níveis)** — **Usuário (cliente)** usa o site; **Supervisor** abre o
  painel e opera o dia a dia (clientes, estoque, manutenção, despesas); **Administrador** faz
  tudo, inclusive excluir, configurar a nuvem e definir quem é quem. Cada rota do servidor
  confere a permissão (403 para quem não pode) e o painel esconde o que o perfil não alcança.
  Tudo em `permissoes.js` e explicado em **HIERARQUIA_DE_ACESSO.md**.
* **Admin (premium)** — painel para a equipe (administrador e supervisor):
  dashboard com KPIs e gráficos, banco de clientes com busca/filtro/paginação/ficha/CSV,
  **estoque, manutenção e despesas agora no banco do servidor** (compartilhados entre os admins),
  aba **Banco de Dados** com o status do espelho na nuvem. Faixa **"Hoje na
  barbearia"** (cadastros e acessos do dia, estoque abaixo do mínimo, despesas em aberto, fila da
  nuvem), cartões de KPI que abrem a tela do assunto com um clique e o chip de quem está logado
  no cabeçalho. Para ligar o Supabase, basta **colar o bloco inteiro** que o painel dele mostra —
  a URL e a chave são separadas sozinhas.

### Testes (sem instalar nada)

```bash
npm run demo          # dados de vitrine (18 clientes, estoque, despesas) para o painel abrir com número
npm test              # sobe um servidor descartável e checa banco, rotas, segurança e hierarquia (159 verificações)
npm run test:nuvem    # idem, mas exige que a linha do cadastro chegue de fato no seu Supabase
npm run test:render   # roda o admin.js inteiro num DOM falso: quebrando o painel, quebra o teste
npm run test:painel   # idem, mas contra o servidor de pé (usa o login da semente em localhost:8000)
npm run test:acessos  # só a hierarquia de acesso: cliente x supervisor x administrador (65 verificações)
npm run matriz        # imprime a matriz de permissões atualizada (vem do código, não do documento)
```

## Documentação

| Arquivo | Conteúdo |
| --- | --- |
| `LOGIN_E_BANCO_DE_DADOS.md` | Login, banco de clientes, espelho no Supabase, lista de admins, API e como rodar |
| `ATUALIZACOES.md` | Histórico de atualizações anteriores do projeto |
| `IMPLEMENTACAO_IA.md` | Recursos de IA (câmera/visagismo) |
| `HIERARQUIA_DE_ACESSO.md` | Administrador x supervisor x usuário: matriz de permissões, rotas e como promover alguém |
| `RELATORIO_FINAL.md` | Relatório geral das entregas |
| `TCC/` | Material do TCC: **casos de uso passo a passo** (`casos-de-uso.md`), **diagrama de caso de uso** em A4 paisagem (`diagrama-caso-de-uso.html`, imprimir em PDF com Ctrl+P) e **Daily Scrum / quem é quem** (`daily-scrum.html` e `Daily-Scrum-TCC.docx`) |
| `novos_precos.md` | Tabela de preços e planos (inclui o Dia do Noivo) |

## Estrutura principal

```
server.js            servidor do site + API (/api/auth/*, /api/admin/*)
db.js                banco de dados em data/db.json
auth-hash.js         SHA-256 com sal (usado no navegador e no servidor)
admin-accounts.js    lista oficial da equipe (somente hashes): 6 administradores e
                     2 supervisores (Wevergton Sousa e Michel Lima, os barbeiros)
permissoes.js        hierarquia de acesso: a matriz do que cada perfil pode fazer
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
ferramentas/teste-hierarquia.js   65 verificações da hierarquia de acesso
ferramentas/gerar-daily-scrum.js  gera TCC/Daily-Scrum-TCC.docx (precisa de `npm i docx --no-save`)
TCC/                 casos de uso, diagrama de caso de uso (A4) e Daily Scrum do projeto
```
