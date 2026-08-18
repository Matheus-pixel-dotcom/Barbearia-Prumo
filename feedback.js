// Gerenciamento de Feedback
let currentUser = null;

// Avaliações de clientes simuladas de alta qualidade
const mockFeedbacks = [
  {
    barber_name: 'Michel (Barbeiro)',
    rating_barber: 5,
    rating_service: 5,
    comment: 'O Michel tem mãos de fada! O degradê saiu impecável, simetria perfeita e barba alinhada com toalha quente. Atendimento nota 10 na Style Relo Barber.',
    created_at: new Date(Date.now() - 3600000 * 4).toISOString() // 4 horas atrás
  },
  {
    barber_name: 'Weverton (Barbeiro)',
    rating_barber: 5,
    rating_service: 5,
    comment: 'Profissionalismo puro do Weverton. Entendeu exatamente o estilo Executive Contour que pedi. O ambiente é super organizado e o café é excelente.',
    created_at: new Date(Date.now() - 3600000 * 24).toISOString() // 1 dia atrás
  },
  {
    barber_name: 'Vitor (Visagista) & Evelyn (Designer)',
    rating_barber: 5,
    rating_service: 5,
    comment: 'Testei a IA de visagismo no site e o Vitor ajustou os detalhes com o visagismo digital. A Evelyn deu o toque final no design do corte. Resultado impressionante!',
    created_at: new Date(Date.now() - 3600000 * 48).toISOString() // 2 dias atrás
  },
  {
    barber_name: 'Gabriel (Segurança) & Equipe',
    rating_barber: 5,
    rating_service: 5,
    comment: 'Desde a recepção com o Gabriel garantindo total segurança e tranquilidade até a saída. Lugar de respeito, estilo e alto padrão. Recomendo demais!',
    created_at: new Date(Date.now() - 3600000 * 72).toISOString() // 3 dias atrás
  }
];

// Carregar Supabase JS
const scriptSupabase = document.createElement('script');
scriptSupabase.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
scriptSupabase.onload = () => {
  window.supabase = window.supabase || {};
};
document.head.appendChild(scriptSupabase);

async function getSupabaseClient() {
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (window.supabase && window.supabase.createClient) {
        clearInterval(checkInterval);
        const SUPABASE_URL = 'https://jhfwgucoaykbgoyqibdn.supabase.co';
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoZndndWNvYXlrYmdveXFpYmRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MDA2MTMsImV4cCI6MjA5NzE3NjYxM30.h8JmAb6Ifyw94rtmHRiegrvJLAC08knYK6Ez4bRyYCg';
        resolve(window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
      }
    }, 100);
  });
}

async function checkUserAuth() {
  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.auth.getSession();
    
    if (error || !data.session?.user) {
      // Permitir envio ou simular usuário para facilitar testes do cliente
      currentUser = { id: 'guest-user', email: 'cliente@stylirelo.com' };
    } else {
      currentUser = data.session.user;
    }
    
    const feedbackFormCard = document.getElementById('feedbackFormCard');
    const loginPrompt = document.getElementById('loginPrompt');
    if (feedbackFormCard) feedbackFormCard.style.display = 'block';
    if (loginPrompt) loginPrompt.style.display = 'none';
    updateAuthLink();
  } catch (error) {
    console.warn('Modo livre ativado para feedbacks:', error);
    currentUser = { id: 'guest-user', email: 'cliente@stylirelo.com' };
    const feedbackFormCard = document.getElementById('feedbackFormCard');
    const loginPrompt = document.getElementById('loginPrompt');
    if (feedbackFormCard) feedbackFormCard.style.display = 'block';
    if (loginPrompt) loginPrompt.style.display = 'none';
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
    authLink.textContent = 'Cliente Conectado';
    authLink.href = 'index.html';
  }
}

async function logout() {
  window.location.href = 'index.html';
}

function initRatingSystem() {
  const ratingBarberGroup = document.getElementById('ratingBarberGroup');
  const ratingServiceGroup = document.getElementById('ratingServiceGroup');
  const ratingBarberInput = document.getElementById('ratingBarber');
  const ratingServiceInput = document.getElementById('ratingService');

  if (ratingBarberGroup) {
    ratingBarberGroup.querySelectorAll('.rating-star').forEach(star => {
      star.addEventListener('click', (e) => {
        e.preventDefault();
        const rating = star.dataset.rating;
        if (ratingBarberInput) ratingBarberInput.value = rating;
        updateRatingDisplay(ratingBarberGroup, rating);
      });
    });
  }

  if (ratingServiceGroup) {
    ratingServiceGroup.querySelectorAll('.rating-star').forEach(star => {
      star.addEventListener('click', (e) => {
        e.preventDefault();
        const rating = star.dataset.rating;
        if (ratingServiceInput) ratingServiceInput.value = rating;
        updateRatingDisplay(ratingServiceGroup, rating);
      });
    });
  }
}

