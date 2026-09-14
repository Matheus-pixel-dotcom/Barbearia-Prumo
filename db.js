/*
 * Banco de dados do Style Relo Barber.
 *
 * Guarda o cadastro de clientes, as sessões de login e o histórico de acessos.
 * Possui duas formas de armazenamento, escolhidas automaticamente:
 *
 *   1. SUPABASE (durável e compartilhado) — usada quando as variáveis de ambiente
 *      SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_KEY) estão definidas.
 *      É o modo indicado para hospedagens gratuitas, onde o arquivo local pode
 *      ser apagado a cada deploy.
 *
 *   2. ARQUIVO JSON (data/db.json) — modo padrão, usado no computador ou em
 *      qualquer host com disco (Docker com volume, VPS, etc.).
 *
 * Nada aqui depende de pacotes externos: o acesso ao Supabase é feito via HTTP.
 */
const fs = require('fs');
const path = require('path');
const ReloHash = require('./auth-hash');
const sementeAdmins = require('./admin-accounts');

const DATA_DIR = process.env.RELO_DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const VALIDADE_SESSAO_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.RELO_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_CHAVE =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '';
const TABELA = process.env.RELO_SUPABASE_TABLE || 'relo_db';
const LINHA_ID = 'principal';

function bancoVazio() {
  return {
    versao: 2,
    criadoEm: new Date().toISOString(),
    usuarios: [],
    sessoes: [],
    logins: []
  };
}

function normalizarBanco(dados) {
  const fonte = dados || {};
  return {
    versao: fonte.versao || 2,
    criadoEm: fonte.criadoEm || new Date().toISOString(),
    usuarios: Array.isArray(fonte.usuarios) ? fonte.usuarios : [],
    sessoes: Array.isArray(fonte.sessoes) ? fonte.sessoes : [],
    logins: Array.isArray(fonte.logins) ? fonte.logins : []
  };
}

/* ------------------------------------------------------------------ */
/* Armazenamento em arquivo (padrão)                                   */
/* ------------------------------------------------------------------ */
const ArmazenamentoArquivo = {
  nome: 'arquivo',
  descricao: 'arquivo local ' + (DB_FILE.startsWith(__dirname) ? path.relative(__dirname, DB_FILE) : DB_FILE),

  async carregar() {
    if (!fs.existsSync(DB_FILE)) return bancoVazio();
    const bruto = fs.readFileSync(DB_FILE, 'utf8');
    return normalizarBanco(JSON.parse(bruto || '{}'));
  },

  async salvar(banco) {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const temporario = DB_FILE + '.tmp';
    fs.writeFileSync(temporario, JSON.stringify(banco, null, 2), 'utf8');
    fs.renameSync(temporario, DB_FILE); // gravação atômica: evita arquivo corrompido
  }
};

