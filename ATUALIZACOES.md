# Atualizações do Projeto - Style Relo Barber

## 🛠️ 9 de outubro de 2026 (tarde) — Painel por dentro + configurar o Supabase colando

### O que o admin vê ao abrir o painel
- **Faixa "Hoje na barbearia"**, logo acima dos gráficos: quantos cadastros e acessos entraram
  **hoje** (no calendário, não "últimas 24 h"), quantos produtos estão abaixo do mínimo,
  manutenções abertas, o total de despesas do mês com o que ainda está em aberto e se sobrou
  cadastro na fila da nuvem. Cada bolinha é um botão: clicar nela **abre a tela do assunto**.
- **Cartões de KPI clicáveis**: levam para a aba correspondente (Enter/Espaço também funcionam,
  e há `aria-label`), com hover mais vivo — elevação, sombra e filete dourado no topo.
- **Chip do admin logado no cabeçalho** (avatar com as iniciais + primeiro nome). Na tela
  pequena a sidebar fica escondida, e o nome sumia junto; agora ele está sempre no topo. Ao
  clicar: e-mail da conta, atalho para o status do banco e **Sair da conta**.
- Números novos vêm do servidor: `calcularMetricas()` passou a devolver `novosHoje`,
  `acessosHoje` e `despesasPendentes` (o painel em modo local calcula os equivalentes no navegador).

### Configurar o espelho ficou "colar e salvar"
- Na aba **Banco de Dados** há um campo novo: **cole o bloco inteiro** que o painel do Supabase
  mostra (URL, chave, rótulos, aspas, vírgulas — tanto faz). O servidor separa as partes:
  - acha `https://xxxx.supabase.co` e o ref mesmo sem o `https://`;
  - aceita a chave **anon**, a **publishable** nova (`sb_publishable_…`) e o **JWT**;
  - lê o payload do JWT para dizer o tipo da chave e **avisa se for a `service_role`**
    (funciona, mas a anon/publishable já basta para o espelho);
  - se não achar nada, responde 400 explicando o que falta, em português.
- URL de **outro** projeto é barrada com 409 se a `SUPABASE_URL` do `.env` fixa qual é o
  projeto (para o painel nunca desviar o espelho para outro lugar sem querer).
- Campo URL **em branco** ao salvar com bloco colado não apaga a URL atual.
- A chave continua gravada só no servidor (`data/supabase-config.json`, gitignored) e o
  navegador nunca a recebe inteira — só a máscara.

### Vitrine
- `npm run demo` agora cria 3 cadastros **de hoje** (com hora limitada ao horário atual, para
  nunca inventar futuro) — é o que a faixa "Hoje na barbearia" mostra.

---

## ✂️ 9 de outubro de 2026 — Menu igual em toda página + pílula do Admin

### O item "🍌 Estúdio Nano Banana" saiu do menu
- Ele só existia em 3 páginas (`index.html`, `ia-tryon.html`, `nano-banana.html`), então o
  cabeçalho mudava de tamanho de uma página para a outra. Agora **nenhuma** página mostra o
  item no menu — as 12 páginas têm exatamente a mesma navegação.
- A página do estúdio continua no ar (`nano-banana.html`) e chega nela por onde faz sentido:
  pelo botão **"Ver o corte na sua foto (Estúdio)"** na tela de resultado do
  **Experimente com IA** e pelo **"Abrir Estúdio"** da aba de IA do painel admin.

### "Admin" no menu deixou de ser um texto dourado solto
- Antes: `<a style="color: var(--gold)">Admin</a>` (e faltava em `nano-banana.html`).
- Agora: pílula dourada com ícone de cadeado (`.nav-admin`), no mesmo vocabulário do botão
  de login — contorno dourado por fora, e **fechada em ouro quando você entra com uma conta
  de administrador** (o `login-modal.js` já marcava o link; agora isso aparece na tela).
- `:focus-visible` com anel dourado no menu inteiro (antes o destaque de teclado era o do
  navegador), e o item da página atual ganhou um filete, para não depender só da cor.
