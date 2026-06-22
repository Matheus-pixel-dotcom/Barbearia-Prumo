// Gerenciamento de Feedback
let currentUser = null;

// Carregar Supabase JS
const scriptSupabase = document.createElement('script');
scriptSupabase.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
scriptSupabase.onload = () => {
  window.supabase = window.supabase || {};
};
document.head.appendChild(scriptSupabase);

// Obter cliente Supabase
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

// Verificar autenticação ao carregar
async function checkUserAuth() {
  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('Erro ao verificar autenticação:', error);
      showLoginPrompt();
      return;
    }

    if (data.session?.user) {
      currentUser = data.session.user;
      document.getElementById('feedbackFormCard').style.display = 'block';
      document.getElementById('loginPrompt').style.display = 'none';
      updateAuthLink();
    } else {
      showLoginPrompt();
    }
  } catch (error) {
    console.error('Erro ao verificar autenticação:', error);
    showLoginPrompt();
  }
}

// Mostrar prompt de login
function showLoginPrompt() {
  document.getElementById('feedbackFormCard').style.display = 'none';
  document.getElementById('loginPrompt').style.display = 'block';
}

// Atualizar link de autenticação
function updateAuthLink() {
  const authLink = document.getElementById('authLink');
  if (currentUser) {
    authLink.textContent = 'Logout';
    authLink.href = '#';
    authLink.onclick = (e) => {
      e.preventDefault();
      logout();
    };
  }
}

// Fazer logout
async function logout() {
  try {
    const supabase = await getSupabaseClient();
    await supabase.auth.signOut();
    currentUser = null;
    localStorage.removeItem('user_id');
    localStorage.removeItem('user_email');
    window.location.href = 'index.html';
  } catch (error) {
    console.error('Erro ao fazer logout:', error);
  }
}

// Inicializar sistema de rating
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
        ratingBarberInput.value = rating;
        updateRatingDisplay(ratingBarberGroup, rating);
      });
    });
  }

  if (ratingServiceGroup) {
    ratingServiceGroup.querySelectorAll('.rating-star').forEach(star => {
      star.addEventListener('click', (e) => {
        e.preventDefault();
        const rating = star.dataset.rating;
        ratingServiceInput.value = rating;
        updateRatingDisplay(ratingServiceGroup, rating);
      });
    });
  }
}

// Atualizar display de rating
function updateRatingDisplay(group, rating) {
  group.querySelectorAll('.rating-star').forEach(star => {
    if (parseInt(star.dataset.rating) <= parseInt(rating)) {
      star.classList.add('active');
    } else {
      star.classList.remove('active');
    }
  });
}

// Gerenciar formulário de feedback
async function initFeedbackForm() {
  const form = document.getElementById('feedbackForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!currentUser) {
      showError('Você precisa estar autenticado para enviar feedback.', document.getElementById('errorMessage'));
      return;
    }

    const barberName = document.getElementById('barberName').value.trim();
    const ratingBarber = parseInt(document.getElementById('ratingBarber').value);
    const ratingService = parseInt(document.getElementById('ratingService').value);
    const comment = document.getElementById('comment').value.trim();
    const submitBtn = document.getElementById('submitBtn');
    const errorMsg = document.getElementById('errorMessage');
    const successMsg = document.getElementById('successMessage');

    // Limpar mensagens
    errorMsg.classList.remove('show');
    successMsg.classList.remove('show');

    // Validar campos
    if (!barberName || ratingBarber === 0 || ratingService === 0) {
      showError('Por favor, preencha todos os campos obrigatórios.', errorMsg);
      return;
    }

    // Desabilitar botão
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';

    try {
      const supabase = await getSupabaseClient();
      
      const { data, error } = await supabase
        .from('feedbacks')
        .insert([
          {
            user_id: currentUser.id,
            barber_name: barberName,
            rating_barber: ratingBarber,
            rating_service: ratingService,
            comment: comment || null,
            created_at: new Date().toISOString()
          }
        ]);

      if (error) {
        throw error;
      }

      // Sucesso
      showSuccess('Feedback enviado com sucesso! Obrigado pela avaliação.', successMsg);
      form.reset();
      document.getElementById('ratingBarber').value = 0;
      document.getElementById('ratingService').value = 0;
      document.getElementById('ratingBarberGroup').querySelectorAll('.rating-star').forEach(s => s.classList.remove('active'));
      document.getElementById('ratingServiceGroup').querySelectorAll('.rating-star').forEach(s => s.classList.remove('active'));
      
      // Recarregar feedbacks
      setTimeout(() => {
        loadFeedbacks();
      }, 1000);

    } catch (error) {
      console.error('Erro ao enviar feedback:', error);
      showError(error.message || 'Erro ao enviar feedback. Tente novamente.', errorMsg);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Enviar Feedback';
    }
  });
}

// Carregar feedbacks
async function loadFeedbacks() {
  try {
    const supabase = await getSupabaseClient();
    
    const { data, error } = await supabase
      .from('feedbacks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      throw error;
    }

    const feedbacksList = document.getElementById('feedbacksList');
    
    if (!data || data.length === 0) {
      feedbacksList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <p>Nenhum feedback ainda. Seja o primeiro a compartilhar sua experiência!</p>
        </div>
      `;
      return;
    }

    feedbacksList.innerHTML = data.map(feedback => `
      <div class="feedback-item">
        <div class="feedback-header-item">
          <div class="feedback-barber">${escapeHtml(feedback.barber_name)}</div>
          <div class="feedback-date">${formatDate(feedback.created_at)}</div>
        </div>
        <div class="feedback-ratings">
          <div class="rating-item">
            <span class="rating-label">Barbeiro:</span>
            <span class="rating-value">${feedback.rating_barber}/5 ★</span>
          </div>
          <div class="rating-item">
            <span class="rating-label">Atendimento:</span>
            <span class="rating-value">${feedback.rating_service}/5 ★</span>
          </div>
        </div>
        ${feedback.comment ? `<div class="feedback-comment">"${escapeHtml(feedback.comment)}"</div>` : ''}
      </div>
    `).join('');

  } catch (error) {
    console.error('Erro ao carregar feedbacks:', error);
  }
}

// Funções auxiliares
function showError(message, element) {
  element.textContent = message;
  element.classList.add('show');
}

function showSuccess(message, element) {
  element.textContent = message;
  element.classList.add('show');
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Hoje às ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Ontem às ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } else {
    return date.toLocaleDateString('pt-BR');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
  initMobileMenu();
  checkUserAuth();
  initRatingSystem();
  initFeedbackForm();
  loadFeedbacks();
});
