/*
 * Painel administrativo premium do Style Relo Barber.
 *
 * - Acesso liberado apenas para as contas de administrador (admin-accounts.js),
 *   conferidas pelo ReloAuth (auth-core.js).
 * - "Banco de Clientes": tudo que se cadastra no site aparece aqui na hora, porque a
 *   fonte é o banco do servidor (data/db.json). O espelho no Supabase é mostrado como
 *   status por cliente + fila com reenvio.
 * - Estoque, manutenção e despesas agora moram no banco do servidor (compartilhado
 *   entre os admins). Se o site estiver aberto SEM servidor (modo local), o painel
 *   continua funcionando com o localStorage de antes — nada é perdido.
 *
 * Sem dependências externas, sem CDN: os gráficos são SVG desenhados aqui mesmo.
 */
(function (global) {
  'use strict';

  const ReloAuth = global.ReloAuth;
  const CHAVES_LOCAIS = {
    produtos: 'prumo_products',
    manutencoes: 'prumo_maintenance',
    despesas: 'prumo_expenses'
  };
  const LINHAS_PAGINA = 12;

  const estado = {
    liberado: false,
    usuarios: [],
    logins: [],
    metricas: null,
    busca: '',
    filtroPerfil: '',
    filtroSync: '',
    ordem: 'recentes',
    pagina: 0,
    estoque: null,
    manutencoes: [],
    despesas: [],
    sync: null,
    emModoLocal: false
  };

  /* ============================ utilidades ============================ */
  function id(sel) {
    return document.getElementById(sel);
  }
  function definir(sel, valor) {
    const el = id(sel);
    if (el) el.textContent = String(valor == null ? '' : valor);
  }
  function html(sel, conteudo) {
    const el = id(sel);
    if (el) el.innerHTML = conteudo;
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
  function moeda(valor) {
    return 'R$ ' + Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function dataCurta(iso) {
    if (!iso) return '—';
    if (ehDataLegada(iso)) return String(iso); // "01/10/2026" já está no formato certo
    const data = new Date(iso);
    if (isNaN(data.getTime())) return '—';
    return (
      data.toLocaleDateString('pt-BR') +
      ' ' +
      data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    );
  }
  // Dados antigos do painel guardavam a data como texto "dd/mm/aaaa".
  // Este parser aceita tanto ISO (servidor) quanto o formato legado.
  function mesDe(valor) {
    const texto = String(valor || '');
    if (/^\d{4}-\d{2}/.test(texto)) return texto.slice(0, 7);
    const m = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return m[3] + '-' + m[2].padStart(2, '0');
    return '';
  }
  function ehDataLegada(valor) {
    return /^\d{1,2}\/\d{1,2}\/\d{4}/.test(String(valor || ''));
  }
  function tempoRelativo(iso) {
    if (!iso) return '—';
    const quando = new Date(iso).getTime();
    if (isNaN(quando)) return '—';
    const diff = Date.now() - quando;
    if (diff < 0) return 'agora';
    const minutos = Math.floor(diff / 60000);
    if (minutos < 1) return 'agora';
    if (minutos < 60) return 'há ' + minutos + ' min';
    const horas = Math.floor(minutos / 60);
    if (horas < 24) return 'há ' + horas + 'h';
    const dias = Math.floor(horas / 24);
    if (dias < 30) return 'há ' + dias + ' dia' + (dias === 1 ? '' : 's');
    return new Date(iso).toLocaleDateString('pt-BR');
  }
  function iniciais(nome, email) {
    const base = String(nome || email || '?').trim();
    const partes = base.split(/\s+/).filter(Boolean);
    if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
    return base.slice(0, 2).toUpperCase();
  }

  /* ============================ API do painel ============================ */
  function autenticado() {
    return ReloAuth && ReloAuth.modo === 'servidor';
  }
  async function api(caminho, corpo, metodo) {
    if (!autenticado()) return { ausente: true };
    const opts = { method: corpo ? metodo || 'POST' : 'GET', headers: {} };
    if (corpo) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(corpo);
    }
    if (ReloAuth.token) opts.headers.Authorization = 'Bearer ' + ReloAuth.token;
    let resposta;
    try {
      resposta = await fetch('api/' + caminho, opts);
    } catch (erro) {
      return { ausente: true };
    }
    let dados = {};
    try {
      dados = await resposta.json();
    } catch (erro) {
      dados = {};
    }
    if (!resposta.ok) {
      // servidor antigo sem a rota nova: trata como "ausente" e usa o navegador
      const mensagem = dados.erro || 'Erro ' + resposta.status;
      if (resposta.status === 404) return { ausente: true, erro: mensagem };
      return { erro: mensagem, status: resposta.status };
    }
    return { dados };
  }

  /* ============================ localStorage (reserva) ============================ */
  function lerLocal(chave) {
    try {
      const bruto = localStorage.getItem(CHAVES_LOCAIS[chave]);
      const lista = bruto ? JSON.parse(bruto) : [];
      return Array.isArray(lista) ? lista : [];
    } catch (erro) {
      return [];
    }
  }
  function gravarLocal(chave, lista) {
    try {
      localStorage.setItem(CHAVES_LOCAIS[chave], JSON.stringify(lista));
    } catch (erro) {
      console.warn('[admin] não consegui gravar no navegador:', erro.message);
    }
  }
  // Converte o formato antigo (name/qty/price) para o atual (nome/quantidade/preco).
  function normalizarProduto(p, indice) {
    return {
      id: p.id || 'local_' + indice,
      nome: p.nome || p.name || 'Produto',
      categoria: p.categoria || p.category || '',
      quantidade: Number(p.quantidade != null ? p.quantidade : p.qty) || 0,
      preco: Number(p.preco != null ? p.preco : p.price) || 0,
      minimo: Number(p.minimo || 0),
      atualizadoEm: p.atualizadoEm || null,
      movimentos: Array.isArray(p.movimentos) ? p.movimentos : []
    };
  }
  function normalizarManutencao(m, indice) {
    return {
      id: m.id || 'local_m' + indice,
      item: m.item || 'Equipamento',
      descricao: m.descricao || m.desc || '',
      status: m.status || 'Pendente',
      responsavel: m.responsavel || '',
      valor: m.valor != null ? m.valor : null,
      criadoEm: m.criadoEm || m.date || null
    };
  }
  function normalizarDespesa(d, indice) {
    return {
      id: d.id || 'local_d' + indice,
      descricao: d.descricao || d.desc || 'Despesa',
      categoria: d.categoria || d.cat || 'Operacional',
      valor: Number(d.valor != null ? d.valor : d.value) || 0,
      pago: Boolean(d.pago),
      criadoEm: d.criadoEm || d.date || null
    };
  }

  /* ============================ avisos (toast) ============================ */
  function toast(mensagem, tipo) {
    const pilha = id('toast-stack');
    if (!pilha) {
      global.alert(mensagem);
      return;
    }
    const icone =
      tipo === 'ok'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2.2" stroke-linecap="round"><path d="M20 6 9 17l-5-5"/></svg>'
        : tipo === 'err'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" stroke-width="2.2" stroke-linecap="round"><path d="M12 7v6m0 4h.01"/><circle cx="12" cy="12" r="9"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="#d4af37" stroke-width="2.2" stroke-linecap="round"><path d="M12 8v5m0 3h.01"/><circle cx="12" cy="12" r="9"/></svg>';
    const caixa = document.createElement('div');
    caixa.className = 'toast show' + (tipo ? ' ' + tipo : '');
    caixa.innerHTML = icone + '<span>' + escapar(mensagem) + '</span>';
    pilha.appendChild(caixa);
    setTimeout(() => {
      caixa.className = 'toast';
      setTimeout(() => caixa.remove(), 320);
    }, 3400);
  }

  let acaoConfirmada = null;
  function confirmar(titulo, mensagem, rotuloOk, acao) {
    definir('confirm-titulo', titulo);
    const corpo = id('confirm-mensagem');
    // a mensagem é montada aqui com dados já escapados (escapar()) — pode conter <strong>
    if (corpo) corpo.innerHTML = mensagem;
    const botao = id('confirm-ok');
    if (botao) botao.textContent = rotuloOk || 'Confirmar';
    acaoConfirmada = acao;
    abrirModal('confirm-modal');
  }

  /* ============================ modais ============================ */
  function abrirModal(nome) {
    const modal = id(nome);
    if (modal) {
      modal.classList.add('open');
      const campo = modal.querySelector('input:not([type=hidden]), select, textarea');
      if (campo) setTimeout(() => campo.focus(), 60);
    }
  }
  function fecharModal(nome) {
    const modal = typeof nome === 'string' ? id(nome) : nome;
    if (modal) modal.classList.remove('open');
  }
  function ligarModais() {
    document.querySelectorAll('.modal').forEach((modal) => {
      modal.addEventListener('click', (evento) => {
        if (evento.target === modal || evento.target.closest('[data-fechar-modal]')) fecharModal(modal);
      });
    });
    document.addEventListener('keydown', (evento) => {
      if (evento.key === 'Escape') {
        document.querySelectorAll('.modal.open').forEach((m) => fecharModal(m));
        return;
      }
      // "/" pula para a busca de clientes; "g d" / "g c" atalhos de aba
      const digitando = /^(INPUT|TEXTAREA|SELECT)$/.test((evento.target.tagName || ''));
      if (evento.key === '/' && !digitando && !evento.metaKey && !evento.ctrlKey && estado.liberado) {
        evento.preventDefault();
        mudarAba('clients');
        const campo = id('busca-clientes');
        if (campo) campo.focus();
      }
    });
    const ok = id('confirm-ok');
    if (ok) {
      ok.addEventListener('click', () => {
        fecharModal('confirm-modal');
        const acao = acaoConfirmada;
        acaoConfirmada = null;
        if (typeof acao === 'function') acao();
      });
    }
  }

  /* ============================ gráficos ============================ */
  function caminhoPoligono(pontos, altura, largura) {
    if (!pontos.length) return { linha: '', area: '' };
    const max = Math.max(1, ...pontos.map((p) => p.valor));
    const passo = largura / Math.max(1, pontos.length - 1);
    const coordenadas = pontos.map((p, i) => {
      const x = i * passo;
      const y = altura - (p.valor / max) * (altura - 10) - 5;
      return { x, y, dado: p };
    });
    const linha = coordenadas.map((c, i) => (i ? 'L' : 'M') + c.x.toFixed(1) + ' ' + c.y.toFixed(1)).join(' ');
    const area = linha + ' L' + largura + ' ' + altura + ' L0 ' + altura + ' Z';
    return { linha, area, coordenadas, max };
  }

  function graficoArea(pontos, opts) {
    const config = Object.assign({ cor: '#d4af37', altura: 132, largura: 640, nome: 'area' }, opts || {});
    const { linha, area, coordenadas, max } = caminhoPoligono(pontos, config.altura, config.largura);
    if (!coordenadas || !coordenadas.length) {
      return '<p class="muted" style="margin:24px 0">Sem dados no período.</p>';
    }
    const grade = [0, 0.25, 0.5, 0.75, 1]
      .map((f) => {
        const y = (config.altura * f).toFixed(1);
        return '<line x1="0" y1="' + y + '" x2="' + config.largura + '" y2="' + y + '" stroke="rgba(255,255,255,.06)" stroke-width="1"/>';
      })
      .join('');
    const marcadores = coordenadas
      .map(
        (c, i) =>
          '<g class="pt" data-i="' + i + '" data-rotulo="' + escapar(c.dado.rotulo) + '" data-valor="' + escapar(c.dado.rotuloDetalhe || c.dado.valor) + '">' +
          '<rect x="' + (c.x - config.largura / pontos.length / 2).toFixed(1) + '" y="0" width="' + (config.largura / pontos.length).toFixed(1) + '" height="' + config.altura + '" fill="transparent"/>' +
          '<circle cx="' + c.x.toFixed(1) + '" cy="' + c.y.toFixed(1) + '" r="2.6" fill="' + config.cor + '" opacity=".85"/>' +
          '</g>'
      )
      .join('');
    return (
      '<svg viewBox="0 0 ' + config.largura + ' ' + (config.altura + 18) + '" role="img" aria-label="Gráfico de ' + escapar(config.nome) + '">' +
      '<defs><linearGradient id="grad-' + config.nome + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + config.cor + '" stop-opacity=".42"/>' +
      '<stop offset="100%" stop-color="' + config.cor + '" stop-opacity="0"/>' +
      '</linearGradient></defs>' +
      grade +
      '<path d="' + area + '" fill="url(#grad-' + config.nome + ')"/>' +
      '<path d="' + linha + '" fill="none" stroke="' + config.cor + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>' +
      marcadores +
      '<text x="0" y="' + (config.altura + 13) + '" fill="#6b7488" font-size="9">' + escapar(pontos[0].rotulo) + '</text>' +
      '<text x="' + config.largura + '" y="' + (config.altura + 13) + '" fill="#6b7488" font-size="9" text-anchor="end">' + escapar(pontos[pontos.length - 1].rotulo) + '</text>' +
      '<text x="4" y="12" fill="#6b7488" font-size="9">máx ' + max + '</text>' +
      '</svg>'
    );
  }

  function graficoBarras(pontos, opts) {
    const config = Object.assign({ cor: '#7dd3fc', altura: 132, largura: 640, nome: 'bar' }, opts || {});
    if (!pontos.length) return '<p class="muted" style="margin:24px 0">Sem dados no período.</p>';
    const max = Math.max(1, ...pontos.map((p) => p.valor));
    const passo = config.largura / pontos.length;
    const barras = pontos
      .map((p, i) => {
        const altura = (p.valor / max) * (config.altura - 12);
        const x = i * passo + passo * 0.22;
        const largura = passo * 0.56;
        const y = config.altura - altura;
        return (
          '<g class="pt" data-i="' + i + '" data-rotulo="' + escapar(p.rotulo) + '" data-valor="' + escapar(p.rotuloDetalhe || p.valor) + '">' +
          '<rect x="' + (i * passo).toFixed(1) + '" y="0" width="' + passo.toFixed(1) + '" height="' + config.altura + '" fill="transparent"/>' +
          '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + largura.toFixed(1) + '" height="' + Math.max(2, altura).toFixed(1) + '" rx="3" fill="' + config.cor + '" opacity="' + (p.valor ? '.85' : '.2') + '"/>' +
          '</g>'
        );
      })
      .join('');
    return (
      '<svg viewBox="0 0 ' + config.largura + ' ' + (config.altura + 18) + '" role="img" aria-label="Gráfico de barras">' +
      barras +
      '<line x1="0" y1="' + config.altura + '" x2="' + config.largura + '" y2="' + config.altura + '" stroke="rgba(255,255,255,.1)"/>' +
      '<text x="0" y="' + (config.altura + 13) + '" fill="#6b7488" font-size="9">' + escapar(pontos[0].rotulo) + '</text>' +
      '<text x="' + config.largura + '" y="' + (config.altura + 13) + '" fill="#6b7488" font-size="9" text-anchor="end">' + escapar(pontos[pontos.length - 1].rotulo) + '</text>' +
      '</svg>'
    );
  }

  function rosca(itens) {
    if (!itens.length) return '<p class="muted" style="margin:12px 0">Sem dados ainda.</p>';
    const total = itens.reduce((soma, i) => soma + i.total, 0) || 1;
    const cores = ['#d4af37', '#7dd3fc', '#34d399', '#f472b6', '#fbbf24', '#a5b4fc'];
    const raio = 52;
    const circunferencia = 2 * Math.PI * raio;
    let deslocamento = 0;
    const arcos = itens
      .map((item, i) => {
        const frac = item.total / total;
        const comprimento = frac * circunferencia;
        const cor = item.cor || cores[i % cores.length];
        const arco =
          '<circle cx="70" cy="70" r="' + raio + '" fill="none" stroke="' + cor + '" stroke-width="17" ' +
          'stroke-dasharray="' + (comprimento - 1.5).toFixed(2) + ' ' + (circunferencia - comprimento + 1.5).toFixed(2) + '" ' +
          'stroke-dashoffset="' + (-deslocamento).toFixed(2) + '" transform="rotate(-90 70 70)" stroke-linecap="butt"><title>' +
          escapar(item.rotulo) + ': ' + item.total + '</title></circle>';
        deslocamento += comprimento;
        return arco;
      })
      .join('');
    const legenda = itens
      .map((item, i) => {
        const cor = item.cor || cores[i % cores.length];
        return (
          '<div style="display:flex;align-items:center;gap:8px;font-size:12.5px;padding:5px 0">' +
          '<i style="width:9px;height:9px;border-radius:3px;background:' + cor + ';display:inline-block"></i>' +
          '<span>' + escapar(item.rotulo) + '</span>' +
          '<strong style="margin-left:auto">' + item.total + '</strong>' +
          '<span class="muted" style="font-size:11px">' + Math.round((item.total / total) * 100) + '%</span>' +
          '</div>'
        );
      })
      .join('');
    return (
      '<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">' +
      '<svg viewBox="0 0 140 140" width="128" height="128" style="flex:none">' + arcos +
      '<text x="70" y="66" text-anchor="middle" fill="#fff" font-size="21" font-weight="800">' + total + '</text>' +
      '<text x="70" y="82" text-anchor="middle" fill="#97a0b5" font-size="9.5">contas</text></svg>' +
      '<div style="flex:1 1 170px;min-width:160px">' + legenda + '</div>' +
      '</div>'
    );
  }

  function sparkline(valores, cor) {
    const largura = 120;
    const altura = 30;
    if (!valores || valores.length < 2) return '';
    const max = Math.max(1, ...valores);
    const passo = largura / (valores.length - 1);
    const pontos = valores.map((v, i) => (i * passo).toFixed(1) + ',' + (altura - (v / max) * (altura - 4) - 2).toFixed(1));
    return (
      '<polyline points="' + pontos.join(' ') + '" fill="none" stroke="' + (cor || '#d4af37') + '" stroke-width="1.8" stroke-linejoin="round" opacity=".9"/>' +
      '<circle cx="' + ((valores.length - 1) * passo).toFixed(1) + '" cy="' + (altura - (valores[valores.length - 1] / max) * (altura - 4) - 2).toFixed(1) + '" r="2.3" fill="' + (cor || '#d4af37') + '"/>'
    );
  }

  function ligarTooltips(contenedorId, tooltipId, serie) {
    const contenedor = id(contenedorId);
    const dica = id(tooltipId);
    if (!contenedor || !dica) return;
    contenedor.addEventListener('mousemove', (evento) => {
      const grupo = evento.target.closest('.pt');
      if (!grupo) {
        dica.classList.remove('show');
        return;
      }
      const i = Number(grupo.dataset.i);
      const ponto = serie && serie[i];
      dica.innerHTML = '<strong>' + escapar(grupo.dataset.valor) + '</strong><br>' + escapar(grupo.dataset.rotulo) +
        (ponto && ponto.cadastros != null ? ' · cadastros: ' + ponto.cadastros + ' · acessos: ' + ponto.acessos : '');
      const retangulo = contenedor.getBoundingClientRect();
      dica.style.left = Math.min(retangulo.width - 150, Math.max(0, evento.clientX - retangulo.left - 60)) + 'px';
      dica.style.top = evento.clientY - retangulo.top - 62 + 'px';
      dica.classList.add('show');
    });
    contenedor.addEventListener('mouseleave', () => dica.classList.remove('show'));
  }

  function contarNumero(el, alvo, formato) {
    if (!el) return;
    const numero = Number(alvo || 0);
    const mostrar = (v) => {
      el.textContent = formato ? formato(v) : String(Math.round(v));
    };
    const movimentoReduzido = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (movimentoReduzido || !numero) return mostrar(numero);
    const duracao = 620;
    const inicio = performance.now();
    const passo = (agora) => {
      const progresso = Math.min(1, (agora - inicio) / duracao);
      mostrar(numero * (1 - Math.pow(1 - progresso, 3)));
      if (progresso < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }

  /* ============================ acesso ============================ */
  function telaBloqueio(titulo, textoHtml, mostrarBotao) {
    const painel = id('acesso-painel');
    const layout = id('layout');
    if (layout) layout.style.display = 'none';
    if (!painel) return;
    painel.hidden = false;
    painel.innerHTML =
      '<div class="acesso-card">' +
      '<span class="brand-mark">S</span>' +
      '<h1>' + escapar(titulo) + '</h1>' +
      '<p>' + textoHtml + '</p>' +
      '<div class="acesso-acoes">' +
      (mostrarBotao ? '<button type="button" class="btn" id="btn-entrar-admin">Entrar como administrador</button>' : '') +
      '<a class="btn btn-secondary" href="index.html">Voltar ao site</a>' +
      '<a class="btn btn-secondary" href="dashboard.html">Minha área</a>' +
      '</div></div>';
    const botao = id('btn-entrar-admin');
    if (botao) botao.addEventListener('click', abrirLoginAdmin);
  }

  function abrirLoginAdmin() {
    if (global.ReloLoginModal) {
      global.ReloLoginModal.abrir({
        aba: 'entrar',
        mensagem: 'Entre com um e-mail de administrador para abrir o painel da barbearia.'
      });
    }
  }

  async function verificarAcesso() {
    await ReloAuth.ready();
    const usuario = ReloAuth.usuario;
    estado.emModoLocal = ReloAuth.modo !== 'servidor';
    const servidor = !estado.emModoLocal;

    if (!usuario) {
      telaBloqueio(
        'Área restrita aos administradores',
        'Faça login com um e-mail de administrador autorizado para abrir o painel.',
        true
      );
      setTimeout(abrirLoginAdmin, 400);
      return false;
    }

    if (!ReloAuth.ehAdmin(usuario)) {
      telaBloqueio(
        'Sua conta é de cliente',
        'A conta <strong>' + escapar(usuario.email) + '</strong> não tem permissão de administrador. ' +
          'Apenas os e-mails da equipe cadastrados abrem esta aba.',
        false
      );
      return false;
    }

    estado.liberado = true;
    const painel = id('acesso-painel');
    if (painel) painel.hidden = true;
    const layout = id('layout');
    if (layout) layout.style.display = 'flex';

    definir('nome-usuario', usuario.nome || 'Administrador');
    definir('email-usuario', usuario.email);
    const avatar = id('avatar-usuario');
    if (avatar) avatar.textContent = iniciais(usuario.nome, usuario.email);

    const pill = id('pill-banco');
    if (pill) {
      pill.className = 'pill ' + (estado.emModoLocal ? 'warn' : 'on');
      pill.textContent = estado.emModoLocal ? 'banco local do navegador' : 'banco do servidor';
    }
    renderizarAtualizado();
    if (servidor) {
      const resposta = await api('health');
      const dados = resposta.dados || {};
      if (id('page-sub')) {
        id('page-sub').innerHTML =
          'Banco <code>' + escapar(dados.banco || 'data/db.json') + '</code> · ' +
          (dados.usuarios || 0) + ' conta(s) · espelho na nuvem ' +
          (dados.espelho && dados.espelho.ativo
            ? '<strong style="color:var(--success)">ligado</strong> em <code>' + escapar(dados.espelho.tabela) + '</code>'
            : '<strong style="color:var(--warn)">desligado</strong>');
      }
      if (dados.espelho && dados.espelho.pendentes) {
        toast(dados.espelho.pendentes + ' cadastro(s) aguardando envio para a nuvem.');
      }
      definir(
        'nota-cadastro-modo',
        'O servidor está no ar: cada pessoa que criar conta entra neste banco na hora' +
          (dados.espelho && dados.espelho.ativo ? ' e é copiada para o Supabase em seguida.' : '.')
      );
    } else {
      definir('nota-cadastro-modo', 'Este site está aberto sem servidor, então o banco é local deste navegador — rode "npm run serve" para compartilhar com todos os aparelhos.');
      definir('nota-estoque-modo', '(neste caso, salvos só neste navegador)');
      definir('page-sub', 'Modo local: sem servidor, os cadastros ficam apenas neste navegador');
    }
    return true;
  }

  /* ============================ dashboard ============================ */
  function renderizarMetricas(m) {
    if (!m) return;
    estado.metricas = m;
    const serie = m.serie || [];
    const cadastros = serie.map((p) => p.cadastros);
    const acessos = serie.map((p) => p.acessos);

    const elClientes = id('stat-clients');
    contarNumero(elClientes, m.clientes);
    definir('stat-clients-total', m.novos7 ? ' (+' + m.novos7 + ' na semana)' : '');
    const delta = id('stat-clients-delta');
    if (delta) {
      const antes = Math.max(0, m.novos30 - m.novos7); // média das semanas anteriores
      const diferenca = m.novos7 - antes;
      delta.textContent = (diferenca > 0 ? '+' : '') + diferenca;
      delta.className = 'delta ' + (diferenca > 0 ? 'up' : diferenca < 0 ? 'down' : 'flat');
    }
    const spark = id('spark-clientes');
    if (spark) spark.innerHTML = sparkline(cadastros, '#d4af37');

    contarNumero(id('stat-logins'), m.acessos24);
    definir('stat-logins-falhas', m.falhas24 ? m.falhas24 + ' tentativa(s) bloqueada(s)' : 'nenhuma tentativa bloqueada');
    contarNumero(id('stat-reativados'), m.ativos30);
    definir('stat-taxa-retorno', m.taxaRetorno + '%');
    definir('stat-produtos-valor', moeda(m.estoque && m.estoque.valor));
    definir('stat-produtos', (m.estoque && m.estoque.itens) + ' itens');
    definir('stat-produtos-unidades', (m.estoque && m.estoque.unidades) + ' unidades');
    definir('stat-expenses', moeda(m.despesas && m.despesas.doMes));
    definir('stat-manutencoes', (m.manutencoesAbertas || 0) + ' manutenção(ões) abertas');

    const badgeClientes = id('nav-badge-clientes');
    if (badgeClientes) badgeClientes.textContent = m.clientes;
    const alertas = alertasDoSistema(m);
    const badgeAlertas = id('nav-badge-alertas');
    if (badgeAlertas) {
      badgeAlertas.hidden = alertas.length === 0;
      badgeAlertas.textContent = alertas.length;
    }

    renderizarGraficos(m);
    renderizarAtividade(m.atividade || []);
    renderizarAlertas(alertas);
  }

  function alertasDoSistema(m) {
    const alertas = [];
    ((m.estoque && m.estoque.abaixoDoMinimo) || []).forEach((p) => {
      alertas.push({
        tipo: 'critico',
        texto: 'Estoque baixo: <strong>' + escapar(p.nome) + '</strong> — ' + p.quantidade + ' un. (mínimo ' + p.minimo + ')'
      });
    });
    if (m.manutencoesAbertas) {
      alertas.push({ tipo: 'aviso', texto: '<strong>' + m.manutencoesAbertas + '</strong> manutenção(ões) em aberto.' });
    }
    if (m.sincronizacao && m.sincronizacao.pendentes) {
      alertas.push({
        tipo: 'aviso',
        texto: '<strong>' + m.sincronizacao.pendentes + '</strong> cadastro(s) esperando o envio para a nuvem — veja a aba Banco de Dados.'
      });
    }
    if (m.sincronizacao && m.sincronizacao.ultimoErro) {
      alertas.push({ tipo: 'aviso', texto: 'Última falha na nuvem: <em>' + escapar(m.sincronizacao.ultimoErro) + '</em>' });
    }
    if (m.falhas24 > 3) {
      alertas.push({ tipo: 'aviso', texto: m.falhas24 + ' tentativas de login recusadas nas últimas 24h.' });
    }
    return alertas;
  }

  function renderizarGraficos(m) {
    const serie = (m.serie || []).map((p) => ({
      dia: p.dia,
      rotulo: p.rotulo,
      valor: p.cadastros,
      cadastros: p.cadastros,
      acessos: p.acessos,
      rotuloDetalhe: p.cadastros + ' cadastro(s)'
    }));
    const serieAcessos = (m.serie || []).map((p) => ({
      dia: p.dia,
      rotulo: p.rotulo,
      valor: p.acessos,
      cadastros: p.cadastros,
      acessos: p.acessos,
      rotuloDetalhe: p.acessos + ' acesso(s)'
    }));
    renderizarKpiSync(estado.sync);
    html('chart-cadastros', graficoArea(serie, { cor: '#d4af37', nome: 'cad' }));
    html('chart-acessos', graficoBarras(serieAcessos, { cor: '#7dd3fc', nome: 'ace' }));
    ligarTooltips('chart-cadastros', 'tip-cadastros', serie);
    ligarTooltips('chart-acessos', 'tip-acessos', serieAcessos);

    const totalCadastros = serie.reduce((soma, p) => soma + p.valor, 0);
    definir('chart-cadastros-total', totalCadastros + ' em 14d');
    definir('chart-cadastros-media', 'média ' + (serie.length ? (totalCadastros / serie.length).toFixed(1) : '0') + ' por dia');
    const totalAcessos = serieAcessos.reduce((soma, p) => soma + p.valor, 0);
    definir('chart-acessos-total', totalAcessos + ' em 14d');
    const pico = serieAcessos.slice().sort((a, b) => b.valor - a.valor)[0];
    definir('chart-acessos-pico', pico && pico.valor ? 'melhor dia: ' + pico.rotulo + ' (' + pico.valor + ')' : 'sem acessos no período');

    const rotulosOrigem = { cadastro: 'Cadastro no site', admin: 'Criado pelo admin', semente: 'Equipe (fixa)', importado: 'Importado' };
    html(
      'chart-origens',
      rosca(
        (m.origens || []).map((o) => ({
          rotulo: rotulosOrigem[o.chave] || o.chave,
          total: o.total,
          cor: o.chave === 'admin' ? '#7dd3fc' : o.chave === 'semente' ? '#a5b4fc' : null
        }))
      )
    );
  }

  function renderizarAtividade(atividade) {
    const alvo = id('atividade-list');
    if (!alvo) return;
    if (!atividade.length) {
      alvo.innerHTML = '<p class="muted" style="margin:6px 8px">Nada registrado ainda — o primeiro cadastro do site aparece aqui sozinho.</p>';
      return;
    }
    const icones = {
      cadastro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1"/><circle cx="9.5" cy="8" r="3.2"/><path d="M19 8v5m2.5-2.5h-5"/></svg>',
      login: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 16l-4-4 4-4M6 12h9"/></svg>',
      despesa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7h18v11H3z"/><path d="M3 11h18"/></svg>',
      manutencao: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14.5 5.5a3.9 3.9 0 0 0 5 5L21 21H3z"/></svg>'
    };
    alvo.innerHTML = atividade
      .slice(0, 10)
      .map(
        (item) =>
          '<div class="feed-item"><span class="feed-ico ' + escapar(item.tipo) + '">' +
          (icones[item.tipo] || icones.login) +
          '</span><span class="feed-txt"><strong>' + escapar(item.titulo) + '</strong><span>' +
          escapar(item.detalhe) + '</span></span><span class="feed-quando" title="' +
          escapar(dataCurta(item.quando)) + '">' + escapar(tempoRelativo(item.quando)) + '</span></div>'
      )
      .join('');
  }

  function renderizarAlertas(alertas) {
    const alvo = id('alertas-list');
    if (!alvo) return;
    if (!alertas.length) {
      alvo.innerHTML = '<p class="muted" style="margin:0">Tudo em ordem por aqui — sem estoque baixo, sem fila travada.</p>';
      return;
    }
    alvo.innerHTML = alertas
      .slice(0, 6)
      .map((a) => {
        const icone =
          a.tipo === 'critico'
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" stroke-width="2" stroke-linecap="round"><path d="M12 9v4m0 4h.01"/><path d="M10.3 3.9 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/></svg>';
        return '<div class="alerta-item' + (a.tipo === 'critico' ? ' critico' : '') + '">' + icone + '<span>' + a.texto + '</span></div>';
      })
      .join('');
  }

  /* ============================ clientes ============================ */
  async function carregarUsuarios() {
    const corpo = id('clients-table-body');
    if (!corpo) return;
    const resultado = await ReloAuth.listarUsuarios();
    if (!resultado.ok) {
      corpo.innerHTML =
        '<tr><td colspan="6"><div class="empty">' + escapar(resultado.erro || 'Não foi possível carregar o banco de clientes.') + '</div></td></tr>';
      return;
    }
    estado.usuarios = resultado.usuarios || [];
    estado.logins = resultado.logins || [];
    renderizarClientes();
    renderizarLogins(estado.logins);
  }

  function clientesFiltrados() {
    const termo = estado.busca.trim().toLowerCase();
    let lista = estado.usuarios.slice();
    if (estado.filtroPerfil) lista = lista.filter((u) => u.perfil === estado.filtroPerfil);
    if (estado.filtroSync) lista = lista.filter((u) => (u.sincronizacao && u.sincronizacao.estado) === estado.filtroSync);
    if (termo) {
      lista = lista.filter(
        (u) =>
          (u.nome || '').toLowerCase().includes(termo) ||
          (u.email || '').toLowerCase().includes(termo) ||
          (u.id || '').toLowerCase().includes(termo)
      );
    }
    const comparadores = {
      recentes: (a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0),
      antigos: (a, b) => new Date(a.criadoEm || 0) - new Date(b.criadoEm || 0),
      nome: (a, b) => String(a.nome || a.email).localeCompare(String(b.nome || b.email), 'pt-BR'),
      acessos: (a, b) => (b.totalLogins || 0) - (a.totalLogins || 0)
    };
    return lista.sort(comparadores[estado.ordem] || comparadores.recentes);
  }

  function sincronizacaoBadge(usuario) {
    const sync = usuario.sincronizacao || {};
    if (sync.estado === 'ok') {
      return '<span class="badge success" title="Enviado para a nuvem em ' + escapar(dataCurta(sync.em)) + '">✓ nuvem</span>';
    }
    if (sync.estado === 'erro') {
      return '<span class="badge danger" title="' + escapar(sync.erro || 'falha no envio') + '">✕ falhou</span>';
    }
    return '<span class="badge neutral" title="Ainda não foi para a nuvem">· fila</span>';
  }

  function renderizarClientes() {
    const corpo = id('clients-table-body');
    if (!corpo) return;
    const lista = clientesFiltrados();
    const totalPaginas = Math.max(1, Math.ceil(lista.length / LINHAS_PAGINA));
    if (estado.pagina > totalPaginas - 1) estado.pagina = totalPaginas - 1;
    const visiveis = lista.slice(estado.pagina * LINHAS_PAGINA, estado.pagina * LINHAS_PAGINA + LINHAS_PAGINA);

    definir(
      'clientes-contagem',
      lista.length === estado.usuarios.length
        ? estado.usuarios.length + ' conta' + (estado.usuarios.length === 1 ? '' : 's')
        : lista.length + ' de ' + estado.usuarios.length + ' conta(s)'
    );
    definir('pager-info', lista.length ? 'página ' + (estado.pagina + 1) + ' de ' + totalPaginas : '');
    const anterior = id('pager-anterior');
    const proximo = id('pager-proximo');
    if (anterior) anterior.disabled = estado.pagina === 0;
    if (proximo) proximo.disabled = estado.pagina >= totalPaginas - 1;
    id('pager') && (id('pager').style.visibility = lista.length > LINHAS_PAGINA ? 'visible' : 'hidden');

    if (!lista.length) {
      corpo.innerHTML =
        '<tr><td colspan="6"><div class="empty">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
        '<strong>' + (estado.busca ? 'Nada encontrado' : 'Nenhum cliente no banco ainda') + '</strong>' +
        (estado.busca
          ? 'Tente outro nome, e-mail ou limpe os filtros.'
          : 'Assim que alguém criar conta no site (ou na caixinha de login), a pessoa aparece aqui na hora.') +
        '</div></td></tr>';
      return;
    }

    corpo.innerHTML = visiveis
      .map((u) => {
        const ehAdmin = u.perfil === 'admin';
        return (
          '<tr data-id="' + escapar(u.id) + '">' +
          '<td><div class="cell-pessoa"><span class="avatar' + (ehAdmin ? '' : ' cliente') + '">' + escapar(iniciais(u.nome, u.email)) + '</span>' +
          '<span><strong>' + escapar(u.nome || 'Sem nome') + '</strong><small><code>' + escapar(u.email) + '</code></small></span></div></td>' +
          '<td><span class="relo-pill ' + (ehAdmin ? 'admin' : 'cliente') + '">' + (ehAdmin ? 'Admin' : 'Cliente') + '</span>' +
          '<div style="margin-top:5px"><span class="badge neutral">' + escapar(rotuloOrigem(u.origem)) + '</span></div></td>' +
          '<td><span title="' + escapar(dataCurta(u.criadoEm)) + '">' + escapar(tempoRelativo(u.criadoEm)) + '</span></td>' +
          '<td>' +
          (u.ultimoLogin
            ? '<span title="' + escapar(dataCurta(u.ultimoLogin)) + '">' + escapar(tempoRelativo(u.ultimoLogin)) + '</span> <span class="muted" style="font-size:11.5px">(' + (u.totalLogins || 0) + 'x)</span>'
            : '<span class="muted">nunca entrou</span>') +
          '</td>' +
          '<td>' + sincronizacaoBadge(u) + '</td>' +
          '<td class="acoes">' +
          '<button class="btn btn-secondary btn-sm" data-acao="ficha" data-id="' + escapar(u.id) + '">Ficha</button> ' +
          (u.origem === 'semente'
            ? '<span class="muted" style="font-size:11.5px;margin-left:6px">protegida</span>'
            : '<button class="btn btn-danger btn-sm" data-acao="excluir" data-id="' + escapar(u.id) + '">Excluir</button>') +
          '</td></tr>'
        );
      })
      .join('');
    definir('nav-badge-clientes', estado.usuarios.filter((u) => u.perfil === 'cliente').length);
  }
  function rotuloOrigem(origem) {
    return { cadastro: 'site', admin: 'painel', semente: 'equipe', importado: 'importado' }[origem] || origem || 'site';
  }

  function renderizarLogins(logins) {
    const alvo = id('logins-list');
    if (!alvo) return;
    if (!logins || !logins.length) {
      alvo.innerHTML = '<p class="muted" style="margin:0">Nenhum acesso registrado ainda.</p>';
      return;
    }
    alvo.innerHTML =
      '<div class="table-scroll"><table><thead><tr><th>E-mail</th><th>Perfil</th><th>Quando</th><th>Origem</th><th>Situação</th></tr></thead><tbody>' +
      logins
        .slice(0, 40)
        .map(
          (l) =>
            '<tr><td><code>' + escapar(l.email) + '</code></td><td class="muted">' + escapar(l.perfil || '—') + '</td>' +
            '<td><span title="' + escapar(dataCurta(l.quando)) + '">' + escapar(tempoRelativo(l.quando)) + '</span></td>' +
            '<td class="muted">' + escapar(l.origem || '—') + '</td>' +
            '<td><span class="badge ' + (l.sucesso ? 'success' : 'danger') + '">' + (l.sucesso ? 'sucesso' : 'recusado') + '</span></td></tr>'
        )
        .join('') +
      '</tbody></table></div>';
  }

  async function abrirFicha(usuarioId) {
    abrirModal('ficha-modal');
    const corpo = id('ficha-corpo');
    corpo.innerHTML = '<div class="skel" style="width:70%;height:20px"></div><div class="skel" style="width:45%;margin-top:12px"></div>';
    let dados = null;
    const resposta = await api('admin/usuarios/' + encodeURIComponent(usuarioId));
    if (resposta.dados) dados = resposta.dados;
    const usuario = (dados && dados.usuario) || estado.usuarios.find((u) => u.id === usuarioId);
    if (!usuario) {
      corpo.innerHTML = '<p class="muted">Cliente não encontrado.</p>';
      return;
    }
    const acessos = (dados && dados.acessos) || estado.logins.filter((l) => l.email === usuario.email);
    const sync = usuario.sincronizacao || {};
    corpo.innerHTML =
      '<div class="ficha-top"><span class="avatar">' + escapar(iniciais(usuario.nome, usuario.email)) + '</span>' +
      '<div><h3 style="margin:0 0 4px">' + escapar(usuario.nome || 'Sem nome') + '</h3>' +
      '<code class="muted">' + escapar(usuario.email) + '</code></div></div>' +
      '<div class="ficha-grid">' +
      campoFicha('Perfil', usuario.perfil === 'admin' ? 'Administrador' : 'Cliente') +
      campoFicha('Cadastro', dataCurta(usuario.criadoEm)) +
      campoFicha('Último acesso', usuario.ultimoLogin ? dataCurta(usuario.ultimoLogin) : 'nunca entrou') +
      campoFicha('Total de acessos', String(usuario.totalLogins || 0)) +
      campoFicha('Origem', rotuloOrigem(usuario.origem)) +
      campoFicha('ID interno', usuario.id) +
      '</div>' +
      '<div style="margin-bottom:14px">' +
      (sync.estado === 'ok'
        ? '<span class="badge success">✓ na nuvem (' + escapar(dataCurta(sync.em)) + ')</span>'
        : '<span class="badge ' + (sync.estado === 'erro' ? 'danger' : 'neutral') + '">' +
          (sync.estado === 'erro' ? '✕ nuvem: ' + escapar(sync.erro || 'erro') : '· aguardando envio para a nuvem') + '</span>') +
      '</div>' +
      '<div class="sub-panel" style="margin-top:10px;padding-top:16px"><h3>Histórico de acessos (' + acessos.length + ')</h3>' +
      (acessos.length
        ? '<div class="table-scroll"><table><thead><tr><th>Quando</th><th>Situação</th></tr></thead><tbody>' +
          acessos
            .slice(0, 20)
            .map(
              (l) =>
                '<tr><td>' + escapar(dataCurta(l.quando)) + '</td><td><span class="badge ' + (l.sucesso ? 'success' : 'danger') + '">' +
                (l.sucesso ? 'sucesso' : 'recusado') + '</span></td></tr>'
            )
            .join('') +
          '</tbody></table></div>'
        : '<p class="muted" style="margin:0">Sem acessos registrados.</p>') +
      '</div>';
  }
  function campoFicha(rotulo, valor) {
    return '<div class="ficha-campo"><b>' + escapar(rotulo) + '</b><span>' + escapar(valor || '—') + '</span></div>';
  }

  async function excluirUsuario(usuarioId) {
    const alvo = estado.usuarios.find((u) => u.id === usuarioId);
    const nome = alvo ? alvo.nome || alvo.email : 'este cadastro';
    confirmar(
      'Excluir cliente',
      'Remover <strong>' + escapar(nome) + '</strong> do banco de dados? O login e as sessões dele são apagados junto e a ação não pode ser desfeita.',
      'Excluir',
      async () => {
        const resultado = await ReloAuth.removerUsuario(usuarioId);
        if (!resultado.ok) {
          toast(resultado.erro || 'Não foi possível excluir.', 'err');
          return;
        }
        toast('Cliente removido do banco.', 'ok');
        await carregarTudo();
      }
    );
  }

  async function salvarCliente(evento) {
    evento.preventDefault();
    const aviso = id('cliente-modal-aviso');
    if (aviso) aviso.hidden = true;
    const resultado = await ReloAuth.criarCliente({
      nome: id('cli-name').value,
      email: id('cli-email').value,
      senha: id('cli-senha').value
    });
    if (!resultado.ok) {
      if (aviso) {
        aviso.textContent = resultado.erro;
        aviso.hidden = false;
      }
      return;
    }
    fecharModal('cliente-modal');
    id('cliente-form').reset();
    toast('Cliente cadastrado e salvo no banco de dados.', 'ok');
    await carregarTudo();
  }

  function exportarCSV() {
    const lista = clientesFiltrados();
    if (!lista.length) return toast('Nada para exportar com esses filtros.', 'err');
    const colunas = ['nome', 'email', 'perfil', 'origem', 'cadastro', 'ultimo_acesso', 'total_acessos', 'nuvem'];
    const linhas = lista.map((u) => [
      u.nome || '',
      u.email || '',
      u.perfil,
      u.origem || 'cadastro',
      u.criadoEm ? new Date(u.criadoEm).toLocaleString('pt-BR') : '',
      u.ultimoLogin ? new Date(u.ultimoLogin).toLocaleString('pt-BR') : '',
      u.totalLogins || 0,
      (u.sincronizacao && u.sincronizacao.estado) || 'pendente'
    ]);
    const csv = [colunas, ...linhas]
      .map((l) => l.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(';'))
      .join('\r\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'clientes-style-relo-' + new Date().toISOString().slice(0, 10) + '.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    toast('CSV com ' + lista.length + ' cadastro(s) baixado.', 'ok');
  }

  /* ============================ estoque / manutenção / despesas ============================ */
  // Cada lista tem duas fontes possíveis: o banco do servidor (compartilhado) ou,
  // quando o site está aberto sem servidor, o navegador deste computador.
  const LISTAS = {
    produtos: { rota: 'admin/estoque', um: 'produto', normalizar: normalizarProduto },
    manutencoes: { rota: 'admin/manutencao', um: 'manutencao', normalizar: normalizarManutencao },
    despesas: { rota: 'admin/despesas', um: 'despesa', normalizar: normalizarDespesa }
  };

  const Loja = {
    async carregarLista(coisa) {
      const config = LISTAS[coisa];
      const resposta = await api(config.rota);
      if (resposta.dados) return (resposta.dados[coisa] || []).map(config.normalizar);
      return lerLocal(coisa).map(config.normalizar);
    },
    async carregarEstoque() {
      return Loja.carregarLista('produtos');
    },
    async criar(coisa, dados) {
      const config = LISTAS[coisa];
      if (autenticado()) {
        const resposta = await api(config.rota, dados);
        if (resposta.erro) throw new Error(resposta.erro);
        if (resposta.ausente) throw new Error('O servidor não respondeu (rode "npm run serve" para gravar no banco compartilhado).');
        return config.normalizar(resposta.dados[config.um] || resposta.dados, 0);
      }
      const lista = lerLocal(coisa).map(config.normalizar);
      lista.push(Object.assign({ id: 'local_' + Date.now().toString(36), criadoEm: new Date().toISOString() }, dados));
      gravarLocal(coisa, lista);
      return config.normalizar(dados, lista.length - 1);
    },
    async salvarProduto(dados) {
      if (autenticado()) {
        const resposta = await api('admin/estoque', dados);
        if (resposta.erro) throw new Error(resposta.erro);
        if (resposta.ausente) throw new Error('Sem servidor: o produto ficou só neste navegador.');
        return;
      }
      const lista = lerLocal('produtos').map(normalizarProduto);
      const indice = lista.findIndex((p) => p.id === dados.id);
      if (indice >= 0) {
        lista[indice] = Object.assign({}, lista[indice], dados);
      } else {
        lista.push(Object.assign({ id: 'local_' + Date.now().toString(36), movimentos: [], criadoEm: new Date().toISOString() }, dados));
      }
      gravarLocal('produtos', lista);
    },
    async movimentar(dados) {
      if (autenticado()) {
        const resposta = await api('admin/estoque/mov', dados);
        if (resposta.erro) throw new Error(resposta.erro);
        return;
      }
      const lista = lerLocal('produtos').map(normalizarProduto);
      const produto = lista.find((p) => p.id === dados.id);
      if (!produto) throw new Error('Produto não encontrado.');
      const delta = Number(dados.delta || 0);
      const antes = produto.quantidade;
      produto.quantidade = Math.max(0, antes + delta);
      produto.movimentos = [
        {
          tipo: delta >= 0 ? 'entrada' : 'saida',
          quantidade: Math.abs(delta),
          antes,
          depois: produto.quantidade,
          observacao: dados.observacao || '',
          quando: new Date().toISOString()
        }
      ]
        .concat(produto.movimentos || [])
        .slice(0, 60);
      gravarLocal('produtos', lista);
    },
    async atualizarManutencao(dados) {
      if (autenticado()) {
        const resposta = await api('admin/manutencao', dados);
        if (resposta.erro) throw new Error(resposta.erro);
        return;
      }
      const lista = lerLocal('manutencoes');
      const alvo = lista.find((m) => (m.id || '') === dados.id);
      if (alvo) Object.assign(alvo, dados);
      gravarLocal('manutencoes', lista);
    },
    async excluir(coisa, itemId) {
      const config = LISTAS[coisa];
      if (autenticado()) {
        const resposta = await api(config.rota + '/' + encodeURIComponent(itemId), {}, 'DELETE');
        if (resposta.erro) throw new Error(resposta.erro);
        return;
      }
      const lista = lerLocal(coisa).filter((x) => (x.id || '') !== itemId);
      gravarLocal(coisa, lista);
    }
  };

  function renderizarEstoque(lista) {
    const corpo = id('products-table-body');
    if (!corpo) return;
    estado.estoque = lista;
    const unidades = lista.reduce((soma, p) => soma + p.quantidade, 0);
    const valor = lista.reduce((soma, p) => soma + p.quantidade * p.preco, 0);
    definir('stat-produtos-valor', moeda(valor));
    definir('stat-produtos', lista.length + ' itens');
    definir('stat-produtos-unidades', unidades + ' unidades');

    const baixos = lista.filter((p) => p.minimo > 0 && p.quantidade <= p.minimo);
    const alerta = id('produtos-alerta');
    if (alerta) {
      alerta.innerHTML = baixos.length
        ? '<div class="alerta-item critico"><svg viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" stroke-width="2"><path d="M12 9v4m0 4h.01"/><path d="M10.3 3.9 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg><span><strong>' +
          baixos.length + ' produto(s) abaixo do mínimo:</strong> ' + escapar(baixos.map((p) => p.nome).join(', ')) + '</span></div>'
        : '';
    }

    if (!lista.length) {
      corpo.innerHTML =
        '<tr><td colspan="7"><div class="empty"><strong>Estoque vazio</strong>Cadastre os produtos que você vende e usa na barbearia — o controle de entrada e saída passa a funcionar.</div></td></tr>';
      return;
    }
    corpo.innerHTML = lista
      .map((p, i) => {
        const baixo = p.minimo > 0 && p.quantidade <= p.minimo;
        const ultimo = p.movimentos && p.movimentos[0];
        return (
          '<tr>' +
          '<td><strong>' + escapar(p.nome) + '</strong>' +
          (ultimo ? '<div class="muted" style="font-size:11.5px">' + (ultimo.tipo === 'entrada' ? '↑' : '↓') + ' ' + ultimo.quantidade + ' ' + escapar(tempoRelativo(ultimo.quando)) + '</div>' : '') +
          '</td>' +
          '<td class="muted">' + escapar(p.categoria || '—') + '</td>' +
          '<td><span class="badge ' + (baixo ? 'danger' : p.quantidade ? 'success' : 'neutral') + '">' + p.quantidade + ' un.</span></td>' +
          '<td class="muted">' + (p.minimo || '—') + '</td>' +
          '<td>' + moeda(p.preco) + '</td>' +
          '<td><strong>' + moeda(p.quantidade * p.preco) + '</strong></td>' +
          '<td class="acoes">' +
          '<button class="btn btn-secondary btn-sm" data-acao="mov" data-i="' + i + '">Entrada/Saída</button> ' +
          '<button class="btn btn-secondary btn-sm" data-acao="edit-produto" data-i="' + i + '">Editar</button> ' +
          '<button class="btn btn-danger btn-sm" data-acao="del-produto" data-i="' + i + '">Excluir</button>' +
          '</td></tr>'
        );
      })
      .join('');
  }

  function renderizarManutencoes(lista) {
    const corpo = id('maintenance-table-body');
    if (!corpo) return;
    estado.manutencoes = lista;
    const abertas = lista.filter((m) => m.status !== 'Concluído').length;
    definir('manutencao-resumo', abertas ? abertas + ' ordem(ns) em aberto — clique no status para alternar.' : 'Nenhuma ordem em aberto. ✨ Clique no status para alternar.');
    const badge = id('nav-badge-alertas');
    if (badge) {
      badge.hidden = abertas === 0;
      badge.textContent = abertas;
    }
    if (!lista.length) {
      corpo.innerHTML = '<tr><td colspan="7"><div class="empty"><strong>Nenhuma manutenção registrada</strong>Registre troca de lâmina, higienização, conserto de cadeira — e a barbearia não esquece.</div></td></tr>';
      return;
    }
    const cores = { Pendente: 'danger', 'Em Andamento': 'gold', Concluído: 'success' };
    corpo.innerHTML = lista
      .map((m, i) => {
        return (
          '<tr>' +
          '<td><strong>' + escapar(m.item) + '</strong></td>' +
          '<td class="muted">' + escapar(m.descricao || '—') + '</td>' +
          '<td class="muted">' + escapar(m.responsavel || '—') + '</td>' +
          '<td>' + (m.valor ? moeda(m.valor) : '<span class="muted">—</span>') + '</td>' +
          '<td><button class="badge ' + (cores[m.status] || 'neutral') + '" data-acao="status-manutencao" data-i="' + i + '" style="cursor:pointer">' + escapar(m.status) + '</button></td>' +
          '<td class="muted">' + escapar(m.criadoEm ? dataCurta(m.criadoEm) : '—') + '</td>' +
          '<td class="acoes"><button class="btn btn-danger btn-sm" data-acao="del-manutencao" data-i="' + i + '">Excluir</button></td>' +
          '</tr>'
        );
      })
      .join('');
  }

  function renderizarDespesas(lista) {
    const corpo = id('expenses-table-body');
    if (!corpo) return;
    estado.despesas = lista;
    const mesAtual = new Date().toISOString().slice(0, 7);
    const doMes = lista.filter((d) => mesDe(d.criadoEm) === mesAtual).reduce((soma, d) => soma + d.valor, 0);
    const total = lista.reduce((soma, d) => soma + d.valor, 0);
    definir('despesas-mes', moeda(doMes));
    definir('despesas-total', moeda(total));
    definir('despesas-qtd', String(lista.length));
    definir('stat-expenses', moeda(doMes));

    if (!lista.length) {
      corpo.innerHTML = '<tr><td colspan="5"><div class="empty"><strong>Nenhuma despesa lançada</strong></div></td></tr>';
      html('despesas-por-categoria', '<p class="muted" style="margin:0">Sem despesas lançadas.</p>');
      return;
    }
    corpo.innerHTML = lista
      .map((d, i) => {
        return (
          '<tr>' +
          '<td><strong>' + escapar(d.descricao) + '</strong></td>' +
          '<td><span class="badge neutral">' + escapar(d.categoria || 'Operacional') + '</span> ' + (d.pago ? '<span class="badge success">paga</span>' : '') + '</td>' +
          '<td><strong>' + moeda(d.valor) + '</strong></td>' +
          '<td class="muted">' + escapar(d.criadoEm ? dataCurta(d.criadoEm) : '—') + '</td>' +
          '<td class="acoes"><button class="btn btn-danger btn-sm" data-acao="del-despesa" data-i="' + i + '">Excluir</button></td>' +
          '</tr>'
        );
      })
      .join('');

    const porCategoria = {};
    lista.forEach((d) => {
      const chave = d.categoria || 'Operacional';
      porCategoria[chave] = (porCategoria[chave] || 0) + d.valor;
    });
    const max = Math.max(1, ...Object.keys(porCategoria).map((c) => porCategoria[c]));
    html(
      'despesas-por-categoria',
      '<div class="barra-cat" style="grid-template-columns:1fr auto;gap:8px 12px">' +
        Object.keys(porCategoria)
          .sort((a, b) => porCategoria[b] - porCategoria[a])
          .map(
            (c) =>
              '<span>' + escapar(c) + '</span><strong>' + moeda(porCategoria[c]) + '</strong>' +
              '<span class="traco"><i style="width:' + Math.round((porCategoria[c] / max) * 100) + '%"></i></span>'
          )
          .join('') +
        '</div>'
    );
  }

  /* ============================ aba Banco / nuvem ============================ */
  function renderizarKpiSync(dados) {
    if (!dados) {
      definir('stat-sync', '—');
      definir('stat-sync-total', '');
      definir('stat-sync-foot', 'precisa do servidor (npm run serve)');
      return;
    }
    if (!dados.ativo) {
      definir('stat-sync', 'desligada');
      definir('stat-sync-total', '');
      definir('stat-sync-foot', 'ligue no formulário abaixo para espelhar na nuvem');
      return;
    }
    const enviados = dados.clientesSync != null ? dados.clientesSync : dados.enviado;
    const total = dados.totalClientes || 0;
    definir('stat-sync', String(enviados));
    definir('stat-sync-total', total ? ' / ' + total : '');
    const rodape = id('stat-sync-foot');
    if (rodape) {
      const quem = dados.modo === 'navegador' ? 'o navegador tenta de novo a cada visita' : 'o servidor tenta de novo sozinho';
      rodape.innerHTML = dados.pendentes
        ? '<span class="delta down">' + Number(dados.pendentes) + ' na fila</span> ' + quem
        : 'cadastros espelhados na tabela <code>' + escapar(dados.tabela || 'clientes') + '</code>';
    }
  }

  // Sem servidor, quem faz o espelho é o próprio navegador (auth-core.js).
  function renderizarSyncNavegador() {
    const dados = ReloAuth.estadoSincronizacao();
    estado.sync = dados;
    const pill = id('pill-sync');
    if (pill) {
      pill.className = 'pill ' + (dados.ativo ? (dados.pendentes ? 'warn' : 'on') : 'off');
      pill.textContent = dados.ativo ? (dados.pendentes ? 'nuvem: ' + dados.pendentes + ' na fila' : 'nuvem: sincronizada') : 'nuvem: desligada';
    }
    renderizarKpiSync(dados);
    const badge = id('nav-badge-sync');
    if (badge) {
      badge.hidden = !dados.pendentes;
      badge.textContent = dados.pendentes || 0;
    }
    definir('sync-modo', 'localStorage deste navegador');
    definir('sync-arquivo', 'banco local — sem servidor no ar');
    definir('sync-estado', dados.ativo ? 'Ativa (direto do navegador)' : 'Desligada');
    definir('sync-url-rotulo', dados.urlMascara || 'sem url');
    definir('sync-tabela-rotulo', dados.tabela);
    definir('sync-enviado', String(dados.enviado));
    definir('sync-clientes-rotulo', dados.totalClientes + ' cliente(s) neste navegador');
    definir('sync-pendentes', String(dados.pendentes));
    definir('sync-falha', (dados.falha || 0) + ' falha(s)');
    definir('sync-chave-atual', 'atual: ' + (dados.chaveMascara || 'nenhuma') + ' · origem: ' + (dados.origem || 'navegador'));
    html(
      'sync-ultimo-erro',
      (dados.ultimoErro
        ? '<div class="alerta-item"><svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/></svg><span>Última falha: <em>' +
          escapar(dados.ultimoErro) + '</em> — o navegador tenta de novo sozinho a cada visita.</span></div>'
        : '<p class="muted" style="margin:8px 0 0">Sem servidor no ar: os cadastros novos são enviados ao Supabase direto pelo navegador e ficam na fila se a internet cair.</p>') +
        '<p class="muted" style="margin:8px 0 0">Para o banco compartilhado de verdade (todos os aparelhos veem a mesma lista), rode <code>npm run serve</code>.</p>'
    );
    const fila = id('sync-fila');
    if (fila) {
      fila.innerHTML = dados.fila && dados.fila.length
        ? '<div class="table-scroll"><table><thead><tr><th>E-mail</th><th>Tentativas</th><th>Erro</th><th>Na fila desde</th></tr></thead><tbody>' +
          dados.fila.map((item) =>
            '<tr><td><code>' + escapar(item.email) + '</code></td><td>' + (item.tentativas || 0) + '</td><td class="muted">' +
            escapar(item.erro || '—') + '</td><td class="muted">' + escapar(tempoRelativo(item.desde)) + '</td></tr>'
          ).join('') + '</tbody></table></div>'
        : '<p class="muted" style="margin:0">Nenhum cadastro parado — tudo sincronizado. 🎉</p>';
    }
    definir('sync-fila-total', String((dados.fila && dados.fila.length) || 0));
  }

  async function carregarSync() {
    const resposta = await api('admin/supabase');
    const dados = resposta.dados;
    estado.sync = dados || null;
    const pill = id('pill-sync');
    const estadoEl = id('sync-estado');

    if (!dados && resposta.ausente && ReloAuth.estadoSincronizacao) {
      return renderizarSyncNavegador();
    }
    if (!dados) {
      if (pill) {
        pill.className = 'pill off';
        pill.textContent = 'nuvem: sem resposta';
      }
      definir('sync-modo', 'banco local do navegador');
      definir('sync-arquivo', 'rode "npm run serve" para o banco compartilhado');
      definir('sync-estado', 'indisponível');
      definir('sync-url-rotulo', 'configure no .env ou no servidor');
      renderizarKpiSync(null);
      html(
        'sync-ultimo-erro',
        '<div class="alerta-item"><svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/></svg><span>O espelho na nuvem e o banco compartilhado precisam do servidor rodando (<code>npm run serve</code>). Assim que ele subir, o cadastro dos clientes passa a ir para <code>data/db.json</code> + Supabase automaticamente.</span></div>'
      );
      return;
    }

    if (pill) {
      pill.className = 'pill ' + (dados.ativo ? (dados.pendentes ? 'warn' : 'on') : 'off');
      pill.textContent = dados.ativo ? (dados.pendentes ? 'nuvem: ' + dados.pendentes + ' na fila' : 'nuvem: sincronizada') : 'nuvem: desligada';
    }
    const badgeSync = id('nav-badge-sync');
    if (badgeSync) {
      badgeSync.hidden = !dados.pendentes;
      badgeSync.textContent = dados.pendentes || 0;
    }
    if (estadoEl) {
      estadoEl.textContent = dados.ativo ? 'Ativa' : 'Desligada';
      estadoEl.style.color = dados.ativo ? 'var(--success)' : 'var(--muted)';
    }
    definir('sync-modo', 'banco do servidor');
    renderizarKpiSync(dados);
    definir('sync-arquivo', (dados.bancoLocal && dados.bancoLocal.arquivo) || 'data/db.json');
    definir('sync-url-rotulo', dados.urlMascara || 'sem url');
    definir('sync-tabela-rotulo', dados.tabela || 'clientes');
    definir('sync-enviado', dados.enviado + (dados.clientesSync != null ? ' / ' + dados.totalClientes : ''));
    definir('sync-clientes-rotulo', (dados.bancoLocal && dados.bancoLocal.clientes) + ' cliente(s) no banco do site');
    definir('sync-pendentes', String(dados.pendentes || 0));
    definir('sync-falha', (dados.falha || 0) + ' falha(s)');
    definir('sync-chave-atual', 'atual: ' + (dados.chaveMascara || 'nenhuma') + ' · origem: ' + (dados.origem || 'padrão'));
    const campoUrl = id('sync-url');
    if (campoUrl && !campoUrl.value) campoUrl.value = dados.urlMascara ? 'https://' + dados.urlMascara : '';
    const campoTabela = id('sync-tabela');
    if (campoTabela && !campoTabela.value) campoTabela.value = dados.tabela || 'clientes';
    const campoAtivo = id('sync-ativo');
    if (campoAtivo) campoAtivo.checked = Boolean(dados.ativo);

    html(
      'sync-ultimo-erro',
      dados.ultimoErro
        ? '<div class="alerta-item"><svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/></svg><span>Última falha: <em>' +
          escapar(dados.ultimoErro) + '</em>' + (dados.ultimoErroEm ? ' (' + escapar(tempoRelativo(dados.ultimoErroEm)) + ')' : '') + '</span></div>'
        : dados.ativo
        ? '<p class="muted" style="margin:8px 0 0">Nenhum erro registrado — os cadastros estão subindo. Último envio: ' +
          escapar(dados.ultimoEnvio ? tempoRelativo(dados.ultimoEnvio) : '—') + '</p>'
        : '<p class="muted" style="margin:8px 0 0">Espelhamento desligado: os cadastros ficam só no banco do site.</p>'
    );

    const fila = id('sync-fila');
    if (fila) {
      fila.innerHTML = dados.fila && dados.fila.length
        ? '<div class="table-scroll"><table><thead><tr><th>E-mail</th><th>Motivo</th><th>Tentativas</th><th>Erro</th><th>Na fila desde</th></tr></thead><tbody>' +
          dados.fila
            .map(
              (item) =>
                '<tr><td><code>' + escapar(item.email) + '</code></td><td class="muted">' + escapar(item.motivo || 'cadastro') +
                '</td><td>' + (item.tentativas || 0) + '</td><td class="muted">' + escapar(item.erro || '—') + '</td><td class="muted">' +
                escapar(tempoRelativo(item.desde)) + '</td></tr>'
            )
            .join('') +
          '</tbody></table></div>'
        : '<p class="muted" style="margin:0">Nenhum cadastro parado — tudo sincronizado. 🎉</p>';
    }
    definir('sync-fila-total', String((dados.fila && dados.fila.length) || dados.pendentes || 0));
  }

  async function testarSync() {
    const botao = id('btn-testar-sync');
    if (botao) { botao.disabled = true; botao.textContent = 'Testando…'; }
    try {
      const resposta = await api('admin/supabase/teste', {});
      if (resposta.dados) {
        const teste = resposta.dados.teste || {};
        if (teste.ok) toast('Conexão OK — tabela "' + (teste.tabela || 'clientes') + '" respondendo.', 'ok');
        else toast('Teste falhou: ' + (teste.erro || 'erro desconhecido'), 'err');
      } else if (resposta.ausente && global.ReloSync) {
        const teste = await global.ReloSync.testar(global.ReloSync.configNavegador());
        if (teste.ok) toast('Conexão direta do navegador OK (' + teste.tabela + ').', 'ok');
        else toast('Teste falhou: ' + teste.erro, 'err');
      } else {
        toast(resposta.erro || 'Sem servidor para testar.', 'err');
      }
      await carregarSync();
    } finally {
      if (botao) { botao.disabled = false; botao.textContent = 'Testar conexão'; }
    }
  }

  async function salvarSync(evento) {
    if (evento) evento.preventDefault();
    const corpo = {
      ativo: Boolean(id('sync-ativo').checked),
      url: id('sync-url').value.trim(),
      tabela: id('sync-tabela').value.trim(),
      chave: id('sync-chave').value.trim()
    };
    if (!corpo.chave) delete corpo.chave;
    const resposta = await api('admin/supabase', corpo);
    if (resposta.erro) return toast(resposta.erro, 'err');
    if (resposta.ausente) {
      return toast('Sem servidor no ar, a configuração da nuvem não pode ser gravada pelo painel: rode "npm run serve" (ou ajuste window.RELO_SUPABASE na página).', 'err');
    }
    if (id('sync-chave')) id('sync-chave').value = '';
    const teste = resposta.dados && resposta.dados.teste;
    toast('Configuração salva' + (teste && teste.ok ? ' — conexão OK.' : teste ? ': ' + (teste.erro || '') : '.'), teste && !teste.ok ? 'err' : 'ok');
    await carregarSync();
    await carregarMetricas();
  }

  async function reenviarFila() {
    const botao = id('btn-reenviar');
    if (botao) { botao.disabled = true; botao.textContent = 'Enviando…'; }
    if (!autenticado() && ReloAuth.reenviarFilaNuvem) {
      const local = await ReloAuth.reenviarFilaNuvem();
      if (botao) { botao.disabled = false; botao.textContent = 'Reenviar fila'; }
      toast(local.processados ? 'Reenviados ' + local.processados + ' cadastro(s) pelo navegador.' : 'Nada na fila.', 'ok');
      await carregarSync();
      await carregarUsuarios();
      return;
    }
    const resposta = await api('admin/supabase/reenviar', {});
    if (botao) { botao.disabled = false; botao.textContent = 'Reenviar fila'; }
    if (resposta.erro) return toast(resposta.erro, 'err');
    if (resposta.ausente) return toast('Precisa do servidor no ar para reenviar a fila do servidor.', 'err');
    const processados = (resposta.dados && resposta.dados.processados) || 0;
    toast(processados ? 'Reenvio tentado para ' + processados + ' cadastro(s).' : 'Nada pendente na fila.', 'ok');
    await carregarSync();
    await carregarUsuarios();
  }

  const SQL_CREATE = `-- Cole tudo isto no SQL Editor do Supabase (1x só).
create table if not exists public.clientes (
  id              uuid primary key default gen_random_uuid(),
  id_cliente      text,
  nome            text not null,
  email           text not null unique,
  perfil          text not null default 'cliente',
  origem          text not null default 'cadastro',
  telefone        text,
  criado_em       timestamptz not null default now(),
  ultimo_login    timestamptz,
  total_logins    integer not null default 0,
  sincronizado_em timestamptz not null default now()
);
create index if not exists clientes_criado_em_idx on public.clientes (criado_em desc);

alter table public.clientes enable row level security;
drop policy if exists "site grava cadastro" on public.clientes;
create policy "site grava cadastro" on public.clientes for insert to anon, service_role with check (true);
drop policy if exists "site atualiza cadastro" on public.clientes;
create policy "site atualiza cadastro" on public.clientes for update to anon, service_role using (true) with check (true);
drop policy if exists "painel consulta cadastros" on public.clientes;
create policy "painel consulta cadastros" on public.clientes for select to anon, authenticated, service_role using (true);

-- A senha nunca é enviada: nem hash, nem texto puro.`;

  async function copiarSQL() {
    try {
      await navigator.clipboard.writeText(SQL_CREATE);
      toast('SQL da tabela copiado! Cole no SQL Editor do Supabase.', 'ok');
    } catch (erro) {
      abrirModal('sql-modal');
      const alvo = id('sql-texto');
      if (alvo) alvo.textContent = SQL_CREATE;
    }
  }

  /* ============================ IA (Nano Banana) ============================ */
  async function chamarIaAdmin(corpo) {
    const resposta = await api('admin/ia', corpo);
    if (resposta.dados) return { ok: true, dados: resposta.dados };
    return { ok: false, dados: { erro: resposta.erro || 'Servidor indisponível.' } };
  }
  async function carregarIA() {
    const resposta = await chamarIaAdmin();
    const dados = resposta.dados || {};
    const pill = id('ia-pill');
    if (!resposta.ok) {
      definir('ia-status', dados.erro || 'Erro ao carregar');
      if (pill) { pill.className = 'pill off'; pill.textContent = 'sem conexão'; }
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
    const campoLimite = id('ia-limite-input');
    if (campoLimite && !campoLimite.value) campoLimite.value = dados.limitePorHora;
  }
  async function salvarChaveIA() {
    const chave = String(id('ia-chave-input').value || '').trim();
    if (!chave) return toast('Cole uma chave válida antes de salvar.', 'err');
    const resposta = await chamarIaAdmin({ chave });
    if (!resposta.ok) return toast(resposta.dados.erro || 'Não foi possível salvar a chave.', 'err');
    id('ia-chave-input').value = '';
    toast('Chave salva! Nano Banana ' + (resposta.dados.ativo ? 'ativo' : 'inativo') + '.', 'ok');
    carregarIA();
  }
  async function salvarLimiteIA() {
    const limitePorHora = Number(id('ia-limite-input').value);
    if (!Number.isFinite(limitePorHora) || limitePorHora < 1 || limitePorHora > 500) {
      return toast('Informe um limite válido (entre 1 e 500).', 'err');
    }
    const resposta = await chamarIaAdmin({ limitePorHora });
    if (!resposta.ok) return toast(resposta.dados.erro || 'Não foi possível salvar o limite.', 'err');
    toast('Limite atualizado para ' + resposta.dados.limitePorHora + ' gerações/hora.', 'ok');
    carregarIA();
  }

  /* ============================ "atualizado há X" ============================ */
  let ultimaAtualizacao = 0;
  function marcarAtualizado() {
    ultimaAtualizacao = Date.now();
    renderizarAtualizado();
  }
  async function renderizarSeloBanco() {
    const pill = id('pill-banco');
    if (!pill || estado.emModoLocal) return; // no modo local o selo já diz a verdade
    const resposta = await api('health');
    if (!resposta.dados) return;
    const dados = resposta.dados;
    pill.className = 'pill on';
    pill.textContent = 'banco do servidor · ' + (dados.usuarios || 0) + ' conta(s)';
  }

  function renderizarAtualizado() {
    const el = id('pill-atualizado');
    if (!el) return;
    if (!ultimaAtualizacao) {
      el.className = 'pill';
      el.textContent = 'sincronizando…';
      return;
    }
    const segundos = Math.round((Date.now() - ultimaAtualizacao) / 1000);
    el.className = 'pill ' + (segundos < 120 ? 'on' : segundos < 420 ? 'warn' : 'off');
    el.textContent = 'atualizado ' + tempoRelativo(new Date(ultimaAtualizacao).toISOString());
  }

  /* ============================ navegação ============================ */
  const TITULOS = {
    dashboard: ['Visão Geral do Negócio', 'Cadastros, acessos e operação em tempo real'],
    clients: ['Banco de Clientes & Logins', 'Tudo que se cadastra no site aparece aqui'],
    products: ['Controle de Estoque', 'Entrada e saída compartilhadas entre os administradores'],
    maintenance: ['Gestão de Manutenção', 'Equipamentos e serviços da barbearia'],
    expenses: ['Controle de Despesas', 'Custos do mês, por categoria'],
    banco: ['Banco de Dados', 'data/db.json + espelho no Supabase'],
    ia: ['Nano Banana — Central de IA', 'Chave, limites e uso do gerador de imagens']
  };

  function mudarAba(nome) {
    document.querySelectorAll('.section-panel').forEach((p) => p.classList.remove('active'));
    document.querySelectorAll('.sidebar .nav-link[data-tab]').forEach((l) =>
      l.classList.toggle('active', l.dataset.tab === nome)
    );
    const painel = id('tab-' + nome);
    if (painel) painel.classList.add('active');
    const cabecalho = TITULOS[nome] || ['Painel Administrativo', ''];
    definir('page-title', cabecalho[0]);
    definir('page-sub', cabecalho[1]);
    document.getElementById('layout').classList.remove('nav-aberta');
    if (nome === 'clients') carregarUsuarios();
    if (nome === 'products') carregarEstoque();
    if (nome === 'maintenance') carregarManutencao();
    if (nome === 'expenses') carregarDespesas();
    if (nome === 'banco') carregarSync();
    if (nome === 'ia') carregarIA();
  }

  async function carregarMetricas() {
    const resposta = await api('admin/metricas');
    if (resposta.dados) return renderizarMetricas(resposta.dados);
    // modo local: monta as métricas a partir do que o navegador tem
    renderizarMetricas(metricasLocais());
  }

  function metricasLocais() {
    const agora = Date.now();
    const dias = [];
    for (let i = 13; i >= 0; i -= 1) {
      const data = new Date(agora - i * 864e5);
      dias.push({ dia: data.toISOString().slice(0, 10), rotulo: data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), cadastros: 0, acessos: 0 });
    }
    const mapa = new Map(dias.map((d) => [d.dia, d]));
    let novos7 = 0;
    let novos30 = 0;
    let ativos30 = 0;
    const origens = {};
    estado.usuarios.forEach((u) => {
      if (u.perfil === 'admin') return;
      const chave = u.criadoEm ? new Date(u.criadoEm).toISOString().slice(0, 10) : null;
      if (chave && mapa.has(chave)) mapa.get(chave).cadastros += 1;
      const criado = u.criadoEm ? new Date(u.criadoEm).getTime() : 0;
      if (criado && agora - criado <= 7 * 864e5) novos7 += 1;
      if (criado && agora - criado <= 30 * 864e5) novos30 += 1;
      if (u.ultimoLogin && agora - new Date(u.ultimoLogin).getTime() <= 30 * 864e5) ativos30 += 1;
      const o = u.origem || 'cadastro';
      origens[o] = (origens[o] || 0) + 1;
    });
    let acessos24 = 0;
    let falhas24 = 0;
    (estado.logins || []).forEach((l) => {
      const quando = l.quando ? new Date(l.quando).getTime() : 0;
      if (!quando) return;
      if (agora - quando > 864e5) return;
      if (l.sucesso === false) falhas24 += 1;
      else acessos24 += 1;
      const chave = new Date(quando).toISOString().slice(0, 10);
      if (mapa.has(chave) && l.sucesso !== false) mapa.get(chave).acessos += 1;
    });
    const produtos = (estado.estoque || []).length ? estado.estoque : lerLocal('produtos').map(normalizarProduto);
    void 0;
    const despesas = (estado.despesas || []).length ? estado.despesas : lerLocal('despesas').map(normalizarDespesa);
    const manutencoes = (estado.manutencoes || []).length ? estado.manutencoes : lerLocal('manutencoes').map(normalizarManutencao);
    const clientes = estado.usuarios.filter((u) => u.perfil !== 'admin');
    const mesAtual = new Date().toISOString().slice(0, 7);
    return {
      ok: true,
      clientes: clientes.length,
      administradores: estado.usuarios.length - clientes.length,
      novos7, novos30, ativos30,
      taxaRetorno: clientes.length ? Math.round((ativos30 / clientes.length) * 100) : 0,
      acessos24, falhas24,
      serie: dias,
      origens: Object.keys(origens).map((chave) => ({ chave, total: origens[chave] })),
      estoque: {
        unidades: produtos.reduce((s, p) => s + (p.quantidade || 0), 0),
        valor: produtos.reduce((s, p) => s + (p.quantidade || 0) * (p.preco || 0), 0),
        itens: produtos.length,
        abaixoDoMinimo: produtos.filter((p) => p.minimo > 0 && p.quantidade <= p.minimo)
      },
      manutencoesAbertas: manutencoes.filter((m) => m.status !== 'Concluído').length,
      despesas: { doMes: despesas.filter((d) => mesDe(d.criadoEm) === mesAtual).reduce((s, d) => s + (d.valor || 0), 0), total: despesas.length },
      sincronizacao: { pendentes: 0, enviado: 0, falha: 0, ultimoErro: null, ultimoEnvio: null, fila: [] },
      atividade: clientes
        .slice(-6)
        .reverse()
        .map((u) => ({ tipo: 'cadastro', titulo: u.nome || u.email, detalhe: u.email, quando: u.criadoEm }))
    };
  }

  async function carregarEstoque() {
    try { renderizarEstoque(await Loja.carregarEstoque()); }
    catch (erro) { toast(erro.message, 'err'); }
  }
  async function carregarManutencao() {
    try { renderizarManutencoes(await Loja.carregarLista('manutencoes')); }
    catch (erro) { toast(erro.message, 'err'); }
  }
  async function carregarDespesas() {
    try { renderizarDespesas(await Loja.carregarLista('despesas')); }
    catch (erro) { toast(erro.message, 'err'); }
  }

  async function carregarTudo() {
    if (!estado.liberado && !(await verificarAcesso())) return;
    renderizarAtualizado();
    await carregarUsuarios();
    await Promise.all([carregarEstoque(), carregarManutencao(), carregarDespesas()]);
    await carregarMetricas();
    await carregarSync();
    marcarAtualizado();
  }

  /* ============================ eventos ============================ */
  function ligarEventos() {
    document.querySelectorAll('.sidebar .nav-link[data-tab]').forEach((link) => {
      link.addEventListener('click', (evento) => {
        evento.preventDefault();
        mudarAba(link.dataset.tab);
        if (link.dataset.tab === 'dashboard') carregarTudo();
      });
    });
    const mobile = id('btn-menu-mobile');
    if (mobile) mobile.addEventListener('click', () => id('layout').classList.toggle('nav-aberta'));
    document.addEventListener('click', (evento) => {
      if (id('layout').classList.contains('nav-aberta') && !evento.target.closest('aside.sidebar') && !evento.target.closest('#btn-menu-mobile')) {
        id('layout').classList.remove('nav-aberta');
      }
    });

    id('btn-atualizar').addEventListener('click', async () => {
      const botao = id('btn-atualizar');
      botao.disabled = true;
      botao.textContent = 'Atualizando…';
      await carregarTudo();
      botao.disabled = false;
      botao.textContent = 'Atualizar';
      toast('Dados atualizados.', 'ok');
    });
    id('link-sair').addEventListener('click', async (evento) => {
      evento.preventDefault();
      await ReloAuth.sair();
      global.location.href = 'index.html';
    });

    // filtros de clientes
    const busca = id('busca-clientes');
    let timerBusca;
    busca.addEventListener('input', () => {
      clearTimeout(timerBusca);
      timerBusca = setTimeout(() => {
        estado.busca = busca.value;
        estado.pagina = 0;
        renderizarClientes();
      }, 120);
    });
    id('filtro-perfil').addEventListener('change', (e) => { estado.filtroPerfil = e.target.value; estado.pagina = 0; renderizarClientes(); });
    id('filtro-sync').addEventListener('change', (e) => { estado.filtroSync = e.target.value; estado.pagina = 0; renderizarClientes(); });
    id('ordenar-por').addEventListener('change', (e) => { estado.ordem = e.target.value; renderizarClientes(); });
    id('pager-anterior').addEventListener('click', () => { estado.pagina = Math.max(0, estado.pagina - 1); renderizarClientes(); });
    id('pager-proximo').addEventListener('click', () => { estado.pagina += 1; renderizarClientes(); });
    id('btn-recarregar-clientes').addEventListener('click', carregarUsuarios);
    id('btn-novo-cliente').addEventListener('click', () => abrirModal('cliente-modal'));
    id('cliente-form').addEventListener('submit', salvarCliente);
    id('btn-exportar-csv').addEventListener('click', exportarCSV);

    // ações nas tabelas (delegação — evita onclick inline e XSS por dados)
    document.body.addEventListener('click', async (evento) => {
      const botao = evento.target.closest('[data-acao]');
      if (!botao) return;
      const acao = botao.dataset.acao;
      const i = Number(botao.dataset.i);
      const lista = { produtos: estado.estoque || [], manutencoes: estado.manutencoes || [], despesas: estado.despesas || [] };
      try {
        if (acao === 'ficha') return abrirFicha(botao.dataset.id);
        if (acao === 'excluir') return excluirUsuario(botao.dataset.id);

        if (acao === 'mov') {
          const produto = lista.produtos[i];
          if (!produto) return;
          id('mov-id').value = produto.id;
          definir('mov-titulo', 'Movimentar: ' + produto.nome);
          definir('mov-contexto', 'Estoque atual: ' + produto.quantidade + ' unidade(s).');
          id('mov-qtd').value = 1;
          id('mov-obs').value = '';
          return abrirModal('mov-modal');
        }
        if (acao === 'edit-produto') {
          const produto = lista.produtos[i];
          if (!produto) return;
          id('prod-id').value = produto.id;
          definir('product-modal-titulo', 'Editar produto');
          id('prod-name').value = produto.nome;
          id('prod-category').value = produto.categoria || '';
          id('prod-qty').value = produto.quantidade;
          id('prod-min').value = produto.minimo || 0;
          id('prod-price').value = produto.preco;
          return abrirModal('product-modal');
        }
        if (acao === 'del-produto') {
          const produto = lista.produtos[i];
          if (!produto) return;
          return confirmar('Excluir produto', 'Remover <strong>' + escapar(produto.nome) + '</strong> do estoque?', 'Excluir', async () => {
            await Loja.excluir('produtos', produto.id);
            toast('Produto removido.', 'ok');
            await carregarEstoque();
            await carregarMetricas();
          });
        }
        if (acao === 'status-manutencao') {
          const ordem = lista.manutencoes[i];
          if (!ordem) return;
          const ordemStatus = ['Pendente', 'Em Andamento', 'Concluído'];
          const proximo = ordemStatus[(ordemStatus.indexOf(ordem.status) + 1) % ordemStatus.length];
          await Loja.atualizarManutencao({ id: ordem.id, status: proximo });
          toast('Status: ' + proximo.toLowerCase() + '.');
          return carregarManutencao();
        }
        if (acao === 'del-manutencao') {
          const ordem = lista.manutencoes[i];
          if (!ordem) return;
          return confirmar('Excluir ordem', 'Remover a manutenção de <strong>' + escapar(ordem.item) + '</strong>?', 'Excluir', async () => {
            await Loja.excluir('manutencoes', ordem.id);
            toast('Ordem removida.', 'ok');
            await carregarManutencao();
          });
        }
        if (acao === 'del-despesa') {
          const despesa = lista.despesas[i];
          if (!despesa) return;
          return confirmar('Excluir despesa', 'Remover <strong>' + escapar(despesa.descricao) + '</strong> (' + moeda(despesa.valor) + ')?', 'Excluir', async () => {
            await Loja.excluir('despesas', despesa.id);
            toast('Despesa removida.', 'ok');
            await carregarDespesas();
            await carregarMetricas();
          });
        }
      } catch (erro) {
        toast(erro.message || 'Não foi possível concluir.', 'err');
      }
    });

    // estoque / manutenção / despesas
    id('btn-novo-produto').addEventListener('click', () => {
      id('product-form').reset();
      id('prod-id').value = '';
      definir('product-modal-titulo', 'Novo produto');
      abrirModal('product-modal');
    });
    id('btn-recarregar-estoque').addEventListener('click', carregarEstoque);
    id('product-form').addEventListener('submit', async (evento) => {
      evento.preventDefault();
      try {
        await Loja.salvarProduto({
          id: id('prod-id').value || undefined,
          nome: id('prod-name').value.trim(),
          categoria: id('prod-category').value.trim(),
          quantidade: Number(id('prod-qty').value),
          minimo: Number(id('prod-min').value),
          preco: Number(id('prod-price').value)
        });
        fecharModal('product-modal');
        id('product-form').reset();
        id('prod-id').value = '';
        toast('Produto salvo no banco de dados.', 'ok');
        await carregarEstoque();
        await carregarMetricas();
      } catch (erro) {
        toast(erro.message, 'err');
      }
    });
    id('mov-form').addEventListener('submit', async (evento) => {
      evento.preventDefault();
      try {
        const tipo = id('mov-tipo').value;
        const quantidade = Number(id('mov-qtd').value) || 1;
        await Loja.movimentar({
          id: id('mov-id').value,
          delta: tipo === 'entrada' ? quantidade : -quantidade,
          observacao: id('mov-obs').value.trim()
        });
        fecharModal('mov-modal');
        toast('Estoque atualizado.', 'ok');
        await carregarEstoque();
        await carregarMetricas();
      } catch (erro) {
        toast(erro.message, 'err');
      }
    });

    id('btn-nova-manutencao').addEventListener('click', () => {
      id('maintenance-form').reset();
      abrirModal('maintenance-modal');
    });
    id('btn-recarregar-manutencao').addEventListener('click', carregarManutencao);
    id('maintenance-form').addEventListener('submit', async (evento) => {
      evento.preventDefault();
      try {
        await Loja.criar('manutencoes', {
          item: id('maint-item').value.trim(),
          descricao: id('maint-desc').value.trim(),
          responsavel: id('maint-resp').value.trim(),
          valor: id('maint-valor').value ? Number(id('maint-valor').value) : null,
          status: id('maint-status').value
        });
        fecharModal('maintenance-modal');
        id('maintenance-form').reset();
        toast('Manutenção registrada.', 'ok');
        await carregarManutencao();
        await carregarMetricas();
      } catch (erro) {
        toast(erro.message, 'err');
      }
    });

    id('btn-nova-despesa').addEventListener('click', () => {
      id('expense-form').reset();
      id('exp-cat').value = 'Operacional';
      abrirModal('expense-modal');
    });
    id('btn-recarregar-despesas').addEventListener('click', carregarDespesas);
    id('expense-form').addEventListener('submit', async (evento) => {
      evento.preventDefault();
      try {
        await Loja.criar('despesas', {
          descricao: id('exp-desc').value.trim(),
          categoria: id('exp-cat').value.trim() || 'Operacional',
          valor: Number(id('exp-value').value),
          pago: id('exp-pago').checked
        });
        fecharModal('expense-modal');
        id('expense-form').reset();
        toast('Despesa salva no banco de dados.', 'ok');
        await carregarDespesas();
        await carregarMetricas();
      } catch (erro) {
        toast(erro.message, 'err');
      }
    });

    // banco / nuvem
    id('form-sync').addEventListener('submit', salvarSync);
    id('btn-testar-sync').addEventListener('click', testarSync);
    id('btn-reenviar').addEventListener('click', reenviarFila);
    id('btn-recarregar-sync').addEventListener('click', carregarSync);
    id('btn-sql').addEventListener('click', copiarSQL);

    // IA
    id('btn-recarregar-ia').addEventListener('click', carregarIA);
    id('btn-salvar-chave-ia').addEventListener('click', salvarChaveIA);
    id('btn-salvar-limite-ia').addEventListener('click', salvarLimiteIA);
    id('btn-atividade-trocar').addEventListener('click', carregarMetricas);
  }

  /* ============================ começo ============================ */
  document.addEventListener('DOMContentLoaded', async () => {
    ligarModais();
    const liberado = await verificarAcesso();
    if (!liberado) {
      // quem entra pela caixinha de login abre o painel sozinho
      ReloAuth.aoMudar(async (usuario) => {
        if (!usuario) return;
        if (ReloAuth.ehAdmin(usuario)) {
          await verificarAcesso();
          await carregarTudo();
          return;
        }
        const layout = id('layout');
        if (layout) layout.style.display = 'none';
        telaBloqueio(
          'Sua conta é de cliente',
          'A conta <strong>' + escapar(usuario.email) + '</strong> não tem permissão de administrador.',
          false
        );
      });
      return;
    }
    ligarEventos();
    await carregarTudo();
    // o painel se mantém vivo: de minuto em minuto atualiza o dashboard, os
    // cadastros abertos na tela e o carimbo de "atualizado há X"
    if (global.ReloAdminTimer) clearInterval(global.ReloAdminTimer);
    global.ReloAdminTimer = setInterval(async () => {
      renderizarAtualizado();
      if (document.hidden) return;
      const abaAtual = (document.querySelector('.section-panel.active') || {}).id;
      if (abaAtual === 'tab-dashboard') {
        await carregarMetricas();
      } else if (abaAtual === 'tab-clients') {
        await carregarUsuarios();
      } else if (abaAtual === 'tab-products') {
        await carregarEstoque();
      } else if (abaAtual === 'tab-expenses') {
        await carregarDespesas();
      } else if (abaAtual === 'tab-maintenance') {
        await carregarManutencao();
      } else if (abaAtual === 'tab-banco') {
        await carregarSync();
      }
      if (abaAtual !== 'tab-ia') renderizarSeloBanco();
    }, 60000);
  });

  // pequeno utilitário exposto para o console do navegador
  global.ReloAdmin = { estado, toast, api, mudarAba, carregarTudo };
})(typeof window !== 'undefined' ? window : this);