- `?v=` de CSS e JS bumped para `20261009` em todas as páginas, para ninguém ficar com o
  cabeçalho velho na cache.

### Vitrine de dados de demonstração (era script solto, agora é comando)
- `ferramentas/semeia-demo.js` + **`npm run demo`**: 18 clientes de exemplo (e-mails em
  `@exemplo.com`), 5 produtos (dois abaixo do mínimo, de propósito, para o alerta de falta
  aparecer), 3 ordens de manutenção e 5 despesas, com cadastros e acessos espalhados nos
  últimos 33 dias — assim os KPIs, os gráficos e a variação semanal do painel abrem com
  número de verdade. Idempotente: rodar de novo não duplica nada e só escreve em
  `data/db.json` (gitignored).

---

## 🏆 5 de outubro de 2026 — Painel admin premium + cadastro indo direto para o banco

### Cadastro do cliente → banco de dados (automático, sem importar nada)
- Todo cadastro feito no site (página **Criar conta** ou a caixinha de login) entra
  **na hora** no banco do servidor (`data/db.json`), que é o banco que o painel admin lê.
- Em seguida, em segundo plano, o servidor manda uma **cópia para o Supabase**
  (tabela `clientes`) — o "banco de dados da nuvem" da barbearia. O cadastro do cliente
  nunca fica preso num único computador.
- **Se a internet cair, não se perde nada**: o cadastro entra numa fila (`sync.fila` no
  banco) e o servidor tenta de novo sozinho a cada 3 minutos, com espera crescente.
  O painel admin mostra a fila, o erro de cada item e o botão **Reenviar fila**.
- Site aberto **sem servidor** (duplo clique no HTML / hospedagem estática): agora o
  próprio navegador manda o cadastro para o Supabase (`sync-supabase.js`) e guarda a fila
  no navegador, tentando o reenvio a cada visita.
