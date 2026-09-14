/*
 * Contas de administrador do Style Relo Barber (semente do banco de dados).
 *
 * Estes são os e-mails que podem entrar na aba ADMIN do site.
 * Qualquer outro e-mail é tratado como CLIENTE comum.
 *
 * As senhas NÃO ficam escritas aqui: guardamos apenas o "sal" + o hash SHA-256
 * de cada senha. O hash é conferido no login (auth-core.js / server.js).
 * Arquivo usado tanto pelo navegador (window.ReloAdminAccounts) quanto pelo
 * servidor Node (require('./admin-accounts.js')).
 */
(function (root, factory) {
  const dados = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = dados;
  } else {
    root.ReloAdminAccounts = dados;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  return {
    versao: 2,
    atualizadoEm: '2026-09-14',
    contas: [
      {
        nome: 'R. Gabriel',
        email: 'r.gabriel08@escola.pr.gov.br',
        aliases: ['r.grabriel08@escola.pr.gov.br'],
        perfil: 'admin',
        salt: '3af4a614a48bcb91',
        senhaHash: '4a23a4a3fe0a5115486ad3055e25cd0756f27991071338abd451a84a38212a82'
      },
      {
        nome: 'Evelyn Coller',
        email: 'evelyn.coller@escola.pr.gov.br',
        aliases: ['evelyn.coller@escoa.pr.gov.br'],
        perfil: 'admin',
        salt: 'c85c232c029c4566',
        senhaHash: '6da346d82dbb78c05f3a6be28c269b1d0a24dfa49b02cbd2750e5c14aa204107'
      },
      {
        nome: 'Matheus Moura',
        email: 'matheus.moura14@escola.pr.gov.br',
        aliases: [],
        perfil: 'admin',
        salt: '711a8585b57e2b67',
        senhaHash: '5c0d9ee1400c076c7f8e0319d645238ebb6013262ac95867860f510f6218ede3'
      },
      {
        nome: 'Marcos Rossa',
        email: 'marcos.rossa@escola.pr.gov.br',
        aliases: [],
        perfil: 'admin',
        salt: '800de0e7fde4a2af',
        senhaHash: 'bb621a9451da08c79daa77b086ea5f9f6257e567d29a55d2572404cc09eab9d5'
      },
      {
        nome: 'Professor',
        email: 'professor@gmail.com',
        aliases: [],
        perfil: 'admin',
        salt: '4f07817903f2fa0b',
        senhaHash: '5882274e6523fc915456ffee2745c2fa91890b244224192cf4232fec129edd8f'
      },
      {
        nome: 'Wevergton Sousa',
        email: 'wevergton.sousa@escola.pr.gov.br',
        aliases: [],
        perfil: 'admin',
        salt: '3977f6b210d0e32d',
        senhaHash: '22e7fc6360c92bc127fd96b011e6cde725d3c95615776e6a6ebd28336300c28a'
      },
      {
        nome: 'Michel Lima',
        email: 'michel.lima30@escola.pr.gov.br',
        aliases: [],
        perfil: 'admin',
        salt: '02bf5f0428407353',
        senhaHash: '297d11b88f62aeb98d60ff1f7a055fe94a779a088b8b0c0bc729d1e238ad0eca'
      },
      {
        nome: 'Victor Camargo Pereira',
        email: 'camargo.pereira.victor@escola.pr.gov.br',
        aliases: [],
        perfil: 'admin',
        salt: '84f89e0d4aa77af4',
        senhaHash: '030f72261fbfafe8173ac483c24242a16944ae204978d4b24cefd65252ca022a'
      }
    ]
  };
});
