// Painel administrativo — Barbearia Prumo.
//
// Correções em relação à versão anterior:
//  - Falha ao consultar o Supabase não é mais mascarada por um cliente fictício
//    ("Cliente Exemplo"): o painel mostra o erro e o contador fica em "—".
//  - Todo valor vindo de dados externos passa por escapeHtml antes do innerHTML.
//  - switchTab não depende mais do `event` global implícito (que não existe de forma
//    confiável fora do Chromium); usa data-tab.
(function () {
  'use strict';

  const TITLES = {
    dashboard: 'Visão Geral do Negócio',
    clients: 'Gestão de Clientes & Logins',
    products: 'Controle de Estoque (Entrada/Saída)',
    maintenance: 'Gestão de Manutenção',
    expenses: 'Controle de Despesas',
  };

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(value);
    return div.innerHTML;
  }

  function switchTab(tabName) {
    document.querySelectorAll('.section-panel').forEach(panel => panel.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));

    document.getElementById(`tab-${tabName}`)?.classList.add('active');
    document.querySelector(`.nav-link[data-tab="${tabName}"]`)?.classList.add('active');

    const title = document.getElementById('page-title');
    if (title) title.textContent = TITLES[tabName] || 'Painel Administrativo';
  }

  function openModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.style.display = 'flex';
  }

  function closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.style.display = 'none';
  }

  // Persistência local: estoque, manutenção e despesas. Clientes vêm do Supabase.
  const AdminData = {
    getProducts: () => JSON.parse(localStorage.getItem('prumo_products') || '[]'),
    saveProducts: (data) => localStorage.setItem('prumo_products', JSON.stringify(data)),

    getMaintenance: () => JSON.parse(localStorage.getItem('prumo_maintenance') || '[]'),
    saveMaintenance: (data) => localStorage.setItem('prumo_maintenance', JSON.stringify(data)),

    getExpenses: () => JSON.parse(localStorage.getItem('prumo_expenses') || '[]'),
    saveExpenses: (data) => localStorage.setItem('prumo_expenses', JSON.stringify(data)),
  };

  function setClientsError(message) {
    const box = document.getElementById('clients-status');
    if (box) {
      box.textContent = message;
      box.style.display = 'block';
    }
  }

  function clearClientsError() {
    const box = document.getElementById('clients-status');
    if (box) box.style.display = 'none';
  }

  function readNumber(value, fallback = 0) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
  }

  async function loadClients() {
    const clientTable = document.getElementById('clients-table-body');
    const stat = document.getElementById('stat-clients');

    if (typeof window.supabaseClient === 'undefined') {
      if (stat) stat.textContent = '—';
      if (clientTable) {
        clientTable.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--danger);">Cliente do banco não carregou (supabase-client.js indisponível).</td></tr>`;
      }
      setClientsError('O módulo de acesso ao banco não foi carregado nesta página.');
      return;
    }

    let clients;
    try {
      clients = await window.supabaseClient.query('profiles', { select: '*' });
    } catch (error) {
      // Antes: console.log + lista fake com "Cliente Exemplo" e contador 1.
      console.error('Falha ao carregar clientes do Supabase:', error);
      if (stat) stat.textContent = '—';
      if (clientTable) {
        clientTable.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--danger);">Não foi possível carregar os clientes.</td></tr>`;
      }
      setClientsError(`Erro ao consultar o banco: ${error.message}`);
      return;
    }

    clearClientsError();
    if (!Array.isArray(clients)) clients = [];

    if (stat) stat.textContent = clients.length;

    if (clientTable) {
      clientTable.innerHTML = clients.length
        ? clients.map(c => `
      <tr>
        <td><strong>${escapeHtml(c.full_name) || 'Sem Nome'}</strong></td>
        <td><code>${escapeHtml(c.id) || 'N/A'}</code></td>
        <td>${c.updated_at ? escapeHtml(new Date(c.updated_at).toLocaleDateString('pt-BR')) : 'Recente'}</td>
        <td><span class="badge success">Ativo</span></td>
      </tr>
    `).join('')
        : `<tr><td colspan="4" style="text-align: center; color: var(--muted);">Nenhum cliente cadastrado ainda.</td></tr>`;
    }
  }

  async function loadAdminData() {
    await loadClients();

    try {
      // Estoque
      const products = AdminData.getProducts();
      const statProducts = document.getElementById('stat-products');
      if (statProducts) {
        statProducts.textContent = products.reduce((acc, p) => acc + readNumber(p.qty), 0);
      }
      const prodTable = document.getElementById('products-table-body');
      if (prodTable) {
        prodTable.innerHTML = products.length === 0
          ? `<tr><td colspan="5" style="text-align: center; color: var(--muted);">Nenhum produto cadastrado.</td></tr>`
          : products.map((p, idx) => `
        <tr>
          <td><strong>${escapeHtml(p.name)}</strong></td>
          <td>${escapeHtml(p.category)}</td>
          <td>
            <button class="btn btn-secondary" style="padding: 2px 6px; font-size: 12px;" onclick="adjustStock(${idx}, -1)">-</button>
            <span style="margin: 0 8px; font-weight: bold;">${escapeHtml(p.qty)}</span>
            <button class="btn btn-secondary" style="padding: 2px 6px; font-size: 12px;" onclick="adjustStock(${idx}, 1)">+</button>
          </td>
          <td>R$ ${readNumber(p.price).toFixed(2)}</td>
          <td><button class="btn btn-secondary" style="padding: 4px 8px; color: var(--danger);" onclick="deleteProduct(${idx})">Excluir</button></td>
        </tr>
      `).join('');
      }

      // Manutenção
      const maintenance = AdminData.getMaintenance();
      const statMaintenance = document.getElementById('stat-maintenance');
      if (statMaintenance) {
        statMaintenance.textContent = maintenance.filter(m => m.status !== 'Concluído').length;
      }
      const maintTable = document.getElementById('maintenance-table-body');
      if (maintTable) {
        maintTable.innerHTML = maintenance.length === 0
          ? `<tr><td colspan="5" style="text-align: center; color: var(--muted);">Nenhuma manutenção registrada.</td></tr>`
          : maintenance.map((m, idx) => `
        <tr>
          <td><strong>${escapeHtml(m.item)}</strong></td>
          <td>${escapeHtml(m.desc)}</td>
          <td><span class="badge ${m.status === 'Concluído' ? 'success' : 'danger'}">${escapeHtml(m.status)}</span></td>
          <td>${escapeHtml(m.date) || 'Hoje'}</td>
          <td><button class="btn btn-secondary" style="padding: 4px 8px;" onclick="toggleMaintenance(${idx})">Alternar Status</button></td>
        </tr>
      `).join('');
      }

      // Despesas
      const expenses = AdminData.getExpenses();
      const totalExpenses = expenses.reduce((acc, e) => acc + readNumber(e.value), 0);
      const statExpenses = document.getElementById('stat-expenses');
      if (statExpenses) statExpenses.textContent = `R$ ${totalExpenses.toFixed(2)}`;
      const expTable = document.getElementById('expenses-table-body');
      if (expTable) {
        expTable.innerHTML = expenses.length === 0
          ? `<tr><td colspan="4" style="text-align: center; color: var(--muted);">Nenhuma despesa registrada.</td></tr>`
          : expenses.map((e) => `
        <tr>
          <td><strong>${escapeHtml(e.desc)}</strong></td>
          <td>${escapeHtml(e.cat)}</td>
          <td style="color: var(--danger); font-weight: 600;">R$ ${readNumber(e.value).toFixed(2)}</td>
          <td>${escapeHtml(e.date) || 'Hoje'}</td>
        </tr>
      `).join('');
      }
    } catch (err) {
      console.error('Erro ao carregar dados administrativos:', err);
    }
  }

  function saveProduct(event) {
    event.preventDefault();
    const name = document.getElementById('prod-name').value;
    const category = document.getElementById('prod-category').value;
    const qty = readNumber(document.getElementById('prod-qty').value);
    const price = readNumber(document.getElementById('prod-price').value);

    if (!name.trim()) {
      alert('Informe o nome do produto.');
      return;
    }

    const products = AdminData.getProducts();
    products.push({ name, category, qty, price });
    AdminData.saveProducts(products);

    closeModal('product-modal');
    document.getElementById('product-form').reset();
    loadAdminData();
  }

  function adjustStock(index, delta) {
    const products = AdminData.getProducts();
    if (products[index]) {
      products[index].qty = Math.max(0, readNumber(products[index].qty) + delta);
      AdminData.saveProducts(products);
      loadAdminData();
    }
  }

  function deleteProduct(index) {
    const products = AdminData.getProducts();
    products.splice(index, 1);
    AdminData.saveProducts(products);
    loadAdminData();
  }

  function saveMaintenance(event) {
    event.preventDefault();
    const item = document.getElementById('maint-item').value;
    const desc = document.getElementById('maint-desc').value;
    const status = document.getElementById('maint-status').value;
    const date = new Date().toLocaleDateString('pt-BR');

    if (!item.trim()) {
      alert('Informe o item da manutenção.');
      return;
    }

    const maintenance = AdminData.getMaintenance();
    maintenance.push({ item, desc, status, date });
    AdminData.saveMaintenance(maintenance);

    closeModal('maintenance-modal');
    document.getElementById('maintenance-form').reset();
    loadAdminData();
  }

  function toggleMaintenance(index) {
    const maintenance = AdminData.getMaintenance();
    if (maintenance[index]) {
      maintenance[index].status = maintenance[index].status === 'Concluído' ? 'Pendente' : 'Concluído';
      AdminData.saveMaintenance(maintenance);
      loadAdminData();
    }
  }

  function saveExpense(event) {
    event.preventDefault();
    const desc = document.getElementById('exp-desc').value;
    const cat = document.getElementById('exp-cat').value;
    const value = readNumber(document.getElementById('exp-value').value);
    const date = new Date().toLocaleDateString('pt-BR');

    if (!desc.trim()) {
      alert('Informe a descrição da despesa.');
      return;
    }

    const expenses = AdminData.getExpenses();
    expenses.push({ desc, cat, value, date });
    AdminData.saveExpenses(expenses);

    closeModal('expense-modal');
    document.getElementById('expense-form').reset();
    loadAdminData();
  }

  // Usados por onclick= no admin.html (inclusive os gerados por innerHTML acima).
  Object.assign(window, {
    switchTab, openModal, closeModal, loadAdminData,
    saveProduct, adjustStock, deleteProduct,
    saveMaintenance, toggleMaintenance, saveExpense,
    AdminData,
  });

  document.addEventListener('DOMContentLoaded', () => {
    loadAdminData();
  });
})();