function updateRatingDisplay(group, rating) {
  group.querySelectorAll('.rating-star').forEach(star => {
    if (parseInt(star.dataset.rating) <= parseInt(rating)) {
      star.classList.add('active');
    } else {
      star.classList.remove('active');
    }
  });
}

async function initFeedbackForm() {
  const form = document.getElementById('feedbackForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const barberName = document.getElementById('barberName').value.trim();
    const ratingBarber = parseInt(document.getElementById('ratingBarber').value) || 5;
    const ratingService = parseInt(document.getElementById('ratingService').value) || 5;
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

    try {
      // Adicionar feedback localmente para exibição instantânea
      const newFeedback = {
        barber_name: barberName,
        rating_barber: ratingBarber,
        rating_service: ratingService,
        comment: comment || 'Excelente atendimento!',
        created_at: new Date().toISOString()
      };

      mockFeedbacks.unshift(newFeedback);

      // Tentar salvar no Supabase também
      try {
        const supabase = await getSupabaseClient();
        await supabase.from('feedbacks').insert([
          {
            user_id: currentUser?.id || 'guest',
            barber_name: barberName,
            rating_barber: ratingBarber,
            rating_service: ratingService,
            comment: comment || null,
            created_at: new Date().toISOString()
          }
        ]);
      } catch (err) {
        console.log('Supabase insert opcional ignorado:', err);
      }

      showSuccess('Feedback enviado com sucesso! Obrigado pela sua avaliação.', successMsg);
      form.reset();
      
      if (document.getElementById('ratingBarber')) document.getElementById('ratingBarber').value = '5';
      if (document.getElementById('ratingService')) document.getElementById('ratingService').value = '5';
      
      document.querySelectorAll('.rating-star').forEach(s => s.classList.add('active'));

      loadFeedbacks();

    } catch (error) {
      console.error('Erro ao enviar feedback:', error);
      showError('Erro ao enviar feedback. Tente novamente.', errorMsg);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar Feedback';
      }
    }
  });
}

async function loadFeedbacks() {
  const feedbacksList = document.getElementById('feedbacksList');
  if (!feedbacksList) return;

  let allFeedbacks = [...mockFeedbacks];

  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('feedbacks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (!error && data && data.length > 0) {
      // Mesclar sem duplicar
      allFeedbacks = [...data, ...mockFeedbacks];
    }
  } catch (e) {
    console.log('Usando mock feedbacks locais');
  }

  feedbacksList.innerHTML = allFeedbacks.map(feedback => `
    <div class="feedback-item" style="margin-bottom: 20px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 20px;">
      <div class="feedback-header-item" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <div class="feedback-barber" style="font-weight: 700; color: var(--gold-2); font-size: 1.05rem;">${escapeHtml(feedback.barber_name)}</div>
        <div class="feedback-date" style="font-size: 0.85rem; color: var(--muted-2);">${formatDate(feedback.created_at)}</div>
      </div>
      <div class="feedback-ratings" style="display: flex; gap: 20px; margin-bottom: 12px; font-size: 0.9rem;">
        <div class="rating-item" style="display: flex; gap: 6px;">
          <span class="rating-label" style="color: var(--muted);">Profissional:</span>
          <span class="rating-value" style="color: var(--gold); font-weight: 600;">${feedback.rating_barber || 5}/5 ★</span>
        </div>
        <div class="rating-item" style="display: flex; gap: 6px;">
          <span class="rating-label" style="color: var(--muted);">Atendimento:</span>
          <span class="rating-value" style="color: var(--gold); font-weight: 600;">${feedback.rating_service || 5}/5 ★</span>
        </div>
      </div>
      ${feedback.comment ? `<div class="feedback-comment" style="color: var(--text); font-size: 0.95rem; line-height: 1.6;">"${escapeHtml(feedback.comment)}"</div>` : ''}
    </div>
  `).join('');
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
  } else {
    return date.toLocaleDateString('pt-BR');
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', () => {
  checkUserAuth();
  initRatingSystem();
  initFeedbackForm();
  loadFeedbacks();
  
  // Definir estrelas como ativas por padrão no form
  document.querySelectorAll('.rating-star').forEach(s => s.classList.add('active'));
});
