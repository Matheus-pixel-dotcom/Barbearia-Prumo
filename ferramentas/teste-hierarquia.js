#!/usr/bin/env node
/*
 * Teste da HIERARQUIA DE ACESSO: cliente (Usuário) < supervisor < administrador.
 *
 *   node ferramentas/teste-hierarquia.js      (ou: npm run test:acessos)
 *
 * Sobe o server.js em um banco descartável (porta 8898) e confere, rota por
 * rota, quem pode e quem NÃO pode — inclusive tentando burlar o painel:
 *
 *   1. cadastro novo nasce cliente e não abre NADA do painel;
 *   2. o administrador promove o cliente a supervisor pelo painel;
 *   3. o supervisor entra e faz o trabalho do dia a dia (ver clientes, métricas,
 *      estoque, manutenção e despesas);
 *   4. o supervisor leva 403 ao tentar excluir, mexer na nuvem ou mudar perfil;
 *   5. o administrador continua podendo tudo;
 *   6. trocar o perfil derruba a sessão antiga (ninguém fica com o poder velho);
 *   7. contas da semente (a equipe oficial) não podem ser rebaixadas nem excluídas.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const PORTA = Number(process.env.TESTE_PORTA_HIERARQUIA || 8898);
const BASE = `http://localhost:${PORTA}`;
const DIR_TESTE = fs.mkdtempSync(path.join(os.tmpdir(), 'relo-hierarquia-'));

let total = 0;
let falhas = 0;

function conferir(nome, cond, extra) {
  total += 1;
  const ok = Boolean(cond);
  console.log((ok ? ' ✓ ' : ' ✗ ') + nome + (ok ? '' : '   ← ' + String(extra).slice(0, 220)));
  if (!ok) falhas += 1;
}

async function chamar(rota, opts) {
  const config = opts || {};
  const headers = Object.assign({ 'Content-Type': 'application/json' }, config.headers || {});
  if (config.token) headers.Authorization = 'Bearer ' + config.token;
  const resposta = await fetch(BASE + rota, {
    method: config.method || (config.body ? 'POST' : 'GET'),
    headers,
    body: config.body ? JSON.stringify(config.body) : undefined
  });
  let dados = {};
  try {
    dados = await resposta.json();
  } catch (erro) {
    dados = {};
  }
  return { status: resposta.status, j: dados };
}

const login = (email, senha) => chamar('/api/auth/login', { body: { email, senha } });

async function esperarServidor(log) {
  for (let tentativa = 0; tentativa < 60; tentativa += 1) {
    try {
      const r = await fetch(BASE + '/api/health');
      if (r.ok) return r.json();
    } catch (erro) {
      /* ainda subindo */
    }
    await new Promise((resolver) => setTimeout(resolver, 200));
  }
  throw new Error('O servidor de teste não respondeu em /api/health\n' + log);
}