- Chave/URL/tabela configuráveis por `.env` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_TABELA`, `SUPABASE_ATIVO`) **ou** pela aba **Banco de Dados** do painel — sem
  tocar no código. A chave nunca é devolvida inteira para o navegador (máscara).
- **A senha não vai para a nuvem**: só nome, e-mail, perfil, origem, datas e nº de acessos.
- Arquivo novo: `ferramentas/supabase-tabela-clientes.sql` (cria a tabela + policies; o
  painel tem o botão "Copiar SQL da tabela").

### Painel admin premium (`admin.html` / `admin.js`)
- Visual novo: preto profundo + ouro, sidebar com ícones em SVG, cartões de vidro,
  foco acessível, animações discretas (`prefers-reduced-motion` respeitado) e layout
  responsivo com menu sanfonado no celular.
- **Dashboard com dados de verdade**: cartões de KPI (clientes, acessos 24h, retorno em
  30 dias, valor em estoque, despesas do mês, status da nuvem) com variação da semana,
  sparkline, gráfico de área (cadastros em 14 dias), gráfico de barras (acessos),
  rosca de origem dos cadastros, fluxo de atividade recente e lista "precisa de atenção".
  Gráficos são SVG desenhados no próprio `admin.js` — **sem CDN, sem biblioteca**.
- **Banco de Clientes**: busca por nome/e-mail/ID, filtro por perfil, filtro por status da
  nuvem, ordenação, paginação, **ficha do cliente** (dados + histórico de acessos dele) e
  **Exportar CSV** (abre direto no Excel em português).
- **Estoque, Manutenção e Despesas saem do `localStorage` e vão para o banco do servidor**:
  todos os admins passam a ver o mesmo número. Adicionado estoque mínimo (alerta de falta),
  histórico de entrada/saída por produto, custo/responsável na manutenção e despesas por
  categoria. Os dados antigos do navegador continuam funcionando (formato antigo é lido e
  atualizado no novo padrão automaticamente).
- **Aba Banco de Dados**: estado do banco local e da nuvem, contadores (enviados, na fila,
  falhas), fila com o erro de cada cadastro, botões **Testar conexão**, **Reenviar fila** e
  o formulário de configuração (ligar/desligar, URL, tabela, chave).
- Modais de verdade (abrem e fecham com Esc/clique fora), confirmação com HTML formatado e
  avisos no canto da tela (toast) em vez de `alert()`.

### Banco e API
- `db.js` → banco na versão 3 com `produtos`, `manutencoes`, `despesas`, `sync` (fila +
  estatísticas), `transacionar()` (escrita serializada) e `calcularMetricas()`.
- Rotas novas (só admin): `GET /api/admin/metricas`, `GET /api/admin/usuarios/:id`,
  `GET|POST /api/admin/estoque`, `POST /api/admin/estoque/mov`, `DELETE /api/admin/estoque/:id`,
  `GET|POST /api/admin/manutencao`, `DELETE /api/admin/manutencao/:id`,
  `GET|POST /api/admin/despesas`, `DELETE /api/admin/despesas/:id`,
  `GET|POST /api/admin/supabase`, `POST /api/admin/supabase/teste`, `POST /api/admin/supabase/reenviar`.
- `GET /api/health` agora informa o estado do espelho (`espelho.ativo/tabela/pendentes`).
- Toda rota nova exige token de admin (cliente recebe `403`, visitante `401`) e `data/`
  continua bloqueada para download pelo navegador.
- Testes: `npm test` roda 88 verificações ponta a ponta contra um servidor descartável
  (cadastro → painel, métricas, estoque, despesas, nuvem/fila, re-espelho no login,
  segurança, senhas só em hash, arquivos protegidos). `npm run test:render` faz o
  `admin.js` inteiro rodar num DOM falso — se o painel quebrar no render, o teste quebra.

### Ajustes finais do mesmo dia (3 detalhes que faltavam)
- **Re-espelho no login**: se a linha do cliente no Supabase estiver velha (último envio há
  mais de 24 h) ou com falha, o `POST /api/auth/login` reagenda o reenvio — assim
  `ultimo_login` e `total_logins` não ficam congelados na data do cadastro.
- **Selo "atualizado há X minutos"** no topo do painel + **auto-refresh da aba aberta** a cada
  minuto (antes só o dashboard se atualizava). Quem deixa a aba de estoque ou a dos clientes
  aberta na tela vê os números mudarem sozinhos — sem F5.
- `ferramentas/teste-painel.js` e `ferramentas/teste-render-admin.js` entraram no repo (com
  `npm test`, `npm run test:nuvem`, `npm run test:render`, `npm run test:painel`) para a
  checagem não depender de arquivo solto fora do projeto.

### Nada foi quebrado
As rotas antigas (`/api/auth/*`, `/api/admin/usuarios`, `/api/admin/ia`, `/api/ia/*`,
`/api/health`) e todas as páginas continuam funcionando. Quem abrir o site sem servidor
usa o banco do navegador como antes — só que agora com o espelho na nuvem por cima.

---

## 🍌 18 de setembro de 2026 — Nano Banana (IA de imagem do Google)

### Novos arquivos
- `nano-banana.js` — módulo do servidor que chama a API Gemini Image (Nano Banana).
  Guarda a chave, monta os prompts de barbearia, faz fallback entre modelos e trata
  erros/bloqueios. Sem dependências externas (usa o `fetch` nativo do Node).
- `ia-gemini.js` — cliente no navegador que chama as rotas `/api/ia/*`, exibe a prévia
  e religa os botões de estilo do simulador (antes não tinham nenhuma função).
- `.env.example` — modelo comentado para ativar a IA. O `.env` real fica fora do Git.
- `NANO_BANANA.md` — guia de ativação (2 minutos), rotas, segurança e custos.

### Rotas de API adicionadas
- `GET /api/ia/status` — informa se a IA está ativa (não gasta cota).
- `POST /api/ia/simular` — gera a prévia do corte na foto do cliente.
- `POST /api/ia/analisar` — leitura facial (formato, simetria, tipo de cabelo).
- `POST /api/ia/chat` — Relo IA por modelo de texto real, com fallback local.

### Melhorias e proteções
- **Chave só no servidor**: o navegador nunca vê a `GEMINI_API_KEY`; o servidor passa a
  bloquear o download de qualquer arquivo `.env` (retorna 404).
- **Cota por visitante** (`IA_LIMITE_POR_HORA`) para proteger o crédito da API.
- **Validação antes da cota**: foto inválida ou pedido vazio retorna `400` sem gastar geração.
- **Fallback de modelo** automático entre as versões do Gemini Image.
- **Simulador**: prévia com comparação antes/depois, download da imagem e WhatsApp
  já preenchido com o corte escolhido.
- **Câmera IA**: após capturar, tocar numa recomendação gera a prévia do corte.
- **Chat**: usa modelo real quando a IA está ligada; caso contrário responde com as
  regras locais (o chat nunca fica mudo).

### Nada foi quebrado
Todas as rotas antigas (`/api/auth/*`, `/api/admin/*`, `/api/health`) e páginas
continuam funcionando. Sem a chave, o site roda em modo demonstrativo idêntico ao anterior.

---

## 📋 Resumo das Mudanças

Este documento descreve todas as atualizações realizadas no projeto da Barbearia Prumo em 22 de junho de 2026.

---

## ✨ Novas Funcionalidades

### 1. **Sistema de Autenticação de Clientes**

#### Arquivos Criados:
- `login.html` - Página de login para clientes
- `signup.html` - Página de cadastro de novos clientes
- `auth.js` - Script de autenticação com Supabase

#### Recursos:
- Autenticação segura com Supabase
- Validação de email e senha
- Criação de perfil de usuário automatizada
- Mensagens de erro e sucesso
- Redirecionamento automático após login

#### Como Usar:
1. Acesse `login.html` para fazer login
2. Ou acesse `signup.html` para criar uma nova conta
3. Após autenticação bem-sucedida, você será redirecionado para o dashboard

---

### 2. **Sistema de Feedback e Avaliações**

#### Arquivos Criados:
- `feedback.html` - Página de feedback e avaliações
- `feedback.js` - Script de gerenciamento de feedback

#### Recursos:
- Avaliação de barbeiros (1-5 estrelas)
- Avaliação do atendimento (1-5 estrelas)
- Comentários opcionais
- Visualização de feedbacks recentes
- Autenticação obrigatória para enviar feedback
- Sistema de rating interativo

#### Como Usar:
1. Acesse `feedback.html`
2. Faça login se não estiver autenticado
3. Selecione um barbeiro
4. Avalie o barbeiro e o atendimento
5. Adicione um comentário (opcional)
6. Clique em "Enviar Feedback"

---

### 3. **Integração da Nova Logo**

#### Logo Integrada:
- `assets/logo-gentleman.png` - Logo "The Gentleman's Cut"

#### Mudanças Visuais:
- Logo adicionada à navbar de todos os arquivos HTML principais
- Efeito de sombra dinâmica ao passar o mouse
- Dimensões otimizadas (40px de altura)
- Alinhamento perfeito com o texto "Style Relo Barber"

#### Arquivos Atualizados:
- `index.html`
- `servicos.html`
- `sobre.html`
- `contato.html`
- `ia-tryon.html`
- `style.css` (novos estilos para a logo)

---

## 🗄️ Atualizações do Banco de Dados (Supabase)

### Tabela: `feedbacks`

Criada nova tabela para armazenar feedbacks com a seguinte estrutura:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Identificador único (chave primária) |
| `user_id` | UUID | ID do usuário (referência a auth.users) |
| `barber_name` | TEXT | Nome do barbeiro avaliado |
| `rating_barber` | INTEGER | Avaliação do barbeiro (1-5) |
| `rating_service` | INTEGER | Avaliação do atendimento (1-5) |
| `comment` | TEXT | Comentário opcional do cliente |
| `created_at` | TIMESTAMP | Data e hora de criação |

#### Políticas de Segurança (RLS):
- Feedbacks são visíveis para todos os usuários
- Apenas usuários autenticados podem inserir feedbacks
- Validação de rating entre 1 e 5 em ambos os campos

---

## 🔗 Atualizações de Navegação

### Links Adicionados em Todos os Arquivos HTML:
1. **Link de Feedback** - Acesso à página de feedback
2. **Link de Login** - Substituiu o botão "Agendar" na navbar

### Estrutura de Navegação Atualizada:
```
Início → Serviços → Experimente com IA → Sobre → Feedback → Contato → Login
```

---

## 🎨 Ajustes de Estilo

### CSS Adicionado (`style.css`):
```css
.brand img {
  filter: drop-shadow(0 4px 12px rgba(245, 158, 11, 0.2));
  transition: filter 0.3s ease;
}

.brand:hover img {
  filter: drop-shadow(0 6px 16px rgba(245, 158, 11, 0.35));
}
```

### Cores Mantidas:
- **Ouro Primário**: `#f59e0b` (var(--gold))
- **Ouro Secundário**: `#fbbf24` (var(--gold-2))
- **Fundo Escuro**: `#070708` (var(--bg))
- **Superfície**: `#101014` (var(--surface))

---

## 🔐 Segurança

### Implementações de Segurança:
1. Autenticação com Supabase (padrão JWT)
2. Row Level Security (RLS) habilitado na tabela `feedbacks`
3. Validação de entrada em todos os formulários
4. Proteção contra XSS com escape de HTML
5. Senhas com mínimo de 6 caracteres

---

## 📱 Responsividade

Todas as novas páginas e componentes foram desenvolvidos com:
- Design mobile-first
- Breakpoints otimizados
- Testes em diferentes resoluções
- Navegação adaptativa

---

## 🚀 Como Testar

### 1. Teste de Autenticação:
```
1. Acesse login.html
2. Clique em "Crie uma agora"
3. Preencha o formulário de cadastro
4. Verifique se o usuário foi criado no Supabase
5. Faça login com as credenciais criadas
```

### 2. Teste de Feedback:
```
1. Acesse feedback.html
2. Verifique se o formulário está oculto (sem login)
3. Faça login
4. Verifique se o formulário aparece
5. Envie um feedback
6. Verifique se aparece na lista de feedbacks
```

### 3. Teste da Logo:
```
1. Acesse todos os arquivos HTML principais
2. Verifique se a logo aparece na navbar
3. Teste o efeito hover da logo
4. Verifique a responsividade em dispositivos móveis
```

---

## 📝 Próximos Passos Recomendados

1. **Dashboard de Usuário**: Criar página de dashboard para clientes visualizarem seus agendamentos
2. **Histórico de Feedbacks**: Permitir que usuários vejam seus próprios feedbacks
3. **Relatórios**: Criar seção administrativa para visualizar estatísticas de feedback
4. **Notificações**: Implementar sistema de notificações por email
5. **Integração com WhatsApp**: Conectar feedbacks com agendamentos

---

## 📞 Suporte

Para dúvidas ou problemas com as novas funcionalidades, entre em contato através de:
- Email: contato@estudioprumo.com
- WhatsApp: (41) 99999-9999

---

**Última atualização**: 22 de junho de 2026
**Versão**: 2.0.0


---

## 🆕 Atualização de 14/09/2026

### Aba "Sobre" virou "Equipe"
* A página agora mostra **apenas a equipe e a função de cada profissional** (história institucional e o bloco "Como funciona" saíram).
* Arquivo renomeado para `equipe.html`; o menu de todas as páginas passou a exibir **Equipe**.
* Novo integrante: **Marcos — Gerente de Vendas de Produtos da barbearia**.

### Nova oferta: "Dia do Noivo" — R$ 250,00
* Pacote com corte personalizado, barboterapia completa (navalha e toalha quente), sobrancelha,
  hidratação/finalização e horário reservado.
* Divulgado na página inicial (`#dia-do-noivo`), na tabela de preços de `servicos.html`, no
  formulário de `contato.html` e nas respostas da Relo IA (`chat-ia.js`).

### Início mais dinâmico
* Texto reduzido (de ~700 para ~250 palavras visíveis), sem blocos repetidos.
* Vitrine de 3 serviços com foto, preço e botão de agendamento.
* Faixa de estilos animada, contadores que sobem e entrada suave dos blocos ao rolar a página.
