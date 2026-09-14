/*
 * Caixinha de login do Style Relo Barber.
 *
 * Este arquivo injeta o modal de login em TODAS as páginas do site e cuida de:
 *   - abrir a caixinha de login automaticamente quando o visitante chega;
 *   - entrar (cliente ou admin) e criar conta usando o banco de dados (ReloAuth);
 *   - mandar administrador para admin.html e cliente para dashboard.html;
 *   - trocar o botão "Login" do menu por "Sair" depois de entrar;
 *   - barrar quem não é administrador ao clicar na aba Admin.
 */
(function (global) {
  'use strict';

  const PAGINAS_SEM_POPUP = ['login.html', 'signup.html', 'dashboard.html', 'admin.html'];

  const HTML = `
  <div class="relo-modal-backdrop" id="relo-login-modal" hidden>
    <div class="relo-modal" role="dialog" aria-modal="true" aria-labelledby="relo-modal-title">
      <button type="button" class="relo-modal-close" data-relo-fechar aria-label="Fechar">&times;</button>

      <div class="relo-modal-top">
        <span class="relo-modal-mark">S</span>
        <div>
          <h2 id="relo-modal-title">Bem-vindo à Style Relo</h2>
          <p id="relo-modal-sub">Entre na sua conta ou crie um cadastro de cliente para agendar e acompanhar seus cortes.</p>
        </div>
      </div>

      <div class="relo-tabs" role="tablist">
        <button type="button" role="tab" class="relo-tab active" data-relo-tab="entrar">Entrar</button>
        <button type="button" role="tab" class="relo-tab" data-relo-tab="criar">Criar conta</button>
      </div>

      <div class="relo-alert" id="relo-modal-alert" hidden></div>

      <form id="relo-form-entrar" class="relo-form" novalidate>
        <label class="relo-field">
          <span>E-mail</span>
          <input type="email" name="email" autocomplete="email" placeholder="seu@email.com" required>
        </label>
        <label class="relo-field">
          <span>Senha</span>
          <input type="password" name="senha" autocomplete="current-password" placeholder="Sua senha" required>
        </label>
        <button type="submit" class="relo-submit">Entrar</button>
        <p class="relo-hint">Administradores usam o mesmo login: a aba <strong>Admin</strong> libera automaticamente.</p>
      </form>

      <form id="relo-form-criar" class="relo-form" hidden novalidate>
        <label class="relo-field">
          <span>Nome completo</span>
          <input type="text" name="nome" autocomplete="name" placeholder="Como podemos te chamar?" required>
        </label>
        <label class="relo-field">
          <span>E-mail</span>
          <input type="email" name="email" autocomplete="email" placeholder="seu@email.com" required>
        </label>
        <label class="relo-field">
          <span>Senha</span>
          <input type="password" name="senha" autocomplete="new-password" placeholder="Mínimo 6 caracteres" minlength="6" required>
        </label>
        <label class="relo-field">
          <span>Confirmar senha</span>
          <input type="password" name="confirmar" autocomplete="new-password" placeholder="Repita a senha" minlength="6" required>
        </label>
        <button type="submit" class="relo-submit">Criar minha conta</button>
        <p class="relo-hint">Seu cadastro é salvo no banco de dados da barbearia (nome, e-mail e senha protegida).</p>
      </form>

      <p class="relo-foot" id="relo-modal-foot"></p>
    </div>
  </div>`;

  let pronto = false;
  let abertoForcado = false;

  function injetar() {
    if (document.getElementById('relo-login-modal')) return;
    const caixa = document.createElement('div');
    caixa.innerHTML = HTML.trim();
    document.body.appendChild(caixa.firstElementChild);
    ligarEventos();
  }

  function elementos() {
    return {
      modal: document.getElementById('relo-login-modal'),
      alerta: document.getElementById('relo-modal-alert'),
      sub: document.getElementById('relo-modal-sub'),
      foot: document.getElementById('relo-modal-foot'),
      formEntrar: document.getElementById('relo-form-entrar'),
      formCriar: document.getElementById('relo-form-criar')
    };
  }

  function mostrarAlerta(texto, tipo) {
    const { alerta } = elementos();
    if (!alerta) return;
    alerta.textContent = texto;
    alerta.className = 'relo-alert show ' + (tipo || 'erro');
    alerta.hidden = false;
  }

  function limparAlerta() {
    const { alerta } = elementos();
    if (!alerta) return;
    alerta.hidden = true;
    alerta.textContent = '';
    alerta.className = 'relo-alert';
  }

  function trocarAba(nome) {
    const { formEntrar, formCriar } = elementos();
    document.querySelectorAll('.relo-tab').forEach((botao) => {
      botao.classList.toggle('active', botao.dataset.reloTab === nome);
    });
    if (formEntrar) formEntrar.hidden = nome !== 'entrar';
    if (formCriar) formCriar.hidden = nome !== 'criar';
    limparAlerta();
  }

  function abrir(opcoes) {
    injetar();
    const { modal, sub } = elementos();
    const config = opcoes || {};
    abertoForcado = true;
    if (sub && config.mensagem) sub.textContent = config.mensagem;
    trocarAba(config.aba || 'entrar');
    limparAlerta();
    if (config.erro) mostrarAlerta(config.erro, 'erro');
    modal.hidden = false;
    document.body.classList.add('relo-modal-aberto');
    const primeiro = modal.querySelector('input:not([hidden])');
    if (primeiro) setTimeout(() => primeiro.focus(), 120);
  }

  function fechar() {
    const { modal } = elementos();
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('relo-modal-aberto');
    limparAlerta();
  }

  function mensagemDeBoasVindas(usuario) {
    const primeiroNome = String(usuario.nome || usuario.email).split(' ')[0];
    return ReloAuth.ehAdmin(usuario)
      ? 'Olá, ' + primeiroNome + '! Abrindo o painel administrativo...'
      : 'Olá, ' + primeiroNome + '! Redirecionando para a sua área...';
  }

  function depoisDoLogin(usuario, modo) {
    const admin = ReloAuth.ehAdmin(usuario);
    mostrarAlerta(
      mensagemDeBoasVindas(usuario) +
        (modo === 'local' ? ' (banco local do navegador)' : ' (banco do servidor)'),
      'ok'
    );
    atualizarNavegacao();
    setTimeout(() => {
      global.location.href = admin ? 'admin.html' : 'dashboard.html';
    }, 900);
  }

  function enviando(form, texto) {
    const botao = form.querySelector('button[type="submit"]');
    if (!botao) return () => {};
    const original = botao.textContent;
    botao.disabled = true;
    botao.textContent = texto;
    return () => {
      botao.disabled = false;
      botao.textContent = original;
    };
  }

  async function tratarEntrar(evento) {
    evento.preventDefault();
    const form = evento.currentTarget;
    const dados = new FormData(form);
    limparAlerta();
    const restaurar = enviando(form, 'Entrando...');
    const resultado = await ReloAuth.entrar(dados.get('email'), dados.get('senha'));
    restaurar();
    if (!resultado.ok) {
      mostrarAlerta(resultado.erro, 'erro');
      return;
    }
    depoisDoLogin(resultado.usuario, resultado.modo);
  }

  async function tratarCriar(evento) {
    evento.preventDefault();
    const form = evento.currentTarget;
    const dados = new FormData(form);
    limparAlerta();
    const senha = String(dados.get('senha') || '');
    const confirmar = String(dados.get('confirmar') || '');
    if (senha !== confirmar) {
      mostrarAlerta('As senhas não coincidem.', 'erro');
      return;
    }
    const restaurar = enviando(form, 'Criando conta...');
    const resultado = await ReloAuth.cadastrar(dados.get('nome'), dados.get('email'), senha);
    restaurar();
    if (!resultado.ok) {
      mostrarAlerta(resultado.erro, 'erro');
      return;
    }
    depoisDoLogin(resultado.usuario, resultado.modo);
  }

  function ligarEventos() {
    const { modal, formEntrar, formCriar } = elementos();
    if (!modal) return;

    modal.querySelectorAll('[data-relo-fechar]').forEach((botao) => {
      botao.addEventListener('click', fechar);
    });
    modal.addEventListener('click', (evento) => {
      if (evento.target === modal) fechar();
    });
    document.addEventListener('keydown', (evento) => {
      if (evento.key === 'Escape') fechar();
    });
    modal.querySelectorAll('.relo-tab').forEach((botao) => {
      botao.addEventListener('click', () => trocarAba(botao.dataset.reloTab));
    });
    if (formEntrar) formEntrar.addEventListener('submit', tratarEntrar);
    if (formCriar) formCriar.addEventListener('submit', tratarCriar);
  }

  /* --------------------- navegação (menu do site) --------------------- */
  function atualizarNavegacao() {
    const logado = ReloAuth.usuario;
    const admin = ReloAuth.ehAdmin(logado);

    // Marca o link de login uma única vez: depois disso ele passa a ter href="#"
    // (por isso guardamos um atributo fixo para conseguir encontrá-lo de novo).
    document.querySelectorAll('.nav-links a[href="login.html"]').forEach((link) => {
      link.dataset.reloLogin = '1';
    });

    document.querySelectorAll('.nav-links [data-relo-login]').forEach((link) => {
      if (logado) {
        link.textContent = 'Sair (' + String(logado.nome || logado.email).split(' ')[0] + ')';
        link.href = '#';
        link.dataset.reloSair = '1';
        link.className = 'btn btn-outline';
      } else {
        link.textContent = 'Entrar';
        link.href = '#';
        link.dataset.reloAbrir = '1';
        link.className = 'btn btn-primary';
      }
    });

    document.querySelectorAll('.nav-links a[href="admin.html"]').forEach((link) => {
      if (logado && admin) {
        link.dataset.reloAdminOk = '1';
        link.title = 'Painel administrativo liberado';
      } else {
        delete link.dataset.reloAdminOk;
        link.title = 'Área exclusiva dos administradores';
      }
    });

    const { foot } = elementos();
    if (foot) {
      if (logado) {
        foot.innerHTML =
          'Conectado como <strong>' + escapar(logado.email) + '</strong> — perfil ' +
          (admin ? '<strong>administrador</strong>' : 'cliente') +
          (ReloAuth.modo === 'local' ? ' · banco local do navegador' : ' · banco do servidor');
      } else {
        foot.textContent =
          'Só os e-mails de administrador cadastrados abrem a aba Admin. Qualquer outro e-mail é atendido como cliente.';
      }
    }
  }

  function escapar(texto) {
    return String(texto == null ? '' : texto).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }

  function ligarNavegacao() {
    document.addEventListener('click', async (evento) => {
      const abrirLogin = evento.target.closest('[data-relo-abrir]');
      if (abrirLogin) {
        evento.preventDefault();
        abrir({ aba: 'entrar' });
        return;
      }

      const sair = evento.target.closest('[data-relo-sair]');
      if (sair) {
        evento.preventDefault();
        const usuario = ReloAuth.usuario;
        if (usuario && global.confirm('Sair da conta ' + usuario.email + '?')) {
          await ReloAuth.sair();
          atualizarNavegacao();
          global.location.href = 'index.html';
        }
        return;
      }

      const linkAdmin = evento.target.closest('a[href="admin.html"]');
      if (linkAdmin && !linkAdmin.dataset.reloAdminOk) {
        await ReloAuth.ready();
        if (!ReloAuth.ehAdmin(ReloAuth.usuario)) {
          evento.preventDefault();
          abrir({
            aba: 'entrar',
            mensagem: 'A aba Admin é exclusiva dos administradores da barbearia. Entre com um e-mail autorizado para continuar.',
            erro: 'Acesso restrito: este e-mail não tem permissão de administrador.'
          });
        }
      }
    });
  }

  /* --------------------- abertura automática --------------------- */
  async function iniciar() {
    if (pronto || !document.body) return;
    pronto = true;

    const pagina = (global.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const podePopUp = PAGINAS_SEM_POPUP.indexOf(pagina) === -1;
    if (podePopUp) injetar();

    await ReloAuth.ready();
    atualizarNavegacao();
    ReloAuth.aoMudar(atualizarNavegacao);

    if (!podePopUp) return;

    // A caixinha de login aparece para todos que ainda não estão logados.
    if (!ReloAuth.usuario && !ReloAuth.jaMostrouLoginNestaAba()) {
      ReloAuth.marcarLoginMostrado();
      const atraso = global.setTimeout(() => abrir(), 450);
      global.addEventListener('beforeunload', () => global.clearTimeout(atraso), { once: true });
    }
  }

  document.addEventListener('DOMContentLoaded', iniciar);

  global.ReloLoginModal = { abrir, fechar, atualizarNavegacao, trocarAba };
})(typeof window !== 'undefined' ? window : this);
