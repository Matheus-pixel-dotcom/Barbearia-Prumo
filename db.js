/*
 * Banco de dados do Style Relo Barber (servidor Node).
 *
 * Guarda tudo em um arquivo JSON (data/db.json) para não precisar de nenhuma
 * instalação extra — funciona offline e é fácil de abrir/inspecionar.
 *
 * Estrutura:
 *   usuarios    : cadastro de clientes e administradores (senha só como hash)
 *   sessoes     : tokens de login ativos (o token puro nunca é gravado)
 *   logins      : histórico de acessos (quem entrou, quando e de onde)
 *   produtos    : estoque (entrada/saída) — compartilhado entre os admins
 *   manutencoes : ordens de manutenção dos equipamentos
 *   despesas    : despesas operacionais
 *   sync        : fila do espelho no Supabase (cadastro que ainda não subiu)
 *
 * Antes, estoque/manutenção/despesas viviam no localStorage do navegador do admin
 * (ou seja: só existiam naquele computador). Agora vivem aqui e todos os admins
 * veem o mesmo dado.
 */
const fs = require('fs');
const path = require('path');
const ReloHash = require('./auth-hash');
const sementeAdmins = require('./admin-accounts');

const DATA_DIR = process.env.RELO_DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const VALIDADE_SESSAO_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const VERSAO = 3;

function bancoVazio() {
  return {
    versao: VERSAO,
    criadoEm: new Date().toISOString(),
    usuarios: [],
    sessoes: [],
    logins: [],
    produtos: [],
    manutencoes: [],
    despesas: [],
    sync: { fila: [], estatisticas: { enviado: 0, falha: 0, ultimoErro: null, ultimoEnvio: null } }
  };
}

function lista(valor) {
  return Array.isArray(valor) ? valor : [];
}

function normalizarEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function novoId(prefixo) {
  return (
    String(prefixo || 'id') +
    '_' +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 7)
  );
}

function carregar() {
  try {
    if (!fs.existsSync(DB_FILE)) return bancoVazio();
    const bruto = fs.readFileSync(DB_FILE, 'utf8');
    const dados = JSON.parse(bruto || '{}');
    const sync = dados.sync && typeof dados.sync === 'object' ? dados.sync : {};
    return {
      versao: dados.versao || VERSAO,
      criadoEm: dados.criadoEm || new Date().toISOString(),
      usuarios: lista(dados.usuarios),
      sessoes: lista(dados.sessoes),
      logins: lista(dados.logins),
      produtos: lista(dados.produtos),
      manutencoes: lista(dados.manutencoes),
      despesas: lista(dados.despesas),
      sync: {
        fila: lista(sync.fila),
        config: sync.config && typeof sync.config === 'object' ? sync.config : null,
        estatisticas:
          sync.estatisticas && typeof sync.estatisticas === 'object'
            ? sync.estatisticas
            : { enviado: 0, falha: 0, ultimoErro: null, ultimoEnvio: null }
      }
    };
  } catch (erro) {
    console.error('[db] Falha ao ler o banco, começando um novo:', erro.message);
    return bancoVazio();
  }
}

// Gravação atômica (arquivo temporário + rename) evita banco corrompido.
function salvar(db) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const temporario = DB_FILE + '.tmp';
  fs.writeFileSync(temporario, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(temporario, DB_FILE);
}

/*
 * transacionar(fn): leitura + alteração + gravação em série.
 * Usado por tudo que grava depois que a resposta HTTP já saiu (espelho do
 * Supabase, cron de reenvio), para duas escritas não se apagarem.
 */
let corrente = Promise.resolve();
function transacionar(fn) {
  const tarefa = corrente.then(async () => {
    const banco = carregar();
    const resultado = await fn(banco);
    salvar(banco);
    return resultado === undefined ? banco : resultado;
  });
  corrente = tarefa.catch(() => {});
  return tarefa;
}

function acharUsuario(db, email) {
  const alvo = normalizarEmail(email);
  if (!alvo) return null;
  return (
    db.usuarios.find((u) => normalizarEmail(u.email) === alvo) ||
    db.usuarios.find((u) => (u.aliases || []).some((a) => normalizarEmail(a) === alvo)) ||
    null
  );
}

