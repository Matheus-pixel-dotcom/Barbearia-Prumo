/*
 * Permissões do Style Relo Barber — a hierarquia de acesso do sistema.
 *
 * O projeto tem TRÊS níveis de usuário e este arquivo é a única fonte da
 * verdade sobre o que cada um pode fazer. Ele roda nos dois lados:
 *
 *   - no servidor Node (server.js)  → quem manda de verdade é o servidor;
 *   - no navegador (admin.js/auth-core.js) → o painel apenas ESCONDE o que o
 *     perfil não pode fazer, para ninguém clicar em botão que vai dar 403.
 *
 * HIERARQUIA
 *   1. cliente     (Usuário)      → usa o site: agenda, simula o corte, avalia.
 *   2. supervisor                 → a equipe da barbearia: abre o painel, vê os
 *                                   números e a lista de clientes e cuida da
 *                                   operação do dia (estoque, manutenção,
 *                                   despesas). Não exclui nada e não mexe em
 *                                   configuração, nuvem nem permissões.
 *   3. admin       (Administrador) → tudo, incluindo excluir cadastros, mexer
 *                                   na nuvem e definir quem é quem.
 *
 * Regra de ouro que os testes cobram: o supervisor OPERA, o administrador
 * ADMINISTRA. Toda ação destrutiva ou de configuração é só do admin.
 */
(function (root, factory) {
  const dados = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = dados;
  } else {
    root.ReloPermissoes = dados;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* Cada ação do painel, com a descrição usada nas mensagens de erro. */
  const ACOES = {
    'painel.ver': 'abrir o painel da barbearia',
    'clientes.ver': 'ver a lista de clientes e o histórico de acessos',
    'clientes.exportar': 'exportar a lista de clientes em CSV',
    'clientes.criar': 'cadastrar um cliente pelo painel',
    'clientes.excluir': 'excluir o cadastro de um cliente',
    'equipe.gerenciar': 'criar contas da equipe e mudar o perfil de um usuário',
    'estoque.ver': 'ver o estoque',
    'estoque.editar': 'lançar entrada, saída e preço no estoque',
    'estoque.excluir': 'excluir um produto do estoque',
    'manutencao.ver': 'ver a manutenção',
    'manutencao.editar': 'abrir, atualizar e concluir ordens de manutenção',
    'manutencao.excluir': 'excluir uma ordem de manutenção',
    'despesas.ver': 'ver as despesas',
    'despesas.editar': 'lançar e quitar despesas',
    'despesas.excluir': 'excluir uma despesa',
    'nuvem.ver': 'ver o status do banco de dados e da nuvem (Supabase)',
    'nuvem.configurar': 'configurar a nuvem (URL, tabela e chave)',
    'nuvem.reenviar': 'reenviar a fila de cadastros para a nuvem'
  };

  /* O que o supervisor pode por cima do que todo mundo vê. */
  const VE = ['painel.ver', 'clientes.ver', 'clientes.exportar', 'estoque.ver', 'manutencao.ver', 'despesas.ver', 'nuvem.ver'];
  const OPERA = VE.concat(['clientes.criar', 'estoque.editar', 'manutencao.editar', 'despesas.editar']);
  const ADMINISTRA = OPERA.concat([
    'clientes.excluir',
    'equipe.gerenciar',
    'estoque.excluir',
    'manutencao.excluir',
    'despesas.excluir',
    'nuvem.configurar',
    'nuvem.reenviar'
  ]);

  const PERFIS = {
    cliente: {
      nivel: 1,
      rotulo: 'Usuário',
      rotuloCurto: 'Cliente',
      resumo: 'Usuário do site: agenda o corte, usa o simulador de visagismo, avalia os barbeiros e acompanha os próprios agendamentos.',
      acoes: []
    },
    supervisor: {
      nivel: 2,
      rotulo: 'Supervisor',
      rotuloCurto: 'Supervisor',
      resumo: 'Equipe da barbearia: abre o painel, acompanha os números e cuida do estoque, da manutenção e das despesas do dia a dia. Não exclui cadastros, não mexe na nuvem e não define permissões.',
      acoes: OPERA
    },
    admin: {
      nivel: 3,
      rotulo: 'Administrador',
      rotuloCurto: 'Admin',
      resumo: 'Acesso total: tudo que o supervisor faz, mais exclusões, configuração do banco na nuvem e a definição de quem é supervisor ou administrador.',
      acoes: ADMINISTRA
    }
  };

  const ALIASES = {
    usuario: 'cliente',
    'usuário': 'cliente',
    user: 'cliente',
    client: 'cliente',
    funcionario: 'supervisor',
    funcionário: 'supervisor',
    gerente: 'supervisor',
    administrador: 'admin',
    administrator: 'admin',
    root: 'admin'
  };

  function normalizar(perfil) {
    const bruto = String(perfil || '').trim().toLowerCase();
    const alvo = ALIASES[bruto] || bruto;
    return PERFIS[alvo] ? alvo : 'cliente';
  }

  function existe(perfil) {
    const bruto = String(perfil || '').trim().toLowerCase();
    return Boolean(PERFIS[ALIASES[bruto] || bruto]);
  }

  function nivel(perfil) {
    return PERFIS[normalizar(perfil)].nivel;
  }

  function rotulo(perfil) {
    return PERFIS[normalizar(perfil)].rotulo;
  }

  function rotuloCurto(perfil) {
    return PERFIS[normalizar(perfil)].rotuloCurto;
  }

  function resumo(perfil) {
    return PERFIS[normalizar(perfil)].resumo;
  }

  function acoes(perfil) {
    return PERFIS[normalizar(perfil)].acoes.slice();
  }

  function pode(perfil, acao) {
    const chave = String(acao || '');
    if (!ACOES[chave]) return false; // ação desconhecida nunca é liberada
    return PERFIS[normalizar(perfil)].acoes.indexOf(chave) !== -1;
  }

  /* Mapa pronto { acao: true/false } — é o que o navegador recebe no login. */
  function mapa(perfil) {
    const chaves = acoes(perfil);
    const mapaCompleto = {};
    Object.keys(ACOES).forEach((chave) => {
      mapaCompleto[chave] = chaves.indexOf(chave) !== -1;
    });
    return mapaCompleto;
  }

  /* Todo mundo que não é cliente entra no painel. */
  function podePainel(perfil) {
    return pode(perfil, 'painel.ver');
  }

  /* Ranqueia dois perfis: true quando "a" manda mais que "b". */
  function acimaDe(a, b) {
    return nivel(a) > nivel(b);
  }

  /* Descrição legível da ação, usada nas mensagens de erro do servidor. */
  function descrever(acao) {
    return ACOES[String(acao || '')] || 'executar esta ação';
  }

  function perfis() {
    return Object.keys(PERFIS).map((chave) => ({
      chave,
      nivel: PERFIS[chave].nivel,
      rotulo: PERFIS[chave].rotulo,
      rotuloCurto: PERFIS[chave].rotuloCurto,
      resumo: PERFIS[chave].resumo,
      acoes: PERFIS[chave].acoes.slice()
    }));
  }

  return {
    ACOES,
    PERFIS,
    perfis,
    normalizar,
    existe,
    nivel,
    rotulo,
    rotuloCurto,
    resumo,
    acoes,
    pode,
    mapa,
    podePainel,
    acimaDe,
    descrever
  };
});
