/*
 * Banco de dados do Style Relo Barber (servidor Node).
 *
 * Guarda tudo em um arquivo JSON (data/db.json) para não precisar de nenhuma
 * instalação extra — funciona offline e é fácil de abrir/inspecionar.
 *
 * Estrutura:
 *   usuarios: cadastro de clientes e administradores (senha só como hash)
 *   sessoes : tokens de login ativos (o token puro nunca é gravado)
 *   logins  : histórico de acessos (quem entrou, quando e de onde)
 */
const fs = require('fs');
const path = require('path');
const ReloHash = require('./auth-hash');
const sementeAdmins = require('./admin-accounts');

const DATA_DIR = process.env.RELO_DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const VALIDADE_SESSAO_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

function bancoVazio() {
  return {
    versao: 2,
    criadoEm: new Date().toISOString(),
    usuarios: [],
    sessoes: [],
    logins: []
  };
}

function normalizarEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function carregar() {
  try {
    if (!fs.existsSync(DB_FILE)) return bancoVazio();
    const bruto = fs.readFileSync(DB_FILE, 'utf8');
    const dados = JSON.parse(bruto || '{}');
    return {
      versao: dados.versao || 2,
      criadoEm: dados.criadoEm || new Date().toISOString(),
      usuarios: Array.isArray(dados.usuarios) ? dados.usuarios : [],
      sessoes: Array.isArray(dados.sessoes) ? dados.sessoes : [],
      logins: Array.isArray(dados.logins) ? dados.logins : []
    };
  } catch (erro) {
    console.error('[db] Falha ao ler o banco, começando um novo:', erro.message);
    return bancoVazio();
  }
}

function salvar(db) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const temporario = DB_FILE + '.tmp';
  fs.writeFileSync(temporario, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(temporario, DB_FILE); // gravação atômica: evita arquivo corrompido
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

function normalizarSucesso(valor) {
  return valor === false ? false : true;
}

module.exports = {
  DB_FILE,
  DATA_DIR,
  VALIDADE_SESSAO_MS,
  bancoVazio,
  carregar,
  salvar,
  normalizarEmail,
  acharUsuario,
  semearAdmins,
  usuarioPublico,
  criarSessao,
  acharSessao,
  removerSessao,
  registrarLogin
};