// Cria as contas de administrador na primeira execução (ou se forem apagadas)
function semearAdmins(db) {
  let criados = 0;
  sementeAdmins.contas.forEach((conta) => {
    if (acharUsuario(db, conta.email)) return;
    db.usuarios.push({
      id: 'adm_' + ReloHash.sha256Hex(conta.email).slice(0, 10),
      nome: conta.nome,
      email: normalizarEmail(conta.email),
      aliases: conta.aliases || [],
      perfil: 'admin',
      origem: 'semente',
      salt: conta.salt,
      senhaHash: conta.senhaHash,
      criadoEm: new Date().toISOString(),
      ultimoLogin: null,
      totalLogins: 0,
      sync: null
    });
    criados += 1;
  });
  return criados;
}

function usuarioPublico(usuario) {
  if (!usuario) return null;
  const sync = usuario.sync && typeof usuario.sync === 'object' ? usuario.sync : null;
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    aliases: usuario.aliases || [],
    perfil: usuario.perfil === 'admin' ? 'admin' : 'cliente',
    origem: usuario.origem || 'cadastro',
    criadoEm: usuario.criadoEm || null,
    ultimoLogin: usuario.ultimoLogin || null,
    totalLogins: usuario.totalLogins || 0,
    sincronizacao: sync
      ? {
          estado: sync.estado === 'ok' || sync.estado === 'erro' ? sync.estado : 'pendente',
          em: sync.em || null,
          erro: sync.erro || null,
          tabela: sync.tabela || null
        }
      : { estado: 'pendente', em: null, erro: null, tabela: null }
  };
}

/* ------------------------------------------------------------------ */
/* Sessões e histórico de acessos                                      */
/* ------------------------------------------------------------------ */
function criarSessao(db, usuario) {
  const token = ReloHash.gerarToken();
  db.sessoes = (db.sessoes || []).filter((s) => new Date(s.expiraEm).getTime() > Date.now());
  db.sessoes.push({
    tokenHash: ReloHash.hashToken(token),
    usuarioId: usuario.id,
    criadoEm: new Date().toISOString(),
    expiraEm: new Date(Date.now() + VALIDADE_SESSAO_MS).toISOString()
  });
  return token;
}

function acharSessao(db, token) {
  if (!token) return null;
  const alvo = ReloHash.hashToken(token);
  const sessao = (db.sessoes || []).find((s) => s.tokenHash === alvo);
  if (!sessao) return null;
  if (new Date(sessao.expiraEm).getTime() < Date.now()) return null;
  return sessao;
}

function removerSessao(db, token) {
  const alvo = ReloHash.hashToken(token);
  db.sessoes = (db.sessoes || []).filter((s) => s.tokenHash !== alvo);
}

function normalizarSucesso(valor) {
  return valor === false ? false : true;
}

function registrarLogin(db, dados) {
  db.logins = db.logins || [];
  db.logins.unshift({
    email: normalizarEmail(dados.email),
    nome: dados.nome || '',
    perfil: dados.perfil || 'cliente',
    quando: new Date().toISOString(),
    sucesso: normalizarSucesso(dados.sucesso),
    origem: dados.origem || 'api'
  });
  db.logins = db.logins.slice(0, 300); // mantém os 300 acessos mais recentes
  return db.logins;
}

/* ------------------------------------------------------------------ */
/* Cadastro de usuário (site, painel admin ou semente)                 */
/* ------------------------------------------------------------------ */
function novoUsuario(db, dados) {
  const email = normalizarEmail(dados.email);
  const salt = ReloHash.saltParaEmail(email);
  const usuario = {
    id: (dados.prefixoId || 'cli') + '_' + ReloHash.sha256Hex(email).slice(0, 10),
    nome: String(dados.nome || '').trim(),
    email,
    aliases: [],
    perfil: dados.perfil === 'admin' ? 'admin' : 'cliente',
    origem: dados.origem || 'cadastro',
    salt,
    senhaHash: dados.senhaHash || ReloHash.hashPassword(salt, dados.senha || ''),
    criadoEm: new Date().toISOString(),
    ultimoLogin: dados.ultimoLogin === null ? null : new Date().toISOString(),
    totalLogins: dados.ultimoLogin === null ? 0 : 1,
    sync: null
  };
  db.usuarios.push(usuario);
  return usuario;
}

