#!/usr/bin/env node
/*
 * Teste ponta a ponta do banco de clientes + painel admin.
 *
 *   node ferramentas/teste-painel.js        (ou: npm run test)
 *
 * O que ele faz sozinho, sem depender de nada instalado:
 *   1. sobe o server.js NUM BANCO DESCARTÁVEL (pasta temporária), porta 8899;
 *   2. aponta o Supabase para um endereço impossível, para testar a fila de
 *      reenvio SEM mandar cliente de teste para a nuvem de verdade;
 *   3. confere cadastro → painel, métricas, estoque, manutenção, despesas,
 *      espelho na nuvem, segurança (401/403), senha só em hash e arquivos
 *      de data/ inacessíveis pelo navegador;
 *   4. derruba o servidor e apaga a pasta temporária.
 *
 * Para testar contra o SEU Supabase de verdade (cria/atualiza linhas reais na
 * tabela clientes):  SUPABASE_LIVE=1 npm run test
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const PORTA = Number(process.env.TESTE_PORTA || 8899);
const BASE = `http://localhost:${PORTA}`;
const VIVO = process.env.SUPABASE_LIVE === '1';
const DIR_TESTE = fs.mkdtempSync(path.join(os.tmpdir(), 'relo-teste-'));

let total = 0;
let falhas = 0;
let tokenAdmin = '';

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
  else if (config.auth !== false && tokenAdmin) headers.Authorization = 'Bearer ' + tokenAdmin;
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

async function esperarServidor(noServidor) {
  for (let tentativa = 0; tentativa < 60; tentativa += 1) {
    try {
      const r = await fetch(BASE + '/api/health');
      if (r.ok) return r.json();
    } catch (erro) {
      /* ainda subindo */
    }
    await new Promise((resolver) => setTimeout(resolver, 200));
  }
  throw new Error('O servidor de teste não respondeu em /api/health' + (noServidor ? '\n' + noServidor : ''));
}

