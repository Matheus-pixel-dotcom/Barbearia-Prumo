#!/usr/bin/env node
/*
 * Gera o sal + o hash de uma senha para cadastrar um novo administrador.
 *
 * Como usar (na pasta do projeto):
 *   node ferramentas/gerar-senha.js novo.admin@escola.pr.gov.br MinhaSenha123
 *
 * Copie o bloco gerado e cole dentro da lista "contas" de admin-accounts.js.
 */
const ReloHash = require('../auth-hash');

const email = process.argv[2];
const senha = process.argv[3];

if (!email || !senha) {
  console.log('Uso: node ferramentas/gerar-senha.js <email> <senha>');
  process.exit(1);
}

const salt = ReloHash.saltParaEmail(email);
console.log('\nCole este bloco na lista "contas" do arquivo admin-accounts.js:\n');
console.log('      {');
console.log(`        nome: 'Nome do Admin',`);
console.log(`        email: '${email.trim().toLowerCase()}',`);
console.log('        aliases: [],');
console.log("        perfil: 'admin',");
console.log(`        salt: '${salt}',`);
console.log(`        senhaHash: '${ReloHash.hashPassword(salt, senha)}'`);
console.log('      },');
console.log('\nConfira se entrou assim:');
console.log(`  node -e "console.log(require('./auth-hash').hashPassword('${salt}','${senha}'))"\n`);