/* ------------------------------------------------------------------ */
/* Espelho do cadastro no Supabase — fila e status                     */
/* ------------------------------------------------------------------ */
function marcarSync(db, email, estado, extra) {
  const usuario = acharUsuario(db, email);
  const info = Object.assign({ estado, em: new Date().toISOString() }, extra || {});
  if (usuario) usuario.sync = info;
  return usuario ? usuario.sync : null;
}

function enfileirarSync(db, dados) {
  const email = normalizarEmail(dados && dados.email);
  if (!email) return db.sync.fila;
  db.sync.fila = db.sync.fila.filter((item) => item.email !== email);
  db.sync.fila.unshift({
    email,
    usuarioId: (dados && dados.usuarioId) || null,
    motivo: (dados && dados.motivo) || 'cadastro',
    tentativas: (dados && dados.tentativas) || 0,
    erro: (dados && dados.erro) || null,
    desde: new Date().toISOString(),
    proximaTentativa: new Date(Date.now() + 60 * 1000).toISOString()
  });
  db.sync.fila = db.sync.fila.slice(0, 200);
  return db.sync.fila;
}

// forcar = ignora a espera do backoff (usado pelo botão "Reenviar fila" do painel)
function pendentesSync(db, limite, forcar) {
  const agora = Date.now();
  return (db.sync && db.sync.fila ? db.sync.fila : [])
    .filter((item) => forcar || !item.proximaTentativa || new Date(item.proximaTentativa).getTime() <= agora)
    .slice(0, limite || 5);
}

function resumoSync(db) {
  const stats = (db.sync && db.sync.estatisticas) || {};
  return {
    pendentes: db.sync && db.sync.fila ? db.sync.fila.length : 0,
    enviado: stats.enviado || 0,
    falha: stats.falha || 0,
    ultimoErro: stats.ultimoErro || null,
    ultimoEnvio: stats.ultimoEnvio || null,
    fila: (db.sync && db.sync.fila ? db.sync.fila : []).slice(0, 20).map((item) => ({
      email: item.email,
      motivo: item.motivo,
      tentativas: item.tentativas || 0,
      erro: item.erro || null,
      desde: item.desde
    }))
  };
}

// Usado pelo cron de reenvio: falha adia a próxima tentativa (backoff).
function atualizarFilaSync(db, email, extra) {
  const alvo = normalizarEmail(email);
  if (!db.sync) db.sync = { fila: [], estatisticas: {} };
  if (!db.sync.estatisticas) db.sync.estatisticas = {};
  const item = (db.sync.fila || []).find((i) => normalizarEmail(i.email) === alvo);
  const dados = extra || {};
  if (dados.ok) {
    db.sync.fila = (db.sync.fila || []).filter((i) => normalizarEmail(i.email) !== alvo);
    db.sync.estatisticas.enviado = (db.sync.estatisticas.enviado || 0) + 1;
    db.sync.estatisticas.ultimoEnvio = new Date().toISOString();
    marcarSync(db, alvo, 'ok', { tabela: dados.tabela || null });
    return { sucesso: true };
  }
  const tentativas = ((item && item.tentativas) || 0) + 1;
  const espera = Math.min(60 * 60 * 1000, Math.pow(2, Math.min(tentativas, 6)) * 60 * 1000);
  const erro = dados.erro || 'falha desconhecida';
  db.sync.estatisticas.falha = (db.sync.estatisticas.falha || 0) + 1;
  db.sync.estatisticas.ultimoErro = erro;
  db.sync.estatisticas.ultimoErroEm = new Date().toISOString();
  marcarSync(db, alvo, 'erro', { erro });
  if (!item) {
    enfileirarSync(db, { email: alvo, motivo: 'reenvio', erro });
  } else {
    item.tentativas = tentativas;
    item.erro = erro;
    item.proximaTentativa = new Date(Date.now() + espera).toISOString();
  }
  return { sucesso: false, tentativas, espera };
}