(async () => {
  const ambiente = Object.assign({}, process.env, {
    PORT: String(PORTA),
    HOST: '127.0.0.1',
    RELO_DATA_DIR: DIR_TESTE,
    // sem isto, o servidor usaria o projeto real do repositório
    SUPABASE_URL: VIVO ? process.env.SUPABASE_URL : 'http://127.0.0.1:9',
    SUPABASE_ANON_KEY: VIVO ? process.env.SUPABASE_ANON_KEY : 'chave-de-teste-invalida'
  });
  delete ambiente.SUPABASE_ATIVO;
  if (!ambiente.SUPABASE_URL) delete ambiente.SUPABASE_URL;
  if (!ambiente.SUPABASE_ANON_KEY) delete ambiente.SUPABASE_ANON_KEY;

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
      /* pasta de teste sumiu */
    }
  };
  process.on('exit', encerrar);

  try {
    const saude = await esperarServidor(logServidor);
    console.log('\n=== servidor de teste (banco descartável: ' + path.relative(os.tmpdir(), DIR_TESTE) + ') ===');
    conferir('GET /api/health responde com o banco vazio', saude.ok === true && saude.usuarios === 8, JSON.stringify(saude));
    conferir('semente criou os 8 administradores', saude.administradores === 8);
    conferir('health informa o estado do espelho na nuvem', Boolean(saude.espelho), JSON.stringify(saude.espelho));

    console.log('\n=== 1. cadastro do cliente entra no banco automaticamente ===');
    const novo = await chamar('/api/auth/registrar', {
      auth: false,
      body: { nome: 'Lucas Ferreira', email: 'lucas@ex.com', senha: 'cabelo123' }
    });
    conferir('POST /api/auth/registrar devolve 201 + token', novo.status === 201 && Boolean(novo.j.token), JSON.stringify(novo.j));
    conferir('perfil vem como cliente (e-mail fora da lista de admins)', novo.j.usuario && novo.j.usuario.perfil === 'cliente');
    conferir('origem = cadastro (veio do site)', novo.j.usuario && novo.j.usuario.origem === 'cadastro');
    conferir('cadastro traz o status do espelho', Boolean(novo.j.usuario && novo.j.usuario.sincronizacao), JSON.stringify(novo.j.usuario));

    tokenAdmin = (
      await chamar('/api/auth/login', { auth: false, body: { email: 'professor@gmail.com', senha: 'professor2026' } })
    ).j.token;
    conferir('admin loga e recebe token', Boolean(tokenAdmin));

    const lista = await chamar('/api/admin/usuarios');
    const cliente = (lista.j.usuarios || []).find((u) => u.email === 'lucas@ex.com');
    conferir('painel do admin já mostra o cliente', Boolean(cliente), JSON.stringify(lista.j).slice(0, 120));
    conferir('contador de clientes bate', lista.j.totalClientes === 1, 'totalClientes=' + lista.j.totalClientes);
    conferir('histórico registrou o cadastro', (lista.j.logins || []).some((l) => l.email === 'lucas@ex.com' && l.origem === 'cadastro'));
    const senhaVazando = JSON.stringify(lista.j).match(/cabelo123|[a-f0-9]{64}/);
    conferir('a API não devolve hash nem senha', !senhaVazando, String(senhaVazando));

    console.log('\n=== 2. métricas do painel premium ===');
    const metricas = await chamar('/api/admin/metricas');
    conferir('GET /api/admin/metricas', metricas.status === 200 && metricas.j.ok === true);
    conferir('série de 14 dias para o gráfico', Array.isArray(metricas.j.serie) && metricas.j.serie.length === 14);
    conferir('cadastro de hoje aparece no gráfico', metricas.j.serie[13].cadastros === 1, JSON.stringify(metricas.j.serie[13]));
    conferir('admin da semente NÃO infla "novos cadastros"', metricas.j.novos7 === 1, 'novos7=' + metricas.j.novos7);
    conferir('resumo da nuvem nas métricas', Boolean(metricas.j.sincronizacao), JSON.stringify(metricas.j.sincronizacao));
    conferir('atividade recente preenchida', (metricas.j.atividade || []).length > 0);
    const ficha = await chamar('/api/admin/usuarios/' + cliente.id);
    conferir('ficha do cliente com histórico', ficha.status === 200 && ficha.j.usuario.email === 'lucas@ex.com' && Array.isArray(ficha.j.acessos), JSON.stringify(ficha.j).slice(0, 120));

    console.log('\n=== 3. estoque, manutenção e despesas no banco do servidor ===');
    const produto = await chamar('/api/admin/estoque', {
      body: { nome: 'Pomada Matte', categoria: 'Cabelo', quantidade: 10, preco: 49.9, minimo: 4 }
    });
    conferir('criar produto', produto.status === 201 && produto.j.produto.quantidade === 10, JSON.stringify(produto.j));
    const mov = await chamar('/api/admin/estoque/mov', { body: { id: produto.j.produto.id, delta: -7, observacao: 'venda' } });
    conferir('saída de 7 deixa 3 unidades', mov.j.produto && mov.j.produto.quantidade === 3, JSON.stringify(mov.j));
    conferir('movimento fica no histórico do produto', mov.j.produto.movimentos.length === 1 && mov.j.produto.movimentos[0].tipo === 'saida');
    const estoque = await chamar('/api/admin/estoque');
    conferir('listagem traz produto + valor total', estoque.j.produtos.length === 1 && estoque.j.valorTotal > 100, JSON.stringify(estoque.j).slice(0, 140));
    const editar = await chamar('/api/admin/estoque', {
      body: { id: produto.j.produto.id, nome: 'Pomada Matte Pro', categoria: 'Cabelo', quantidade: 5, preco: 55, minimo: 2 }
    });
    conferir('editar produto pelo mesmo id', editar.j.produto && editar.j.produto.nome === 'Pomada Matte Pro');
    await chamar('/api/admin/estoque/mov', { body: { id: produto.j.produto.id, delta: -4 } });
    const metricasEstoque = await chamar('/api/admin/metricas');
    conferir('estoque abaixo do mínimo vira alerta', metricasEstoque.j.estoque.abaixoDoMinimo.length === 1, JSON.stringify(metricasEstoque.j.estoque));
    conferir(
      'saída maior que o estoque trava em zero (não fica negativa)',
      (await chamar('/api/admin/estoque/mov', { body: { id: produto.j.produto.id, delta: -999 } })).j.produto.quantidade === 0
    );
    const manutencao = await chamar('/api/admin/manutencao', { body: { item: 'Máquina 01', descricao: 'Lâmina', status: 'Pendente', valor: 80 } });
    conferir('registrar manutenção', manutencao.status === 201 && manutencao.j.manutencao.valor === 80);
    const status = await chamar('/api/admin/manutencao', { body: { id: manutencao.j.manutencao.id, status: 'Concluído' } });
    conferir('mudar status da manutenção', status.j.manutencao.status === 'Concluído');
    const despesa = await chamar('/api/admin/despesas', { body: { descricao: 'Luz', categoria: 'Energia / Água', valor: 210.55 } });
    conferir('registrar despesa', despesa.status === 201 && despesa.j.despesa.valor === 210.55);
    const despesas = await chamar('/api/admin/despesas');
    conferir('soma das despesas do mês', despesas.j.totalMes === 210.55, JSON.stringify(despesas.j).slice(0, 120));
    conferir('excluir despesa', (await chamar('/api/admin/despesas/' + despesa.j.despesa.id, { method: 'DELETE' })).status === 200);
    conferir('excluir de novo devolve 404', (await chamar('/api/admin/despesas/' + despesa.j.despesa.id, { method: 'DELETE' })).status === 404);
    conferir('produto sem nome é recusado', (await chamar('/api/admin/estoque', { body: { nome: '' } })).status === 400);

    console.log('\n=== 4. espelho na nuvem (fila, reenvio, config) ===');
    await new Promise((resolver) => setTimeout(resolver, 1200)); // deixa a tentativa em 2º plano acontecer
    const sync = await chamar('/api/admin/supabase');
    conferir('GET /api/admin/supabase', sync.status === 200 && sync.j.ok === true);
    conferir('a chave nunca volta inteira para o navegador', !JSON.stringify(sync.j).includes('chave-de-teste-invalida'), JSON.stringify(sync.j).slice(0, 160));
    conferir('devolve a máscara da chave', /••••/.test(String(sync.j.chaveMascara)), 'chaveMascara=' + sync.j.chaveMascara);
    conferir('mostra de onde vem a configuração', ['painel admin', '.env', 'padrão do projeto'].includes(sync.j.origem), 'origem=' + sync.j.origem);
    if (VIVO) {
      console.log('   (rodando com SUPABASE_LIVE=1: conferindo se a linha chegou de verdade)');
      const teste = await chamar('/api/admin/supabase/teste', { body: {} });
      conferir('conexão viva com o Supabase OK', teste.j.teste && teste.j.teste.ok === true, JSON.stringify(teste.j.teste));
      const sincronizado = (await chamar('/api/admin/usuarios')).j.usuarios.find((u) => u.email === 'lucas@ex.com');
      conferir('cadastro marcado como enviado para a nuvem', sincronizado.sincronizacao.estado === 'ok', JSON.stringify(sincronizado.sincronizacao));
    } else {
      conferir('nuvem fora do ar NÃO apaga o cadastro do site', (await chamar('/api/admin/usuarios')).j.totalClientes === 1);
      conferir('cadastro entra na fila de reenvio', sync.j.pendentes === 1 && sync.j.fila[0].email === 'lucas@ex.com', JSON.stringify(sync.j.fila));
      conferir('a fila guarda o erro encontrado', /fetch failed|ECONN|refusad/i.test(String(sync.j.ultimoErro)), 'ultimoErro=' + sync.j.ultimoErro);
      const reenvio = await chamar('/api/admin/supabase/reenviar', { body: {} });
      conferir('"Reenviar fila" força a tentativa na hora', reenvio.status === 200 && reenvio.j.processados >= 1, JSON.stringify(reenvio.j).slice(0, 140));
      conferir('continua na fila até conseguir', (await chamar('/api/admin/supabase')).j.pendentes === 1);
      const teste = await chamar('/api/admin/supabase/teste', { body: {} });
      conferir('teste de conexão falha com mensagem útil', teste.status === 200 && teste.j.teste.ok === false && Boolean(teste.j.teste.erro), JSON.stringify(teste.j.teste));
    }
    const desligar = await chamar('/api/admin/supabase', { body: { ativo: false } });
    conferir('desligar o espelho persiste', desligar.status === 200 && desligar.j.ativo === false, JSON.stringify(desligar.j).slice(0, 200));
    conferir('com o espelho desligado, nada é enviado (fila não cresce à toa)', (await chamar('/api/admin/supabase')).j.ativo === false);
    const religar = await chamar('/api/admin/supabase', { body: { ativo: true, tabela: 'clientes' } });
    conferir('religar o espelho', religar.status === 200 && religar.j.ativo === true);
    conferir('nome de tabela inválido é sanitizado', (await chamar('/api/admin/supabase', { body: { tabela: 'client; drop' } })).j.tabela === 'clientdrop');
    await chamar('/api/admin/supabase', { body: { tabela: VIVO ? process.env.SUPABASE_TABELA || 'clientes' : 'clientes' } });

    // "colar o bloco inteiro": o painel do Supabase mostra URL e chave em lugares
    // diferentes, então a gente aceita o texto cru e separa as partes sozinho
    if (!VIVO) {
      const payload = Buffer.from(JSON.stringify({ role: 'anon', ref: 'testeprojeto' })).toString('base64url');
      const chaveFake = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + payload + '.assinatura_de_teste_0123456789';
      const colar = await chamar('/api/admin/supabase', { body: { grudar: 'minha chave: ' + chaveFake + ' , e pronto' } });
      conferir('colar só a chave (com texto em volta) funciona', colar.status === 200 && colar.j.detectado && colar.j.detectado.temChave === true && colar.j.detectado.tipoChave === 'anon', JSON.stringify(colar.j).slice(0, 160));
      const vazou = JSON.stringify(colar.j);
      conferir('a chave colada não volta inteira para o navegador', !/eyJhbGciOi/.test(vazou) && Boolean(colar.j.chaveMascara), vazou.slice(0, 140));

      const urlAntes = (await chamar('/api/admin/supabase')).j.urlMascara;
      const camposVazios = await chamar('/api/admin/supabase', { body: { grudar: chaveFake, url: '', tabela: '' } });
      conferir('campo URL vazio não apaga a URL quando se cola o bloco', camposVazios.status === 200 && camposVazios.j.urlMascara === urlAntes, JSON.stringify(camposVazios.j).slice(0, 140));

      const outroProjeto = await chamar('/api/admin/supabase', { body: { grudar: 'https://outroprojeto1234.supabase.co' } });
      conferir('URL de outro projeto é barrada quando o .env fixa a nossa', outroProjeto.status === 409, JSON.stringify(outroProjeto.j).slice(0, 120));

      const lixo = await chamar('/api/admin/supabase', { body: { grudar: 'meu supabase é aquele de sempre' } });
      conferir('texto sem URL nem chave explica o que falta', lixo.status === 400 && /achei/.test(lixo.j.erro || ''), JSON.stringify(lixo.j).slice(0, 120));

      const publishable = await chamar('/api/admin/supabase', { body: { grudar: 'sb_publishable_AAAAAAAAAAAAAAAAAAAAAA-BBBBBBBBBBB' } });
      conferir('entende a chave nova (sb_publishable_…)', publishable.status === 200 && publishable.j.detectado.tipoChave === 'publishable', JSON.stringify(publishable.j.detectado));

      const serviceRole = await chamar('/api/admin/supabase', {
        body: {
          grudar: 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ role: 'service_role', ref: 'testeprojeto' })).toString('base64url') + '.assinatura_de_teste_0123456789'
        }
      });
      conferir('avisa quando a chave colada é a service_role', serviceRole.status === 200 && /service_role/.test(String(serviceRole.j.detectado.aviso)), JSON.stringify(serviceRole.j.detectado));
    }

    console.log('\n=== 5. atualizar o cadastro na nuvem quando o cliente volta ===');
    await chamar('/api/auth/login', { auth: false, body: { email: 'lucas@ex.com', senha: 'cabelo123' } });
    await new Promise((resolver) => setTimeout(resolver, 1000));
    const depoisDoLogin = (await chamar('/api/admin/usuarios')).j.usuarios.find((u) => u.email === 'lucas@ex.com');
    conferir('login atualiza totalLogins no banco do site', depoisDoLogin.totalLogins >= 2, JSON.stringify(depoisDoLogin).slice(0, 160));
    if (!VIVO) {
      conferir('login reagenda o reenvio da linha desatualizada', /fila|reenvio|pendente|erro/.test(JSON.stringify(depoisDoLogin.sincronizacao)), JSON.stringify(depoisDoLogin.sincronizacao));
    }

    console.log('\n=== 6. segurança ===');
    const loginCliente = await chamar('/api/auth/login', { auth: false, body: { email: 'lucas@ex.com', senha: 'cabelo123' } });
    conferir('cliente entra com a própria senha', loginCliente.status === 200);
    for (const rota of ['/api/admin/usuarios', '/api/admin/metricas', '/api/admin/estoque', '/api/admin/supabase', '/api/admin/despesas', '/api/admin/manutencao']) {
      const bloqueado = await chamar(rota, { token: loginCliente.j.token, auth: false });
      conferir('cliente comum bloqueado em ' + rota, bloqueado.status === 403, 'status=' + bloqueado.status);
    }
    conferir('anônimo: 401 no banco', (await chamar('/api/admin/supabase', { auth: false })).status === 401);
    conferir('anônimo: 401 nas métricas', (await chamar('/api/admin/metricas', { auth: false })).status === 401);
    conferir('não dá para usurpar e-mail de admin', (await chamar('/api/auth/registrar', { auth: false, body: { nome: 'Falso', email: 'professor@gmail.com', senha: '123456' } })).status === 409);
    conferir('admin da semente não é excluído', (await chamar('/api/admin/usuarios/' + lista.j.usuarios.find((u) => u.perfil === 'admin').id, { method: 'DELETE' })).status === 400);
    conferir('senha curta recusada', (await chamar('/api/auth/registrar', { auth: false, body: { nome: 'X', email: 'x@x.com', senha: '123' } })).status === 400);
    const xss = await chamar('/api/auth/registrar', { auth: false, body: { nome: '<img src=x onerror=alert(1)>', email: 'xss@ex.com', senha: 'abc123' } });
    conferir('nome com HTML é guardado cru (a tela escapa)', xss.status === 201);
    conferir('API devolve o texto sem interpretar HTML', (await chamar('/api/admin/usuarios')).j.usuarios.find((u) => u.email === 'xss@ex.com').nome === '<img src=x onerror=alert(1)>');
    for (let i = 0; i < 14; i += 1) {
      await chamar('/api/auth/login', { auth: false, body: { email: 'lucas@ex.com', senha: 'erradissima' } });
    }
    conferir('força-bruta é travada por e-mail', (await chamar('/api/auth/login', { auth: false, body: { email: 'lucas@ex.com', senha: 'cabelo123' } })).status === 429);

    console.log('\n=== 7. banco em disco + arquivos protegidos ===');
    const arquivo = path.join(DIR_TESTE, 'db.json');
    const bruto = fs.readFileSync(arquivo, 'utf8');
    const banco = JSON.parse(bruto);
    conferir('banco na versão 3 com as coleções novas', banco.versao === 3 && Array.isArray(banco.produtos) && Array.isArray(banco.despesas) && Array.isArray(banco.manutencoes) && Boolean(banco.sync));
    conferir('senha NUNCA em texto puro', !bruto.includes('cabelo123') && !bruto.includes('123456'));
    conferir('hash + salt presentes', /"senhaHash": "[a-f0-9]{64}"/.test(bruto) && /"salt"/.test(bruto));
    conferir('token de sessão não fica puro no banco', !bruto.includes(loginCliente.j.token));
    conferir('contas protegidas contra escrita indevida (aliases só na semente)', banco.usuarios.filter((u) => (u.aliases || []).length).length === 2);
    conferir('data/db.json não é baixável pelo navegador', (await fetch(BASE + '/data/db.json')).status === 404);
    conferir('.env não é baixável pelo navegador', (await fetch(BASE + '/.env')).status === 404);
    const pagina = await fetch(BASE + '/admin.html');
    const textoPagina = await pagina.text();
    conferir('admin.html servido', pagina.status === 200 && textoPagina.includes('Painel Premium'));
    conferir('painel carrega o módulo do espelho', textoPagina.includes('sync-supabase.js'));
    conferir('módulo do espelho acessível ao navegador', (await fetch(BASE + '/sync-supabase.js')).status === 200);
    conferir('SQL da tabela está no repo', fs.existsSync(path.join(RAIZ, 'ferramentas', 'supabase-tabela-clientes.sql')));
    for (const arquivoHtml of fs.readdirSync(RAIZ).filter((nome) => nome.endsWith('.html'))) {
      const conteudo = fs.readFileSync(path.join(RAIZ, arquivoHtml), 'utf8');
      if (!conteudo.includes('auth-core.js')) continue;
      conferir(arquivoHtml + ' carrega sync-supabase.js depois do auth-core', /auth-core\.js\?v=\d+" defer><\/script>\s*<script src="sync-supabase\.js/.test(conteudo.replace(/<script src="auth-hash[^>]*>\s*/g, '').replace(/<script src="admin-accounts[^>]*>\s*/g, '')));
    }

    console.log('\n' + (falhas === 0 ? '✔ ' + total + ' verificações, todas passando' : '✖ ' + falhas + ' falha(s) em ' + total + ' verificações'));
    if (!VIVO) console.log('   (dica: SUPABASE_LIVE=1 npm run test testa contra o seu Supabase real)');
    encerrar();
    process.exit(falhas ? 1 : 0);
  } catch (erro) {
    console.error('\n✖ o teste quebrou:', (erro && erro.message) || erro);
    if (logServidor) console.error('--- saída do servidor ---\n' + logServidor.slice(-1200));
    encerrar();
    process.exit(1);
  }
})();