/* ------------------------------------------------------------------ */
/* Armazenamento no Supabase (durável)                                 */
/* ------------------------------------------------------------------ */
const ArmazenamentoSupabase = {
  nome: 'supabase',
  descricao: 'Supabase (' + TABELA + ')',

  cabecalhos(extras) {
    return Object.assign(
      {
        apikey: SUPABASE_CHAVE,
        Authorization: 'Bearer ' + SUPABASE_CHAVE,
        'Content-Type': 'application/json'
      },
      extras || {}
    );
  },

  async carregar() {
    const url = `${SUPABASE_URL}/rest/v1/${TABELA}?id=eq.${LINHA_ID}&select=dados`;
    const resposta = await fetch(url, { headers: this.cabecalhos() });
    if (!resposta.ok) {
      throw new Error('Supabase respondeu ' + resposta.status + ' ao ler o banco');
    }
    const linhas = await resposta.json();
    if (!Array.isArray(linhas) || linhas.length === 0) return bancoVazio();
    return normalizarBanco(linhas[0].dados);
  },

  async salvar(banco) {
    const resposta = await fetch(`${SUPABASE_URL}/rest/v1/${TABELA}`, {
      method: 'POST',
      headers: this.cabecalhos({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify([
        { id: LINHA_ID, dados: banco, atualizado_em: new Date().toISOString() }
      ])
    });
    if (!resposta.ok) {
      const detalhe = await resposta.text().catch(() => '');
      throw new Error(
        'Supabase respondeu ' + resposta.status + ' ao gravar o banco. ' + detalhe.slice(0, 200)
      );
    }
  }
};

/* ------------------------------------------------------------------ */
/* Escolha do armazenamento                                            */
/* ------------------------------------------------------------------ */
const modoSupabaseConfigurado = Boolean(SUPABASE_URL && SUPABASE_CHAVE);
let armazenamento = modoSupabaseConfigurado ? ArmazenamentoSupabase : ArmazenamentoArquivo;
let avisoArmazenamento = '';

function descricaoArmazenamento() {
  return armazenamento.descricao + (avisoArmazenamento ? ' — ' + avisoArmazenamento : '');
}

// Testa o armazenamento configurado uma vez, no primeiro acesso.
// Se o Supabase estiver configurado e falhar, cai para o arquivo local para o
// site continuar funcionando (o aviso aparece em /api/health e no painel).
let testado = false;
async function prepararArmazenamento() {
  if (testado) return;
  testado = true;
  if (armazenamento.nome !== 'supabase') return;
  try {
    await armazenamento.carregar();
  } catch (erro) {
    avisoArmazenamento =
      'Supabase indisponível (' + erro.message + '); usando arquivo local até o Supabase voltar';
    console.warn('[db] ' + avisoArmazenamento);
    armazenamento = ArmazenamentoArquivo;
  }
}

async function carregar() {
  await prepararArmazenamento();
  return armazenamento.carregar();
}

async function salvar(banco) {
  return armazenamento.salvar(banco);
}

/* ------------------------------------------------------------------ */
/* Regras de negócio                                                   */
/* ------------------------------------------------------------------ */
function normalizarEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function acharUsuario(banco, email) {
  const alvo = normalizarEmail(email);
  if (!alvo) return null;
  return (
    banco.usuarios.find((u) => normalizarEmail(u.email) === alvo) ||
    banco.usuarios.find((u) => (u.aliases || []).some((a) => normalizarEmail(a) === alvo)) ||
    null
  );
}

// Cria as contas de administrador na primeira execução (ou se forem apagadas)
function semearAdmins(banco) {
  let criados = 0;
  sementeAdmins.contas.forEach((conta) => {
    if (acharUsuario(banco, conta.email)) return;
    banco.usuarios.push({
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
      totalLogins: 0
    });
    criados += 1;
  });
  return criados;
}

function usuarioPublico(usuario) {
  if (!usuario) return null;
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    aliases: usuario.aliases || [],
    perfil: usuario.perfil === 'admin' ? 'admin' : 'cliente',
    origem: usuario.origem || 'cadastro',
    criadoEm: usuario.criadoEm || null,
    ultimoLogin: usuario.ultimoLogin || null,
    totalLogins: usuario.totalLogins || 0
  };
}

function criarSessao(banco, usuario) {
  const token = ReloHash.gerarToken();
  banco.sessoes = (banco.sessoes || []).filter((s) => new Date(s.expiraEm).getTime() > Date.now());
  banco.sessoes.push({
    tokenHash: ReloHash.hashToken(token),
    usuarioId: usuario.id,
    criadoEm: new Date().toISOString(),
    expiraEm: new Date(Date.now() + VALIDADE_SESSAO_MS).toISOString()
  });
  return token;
}

function acharSessao(banco, token) {
  if (!token) return null;
  const alvo = ReloHash.hashToken(token);
  const sessao = (banco.sessoes || []).find((s) => s.tokenHash === alvo);
  if (!sessao) return null;
  if (new Date(sessao.expiraEm).getTime() < Date.now()) return null;
  return sessao;
}

function removerSessao(banco, token) {
  const alvo = ReloHash.hashToken(token);
  banco.sessoes = (banco.sessoes || []).filter((s) => s.tokenHash !== alvo);
}

function registrarLogin(banco, dados) {
  banco.logins = banco.logins || [];
  banco.logins.unshift({
    email: normalizarEmail(dados.email),
    nome: dados.nome || '',
    perfil: dados.perfil || 'cliente',
    quando: new Date().toISOString(),
    sucesso: dados.sucesso !== false,
    origem: dados.origem || 'api'
  });
  banco.logins = banco.logins.slice(0, 300); // mantém os 300 acessos mais recentes
  return banco.logins;
}

// Cópia do banco para backup (sem as sessões ativas)
function paraBackup(banco) {
  return {
    versao: banco.versao || 2,
    exportadoEm: new Date().toISOString(),
    usuarios: banco.usuarios || [],
    logins: banco.logins || []
  };
}

// Restaura um backup gerado por paraBackup(): mantém os admins da semente e
// substitui a lista de cadastros e o histórico de acessos.
function aplicarBackup(banco, copia) {
  if (!copia || !Array.isArray(copia.usuarios)) {
    throw new Error('Arquivo de backup inválido: falta a lista de usuários.');
  }
  const usuariosValidos = copia.usuarios.filter(
    (u) => u && typeof u.email === 'string' && typeof u.senhaHash === 'string' && typeof u.salt === 'string'
  );
  if (usuariosValidos.length === 0) {
    throw new Error('Arquivo de backup inválido: nenhum usuário com senha protegida foi encontrado.');
  }
  banco.usuarios = usuariosValidos;
  semearAdmins(banco); // garante que os admins oficiais existam de novo
  if (Array.isArray(copia.logins)) banco.logins = copia.logins.slice(0, 300);
  return { usuarios: banco.usuarios.length, logins: banco.logins.length };
}

module.exports = {
  DB_FILE,
  DATA_DIR,
  VALIDADE_SESSAO_MS,
  bancoVazio,
  carregar,
  salvar,
  descricaoArmazenamento,
  normalizarEmail,
  acharUsuario,
  semearAdmins,
  usuarioPublico,
  criarSessao,
  acharSessao,
  removerSessao,
  registrarLogin,
  paraBackup,
  aplicarBackup
};