function registrarEnvioSync(db, resultado, email) {
  if (!db.sync) db.sync = { fila: [], estatisticas: {} };
  if (!db.sync.estatisticas) db.sync.estatisticas = {};
  const stats = db.sync.estatisticas;
  if (resultado && resultado.ok) {
    stats.enviado = (stats.enviado || 0) + 1;
    stats.ultimoEnvio = new Date().toISOString();
    marcarSync(db, email, 'ok', { tabela: (resultado && resultado.tabela) || null });
    db.sync.fila = (db.sync.fila || []).filter((item) => item.email !== normalizarEmail(email));
  } else {
    stats.falha = (stats.falha || 0) + 1;
    stats.ultimoErro = (resultado && resultado.erro) || 'falha desconhecida';
    stats.ultimoErroEm = new Date().toISOString();
    marcarSync(db, email, 'erro', { erro: stats.ultimoErro });
    enfileirarSync(db, { email, motivo: 'reenvio', erro: stats.ultimoErro });
  }
  return stats;
}

/* ------------------------------------------------------------------ */
/* Estoque                                                             */
/* ------------------------------------------------------------------ */
function produtoPublico(produto) {
  return {
    id: produto.id,
    nome: produto.nome,
    categoria: produto.categoria || '',
    quantidade: Number(produto.quantidade || 0),
    preco: Number(produto.preco || 0),
    minimo: Number(produto.minimo || 0),
    atualizadoEm: produto.atualizadoEm || null,
    movimentos: lista(produto.movimentos).slice(0, 30)
  };
}

function ajustarProduto(db, produto, delta, observacao) {
  const anterior = Number(produto.quantidade || 0);
  const novo = Math.max(0, anterior + Number(delta || 0));
  produto.quantidade = novo;
  produto.atualizadoEm = new Date().toISOString();
  produto.movimentos = [
    {
      id: novoId('mov'),
      tipo: novo >= anterior ? 'entrada' : 'saida',
      quantidade: Math.abs(Number(delta || 0)),
      antes: anterior,
      depois: novo,
      observacao: String(observacao || '').slice(0, 120),
      quando: new Date().toISOString()
    }
  ].concat(lista(produto.movimentos)).slice(0, 60);
  return produto;
}

/* ------------------------------------------------------------------ */
/* Métricas do painel (calculadas no servidor, para o dashboard abrir rápido) */
/* ------------------------------------------------------------------ */
function chaveDoDia(dataIso) {
  const data = dataIso ? new Date(dataIso) : new Date();
  if (isNaN(data.getTime())) return null;
  return data.toISOString().slice(0, 10);
}

function serieDias(dias) {
  const saida = [];
  const hoje = new Date();
  hoje.setHours(12, 0, 0, 0);
  for (let i = dias - 1; i >= 0; i -= 1) {
    const dia = new Date(hoje.getTime() - i * 24 * 60 * 60 * 1000);
    saida.push({ dia: dia.toISOString().slice(0, 10), data: dia });
  }
  return saida;
}

