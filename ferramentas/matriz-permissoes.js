#!/usr/bin/env node
/*
 * Matriz de permissões em Markdown — 'npm run matriz'
 *
 * Lê a tabela de permissoes.js (a mesma que o servidor e o painel usam) e
 * imprime a matriz em Markdown. Serve para os documentos do TCC nunca ficarem
 * desatualizados em relação ao código: se alguém mudar uma permissão, é só
 * rodar de novo e colar os dois blocos abaixo no documento.
 *
 *   node ferramentas/matriz-permissoes.js            → imprime no terminal
 *   node ferramentas/matriz-permissoes.js --arquivo  → salva em docs/matriz-permissoes.md
 */
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const Permissoes = require(path.join(RAIZ, 'permissoes.js'));
const perfis = Permissoes.perfis();

function tabela() {
  const linhas = [];
  linhas.push('| Ação no sistema | Usuário (cliente) | Supervisor | Administrador |');
  linhas.push('| --- | :---: | :---: | :---: |');
  Object.keys(Permissoes.ACOES).forEach((acao) => {
    const marca = (perfil) => (Permissoes.pode(perfil, acao) ? '✔' : '—');
    linhas.push(
      '| ' +
        Permissoes.ACOES[acao].charAt(0).toUpperCase() +
        Permissoes.ACOES[acao].slice(1) +
        ' | ' +
        marca('cliente') +
        ' | ' +
        marca('supervisor') +
        ' | ' +
        marca('admin') +
        ' |'
    );
  });
  return linhas.join('\n');
}

function resumo() {
  return perfis
    .map(
      (p) =>
        '**' +
        p.rotulo +
        '** (nível ' +
        p.nivel +
        ', `' +
        p.chave +
        '`) — ' +
        p.resumo
    )
    .join('\n\n');
}

const conteudo = [
  '## Perfis da hierarquia de acesso',
  '',
  resumo(),
  '',
  '## Matriz de permissões',
  '',
  tabela(),
  ''
].join('\n');

if (process.argv.includes('--arquivo')) {
  const destino = path.join(RAIZ, 'docs', 'matriz-permissoes.md');
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, conteudo, 'utf8');
  console.log('matriz salva em ' + path.relative(RAIZ, destino));
} else {
  console.log(conteudo);
}
