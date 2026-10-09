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
* **Experimente com IA** — simulador de visagismo com câmera e chat da Relo IA.
* **Simulação de corte com Nano Banana (IA de imagem do Google)** — o cliente sobe uma
  foto, escolhe um estilo e a IA gera na hora uma prévia realista do corte nele.
  A chave fica protegida no servidor (`.env`) e sem ela o site segue em modo
  demonstrativo. Veja `NANO_BANANA.md`.
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
  aba **Banco de Dados** com o status do espelho na nuvem e aba da IA.

### Testes (sem instalar nada)

```bash
npm run demo          # dados de vitrine (18 clientes, estoque, despesas) para o painel abrir com número
npm test              # sobe um servidor descartável e checa o banco, as rotas e a segurança (88 verificações)
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
| `NANO_BANANA.md` | IA de imagem do Google: como ligar (2 min), rotas, segurança e custos |
| `RELATORIO_FINAL.md` | Relatório geral das entregas |
| `novos_precos.md` | Tabela de preços e planos (inclui o Dia do Noivo) |

## Estrutura principal

```
server.js            servidor do site + API (/api/auth/*, /api/admin/*, /api/ia/*)
db.js                banco de dados em data/db.json
auth-hash.js         SHA-256 com sal (usado no navegador e no servidor)
admin-accounts.js    lista oficial de administradores (somente hashes)
auth-core.js         ReloAuth: login, cadastro, sessão (servidor ou modo local)
login-modal.js       caixinha de login injetada em todas as páginas
nano-banana.js       IA de imagem (Nano Banana/Gemini) no servidor; guarda a chave
ia-gemini.js         cliente no navegador: gera a prévia e religa os botões de estilo
chat-ia.js           chat da Relo IA (modelo real + fallback local)
.env.example         modelo do .env para ativar a IA (.env não sobe pro GitHub)
admin.html / admin.js   painel administrativo
dashboard.html       área do cliente
ferramentas/gerar-senha.js   gerador de hash para novos admins
```
