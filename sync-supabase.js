/*
 * ReloSync — espelho do cadastro de clientes no banco de dados da nuvem (Supabase).
 *
 * Por que existe: o banco "oficial" do site é o arquivo data/db.json do servidor
 * (é dele que o painel admin lê). Este módulo manda uma cópia de cada cadastro para
 * o Supabase da barbearia, para que os clientes fiquem num banco central, visível
 * de qualquer computador e protegido de um arquivo apagado.
 *
 * Regras importantes:
 *   - NUNCA bloqueia o cadastro: se o Supabase não responder, o cliente fica na
 *     fila e o servidor tenta de novo sozinho (e o painel admin tem "Reenviar").
 *   - A chave fica no servidor (.env ou data/supabase-config.json). No navegador o
 *     módulo só é usado no modo local (site aberto sem servidor), com a chave
 *     pública/anon que já é do projeto.
 *   - Funciona em dois ambientes: Node (require) e navegador (window.ReloSync).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api; // Node (server.js)
  } else {
    root.ReloSync = api; // Navegador
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Projeto Supabase da barbearia. A URL e a chave anon já são públicas no
  // repositório (feedback.js usa as mesmas); no servidor isso pode ser
  // sobrescrito por .env ou pelo painel admin sem mexer no código.
  const PADROES = {
    url: 'https://jhfwgucoaykbgoyqibdn.supabase.co',
    chave:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoZndndWNvYXlrYmdveXFpYmRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MDA2MTMsImV4cCI6MjA5NzE3NjYxM30.h8JmAb6Ifyw94rtmHRiegrvJLAC08knYK6Ez4bRyYCg',
    tabela: 'clientes'
  };

  const TEMPO_LIMITE_MS = 4500;

  /* ------------------------------------------------------------------ */
  /* Configuração                                                        */
  /* ------------------------------------------------------------------ */

  // No navegador a página pode ajustar antes do script carregar:
  //   window.RELO_SUPABASE = { ativo: false }          // desliga o espelho
  //   window.RELO_SUPABASE = { url, chave, tabela }     // aponta para outro projeto
  function configNavegador() {
    const ambiente = typeof globalThis !== 'undefined' ? globalThis : this;
    const explicita = ambiente.RELO_SUPABASE || {};
    return {
      url: semBarra(explicita.url || PADROES.url),
      chave: explicita.chave || PADROES.chave,
      tabela: (explicita.tabela || PADROES.tabela || PADROES.tabela).replace(/[^a-zA-Z0-9_]/g, '') || 'clientes',
      ativo: explicita.ativo !== false
    };
  }

  function semBarra(url) {
    return String(url || '').trim().replace(/\/+$/, '');
  }

  /* ------------------------------------------------------------------ */
  /* Montagem do registro (uma linha da tabela `clientes`)               */
  /* ------------------------------------------------------------------ */
  function montarLinha(cliente) {
    const email = String((cliente && cliente.email) || '').trim().toLowerCase();
    return {
      id_cliente: (cliente && cliente.id) || null,
      nome: String((cliente && cliente.nome) || '').trim().slice(0, 160) || 'Sem nome',
      email,
      perfil: (cliente && cliente.perfil) === 'admin' ? 'admin' : 'cliente',
      origem: (cliente && cliente.origem) || 'cadastro',
      telefone: (cliente && cliente.telefone) || null,
      criado_em: (cliente && cliente.criadoEm) || new Date().toISOString(),
      ultimo_login: (cliente && cliente.ultimoLogin) || null,
      total_logins: Number((cliente && cliente.totalLogins) || 0),
      sincronizado_em: new Date().toISOString()
    };
  }

  /* ------------------------------------------------------------------ */
  /* Envio                                                               */
  /* ------------------------------------------------------------------ */
  async function postarLinha(alvo, linha, cfg, prefer) {
    const controlador = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const relógio = controlador ? setTimeout(() => controlador.abort(), TEMPO_LIMITE_MS) : null;
    try {
      const resposta = await fetch(alvo, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: cfg.chave,
          Authorization: 'Bearer ' + cfg.chave,
          Prefer: prefer
        },
        body: JSON.stringify(linha),
        signal: controlador ? controlador.signal : undefined
      });
      const texto = await resposta.text().catch(() => '');
      let dados = null;
      try {
        dados = texto ? JSON.parse(texto) : null;
      } catch (erro) {
        dados = null;
      }
      return { resposta, dados, texto };
    } catch (erro) {
      const motivo =
        erro && erro.name === 'AbortError'
          ? 'Supabase não respondeu a tempo (' + Math.round(TEMPO_LIMITE_MS / 1000) + 's).'
          : (erro && erro.message) || 'falha de rede';
      return { erro: motivo };
    } finally {
      if (relógio) clearTimeout(relógio);
    }
  }

  function lerMensagem(tentativa, statusPadrao) {
    if (tentativa.erro) return tentativa.erro;
    const dados = tentativa.dados;
    const texto = tentativa.texto || '';
    return (
      (dados && (dados.message || dados.error || dados.hint)) ||
      texto.slice(0, 180) ||
      tentativa.resposta.statusText ||
      statusPadrao
    );
  }

  async function enviar(cliente, cfg) {
    const linha = montarLinha(cliente);
    if (!linha.email) return { ok: false, erro: 'Sem e-mail para sincronizar.' };
    if (!cfg || !cfg.url || !cfg.chave) return { ok: false, erro: 'Supabase não configurado.' };
    if (typeof fetch !== 'function') return { ok: false, erro: 'Este ambiente não tem fetch (rede).' };

    const base = `${semBarra(cfg.url)}/rest/v1/${cfg.tabela}`;
    // on_conflict precisa de uma UNIQUE em email na tabela (o SQL do projeto cria).
    const conflito = String(cfg.conflito === undefined ? 'email' : cfg.conflito).replace(/[^a-zA-Z0-9_]/g, '');

    let tentativa = await postarLinha(
      conflito ? base + '?on_conflict=' + conflito : base,
      linha,
      cfg,
      'return=representation,resolution=merge-duplicates'
    );

    // Tabela sem UNIQUE em email: refaz como INSERT simples (pode duplicar, mas não perde o cadastro).
    const mensagem = lerMensagem(tentativa, 'Supabase recusou o cadastro.');
    if (tentativa.resposta && !tentativa.resposta.ok && /unique or exclusion constraint/i.test(mensagem)) {
      tentativa = await postarLinha(base, linha, cfg, 'return=representation');
    }

    if (tentativa.erro) return { ok: false, erro: tentativa.erro };

    const resposta = tentativa.resposta;
    const dados = tentativa.dados;
    if (!resposta.ok) {
      return {
        ok: false,
        status: resposta.status,
        erro:
          resposta.status === 404
            ? `A tabela "${cfg.tabela}" não existe no Supabase. Rode o SQL de ferramentas/supabase-tabela-clientes.sql.`
            : lerMensagem(tentativa, 'Supabase recusou o cadastro (erro ' + resposta.status + ').')
      };
    }

    const salvo = Array.isArray(dados) ? dados[0] : dados;
    return { ok: true, id: (salvo && salvo.id) || null, email: linha.email };
  }

  /* ------------------------------------------------------------------ */
  /* Teste de conexão (usado pelo painel admin)                          */
  /* ------------------------------------------------------------------ */
  async function testar(cfg) {
    if (!cfg || !cfg.url || !cfg.chave) return { ok: false, erro: 'Sem configuração de Supabase.' };
    const alvo = `${semBarra(cfg.url)}/rest/v1/${cfg.tabela}?select=email&limit=1`;
    const controlador = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const relógio = controlador ? setTimeout(() => controlador.abort(), TEMPO_LIMITE_MS) : null;
    try {
      const resposta = await fetch(alvo, {
        method: 'GET',
        headers: { apikey: cfg.chave, Authorization: 'Bearer ' + cfg.chave },
        signal: controlador ? controlador.signal : undefined
      });
      if (resposta.ok) {
        let total = 0;
        try {
          total = (await resposta.json()).length;
        } catch (erro) {
          total = 0;
        }
        return { ok: true, tabela: cfg.tabela, amostra: total };
      }
      const corpo = await resposta.text().catch(() => '');
      let mensagem = resposta.statusText || '';
      try {
        const j = JSON.parse(corpo);
        mensagem = j.message || j.error || mensagem;
      } catch (erro) {
        /* mantém o statusText */
      }
      return {
        ok: false,
        status: resposta.status,
        erro:
          resposta.status === 404
            ? `A tabela "${cfg.tabela}" não existe no Supabase. Rode o SQL em ferramentas/supabase-tabela-clientes.sql.`
            : resposta.status === 401 || resposta.status === 403
            ? 'Chave sem permissão nessa tabela (verifique a policy de INSERT/SELECT).'
            : mensagem || 'Erro ' + resposta.status
      };
    } catch (erro) {
      return {
        ok: false,
        erro:
          erro && erro.name === 'AbortError'
            ? 'Sem resposta do Supabase (timeout).'
            : 'Não foi possível falar com o Supabase: ' + ((erro && erro.message) || 'rede')
      };
    } finally {
      if (relógio) clearTimeout(relógio);
    }
  }

  function mascaraChave(chave) {
    const valor = String(chave || '');
    if (!valor) return null;
    if (valor.length <= 12) return valor.slice(0, 4) + '••••';
    return valor.slice(0, 6) + '••••••••' + valor.slice(-4);
  }

  return {
    PADROES,
    TEMPO_LIMITE_MS,
    configNavegador,
    montarLinha,
    enviar,
    testar,
    mascaraChave
  };
});