function calcularMetricas(banco) {
  const agora = Date.now();
  const dia14 = serieDias(14);
  const mapaCadastros = new Map(dia14.map((item) => [item.dia, 0]));
  const mapaAcessos = new Map(dia14.map((item) => [item.dia, 0]));

  let novos7 = 0;
  let novos30 = 0;
  let ativos30 = 0;
  const origens = {};

  (banco.usuarios || []).forEach((u) => {
    const ehCliente = u.perfil !== 'admin';
    const criado = u.criadoEm ? new Date(u.criadoEm).getTime() : 0;
    if (criado) {
      // Só os clientes contam nos gráficos de cadastro — as contas de admin da
      // semente nascem todas no primeiro boot e distorceriam o número.
      if (ehCliente) {
        const chave = chaveDoDia(u.criadoEm);
        if (mapaCadastros.has(chave)) mapaCadastros.set(chave, mapaCadastros.get(chave) + 1);
        if (agora - criado <= 7 * 864e5) novos7 += 1;
        if (agora - criado <= 30 * 864e5) novos30 += 1;
      }
    }
    const ultimo = u.ultimoLogin ? new Date(u.ultimoLogin).getTime() : 0;
    if (ehCliente && ultimo && agora - ultimo <= 30 * 864e5) ativos30 += 1;
    const origem = u.origem || 'cadastro';
    origens[origem] = (origens[origem] || 0) + 1;
  });

  let acessos24 = 0;
  let falhas24 = 0;
  (banco.logins || []).forEach((l) => {
    const quando = l.quando ? new Date(l.quando).getTime() : 0;
    if (!quando) return;
    if (agora - quando <= 24 * 60 * 60 * 1000) {
      if (l.sucesso === false) falhas24 += 1;
      else acessos24 += 1;
    }
    const chave = chaveDoDia(l.quando);
    if (chave && mapaAcessos.has(chave) && l.sucesso !== false) {
      mapaAcessos.set(chave, mapaAcessos.get(chave) + 1);
    }
  });

  const clientes = (banco.usuarios || []).filter((u) => u.perfil !== 'admin');
  const sincronizados = clientes.filter((u) => u.sync && u.sync.estado === 'ok').length;

  const mesAtual = new Date().toISOString().slice(0, 7);
  const despesasDoMes = (banco.despesas || [])
    .filter((d) => String(d.data || d.criadoEm || '').slice(0, 7) === mesAtual || !d.data)
    .reduce((soma, d) => soma + Number(d.valor || 0), 0);

  const estoque = (banco.produtos || []).map(produtoPublico);
  const unidadesEstoque = estoque.reduce((soma, p) => soma + p.quantidade, 0);
  const valorEstoque = estoque.reduce((soma, p) => soma + p.quantidade * p.preco, 0);
  const abaixoDoMinimo = estoque.filter((p) => p.minimo > 0 && p.quantidade <= p.minimo);
  const manutencoesAbertas = (banco.manutencoes || []).filter((m) => m.status !== 'Concluído').length;

  return {
    ok: true,
    geradaEm: new Date().toISOString(),
    clientes: clientes.length,
    administradores: (banco.usuarios || []).length - clientes.length,
    novos7,
    novos30,
    ativos30,
    taxaRetorno: clientes.length ? Math.round((ativos30 / clientes.length) * 100) : 0,
    acessos24,
    falhas24,
    serie: dia14.map((item) => ({
      dia: item.dia,
      rotulo: item.data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      cadastros: mapaCadastros.get(item.dia) || 0,
      acessos: mapaAcessos.get(item.dia) || 0
    })),
    origens: Object.keys(origens).map((chave) => ({ chave, total: origens[chave] })),
    estoque: { unidades: unidadesEstoque, valor: valorEstoque, itens: estoque.length, abaixoDoMinimo },
    manutencoesAbertas,
    despesas: { doMes: despesasDoMes, total: (banco.despesas || []).length },
    sincronizacao: Object.assign(resumoSync(banco), {
      clientesSync: sincronizados,
      totalClientes: clientes.length
    }),
    atividade: [
      ...(banco.usuarios || [])
        .filter((u) => u.criadoEm)
        .slice(-8)
        .reverse()
        .map((u) => ({
          tipo: 'cadastro',
          titulo: u.nome || u.email,
          detalhe: String(u.email || '').trim(),
          quando: u.criadoEm
        })),
      ...(banco.logins || []).slice(0, 8).map((l) => ({
        tipo: 'login',
        titulo: l.nome || l.email,
        detalhe: l.sucesso === false ? 'tentativa de acesso recusada' : 'entrou no site',
        quando: l.quando
      })),
      ...(banco.despesas || []).slice(-4).reverse().map((d) => ({
        tipo: 'despesa',
        titulo: d.descricao || 'Despesa',
        detalhe: 'R$ ' + Number(d.valor || 0).toFixed(2).replace('.', ','),
        quando: d.criadoEm || d.data
      })),
      ...(banco.manutencoes || []).slice(-4).reverse().map((m) => ({
        tipo: 'manutencao',
        titulo: m.item || 'Manutenção',
        detalhe: m.status,
        quando: m.criadoEm || m.data
      }))
    ]
      .filter((e) => e.quando)
      .sort((a, b) => new Date(b.quando) - new Date(a.quando))
      .slice(0, 10)
  };
}

module.exports = {
  DB_FILE,
  DATA_DIR,
  VALIDADE_SESSAO_MS,
  VERSAO,
  bancoVazio,
  carregar,
  salvar,
  transacionar,
  novoId,
  normalizarEmail,
  acharUsuario,
  novoUsuario,
  semearAdmins,
  usuarioPublico,
  criarSessao,
  acharSessao,
  removerSessao,
  registrarLogin,
  // estoque / manutenção / despesas
  produtoPublico,
  ajustarProduto,
  // sincronização
  marcarSync,
  enfileirarSync,
  pendentesSync,
  resumoSync,
  registrarEnvioSync,
  atualizarFilaSync,
  // métricas
  calcularMetricas
};
