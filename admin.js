/*
 * Painel administrativo do Style Relo Barber.
 *
 * - Acesso liberado apenas para as contas de administrador (admin-accounts.js),
 *   conferidas pelo ReloAuth (auth-core.js / auth.js).
 * - Aba "Clientes & Logins" mostra o banco de dados de clientes + histórico de acessos.
 * - Estoque, manutenção e despesas continuam guardados no navegador (localStorage).
 */
(function (global) {
  'use strict';

  const AdminData = {
    getProducts: () => JSON.parse(localStorage.getItem('prumo_products') || '[]'),
    saveProducts: (dados) => localStorage.setItem('prumo_products', JSON.stringify(dados)),

    getMaintenance: () => JSON.parse(localStorage.getItem('prumo_maintenance') || '[]'),
    saveMaintenance: (dados) => localStorage.setItem('prumo_maintenance', JSON.stringify(dados)),

    getExpenses: () => JSON.parse(localStorage.getItem('prumo_expenses') || '[]'),
    saveExpenses: (dados) => localStorage.setItem('prumo_expenses', JSON.stringify(dados))
  };

  let usuariosCarregados = [];
  let liberado = false;

  /* --------------------------- utilidades --------------------------- */
  function escapar(texto) {
    return String(texto == null ? '' : texto).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }

  function dataCurta(iso) {
    if (!iso) return '—';
    const data = new Date(iso);
    if (isNaN(data.getTime())) return '—';
    return data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function definir(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(valor == null ? '' : valor);
  }

  /* --------------------------- acesso --------------------------- */
  function telaBloqueio(titulo, texto, mostrarBotao) {
    const painel = document.getElementById('acesso-painel');
    const layout = document.querySelector('.admin-layout');
    if (layout) layout.style.display = 'none';
    if (!painel) return;
    painel.hidden = false;
    painel.innerHTML = `
      <div class="acesso-card">
        <span class="relo-modal-mark">S</span>
        <h1>${escapar(titulo)}</h1>
        <p>${texto}</p>
        <div class="acesso-acoes">
          ${mostrarBotao ? '<button type="button" class="btn" onclick="abrirLoginAdmin()">Entrar como administrador</button>' : ''}
          <a class="btn btn-secondary" href="index.html">Voltar ao site</a>
          <a class="btn btn-secondary" href="dashboard.html">Minha área</a>
        </div>
      </div>`;
  }

  function abrirLoginAdmin() {
    if (global.ReloLoginModal) {
      global.ReloLoginModal.abrir({
        aba: 'entrar',
        mensagem: 'Entre com um e-mail de administrador para abrir o painel da barbearia.'
      });
    }
  }
  global.abrirLoginAdmin = abrirLoginAdmin;

  async function verificarAcesso() {
    await global.ReloAuth.ready();
    const usuario = global.ReloAuth.usuario;

    if (!usuario) {
      telaBloqueio(
        'Área restrita aos administradores',
        'Faça login com um e-mail de administrador autorizado para abrir o painel.',
        true
      );
      global.setTimeout(abrirLoginAdmin, 400);
      return false;
    }

    if (!global.ReloAuth.ehAdmin(usuario)) {
      telaBloqueio(
        'Sua conta é de cliente',
        'A conta <strong>' + escapar(usuario.email) + '</strong> não tem permissão de administrador. ' +
          'Apenas os e-mails cadastrados da equipe abrem esta aba.',
        false
      );
      return false;
    }

    liberado = true;
    const cracha = document.getElementById('usuario-logado');
    if (cracha) {
      cracha.innerHTML =
        '<span class="relo-pill admin">Admin</span> ' + escapar(usuario.email) +
        (global.ReloAuth.modo === 'local' ? ' (banco local)' : ' (banco do servidor)');
    }
    return true;
  }

  /* --------------------------- dados do banco --------------------------- */
  async function carregarUsuarios() {
    const corpo = document.getElementById('clients-table-body');
    if (!corpo) return;

    const resultado = await global.ReloAuth.listarUsuarios();
    if (!resultado.ok) {
      corpo.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted);">${escapar(
        resultado.erro || 'Não foi possível carregar o banco de clientes.'
      )}</td></tr>`;
      return;
    }

    usuariosCarregados = resultado.usuarios;
    definir('stat-clients', resultado.usuarios.filter((u) => u.perfil === 'cliente').length);
    definir('stat-admins', resultado.usuarios.filter((u) => u.perfil === 'admin').length);

    renderLinhasClientes(resultado.usuarios);
    renderizarLogins(resultado.logins || []);
  }

  function renderLinhasClientes(lista) {
    const corpo = document.getElementById('clients-table-body');
    if (!corpo) return;

    if (!lista.length) {
      corpo.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);">Nenhuma conta encontrada.</td></tr>';
      definir('clientes-contagem', '');
      return;
    }

    corpo.innerHTML = lista
      .map(
        (u) => `
      <tr>
        <td><strong>${escapar(u.nome || 'Sem nome')}</strong></td>
        <td><code>${escapar(u.email)}</code></td>
        <td><span class="relo-pill ${u.perfil === 'admin' ? 'admin' : 'cliente'}">${u.perfil === 'admin' ? 'Admin' : 'Cliente'}</span></td>
        <td>${dataCurta(u.criadoEm)}</td>
        <td>${u.ultimoLogin ? dataCurta(u.ultimoLogin) + ' <span style="color:var(--muted)">(' + (u.totalLogins || 0) + 'x)</span>' : '<span style="color:var(--muted)">nunca entrou</span>'}</td>
        <td>${
          u.origem === 'semente'
            ? '<span style="color:var(--muted);font-size:12px;">protegido</span>'
            : `<button class="btn btn-danger btn-sm" onclick="excluirUsuario('${escapar(u.id)}')">🗑 Excluir</button>`
        }</td>
      </tr>`
      )
      .join('');

    definir('clientes-contagem', lista.length + ' conta' + (lista.length === 1 ? '' : 's') + ' exibida' + (lista.length === 1 ? '' : 's'));
  }

  function filtrarClientes() {
    const campo = document.getElementById('busca-clientes');
    const termo = String((campo && campo.value) || '').trim().toLowerCase();
    if (!termo) return renderLinhasClientes(usuariosCarregados);
    const filtrados = usuariosCarregados.filter(
      (u) => (u.nome || '').toLowerCase().includes(termo) || (u.email || '').toLowerCase().includes(termo)
    );
    renderLinhasClientes(filtrados);
  }
  global.filtrarClientes = filtrarClientes;

  function renderizarLogins(logins) {
    const alvo = document.getElementById('logins-list');
    if (!alvo) return;
    if (!logins.length) {
      alvo.innerHTML = '<p style="color:var(--muted);margin:0;">Nenhum acesso registrado ainda.</p>';
      return;
    }
    alvo.innerHTML = `
      <table>
        <thead>
          <tr><th>E-mail</th><th>Perfil</th><th>Quando</th><th>Situação</th></tr>
        </thead>
        <tbody>
          ${logins
            .map(
              (l) => `
            <tr>
              <td><code>${escapar(l.email)}</code></td>
              <td>${escapar(l.perfil)}</td>
              <td>${dataCurta(l.quando)}</td>
              <td><span class="badge ${l.sucesso ? 'success' : 'danger'}">${l.sucesso ? 'Sucesso' : 'Falhou'}</span></td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>`;
  }

  async function salvarCliente(evento) {
    evento.preventDefault();
    const nome = document.getElementById('cli-name').value;
    const email = document.getElementById('cli-email').value;
    const senha = document.getElementById('cli-senha').value;
    const aviso = document.getElementById('cliente-modal-aviso');

    const resultado = await global.ReloAuth.criarCliente({ nome, email, senha });
    if (!resultado.ok) {
      if (aviso) {
        aviso.textContent = resultado.erro;
        aviso.hidden = false;
      }
      return;
    }
    if (aviso) aviso.hidden = true;
    fecharModal('cliente-modal');
    document.getElementById('cliente-form').reset();
    carregarUsuarios();
  }

  /* --------------------------- confirmação + toast --------------------------- */
  let confirmarAcao = null;

  function confirmar(titulo, mensagem, rotuloOk, acao) {
    definir('confirm-titulo', titulo);
    definir('confirm-mensagem', mensagem);
    const okBtn = document.getElementById('confirm-ok');
    if (okBtn) okBtn.textContent = rotuloOk || 'Confirmar';
    confirmarAcao = acao;
    openModal('confirm-modal');
  }

  function executarConfirmacao() {
    fecharModal('confirm-modal');
    const acao = confirmarAcao;
    confirmarAcao = null;
    if (typeof acao === 'function') acao();
  }
  global.executarConfirmacao = executarConfirmacao;

  function toast(mensagem, tipo) {
    const t = document.getElementById('toast');
    if (!t) {
      global.alert(mensagem);
      return;
    }
    t.textContent = mensagem;
    t.className = 'toast show' + (tipo ? ' ' + tipo : '');
    global.clearTimeout(t._timer);
    t._timer = global.setTimeout(() => {
      t.className = 'toast';
    }, 3200);
  }

  async function excluirUsuario(id) {
    const alvo = usuariosCarregados.find((u) => u.id === id);
    const nome = alvo ? alvo.nome || alvo.email : id;
    confirmar(
      'Excluir cliente',
      'Tem certeza que deseja excluir o cadastro de ' + nome + '? Essa ação não pode ser desfeita.',
      'Excluir',
      async () => {
        const resultado = await global.ReloAuth.removerUsuario(id);
        if (!resultado.ok) {
          toast(resultado.erro || 'Não foi possível excluir.', 'err');
          return;
        }
        toast('Cliente removido com sucesso.', 'ok');
        carregarUsuarios();
      }
    );
  }

  /* --------------------------- estoque / despesas --------------------------- */
  function carregarOperacional() {
    const products = AdminData.getProducts();
    definir('stat-products', products.reduce((soma, p) => soma + parseInt(p.qty || 0, 10), 0));
    const prodTable = document.getElementById('products-table-body');
    if (prodTable) {
      prodTable.innerHTML = products.length
        ? products
            .map(
              (p, idx) => `
        <tr>
          <td><strong>${escapar(p.name)}</strong></td>
          <td>${escapar(p.category)}</td>
          <td>
            <button class="btn btn-secondary" style="padding:2px 6px;font-size:12px;" onclick="adjustStock(${idx}, -1)">-</button>
            <span style="margin:0 8px;font-weight:bold;">${p.qty}</span>
            <button class="btn btn-secondary" style="padding:2px 6px;font-size:12px;" onclick="adjustStock(${idx}, 1)">+</button>
          </td>
          <td>R$ ${parseFloat(p.price || 0).toFixed(2)}</td>
          <td><button class="btn btn-secondary" style="padding:4px 8px;color:var(--danger);" onclick="deleteProduct(${idx})">Excluir</button></td>
        </tr>`
            )
            .join('')
        : '<tr><td colspan="5" style="text-align:center;color:var(--muted);">Nenhum produto cadastrado.</td></tr>';
    }

    const maintenance = AdminData.getMaintenance();
    definir('stat-maintenance', maintenance.filter((m) => m.status !== 'Concluído').length);
    const maintTable = document.getElementById('maintenance-table-body');
    if (maintTable) {
      maintTable.innerHTML = maintenance.length
        ? maintenance
            .map(
              (m, idx) => `
        <tr>
          <td><strong>${escapar(m.item)}</strong></td>
          <td>${escapar(m.desc)}</td>
          <td><span class="badge ${m.status === 'Concluído' ? 'success' : 'danger'}">${escapar(m.status)}</span></td>
          <td>${escapar(m.date || 'Hoje')}</td>
          <td><button class="btn btn-secondary" style="padding:4px 8px;" onclick="toggleMaintenance(${idx})">Alternar Status</button></td>
        </tr>`
            )
            .join('')
        : '<tr><td colspan="5" style="text-align:center;color:var(--muted);">Nenhuma manutenção registrada.</td></tr>';
    }

    const expenses = AdminData.getExpenses();
    const total = expenses.reduce((soma, e) => soma + parseFloat(e.value || 0), 0);
    definir('stat-expenses', 'R$ ' + total.toFixed(2));
    const expTable = document.getElementById('expenses-table-body');
    if (expTable) {
      expTable.innerHTML = expenses.length
        ? expenses
            .map(
              (e, idx) => `
        <tr>
          <td><strong>${escapar(e.desc)}</strong></td>
          <td>${escapar(e.cat)}</td>
          <td style="color:var(--danger);font-weight:600;">R$ ${parseFloat(e.value || 0).toFixed(2)}</td>
          <td>${escapar(e.date || 'Hoje')}</td>
          <td><button class="btn btn-secondary" style="padding:4px 8px;color:var(--danger);" onclick="excluirDespesa(${idx})">Excluir</button></td>
        </tr>`
            )
            .join('')
        : '<tr><td colspan="5" style="text-align:center;color:var(--muted);">Nenhuma despesa registrada.</td></tr>';
    }
  }

  async function loadAdminData() {
    if (!liberado) {
      const ok = await verificarAcesso();
      if (!ok) return;
    }
    try {
      await carregarUsuarios();
      carregarOperacional();
      const status = document.getElementById('supabase-status');
      if (status) {
        status.textContent = global.ReloAuth.modo === 'servidor' ? 'Banco do servidor ativo' : 'Banco local do navegador';
        status.className = 'badge ' + (global.ReloAuth.modo === 'servidor' ? 'success' : 'danger');
      }
    } catch (erro) {
      console.error('Erro ao carregar dados administrativos:', erro);
    }
  }
  global.loadAdminData = loadAdminData;

  /* --------------------------- navegação / modais --------------------------- */
  function switchTab(nome, elemento) {
    document.querySelectorAll('.section-panel').forEach((p) => p.classList.remove('active'));
    document.querySelectorAll('.sidebar .nav-link').forEach((l) => l.classList.remove('active'));
    const painel = document.getElementById('tab-' + nome);
    if (painel) painel.classList.add('active');
    if (elemento) elemento.classList.add('active');

    const titulos = {
      dashboard: 'Visão Geral do Negócio',
      clients: 'Banco de Clientes & Logins',
      products: 'Controle de Estoque (Entrada/Saída)',
      maintenance: 'Gestão de Manutenção',
      expenses: 'Controle de Despesas',
      ia: 'Nano Banana — Central de IA'
    };
    definir('page-title', titulos[nome] || 'Painel Administrativo');

    if (nome === 'clients') carregarUsuarios();
    if (nome === 'ia') carregarIA();
  }
  global.switchTab = switchTab;

  function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'flex';
  }
  function fecharModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
  }
  global.openModal = openModal;
  global.closeModal = fecharModal;
  global.fecharModal = fecharModal;

  function saveProduct(evento) {
    evento.preventDefault();
    const products = AdminData.getProducts();
    products.push({
      name: document.getElementById('prod-name').value,
      category: document.getElementById('prod-category').value,
      qty: parseInt(document.getElementById('prod-qty').value, 10),
      price: parseFloat(document.getElementById('prod-price').value)
    });
    AdminData.saveProducts(products);
    fecharModal('product-modal');
    document.getElementById('product-form').reset();
    carregarOperacional();
  }
  global.saveProduct = saveProduct;

  function adjustStock(index, delta) {
    const products = AdminData.getProducts();
    if (!products[index]) return;
    products[index].qty = Math.max(0, products[index].qty + delta);
    AdminData.saveProducts(products);
    carregarOperacional();
  }
  global.adjustStock = adjustStock;

  function deleteProduct(index) {
    const products = AdminData.getProducts();
    products.splice(index, 1);
    AdminData.saveProducts(products);
    carregarOperacional();
  }
  global.deleteProduct = deleteProduct;

  function saveMaintenance(evento) {
    evento.preventDefault();
    const maintenance = AdminData.getMaintenance();
    maintenance.push({
      item: document.getElementById('maint-item').value,
      desc: document.getElementById('maint-desc').value,
      status: document.getElementById('maint-status').value,
      date: new Date().toLocaleDateString('pt-BR')
    });
    AdminData.saveMaintenance(maintenance);
    fecharModal('maintenance-modal');
    document.getElementById('maintenance-form').reset();
    carregarOperacional();
  }
  global.saveMaintenance = saveMaintenance;

  function toggleMaintenance(index) {
    const maintenance = AdminData.getMaintenance();
    if (!maintenance[index]) return;
    maintenance[index].status = maintenance[index].status === 'Concluído' ? 'Pendente' : 'Concluído';
    AdminData.saveMaintenance(maintenance);
    carregarOperacional();
  }
  global.toggleMaintenance = toggleMaintenance;

  function saveExpense(evento) {
    evento.preventDefault();
    const expenses = AdminData.getExpenses();
    expenses.push({
      desc: document.getElementById('exp-desc').value,
      cat: document.getElementById('exp-cat').value,
      value: parseFloat(document.getElementById('exp-value').value),
      date: new Date().toLocaleDateString('pt-BR')
    });
    AdminData.saveExpenses(expenses);
    fecharModal('expense-modal');
    document.getElementById('expense-form').reset();
    carregarOperacional();
  }
  global.saveExpense = saveExpense;

  function excluirDespesa(index) {
    const expenses = AdminData.getExpenses();
    expenses.splice(index, 1);
    AdminData.saveExpenses(expenses);
    carregarOperacional();
  }
  global.excluirDespesa = excluirDespesa;

  /* --------------------------- Nano Banana (IA) --------------------------- */
  function chamarIaAdmin(corpo) {
    const tok = (global.ReloAuth && global.ReloAuth.token) || '';
    const opts = { method: corpo ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' } };
    if (tok) opts.headers.Authorization = 'Bearer ' + tok;
    if (corpo) opts.body = JSON.stringify(corpo);
    return fetch('api/admin/ia', opts)
      .then((r) => r.json().then((j) => ({ status: r.status, ok: r.ok, dados: j })))
      .catch(() => ({ status: 0, ok: false, dados: { erro: 'Servidor indisponível.' } }));
  }

  async function carregarIA() {
    const resposta = await chamarIaAdmin();
    const dados = resposta.dados || {};
    const pill = document.getElementById('ia-pill');

    if (!resposta.ok) {
      definir('ia-status', dados.erro || 'Erro ao carregar');
      if (pill) {
        pill.className = 'pill off';
        pill.textContent = 'sem conexão';
      }
      return;
    }

    if (pill) {
      pill.className = 'pill ' + (dados.ativo ? 'on' : 'off');
      pill.textContent = dados.ativo ? 'IA ativa' : 'IA desligada';
    }
    definir('ia-status', dados.ativo ? 'Ativa' : 'Desligada');
    definir('ia-modelo', dados.ativo ? dados.modelo : dados.chaveConfigurada ? dados.modelo : 'sem chave');
    definir('ia-chave-mascara', dados.chaveMascara || 'nenhuma configurada');
    definir('ia-uso', dados.usoUltimaHora);
    definir('ia-limite-atual', dados.limitePorHora);

    const campoLimite = document.getElementById('ia-limite-input');
    if (campoLimite && !campoLimite.value) campoLimite.value = dados.limitePorHora;
  }
  global.carregarIA = carregarIA;

  async function salvarChaveIA() {
    const campo = document.getElementById('ia-chave-input');
    const chave = String((campo && campo.value) || '').trim();
    if (!chave) {
      toast('Cole uma chave válida antes de salvar.', 'err');
      return;
    }
    confirmar(
      'Salvar chave da IA',
      'A chave será guardada no servidor e o Nano Banana será ativado na hora. Continuar?',
      'Salvar chave',
      async () => {
        const resposta = await chamarIaAdmin({ chave });
        const dados = resposta.dados || {};
        if (!resposta.ok) {
          toast(dados.erro || 'Não foi possível salvar a chave.', 'err');
          return;
        }
        if (campo) campo.value = '';
        toast('Chave salva! Nano Banana ' + (dados.ativo ? 'ativo' : 'inativo') + '.', 'ok');
        carregarIA();
      }
    );
  }
  global.salvarChaveIA = salvarChaveIA;

  async function salvarLimiteIA() {
    const limitePorHora = Number((document.getElementById('ia-limite-input') || {}).value);
    if (!Number.isFinite(limitePorHora) || limitePorHora < 1 || limitePorHora > 500) {
      toast('Informe um limite válido (entre 1 e 500).', 'err');
      return;
    }
    const resposta = await chamarIaAdmin({ limitePorHora });
    const dados = resposta.dados || {};
    if (!resposta.ok) {
      toast(dados.erro || 'Não foi possível salvar o limite.', 'err');
      return;
    }
    toast('Limite atualizado para ' + dados.limitePorHora + ' gerações/hora.', 'ok');
    carregarIA();
  }
  global.salvarLimiteIA = salvarLimiteIA;

  global.salvarCliente = salvarCliente;
  global.excluirUsuario = excluirUsuario;

  async function sairDaConta() {
    await global.ReloAuth.sair();
    global.location.href = 'index.html';
  }
  global.sairDaConta = sairDaConta;

  function liberarPainel() {
    const painel = document.getElementById('acesso-painel');
    const layout = document.querySelector('.admin-layout');
    if (painel) painel.hidden = true;
    if (layout) layout.style.display = 'flex';
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const liberadoAgora = await verificarAcesso();
    if (liberadoAgora) {
      await carregarUsuarios();
      carregarOperacional();
      carregarIA();
      return;
    }

    // Quem entrou pela caixinha de login (admin ou cliente) atualiza a tela na hora.
    global.ReloAuth.aoMudar(async (usuario) => {
      if (!usuario) return;
      if (global.ReloAuth.ehAdmin(usuario)) {
        liberarPainel();
        await verificarAcesso();
        await carregarUsuarios();
        carregarOperacional();
        carregarIA();
        return;
      }
      // Cliente comum: mantém o painel fechado e explica o motivo.
      const layout = document.querySelector('.admin-layout');
      if (layout) layout.style.display = 'none';
      telaBloqueio(
        'Sua conta é de cliente',
        'A conta <strong>' + escapar(usuario.email) + '</strong> não tem permissão de administrador. ' +
          'Apenas os e-mails cadastrados da equipe abrem esta aba.',
        false
      );
    });
  });
})(typeof window !== 'undefined' ? window : this);