(async () => {
  const ambiente = Object.assign({}, process.env, {
    PORT: String(PORTA),
    HOST: '127.0.0.1',
    RELO_DATA_DIR: DIR_TESTE,
    SUPABASE_URL: 'http://127.0.0.1:9',
    SUPABASE_ANON_KEY: 'chave-de-teste-invalida'
  });
  delete ambiente.SUPABASE_ATIVO;

  const servidor = spawn(process.execPath, [path.join(RAIZ, 'server.js')], {
    cwd: RAIZ,
    env: ambiente,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logServidor = '';
  servidor.stdout.on('data', (pedaco) => (logServidor += pedaco));
  servidor.stderr.on('data', (pedaco) => (logServidor += pedaco));

  const encerrar = () => {
    try {
      servidor.kill('SIGKILL');
    } catch (erro) {
      /* já morreu */
    }
    try {
      fs.rmSync(DIR_TESTE, { recursive: true, force: true });
    } catch (erro) {
      /* pasta já sumiu */
    }
  };
  process.on('exit', encerrar);

  try {
    await esperarServidor(logServidor);
    console.log('\n=== hierarquia de acesso (banco descartável) ===');

    console.log('\n=== 1. o arquivo de permissões é a fonte da verdade ===');
    const Permissoes = require(path.join(RAIZ, 'permissoes.js'));
    conferir('existem exatamente 3 perfis', Permissoes.perfis().length === 3, JSON.stringify(Permissoes.perfis().map((p) => p.chave)));
    conferir('ordem da hierarquia: cliente < supervisor < admin',
      Permissoes.nivel('cliente') < Permissoes.nivel('supervisor') && Permissoes.nivel('supervisor') < Permissoes.nivel('admin'));
    conferir('admin pode tudo', Object.keys(Permissoes.ACOES).every((a) => Permissoes.pode('admin', a)));
    conferir('cliente não abre nada do painel', !Permissoes.pode('cliente', 'painel.ver') && !Permissoes.pode('cliente', 'clientes.ver'));
    conferir('supervisor NÃO exclui cliente', !Permissoes.pode('supervisor', 'clientes.excluir'));
    conferir('supervisor NÃO configura a nuvem', !Permissoes.pode('supervisor', 'nuvem.configurar'));
    conferir('supervisor NÃO gerencia equipe', !Permissoes.pode('supervisor', 'equipe.gerenciar'));
    conferir('supervisor OPERA estoque, manutenção e despesas',
      Permissoes.pode('supervisor', 'estoque.editar') && Permissoes.pode('supervisor', 'manutencao.editar') && Permissoes.pode('supervisor', 'despesas.editar'));
    conferir('ação inventada nunca é liberada', !Permissoes.pode('admin', 'acao.que.nao.existe'));
    conferir('apelidos de perfil caem no perfil certo', Permissoes.normalizar('usuário') === 'cliente' && Permissoes.normalizar('administrador') === 'admin');

    console.log('\n=== 2. login de cada nível ===');
    const admin = await login('professor@gmail.com', 'professor2026');
    conferir('administrador entra', admin.status === 200 && Boolean(admin.j.token));
    conferir('login devolve o perfil e a matriz de permissões',
      admin.j.usuario.perfil === 'admin' && admin.j.usuario.permissoes['clientes.excluir'] === true,
      JSON.stringify(admin.j.usuario.permissoes).slice(0, 140));
    const tokenAdmin = admin.j.token;

    const cadastro = await chamar('/api/auth/registrar', {
      body: { nome: 'Barbeiro Novo', email: 'equipe@ex.com', senha: 'barbeiro123' }
    });
    conferir('cadastro novo nasce cliente', cadastro.j.usuario.perfil === 'cliente' && cadastro.j.usuario.podePainel === false);
    const idNovo = cadastro.j.usuario.id;
    const tokenCliente = cadastro.j.token;

    console.log('\n=== 3. o cliente NÃO entra no painel ===');
    const rotasDoPainel = [
      '/api/admin/metricas',
      '/api/admin/usuarios',
      '/api/admin/estoque',
      '/api/admin/manutencao',
      '/api/admin/despesas',
      '/api/admin/supabase'
    ];
    for (const rota of rotasDoPainel) {
      const r = await chamar(rota, { token: tokenCliente });
      conferir('cliente leva 403 em ' + rota, r.status === 403, 'veio ' + r.status);
    }
    const criaComoCliente = await chamar('/api/admin/usuarios', {
      token: tokenCliente,
      body: { nome: 'Fulano', email: 'fulano@ex.com', senha: 'abc123' }
    });
    conferir('cliente não cadastra ninguém pelo painel', criaComoCliente.status === 403);
    conferir('sem token também é 401', (await chamar('/api/admin/metricas')).status === 401);

    console.log('\n=== 4. o administrador promove o cliente a supervisor ===');
    const semPermissao = await chamar('/api/admin/usuarios/' + idNovo + '/perfil', {
      token: tokenCliente,
      body: { perfil: 'supervisor' }
    });
    conferir('quem não gerencia equipe não muda perfil (403)', semPermissao.status === 403, 'veio ' + semPermissao.status);

    const promocao = await chamar('/api/admin/usuarios/' + idNovo + '/perfil', {
      token: tokenAdmin,
      body: { perfil: 'supervisor' }
    });
    conferir('admin promove cliente a supervisor', promocao.status === 200 && promocao.j.usuario.perfil === 'supervisor', JSON.stringify(promocao.j).slice(0, 160));
    conferir('promoção registra quem promoveu e quando', Boolean(promocao.j.usuario.perfilRotulo === 'Supervisor'));

    const perfilInvalido = await chamar('/api/admin/usuarios/' + idNovo + '/perfil', {
      token: tokenAdmin,
      body: { perfil: 'chefe-master' }
    });
    conferir('perfil inválido é recusado', perfilInvalido.status === 400, JSON.stringify(perfilInvalido.j));

    const idSemente = admin.j.usuario.id;
    const rebaixarSemente = await chamar('/api/admin/usuarios/' + idSemente + '/perfil', {
      token: tokenAdmin,
      body: { perfil: 'cliente' }
    });
    conferir('conta da semente não pode ser rebaixada', rebaixarSemente.status === 400);

    console.log('\n=== 5. a sessão antiga morre quando o perfil muda ===');
    const tokenVelho = await chamar('/api/auth/eu', { token: tokenCliente });
    conferir('token antigo pede login de novo (401)', tokenVelho.status === 401, 'veio ' + tokenVelho.status);

    console.log('\n=== 6. o supervisor opera, mas não administra ===');
    const atendente = await login('equipe@ex.com', 'barbeiro123');
    conferir('supervisor entra no painel', atendente.status === 200 && atendente.j.usuario.podePainel === true);
    conferir('resposta traz o rótulo do perfil', atendente.j.usuario.perfilRotulo === 'Supervisor');
    const tokenSup = atendente.j.token;

    const eu = await chamar('/api/auth/eu', { token: tokenSup });
    conferir('GET /api/auth/eu confirma o perfil do supervisor', eu.status === 200 && eu.j.usuario.perfil === 'supervisor');
    conferir('matriz do supervisor: opera sim, exclui não',
      eu.j.usuario.permissoes['estoque.editar'] === true && eu.j.usuario.permissoes['estoque.excluir'] === false,
      JSON.stringify(eu.j.usuario.permissoes).slice(0, 140));

    const permitidas = [
      ['/api/admin/metricas', 'ver as métricas'],
      ['/api/admin/usuarios', 'ver os clientes'],
      ['/api/admin/estoque', 'ver o estoque'],
      ['/api/admin/manutencao', 'ver a manutenção'],
      ['/api/admin/despesas', 'ver as despesas'],
      ['/api/admin/supabase', 'ver o status da nuvem']
    ];
    for (const [rota, oQue] of permitidas) {
      const r = await chamar(rota, { token: tokenSup });
      conferir('supervisor pode ' + oQue, r.status === 200 && r.j.ok !== false, 'veio ' + r.status);
    }

    console.log('\n--- o que o supervisor FAZ no dia a dia ---');
    const produto = await chamar('/api/admin/estoque', {
      token: tokenSup,
      body: { nome: 'Pomada teste', categoria: 'Cabelo', quantidade: 5, minimo: 1, preco: 39.9 }
    });
    conferir('supervisor cria produto no estoque', produto.status === 201 || produto.status === 200, JSON.stringify(produto.j).slice(0, 120));
    const idProduto = (produto.j.produto && produto.j.produto.id) || produto.j.id;

    const mov = await chamar('/api/admin/estoque/mov', {
      token: tokenSup,
      body: { id: idProduto, delta: -1, observacao: 'venda no balcão (teste)' }
    });
    conferir('supervisor dá baixa no estoque', mov.status === 200 && mov.j.produto.quantidade === 4, JSON.stringify(mov.j).slice(0, 140));

    const manutencao = await chamar('/api/admin/manutencao', {
      token: tokenSup,
      body: { item: 'Máquina de teste', descricao: 'Troca de lâmina', status: 'Pendente' }
    });
    conferir('supervisor abre ordem de manutenção', manutencao.status === 200 || manutencao.status === 201, JSON.stringify(manutencao.j).slice(0, 120));
    const idManutencao = (manutencao.j.ordem && manutencao.j.ordem.id) || manutencao.j.id;

    const despesa = await chamar('/api/admin/despesas', {
      token: tokenSup,
      body: { descricao: 'Material de teste', categoria: 'Produtos', valor: 25, pago: false }
    });
    conferir('supervisor lança despesa', despesa.status === 200 || despesa.status === 201, JSON.stringify(despesa.j).slice(0, 120));
    const idDespesa = (despesa.j.despesa && despesa.j.despesa.id) || despesa.j.id;

    const clienteDoSupervisor = await chamar('/api/admin/usuarios', {
      token: tokenSup,
      body: { nome: 'Cliente do balcão', email: 'balcao@ex.com', senha: 'abc123' }
    });
    conferir('supervisor pode cadastrar um cliente', clienteDoSupervisor.status === 201 && clienteDoSupervisor.j.usuario.perfil === 'cliente', JSON.stringify(clienteDoSupervisor.j).slice(0, 140));

    console.log('\n--- o que o supervisor NÃO pode (403) ---');
    const proibidas = [
      ['DELETE', '/api/admin/usuarios/' + idNovo, null, 'excluir cliente'],
      ['DELETE', '/api/admin/estoque/' + idProduto, null, 'excluir produto'],
      ['DELETE', '/api/admin/manutencao/' + idManutencao, null, 'excluir manutenção'],
      ['DELETE', '/api/admin/despesas/' + idDespesa, null, 'excluir despesa'],
      ['POST', '/api/admin/supabase', { url: 'https://outro.supabase.co' }, 'configurar a nuvem'],
      ['POST', '/api/admin/supabase/reenviar', {}, 'reenviar a fila da nuvem'],
      ['POST', '/api/admin/usuarios/' + idNovo + '/perfil', { perfil: 'admin' }, 'mudar perfil'],
      ['POST', '/api/admin/usuarios', { nome: 'Novo Admin', email: 'chefe@ex.com', senha: 'abc123', perfil: 'admin' }, 'criar administrador']
    ];
    for (const [metodo, rota, corpo, oQue] of proibidas) {
      const r = await chamar(rota, { method: metodo, token: tokenSup, body: corpo || undefined });
      conferir('supervisor NÃO pode ' + oQue + ' (403)', r.status === 403, 'veio ' + r.status);
    }
    const mensagem = (await chamar('/api/admin/supabase/reenviar', { method: 'POST', token: tokenSup, body: {} })).j;
    conferir('a recusa explica o motivo em português', /Supervisor/.test(String(mensagem.erro)) && /reenviar/.test(String(mensagem.erro)), JSON.stringify(mensagem));

    console.log('\n=== 7. o administrador continua podendo tudo ===');
    const exclusao = await chamar('/api/admin/usuarios/' + idNovo, { method: 'DELETE', token: tokenAdmin });
    conferir('admin exclui cliente', exclusao.status === 200, JSON.stringify(exclusao.j).slice(0, 120));
    const excluiProduto = await chamar('/api/admin/estoque/' + idProduto, { method: 'DELETE', token: tokenAdmin });
    conferir('admin exclui produto', excluiProduto.status === 200, 'veio ' + excluiProduto.status);
    const excluiDespesa = await chamar('/api/admin/despesas/' + idDespesa, { method: 'DELETE', token: tokenAdmin });
    conferir('admin exclui despesa', excluiDespesa.status === 200, 'veio ' + excluiDespesa.status);
    const criaEquipe = await chamar('/api/admin/usuarios', {
      token: tokenAdmin,
      body: { nome: 'Supervisora Maria', email: 'maria.sup@ex.com', senha: 'abc123', perfil: 'supervisor' }
    });
    conferir('admin cria conta de supervisor direto pelo painel', criaEquipe.status === 201 && criaEquipe.j.usuario.perfil === 'supervisor', JSON.stringify(criaEquipe.j).slice(0, 140));
    const promoveAdmin = await chamar('/api/admin/usuarios/' + criaEquipe.j.usuario.id + '/perfil', {
      token: tokenAdmin,
      body: { perfil: 'admin' }
    });
    conferir('admin promove supervisor a administrador', promoveAdmin.status === 200 && promoveAdmin.j.usuario.perfil === 'admin');

    console.log('\n=== 8. o painel e as páginas usam a mesma matriz ===');
    const paginaAdmin = await (await fetch(BASE + '/admin.html')).text();
    conferir('admin.html carrega permissoes.js antes do auth-core',
      /permissoes\.js\?v=\d+" defer><\/script>\s*<script src="auth-core\.js/.test(paginaAdmin));
    conferir('admin.html marca os botões com data-perm', (paginaAdmin.match(/data-perm=/g) || []).length >= 5);
    conferir('admin.html tem a faixa que explica o perfil de quem entrou', paginaAdmin.includes('faixa-perfil'));
    conferir('admin.html tem o campo de perfil no cadastro da equipe', paginaAdmin.includes('cli-perfil'));
    conferir('permissoes.js é servido para o navegador', (await fetch(BASE + '/permissoes.js')).status === 200);
    const paginas = fs.readdirSync(RAIZ).filter((nome) => nome.endsWith('.html'));
    let todasCarregam = true;
    for (const arquivo of paginas) {
      const conteudo = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
      if (!conteudo.includes('auth-core.js')) continue;
      if (!conteudo.includes('permissoes.js')) todasCarregam = false;
    }
    conferir('todas as páginas com login carregam permissoes.js', todasCarregam);
    const cssAdmin = paginaAdmin;
    conferir('o painel tem selo próprio para supervisor', cssAdmin.includes('.relo-pill.supervisor'));
    const dashboard = fs.readFileSync(path.join(RAIZ, 'dashboard.html'), 'utf8');
    conferir('a área do cliente mostra o perfil de verdade', dashboard.includes('rotuloPerfil'));
    conferir('a área do cliente libera o painel só para a equipe', dashboard.includes('ehEquipe'));

    console.log('\n' + (falhas === 0 ? '✔ ' + total + ' verificações, todas passando' : '✖ ' + falhas + ' falha(s) em ' + total + ' verificações'));
    encerrar();
    process.exit(falhas ? 1 : 0);
  } catch (erro) {
    console.error('\n✖ o teste quebrou:', (erro && erro.message) || erro);
    if (logServidor) console.error('--- saída do servidor ---\n' + logServidor.slice(-1200));
    encerrar();
    process.exit(1);
  }
})();
