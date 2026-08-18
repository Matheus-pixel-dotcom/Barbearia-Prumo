// Admin JavaScript for Barbearia Prumo

function switchTab(tabName) {
  document.querySelectorAll('.section-panel').forEach(panel => {
    panel.classList.remove('active');
  });
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
  });

  const targetPanel = document.getElementById(`tab-${tabName}`);
  if (targetPanel) {
    targetPanel.classList.add('active');
  }

  // Highlight active nav link
  event.currentTarget.classList.add('active');

  const titles = {
    dashboard: 'Visão Geral do Negócio',
    clients: 'Gestão de Clientes & Logins',
    products: 'Controle de Estoque (Entrada/Saída)',
    maintenance: 'Gestão de Manutenção',
    expenses: 'Controle de Despesas'
  };
  document.getElementById('page-title').innerText = titles[tabName] || 'Painel Administrativo';
}

function openModal(modalId) {
  document.getElementById(modalId).style.display = 'flex';
}

function closeModal(modalId) {
  document.getElementById(modalId).style.display = 'none';
}

// Data store using localStorage as reliable persistence layer + Supabase sync when available
const AdminData = {
  getProducts: () => JSON.parse(localStorage.getItem('prumo_products') || '[]'),
  saveProducts: (data) => localStorage.setItem('prumo_products', JSON.stringify(data)),
  
  getMaintenance: () => JSON.parse(localStorage.getItem('prumo_maintenance') || '[]'),
  saveMaintenance: (data) => localStorage.setItem('prumo_maintenance', JSON.stringify(data)),

  getExpenses: () => JSON.parse(localStorage.getItem('prumo_expenses') || '[]'),
  saveExpenses: (data) => localStorage.setItem('prumo_expenses', JSON.stringify(data)),
};

async function loadAdminData() {
  try {
    // 1. Load Clients from Supabase profiles table if supabaseClient is ready
    let clients = [];
    if (typeof supabaseClient !== 'undefined') {
      try {
        const res = await supabaseClient.query('profiles', { select: '*' });
        if (res && Array.isArray(res)) {
          clients = res;
        }
      } catch (e) {
        console.log('Using local fallback for clients', e);
      }
    }
    
    if (clients.length === 0) {
      clients = JSON.parse(localStorage.getItem('prumo_clients') || '[{"id":"1","full_name":"Cliente Exemplo","updated_at":"2026-08-18"}]');
    }

    document.getElementById('stat-clients').innerText = clients.length;
    
    const clientTable = document.getElementById('clients-table-body');
    clientTable.innerHTML = clients.map(c => `
      <tr>
        <td><strong>${c.full_name || 'Sem Nome'}</strong></td>
        <td><code>${c.id || 'N/A'}</code></td>
        <td>${c.updated_at ? new Date(c.updated_at).toLocaleDateString('pt-BR') : 'Recente'}</td>
        <td><span class="badge success">Ativo</span></td>
      </tr>
    `).join('');

    // 2. Products
    const products = AdminData.getProducts();
    document.getElementById('stat-products').innerText = products.reduce((acc, p) => acc + parseInt(p.qty || 0), 0);
    const prodTable = document.getElementById('products-table-body');
    if (products.length === 0) {
      prodTable.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--muted);">Nenhum produto cadastrado.</td></tr>`;
    } else {
      prodTable.innerHTML = products.map((p, idx) => `
        <tr>
          <td><strong>${p.name}</strong></td>
          <td>${p.category}</td>
          <td>
            <button class="btn btn-secondary" style="padding: 2px 6px; font-size: 12px;" onclick="adjustStock(${idx}, -1)">-</button>
            <span style="margin: 0 8px; font-weight: bold;">${p.qty}</span>
            <button class="btn btn-secondary" style="padding: 2px 6px; font-size: 12px;" onclick="adjustStock(${idx}, 1)">+</button>
          </td>
          <td>R$ ${parseFloat(p.price).toFixed(2)}</td>
          <td><button class="btn btn-secondary" style="padding: 4px 8px; color: var(--danger);" onclick="deleteProduct(${idx})">Excluir</button></td>
        </tr>
      `).join('');
    }

    // 3. Maintenance
    const maintenance = AdminData.getMaintenance();
    document.getElementById('stat-maintenance').innerText = maintenance.filter(m => m.status !== 'Concluído').length;
    const maintTable = document.getElementById('maintenance-table-body');
    if (maintenance.length === 0) {
      maintTable.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--muted);">Nenhuma manutenção registrada.</td></tr>`;
    } else {
      maintTable.innerHTML = maintenance.map((m, idx) => `
        <tr>
          <td><strong>${m.item}</strong></td>
          <td>${m.desc}</td>
          <td><span class="badge ${m.status === 'Concluído' ? 'success' : 'danger'}">${m.status}</span></td>
          <td>${m.date || 'Hoje'}</td>
          <td><button class="btn btn-secondary" style="padding: 4px 8px;" onclick="toggleMaintenance(${idx})">Alternar Status</button></td>
        </tr>
      `).join('');
    }

    // 4. Expenses
    const expenses = AdminData.getExpenses();
    const totalExpenses = expenses.reduce((acc, e) => acc + parseFloat(e.value || 0), 0);
    document.getElementById('stat-expenses').innerText = `R$ ${totalExpenses.toFixed(2)}`;
    const expTable = document.getElementById('expenses-table-body');
    if (expenses.length === 0) {
      expTable.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--muted);">Nenhuma despesa registrada.</td></tr>`;
    } else {
      expTable.innerHTML = expenses.map((e, idx) => `
        <tr>
          <td><strong>${e.desc}</strong></td>
          <td>${e.cat}</td>
          <td style="color: var(--danger); font-weight: 600;">R$ ${parseFloat(e.value).toFixed(2)}</td>
          <td>${e.date || 'Hoje'}</td>
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
  const qty = parseInt(document.getElementById('prod-qty').value);
  const price = parseFloat(document.getElementById('prod-price').value);

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
    products[index].qty = Math.max(0, products[index].qty + delta);
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
  const value = parseFloat(document.getElementById('exp-value').value);
  const date = new Date().toLocaleDateString('pt-BR');

  const expenses = AdminData.getExpenses();
  expenses.push({ desc, cat, value, date });
  AdminData.saveExpenses(expenses);

  closeModal('expense-modal');
  document.getElementById('expense-form').reset();
  loadAdminData();
}

window.addEventListener('DOMContentLoaded', () => {
  loadAdminData();
});
