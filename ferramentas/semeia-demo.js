/*
 * Dados de demonstração do painel — 'npm run demo'
 *
 * Serve para duas coisas: mostrar o painel premium com números de verdade
 * (KPIs, gráficos, estoque com alerta de falta, despesas, manutenção) e poder
 * testar a tela de clientes sem cadastrar 20 pessoas na mão.
 *
 * Só mexe em data/db.json (gitignored) e é idempotente: o que já existe é pulado.
 * Para zerar, apague data/db.json e rode 'npm run serve' — ele ressemeia apenas
 * as contas de administrador de admin-accounts.js.
 *
 * Os e-mails usam @exemplo.com de propósito: nada aqui é contato real.
 */
'use strict';
const db = require('../db.js');

const DIA = 86400000;
const AGORA = Date.now();

function iso(diasAtras, hora) {
  const d = new Date(AGORA - diasAtras * DIA);
  d.setHours(hora === undefined ? 10 : hora, (diasAtras * 7) % 60, 0, 0);
  return d.toISOString();
}

// [nome, apelido do e-mail, origem do cadastro] — cadastros espalhados nos últimos ~33 dias
const CLIENTES = [
  ['Ana Beatriz Nogueira', 'ana.nogueira', 'instagram'],
  ['Carlos Eduardo Lima', 'carlos.lima', 'cadastro'],
  ['Fernanda Rocha', 'fernanda.rocha', 'google'],
  ['João Pedro Martins', 'joao.martins', 'indicacao'],
  ['Juliana Prado', 'juliana.prado', 'whatsapp'],
  ['Marcelo Tavares', 'marcelo.tavares', 'cadastro'],
  ['Patrícia Gomes', 'patricia.gomes', 'instagram'],
  ['Rafael Andrade', 'rafael.andrade', 'indicacao'],
  ['Sofia Almeida', 'sofia.almeida', 'google'],
  ['Thiago Barreto', 'thiago.barreto', 'cadastro'],
  ['Vanessa Cruz', 'vanessa.cruz', 'instagram'],
  ['Bruno Ferraz', 'bruno.ferraz', 'whatsapp'],
  ['Camila Duarte', 'camila.duarte', 'cadastro'],
  ['Diego Moraes', 'diego.moraes', 'indicacao'],
  ['Elisa Ferreira', 'elisa.ferreira', 'google'],
  ['Gustavo Pires', 'gustavo.pires', 'cadastro'],
  ['Helena Vasques', 'helena.vasques', 'instagram'],
  ['Igor Santana', 'igor.santana', 'whatsapp']
];

// um produto propositalmente abaixo do mínimo, para o painel mostrar o alerta de falta
const PRODUTOS = [
  {
    id: 'prd_pomada', nome: 'Pomada Modeladora Firme', categoria: 'Finalização',
    quantidade: 18, preco: 49.9, minimo: 6,
    movimentos: [
      { id: 'mov_pomada_s', tipo: 'saida', quantidade: 6, antes: 24, depois: 18, observacao: 'Vendas do mês', quando: iso(2) },
      { id: 'mov_pomada_e', tipo: 'entrada', quantidade: 24, antes: 0, depois: 24, observacao: 'Compra inicial', quando: iso(30) }
    ]
  },
  {
    id: 'prd_oleo', nome: 'Óleo de Barba Cedro', categoria: 'Barba',
    quantidade: 4, preco: 39.5, minimo: 5,
    movimentos: [{ id: 'mov_oleo_s', tipo: 'saida', quantidade: 8, antes: 12, depois: 4, observacao: 'Vendas + amostras', quando: iso(1) }]
  },
  { id: 'prd_shampoo', nome: 'Shampoo Antirresíduos 300ml', categoria: 'Cabelo', quantidade: 26, preco: 34, minimo: 10, movimentos: [] },
  { id: 'prd_navalha', nome: 'Navalha de Segurança Cromada', categoria: 'Ferramentas', quantidade: 2, preco: 89, minimo: 4, movimentos: [] },
  { id: 'prd_toalha', nome: 'Toalha Quente (pacote 10)', categoria: 'Consumíveis', quantidade: 40, preco: 12.5, minimo: 12, movimentos: [] }
];

