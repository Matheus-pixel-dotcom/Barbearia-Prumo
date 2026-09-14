// Autenticação Supabase (login e cadastro) — Barbearia Prumo.
//
// Roda em IIFE: antes, o `const SUPABASE_URL` daqui colidia com o de script.js e
// supabase-client.js no escopo global, o que abortava este arquivo inteiro em
// SyntaxError — o formulário de login nunca recebia o listener de submit.
(function () {
  'use strict';

  const SUPABASE_URL = 'https://jhfwgucoaykbgoyqibdn.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoZndndWNvYXlrYmdveXFpYmRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MDA2MTMsImV4cCI6MjA5NzE3NjYxM30.h8JmAb6Ifyw94rtmHRiegrvJLAC08knYK6Ez4bRyYCg';
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  const SDK_TIMEOUT_MS = 10000;

  /**
   * Carrega o supabase-js uma única vez (marcado com data-supabase-sdk, então
   * feedback.js reusa o mesmo <script>).
   * REJEITA se a CDN falhar ou estourar o timeout — antes era um setInterval eterno
   * que nunca resolvia, deixando o botão preso em "Entrando..." para sempre.
   */
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
        reject(new Error(`O Supabase JS não carregou em ${SDK_TIMEOUT_MS / 1000}s. Verifique sua conexão.`));
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
      // não deixar um cliente rejeitado em cache para sempre
      clientPromise.catch(() => { clientPromise = null; });
    }
    return clientPromise;
  }

  function initLoginForm() {
    const form = document.getElementById('loginForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value.trim();
      const submitBtn = document.getElementById('submitBtn');
      const errorMsg = document.getElementById('errorMessage');
      const successMsg = document.getElementById('successMessage');

      errorMsg.classList.remove('show');
      successMsg.classList.remove('show');

      if (!email || !password) {
        showError('Por favor, preencha todos os campos.', errorMsg);
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Entrando...';

      try {
        const supabase = await getSupabaseClient();

        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data?.user) throw new Error('Login aceito, mas nenhuma sessão foi retornada.');

        showSuccess('Login realizado com sucesso! Redirecionando...', successMsg);
        localStorage.setItem('user_id', data.user.id);
        localStorage.setItem('user_email', data.user.email || '');
        if (window.supabaseClient?.setAuthToken && data.session?.access_token) {
          window.supabaseClient.setAuthToken(data.session.access_token);
        }

        setTimeout(() => { window.location.href = 'dashboard.html'; }, 1500);
      } catch (error) {
        console.error('Erro ao fazer login:', error);
        showError(error.message || 'Erro ao fazer login. Verifique suas credenciais.', errorMsg);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Entrar';
      }
    });
  }

  function initSignupForm() {
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

      errorMsg.classList.remove('show');
      successMsg.classList.remove('show');

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

      submitBtn.disabled = true;
      submitBtn.textContent = 'Criando conta...';

      try {
        const supabase = await getSupabaseClient();

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;

        // O perfil só pode ser gravado se houver sessão; com confirmação de e-mail
        // ativada o signUp não devolve sessão, e isso precisa ser dito ao usuário.
        if (data?.user && data.session) {
          const { error: profileError } = await supabase
            .from('profiles')
            .insert([{
              id: data.user.id,
              full_name: fullName,
              avatar_url: null,
              updated_at: new Date().toISOString(),
            }]);

          if (profileError && profileError.code !== 'PGRST116') {
            throw new Error(`Conta criada, mas o perfil não foi salvo: ${profileError.message}`);
          }
          showSuccess('Conta criada com sucesso! Redirecionando para login...', successMsg);
        } else {
          showSuccess('Conta criada! Confira seu e-mail para confirmar o cadastro antes de entrar.', successMsg);
        }

        setTimeout(() => { window.location.href = 'login.html'; }, 2500);
      } catch (error) {
        console.error('Erro ao criar conta:', error);
        showError(error.message || 'Erro ao criar conta. Tente novamente.', errorMsg);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Criar conta';
      }
    });
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

  async function checkAuth() {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session?.user || null;
  }

  async function logout() {
    try {
      const supabase = await getSupabaseClient();
      await supabase.auth.signOut();
    } catch (error) {
      // Falha de rede no signOut não deve prender o usuário na página.
      console.warn('signOut remoto falhou; limpando sessão local:', error);
    } finally {
      localStorage.removeItem('user_id');
      localStorage.removeItem('user_email');
      window.location.href = 'index.html';
    }
  }

  window.getSupabaseClient = getSupabaseClient;
  window.initLoginForm = initLoginForm;
  window.initSignupForm = initSignupForm;
  window.checkAuth = checkAuth;
  window.logout = logout;

  document.addEventListener('DOMContentLoaded', () => {
    initLoginForm();
    initSignupForm();
  });
})();
