// Avaliações de clientes — Barbearia Prumo.
//
// Correções em relação à versão anterior:
//  - IIFE: o `const` solto no escopo global colidia com script.js/auth.js e derrubava
//    páginas inteiras em SyntaxError.
//  - O loader do Supabase JS agora REJEITA em vez de girar num setInterval eterno
//    (que deixava o botão preso em "Enviando..." para sempre).
//  - O insert é aguardado e seu erro é verificado: só aparece "enviado com sucesso"
//    quando realmente salvou. Antes mostrava sucesso mesmo com o insert falhando.
//  - As avaliações de exemplo não se misturam mais às reais fingindo ser de verdade:
//    são exibidas em bloco próprio, identificado, e só quando o banco não responde.
(function () {
  'use strict';

  const SUPABASE_URL = 'https://jhfwgucoaykbgoyqibdn.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoZndndWNvYXlrYmdveXFpYmRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MDA2MTMsImV4cCI6MjA5NzE3NjYxM30.h8JmAb6Ifyw94rtmHRiegrvJLAC08knYK6Ez4bRyYCg';
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  const SDK_TIMEOUT_MS = 10000;

  let currentUser = null;
  let realFeedbacks = [];
  let dbAvailable = null;   // null = ainda não tentou | true | false

  /** Exemplos usados só quando o banco não responde. Sempre rotulados como exemplo. */
  const DEMO_FEEDBACKS = [
    {
      barber_name: 'Michel (Barbeiro)',
      rating_barber: 5,
      rating_service: 5,
      comment: 'O Michel tem mãos de fada! O degradê saiu impecável, simetria perfeita e barba alinhada com toalha quente. Atendimento nota 10 na Style Relo Barber.',
      created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
    },
    {
      barber_name: 'Weverton (Barbeiro)',
      rating_barber: 5,
      rating_service: 5,
      comment: 'Profissionalismo puro do Weverton. Entendeu exatamente o estilo Executive Contour que pedi. O ambiente é super organizado e o café é excelente.',
      created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
    },
    {
      barber_name: 'Vitor (Visagista) & Evelyn (Designer)',
      rating_barber: 5,
      rating_service: 5,
      comment: 'Testei a IA de visagismo no site e o Vitor ajustou os detalhes com o visagismo digital. A Evelyn deu o toque final no design do corte. Resultado impressionante!',
      created_at: new Date(Date.now() - 3600000 * 48).toISOString(),
    },
    {
      barber_name: 'Gabriel (Segurança) & Equipe',
      rating_barber: 5,
      rating_service: 5,
      comment: 'Desde a recepção com o Gabriel garantindo total segurança e tranquilidade até a saída. Lugar de respeito, estilo e alto padrão. Recomendo demais!',
      created_at: new Date(Date.now() - 3600000 * 72).toISOString(),
    },
  ];

  /** Mesmo loader de auth.js: deduplicado por data-supabase-sdk, com timeout e rejeição. */
  function loadSupabaseSdk() {
    return new Promise((resolve, reject) => {
      if (window.supabase && window.supabase.createClient) return resolve();

      let el = document.querySelector('script[data-supabase-sdk]');
      if (!el) {
        el = document.createElement('script');
        el.src = SDK_URL;
        el.async = true;
        el.setAttribute('data-supabase-sdk', '');
        document.head.appendChild(el);
      }

      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`O Supabase JS não carregou em ${SDK_TIMEOUT_MS / 1000}s.`));
      }, SDK_TIMEOUT_MS);

      const finish = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) reject(err); else resolve();
      };

      el.addEventListener('load', () => {
        if (window.supabase && window.supabase.createClient) finish(null);
        else finish(new Error('O Supabase JS carregou, mas createClient não está disponível.'));
      });
      el.addEventListener('error', () => {
        finish(new Error('Não foi possível carregar o Supabase JS (CDN inacessível).'));
      });
    });
  }

  let clientPromise = null;
  function getSupabaseClient() {
    if (!clientPromise) {
      clientPromise = loadSupabaseSdk()
        .then(() => window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
      clientPromise.catch(() => { clientPromise = null; });
    }
    return clientPromise;
  }

  async function checkUserAuth() {
    const feedbackFormCard = document.getElementById('feedbackFormCard');
    const loginPrompt = document.getElementById('loginPrompt');

    // A sessão vem do ReloAuth (auth-core.js + servidor Node), que é a fonte de
    // verdade do projeto. Se ele não estiver carregado, avalia como visitante.
    try {
      if (window.ReloAuth) {
        await window.ReloAuth.ready();
        const usuario = window.ReloAuth.usuario;
        currentUser = usuario
          ? { id: usuario.id, email: usuario.email, nome: usuario.nome, perfil: usuario.perfil }
          : null;
      } else {
        currentUser = null;
      }
    } catch (error) {
      console.warn('Não foi possível consultar a sessão do cliente:', error);
      currentUser = null;
    }

    if (feedbackFormCard) feedbackFormCard.style.display = 'block';
    if (loginPrompt) {
      if (currentUser) {
        loginPrompt.style.display = 'none';
      } else {
        loginPrompt.style.display = 'block';
        loginPrompt.innerHTML =
          'Você está navegando como visitante. <a href="#" onclick="abrirLoginFeedback(); return false;" ' +
          'style="color: var(--gold); font-weight: 600;">Entre na sua conta</a> para o feedback ' +
          'ficar vinculado ao seu cadastro.';
      }
    }
    updateAuthLink();
  }

  function abrirLoginFeedback() {
    if (window.ReloLoginModal) {
      window.ReloLoginModal.abrir({
        aba: 'entrar',
        mensagem: 'Entre para que sua avaliação fique registrada no seu cadastro de cliente.',
      });
    }
  }

  function showLoginPrompt() {
    const feedbackFormCard = document.getElementById('feedbackFormCard');
    const loginPrompt = document.getElementById('loginPrompt');
    if (feedbackFormCard) feedbackFormCard.style.display = 'block';
    if (loginPrompt) loginPrompt.style.display = 'none';
  }

  function updateAuthLink() {
    const authLink = document.getElementById('authLink');
    if (authLink && currentUser) {
      authLink.textContent = currentUser.email ? `Conectado: ${currentUser.email}` : 'Avaliando como visitante';
      authLink.href = 'index.html';
    }
  }

  async function logout() {
    if (window.ReloAuth) {
      try { await window.ReloAuth.sair(); }
      catch (error) { console.warn('Falha ao encerrar a sessão:', error); }
    }
    localStorage.removeItem('user_id');
    localStorage.removeItem('user_email');
    window.location.href = 'index.html';
  }

  function initRatingSystem() {
    const bind = (groupId, inputId) => {
      const group = document.getElementById(groupId);
      const input = document.getElementById(inputId);
      if (!group) return;
      group.querySelectorAll('.rating-star').forEach(star => {
        star.addEventListener('click', (e) => {
          e.preventDefault();
          const rating = star.dataset.rating;
          if (input) input.value = rating;
          updateRatingDisplay(group, rating);
        });
      });
    };
    bind('ratingBarberGroup', 'ratingBarber');
    bind('ratingServiceGroup', 'ratingService');
  }

  function updateRatingDisplay(group, rating) {
    group.querySelectorAll('.rating-star').forEach(star => {
      star.classList.toggle('active', parseInt(star.dataset.rating) <= parseInt(rating));
    });
  }

  function initFeedbackForm() {
    const form = document.getElementById('feedbackForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const barberName = document.getElementById('barberName').value.trim();
      const ratingBarber = parseInt(document.getElementById('ratingBarber').value, 10) || 5;
      const ratingService = parseInt(document.getElementById('ratingService').value, 10) || 5;
      const comment = document.getElementById('comment').value.trim();
      const submitBtn = document.getElementById('submitBtn');
      const errorMsg = document.getElementById('errorMessage');
      const successMsg = document.getElementById('successMessage');

      if (errorMsg) errorMsg.classList.remove('show');
      if (successMsg) successMsg.classList.remove('show');

      if (!barberName) {
        showError('Por favor, informe o nome do profissional ou serviço avaliado.', errorMsg);
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Enviando...';
      }

      const payload = {
        user_id: currentUser?.id || 'guest',
        barber_name: barberName,
        rating_barber: ratingBarber,
        rating_service: ratingService,
        comment: comment || null,
        created_at: new Date().toISOString(),
      };

      try {
        const supabase = await getSupabaseClient();
        const { data, error } = await supabase.from('feedbacks').insert([payload]).select();

        if (error) throw new Error(error.message || 'o servidor recusou a avaliação');

        // Só chegou aqui porque salvou de verdade.
        const saved = Array.isArray(data) && data.length ? data : [payload];
        realFeedbacks = [...saved, ...realFeedbacks];
        dbAvailable = true;

        showSuccess('Feedback enviado com sucesso! Obrigado pela sua avaliação.', successMsg);
        form.reset();
        if (document.getElementById('ratingBarber')) document.getElementById('ratingBarber').value = '5';
        if (document.getElementById('ratingService')) document.getElementById('ratingService').value = '5';
        document.querySelectorAll('.rating-star').forEach(s => s.classList.add('active'));

        renderFeedbacks();
      } catch (error) {
        // Antes isto era engolido e a tela dizia "enviado com sucesso".
        dbAvailable = false;
        console.error('Erro ao enviar feedback:', error);
        showError(
          `Não foi possível salvar sua avaliação (${error.message}). Nada foi enviado — tente novamente.`,
          errorMsg
        );
        renderFeedbacks();
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Enviar Feedback';
        }
      }
    });
  }

  async function loadFeedbacks() {
    try {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase
        .from('feedbacks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw new Error(error.message || 'falha ao consultar avaliações');

      realFeedbacks = data ?? [];
      dbAvailable = true;
    } catch (error) {
      dbAvailable = false;
      console.warn('Avaliações do banco indisponíveis:', error.message);
    }
    renderFeedbacks();
  }

  function feedbackCard(feedback) {
    return `
    <div class="feedback-item" style="margin-bottom: 20px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 20px;">
      <div class="feedback-header-item" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <div class="feedback-barber" style="font-weight: 700; color: var(--gold-2); font-size: 1.05rem;">${escapeHtml(feedback.barber_name)}</div>
        <div class="feedback-date" style="font-size: 0.85rem; color: var(--muted-2);">${formatDate(feedback.created_at)}</div>
      </div>
      <div class="feedback-ratings" style="display: flex; gap: 20px; margin-bottom: 12px; font-size: 0.9rem;">
        <div class="rating-item" style="display: flex; gap: 6px;">
          <span class="rating-label" style="color: var(--muted);">Profissional:</span>
          <span class="rating-value" style="color: var(--gold); font-weight: 600;">${escapeHtml(String(feedback.rating_barber || 5))}/5 ★</span>
        </div>
        <div class="rating-item" style="display: flex; gap: 6px;">
          <span class="rating-label" style="color: var(--muted);">Atendimento:</span>
          <span class="rating-value" style="color: var(--gold); font-weight: 600;">${escapeHtml(String(feedback.rating_service || 5))}/5 ★</span>
        </div>
      </div>
      ${feedback.comment ? `<div class="feedback-comment" style="color: var(--text); font-size: 0.95rem; line-height: 1.6;">"${escapeHtml(feedback.comment)}"</div>` : ''}
    </div>`;
  }

  function notice(text, tone) {
    const color = tone === 'error' ? 'var(--danger, #e5484d)' : 'var(--muted)';
    return `<p style="color: ${color}; border: 1px solid var(--line); border-radius: 10px; padding: 12px 16px; margin: 0 0 20px;">${escapeHtml(text)}</p>`;
  }

  function renderFeedbacks() {
    const list = document.getElementById('feedbacksList');
    if (!list) return;

    let html = '';

    if (dbAvailable === false) {
      html += notice('Não foi possível carregar as avaliações salvas no servidor. Os textos abaixo são exemplos ilustrativos.', 'error');
      html += DEMO_FEEDBACKS.map(feedbackCard).join('');
      list.innerHTML = html;
      return;
    }

    if (dbAvailable === true && realFeedbacks.length === 0) {
      html += notice('Ainda não há avaliações registradas. Seja o primeiro a avaliar!');
      list.innerHTML = html;
      return;
    }

    list.innerHTML = realFeedbacks.map(feedbackCard).join('');
  }

  function showError(message, element) {
    if (!element) return;
    element.textContent = message;
    element.classList.add('show');
  }

  function showSuccess(message, element) {
    if (!element) return;
    element.textContent = message;
    element.classList.add('show');
  }

  function formatDate(dateString) {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Recentemente';
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      return 'Hoje às ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('pt-BR');
  }

  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  window.getSupabaseClient = getSupabaseClient;
  window.loadFeedbacks = loadFeedbacks;
  window.initFeedbackForm = initFeedbackForm;
  window.initRatingSystem = initRatingSystem;
  window.showLoginPrompt = showLoginPrompt;
  window.abrirLoginFeedback = abrirLoginFeedback;   // chamado por onclick no loginPrompt
  window.logout = logout;
  window.updateAuthLink = updateAuthLink;

  document.addEventListener('DOMContentLoaded', () => {
    initRatingSystem();
    initFeedbackForm();
    checkUserAuth();
    loadFeedbacks();

    // estrelas ativas por padrão no formulário
    document.querySelectorAll('.rating-star').forEach(s => s.classList.add('active'));
  });
})();