const MANUTENCOES = [
  { item: 'Cadeira 02 — hidráulico', descricao: 'Cadeira não desce até o fim; verificar bomba.', status: 'Em Andamento', responsavel: 'Elevac', valor: 380, dias: 6 },
  { item: 'Secador Turbo 2000W', descricao: 'Faísca ao ligar; troca de resistência orçada.', status: 'Pendente', responsavel: '', valor: null, dias: 3 },
  { item: 'Ar-condicionado Split', descricao: 'Higienização e carga de gás.', status: 'Concluído', responsavel: 'FrioSul', valor: 520, dias: 12 }
];

const DESPESAS = [
  { descricao: 'Aluguel do ponto', categoria: 'Fixo', valor: 3800, pago: true, dias: 4 },
  { descricao: 'Energia elétrica', categoria: 'Operacional', valor: 612.4, pago: true, dias: 3 },
  { descricao: 'Reposição de pomadas e óleos', categoria: 'Estoque', valor: 1240, pago: false, dias: 2 },
  { descricao: 'Tráfego pago (Instagram)', categoria: 'Marketing', valor: 700, pago: true, dias: 1 },
  { descricao: 'Manutenção ar-condicionado', categoria: 'Operacional', valor: 520, pago: true, dias: 11 }
];

db.transacionar((atual) => {
  const saida = { novos: 0, produtos: 0, manutencoes: 0, despesas: 0 };
  db.semearAdmins(atual);

  CLIENTES.forEach(([nome, alias, origem], i) => {
    const email = alias + '@exemplo.com';
    if (db.acharUsuario(atual, email)) return;
    const criadoHa = 33 - i * 2;
    const usuario = db.novoUsuario(atual, { nome, email, senha: 'Senha123!', origem });
    usuario.criadoEm = iso(criadoHa, 9 + (i % 8));
    const visitas = 1 + (i % 5);
    usuario.totalLogins = visitas;
    usuario.ultimoLogin = iso(Math.max(0, criadoHa - visitas * 2 - (i % 3)), 15);
    // linha já confirmada na nuvem (a fila de reenvio é o que 'npm test' exercita)
    usuario.sync = { estado: 'ok', tentativas: 1, em: usuario.criadoEm };
    for (let v = 0; v < visitas; v++) {
      atual.logins.unshift({
        email: email,
        nome: nome,
        perfil: 'cliente',
        quando: iso(Math.max(0, criadoHa - v * 3), 11 + v),
        sucesso: 'sucesso',
        origem: 'web'
      });
    }
    saida.novos += 1;
  });

  atual.produtos = atual.produtos || [];
  PRODUTOS.forEach((produto) => {
    if (atual.produtos.some((x) => x.id === produto.id || x.nome === produto.nome)) return;
    atual.produtos.push(Object.assign({ atualizadoEm: iso(2) }, produto));
    saida.produtos += 1;
  });

  atual.manutencoes = atual.manutencoes || [];
  MANUTENCOES.forEach((ordem) => {
    if (atual.manutencoes.some((x) => x.item === ordem.item)) return;
    atual.manutencoes.push({
      id: db.novoId('man'),
      item: ordem.item,
      descricao: ordem.descricao,
      status: ordem.status,
      responsavel: ordem.responsavel,
      valor: ordem.valor,
      criadoEm: iso(ordem.dias)
    });
    saida.manutencoes += 1;
  });

  atual.despesas = atual.despesas || [];
  DESPESAS.forEach((despesa) => {
    if (atual.despesas.some((x) => x.descricao === despesa.descricao)) return;
    atual.despesas.push({
      id: db.novoId('desp'),
      descricao: despesa.descricao,
      categoria: despesa.categoria,
      valor: despesa.valor,
      pago: despesa.pago,
      criadoEm: iso(despesa.dias)
    });
    saida.despesas += 1;
  });

  atual.logins.sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
  saida.contas = atual.usuarios.length;
  saida.acessos = atual.logins.length;
  return saida;
}).then((r) => {
  console.log(
    `vitrine pronta → +${r.novos} cliente(s), +${r.produtos} produto(s), ` +
    `+${r.manutencoes} manutenção(ões), +${r.despesas} despesa(s) · ` +
    `${r.contas} conta(s) e ${r.acessos} acesso(s) no total`
  );
  if (!r.novos && !r.produtos && !r.despesas) console.log('(já estava semeada — nada foi duplicado)');
  console.log('senha dos clientes de exemplo: Senha123! · para o painel, use um e-mail de admin de admin-accounts.js');
}).catch((erro) => {
  console.error('não consegui semear:', erro.message);
  process.exit(1);
});
