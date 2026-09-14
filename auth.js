/*
 * Login e cadastro das páginas login.html e signup.html.
 *
 * Toda a lógica fica no ReloAuth (auth-core.js), que grava no banco de dados
 * da barbearia: clientes cadastrados + contas de administrador já existentes.
 */
(function (global) {
  'use strict';

  function mostrarErro(mensagem, elemento) {
    if (!elemento) return;
    elemento.textContent = mensagem;
    elemento.classList.add('show');
  }

  function mostrarSucesso(mensagem, elemento) {
    if (!elemento) return;
    elemento.textContent = mensagem;
    elemento.classList.add('show');
  }

  function limparMensagens() {
    document.querySelectorAll('.error-message, .success-message').forEach((el) => {
      el.classList.remove('show');
      el.textContent = '';
    });
  }

  async function initLoginForm() {
    const form = document.getElementById('loginForm');
    if (!form) return;

    await global.ReloAuth.ready();

    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();

      const email = document.getElementById('email').value.trim();
      const senha = document.getElementById('password').value;
      const botao = document.getElementById('submitBtn');
      const erroEl = document.getElementById('errorMessage');
      const sucessoEl = document.getElementById('successMessage');

      limparMensagens();
      if (!email || !senha) {
        mostrarErro('Por favor, preencha todos os campos.', erroEl);
        return;
      }

      const textoOriginal = botao ? botao.textContent : '';
      if (botao) {
        botao.disabled = true;
        botao.textContent = 'Entrando...';
      }

      const resultado = await global.ReloAuth.entrar(email, senha);

      if (botao) {
        botao.disabled = false;
        botao.textContent = textoOriginal;
      }

      if (!resultado.ok) {
        mostrarErro(resultado.erro, erroEl);
        return;
      }

      const admin = global.ReloAuth.ehAdmin(resultado.usuario);
      mostrarSucesso(
        'Login realizado com sucesso! Redirecionando para a sua área' +
          (admin ? ' de administrador' : '') +
          '...',
        sucessoEl
      );
      if (global.ReloLoginModal) global.ReloLoginModal.atualizarNavegacao();
      setTimeout(() => {
        global.location.href = admin ? 'admin.html' : 'dashboard.html';
      }, 1200);
    });
  }

  async function initSignupForm() {
    const form = document.getElementById('signupForm');
    if (!form) return;

    await global.ReloAuth.ready();

    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();

      const nome = document.getElementById('fullName').value.trim();
      const email = document.getElementById('email').value.trim();
      const senha = document.getElementById('password').value;
      const confirmar = document.getElementById('confirmPassword').value;
      const botao = document.getElementById('submitBtn');
      const erroEl = document.getElementById('errorMessage');
      const sucessoEl = document.getElementById('successMessage');

      limparMensagens();
      if (!nome || !email || !senha || !confirmar) {
        mostrarErro('Por favor, preencha todos os campos.', erroEl);
        return;
      }
      if (senha !== confirmar) {
        mostrarErro('As senhas não coincidem.', erroEl);
        return;
      }

      const textoOriginal = botao ? botao.textContent : '';
      if (botao) {
        botao.disabled = true;
        botao.textContent = 'Criando conta...';
      }

      const resultado = await global.ReloAuth.cadastrar(nome, email, senha);

      if (botao) {
        botao.disabled = false;
        botao.textContent = textoOriginal;
      }

      if (!resultado.ok) {
        mostrarErro(resultado.erro, erroEl);
        return;
      }

      mostrarSucesso('Conta criada e salva no banco de dados! Redirecionando...', sucessoEl);
      if (global.ReloLoginModal) global.ReloLoginModal.atualizarNavegacao();
      setTimeout(() => {
        global.location.href = 'dashboard.html';
      }, 1400);
    });
  }

  // Mantidas para compatibilidade com outras páginas do site
  async function checkAuth() {
    await global.ReloAuth.ready();
    return global.ReloAuth.usuario;
  }

  async function logout() {
    await global.ReloAuth.sair();
    global.location.href = 'index.html';
  }

  global.checkAuth = checkAuth;
  global.logout = logout;

  document.addEventListener('DOMContentLoaded', () => {
    initLoginForm();
    initSignupForm();
  });
})(typeof window !== 'undefined' ? window : this);
