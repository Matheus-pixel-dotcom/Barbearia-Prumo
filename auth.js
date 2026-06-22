// Autenticação Supabase com Supabase JS
const SUPABASE_URL = 'https://jhfwgucoaykbgoyqibdn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoZndndWNvYXlrYmdveXFpYmRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MDA2MTMsImV4cCI6MjA5NzE3NjYxM30.h8JmAb6Ifyw94rtmHRiegrvJLAC08knYK6Ez4bRyYCg';

// Carregar Supabase JS
const script = document.createElement('script');
script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
script.onload = () => {
  window.supabase = window.supabase || {};
};
document.head.appendChild(script);

// Aguardar o carregamento do Supabase
async function getSupabaseClient() {
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (window.supabase && window.supabase.createClient) {
        clearInterval(checkInterval);
        resolve(window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
      }
    }, 100);
  });
}

// Gerenciar formulário de login
async function initLoginForm() {
  const form = document.getElementById('loginForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    const submitBtn = document.getElementById('submitBtn');
    const errorMsg = document.getElementById('errorMessage');
    const successMsg = document.getElementById('successMessage');

    // Limpar mensagens
    errorMsg.classList.remove('show');
    successMsg.classList.remove('show');

    // Validar campos
    if (!email || !password) {
      showError('Por favor, preencha todos os campos.', errorMsg);
      return;
    }

    // Desabilitar botão
    submitBtn.disabled = true;
    submitBtn.textContent = 'Entrando...';

    try {
      const supabase = await getSupabaseClient();
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
      });

      if (error) {
        throw error;
      }

      // Login bem-sucedido
      showSuccess('Login realizado com sucesso! Redirecionando...', successMsg);
      localStorage.setItem('user_id', data.user.id);
      localStorage.setItem('user_email', data.user.email);
      
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 1500);

    } catch (error) {
      console.error('Erro ao fazer login:', error);
      showError(error.message || 'Erro ao fazer login. Verifique suas credenciais.', errorMsg);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Entrar';
    }
  });
}

// Gerenciar formulário de cadastro
async function initSignupForm() {
  const form = document.getElementById('signupForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const fullName = document.getElementById('fullName').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    const confirmPassword = document.getElementById('confirmPassword').value.trim();
    const submitBtn = document.getElementById('submitBtn');
    const errorMsg = document.getElementById('errorMessage');
    const successMsg = document.getElementById('successMessage');

    // Limpar mensagens
    errorMsg.classList.remove('show');
    successMsg.classList.remove('show');

    // Validar campos
    if (!fullName || !email || !password || !confirmPassword) {
      showError('Por favor, preencha todos os campos.', errorMsg);
      return;
    }

    if (password !== confirmPassword) {
      showError('As senhas não coincidem.', errorMsg);
      return;
    }

    if (password.length < 6) {
      showError('A senha deve ter no mínimo 6 caracteres.', errorMsg);
      return;
    }

    // Desabilitar botão
    submitBtn.disabled = true;
    submitBtn.textContent = 'Criando conta...';

    try {
      const supabase = await getSupabaseClient();
      
      // Criar usuário
      const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            full_name: fullName
          }
        }
      });

      if (error) {
        throw error;
      }

      // Criar perfil do usuário
      const { error: profileError } = await supabase
        .from('profiles')
        .insert([
          {
            id: data.user.id,
            full_name: fullName,
            avatar_url: null,
            updated_at: new Date().toISOString()
          }
        ]);

      if (profileError && profileError.code !== 'PGRST116') {
        console.error('Erro ao criar perfil:', profileError);
      }

      // Cadastro bem-sucedido
      showSuccess('Conta criada com sucesso! Redirecionando para login...', successMsg);
      
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 1500);

    } catch (error) {
      console.error('Erro ao criar conta:', error);
      showError(error.message || 'Erro ao criar conta. Tente novamente.', errorMsg);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Criar conta';
    }
  });
}

// Função auxiliar para mostrar erro
function showError(message, element) {
  element.textContent = message;
  element.classList.add('show');
}

// Função auxiliar para mostrar sucesso
function showSuccess(message, element) {
  element.textContent = message;
  element.classList.add('show');
}

// Verificar se o usuário está autenticado
async function checkAuth() {
  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('Erro ao verificar autenticação:', error);
      return null;
    }

    return data.session?.user || null;
  } catch (error) {
    console.error('Erro ao verificar autenticação:', error);
    return null;
  }
}

// Fazer logout
async function logout() {
  try {
    const supabase = await getSupabaseClient();
    await supabase.auth.signOut();
    localStorage.removeItem('user_id');
    localStorage.removeItem('user_email');
    window.location.href = 'index.html';
  } catch (error) {
    console.error('Erro ao fazer logout:', error);
  }
}

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
  initLoginForm();
  initSignupForm();
});
