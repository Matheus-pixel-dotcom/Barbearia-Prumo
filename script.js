// Comportamento compartilhado das páginas (menu mobile, formulário de contato, upload
// do simulador). Roda em IIFE para não colidir com os outros <script> clássicos.
(function () {
  'use strict';

  const WHATSAPP_NUMBER = '5541996484980';
  const WHATSAPP_BASE = `https://wa.me/${WHATSAPP_NUMBER}`;

  function buildWhatsappUrl(message) {
    return `${WHATSAPP_BASE}?text=${encodeURIComponent(message)}`;
  }

  function initMobileMenu() {
    const toggle = document.querySelector('[data-nav-toggle]');
    const links = document.querySelector('[data-nav-links]');
    if (!toggle || !links) return;

    toggle.addEventListener('click', () => {
      const isOpen = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    });

    links.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        links.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  function initContactForm() {
    const form = document.querySelector('[data-contact-form]');
    if (!form) return;

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const nome = data.get('nome')?.toString().trim();
      const telefone = data.get('telefone')?.toString().trim();
      const servico = data.get('servico')?.toString().trim();
      const barbeiro = data.get('barbeiro')?.toString().trim();
      const mensagem = data.get('mensagem')?.toString().trim();

      const texto = [
        'Olá! Gostaria de agendar um horário no Style Relo Barber.',
        nome ? `Nome: ${nome}` : '',
        telefone ? `Telefone: ${telefone}` : '',
        servico ? `Serviço: ${servico}` : '',
        barbeiro ? `Barbeiro: ${barbeiro}` : '',
        mensagem ? `Observação: ${mensagem}` : ''
      ].filter(Boolean).join('\n');

      window.open(buildWhatsappUrl(texto), '_blank', 'noopener,noreferrer');
    });
  }

  function initTryOn() {
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('file-input');
    const userPhoto = document.getElementById('user-photo');
    const instructionText = document.getElementById('instruction-text');
    const resetBtn = document.getElementById('reset-btn');
    const cameraBtn = document.getElementById('camera-btn');

    if (!dropArea || !fileInput || !userPhoto) return;

    // Mostrar área de instrução inicialmente
    instructionText?.classList.remove('hidden');

    const showPhoto = (src) => {
      userPhoto.src = src;
      userPhoto.classList.remove('hidden');
      instructionText?.classList.add('hidden');
      resetBtn?.classList.remove('hidden');
      cameraBtn?.style.setProperty('display', 'none');

      // A câmera é de outro arquivo (ia-camera.js / face-recognition.js), que a expõe
      // em window. Olhar window explicitamente em vez de um global implícito.
      if (typeof window.stopCamera === 'function') window.stopCamera();

      // Foto enviada por arquivo também gera a simulação no chat.
      window.startImageSimulation?.(src);
    };

    dropArea.addEventListener('click', (e) => {
      // Não disparar se clicar nos controles da câmera
      if (e.target.closest('.camera-controls-inline') || e.target.closest('#video')) return;
      fileInput.click();
    });

    dropArea.addEventListener('dragover', (event) => {
      event.preventDefault();
      dropArea.style.borderColor = 'var(--gold)';
    });

    dropArea.addEventListener('dragleave', () => {
      dropArea.style.borderColor = '';
    });

    dropArea.addEventListener('drop', (event) => {
      event.preventDefault();
      dropArea.style.borderColor = '';
      const file = event.dataTransfer.files?.[0];
      if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (readerEvent) => showPhoto(readerEvent.target.result);
        reader.readAsDataURL(file);
      }
    });

    fileInput.addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (readerEvent) => showPhoto(readerEvent.target.result);
      reader.readAsDataURL(file);
    });
  }

  // Aparece suavemente conforme o usuário rola a página (usado em [data-reveal])
  function initScrollReveal() {
    const alvos = document.querySelectorAll('[data-reveal]');
    if (!alvos.length) return;

    // Sem suporte (ou usuário pediu menos animação): mostra tudo direto
    const prefereMenosMovimento = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!('IntersectionObserver' in window) || prefereMenosMovimento) {
      alvos.forEach((el) => el.classList.add('revelado'));
      return;
    }

    // Escalona os itens que estão lado a lado (cards de uma mesma grade)
    alvos.forEach((el) => {
      const irmaos = Array.from(el.parentElement.querySelectorAll('[data-reveal]'));
      const posicao = irmaos.indexOf(el);
      if (posicao > 0) el.style.transitionDelay = Math.min(posicao, 5) * 90 + 'ms';
    });

    const observador = new IntersectionObserver((entradas) => {
      entradas.forEach((entrada) => {
        if (!entrada.isIntersecting) return;
        entrada.target.classList.add('revelado');
        observador.unobserve(entrada.target);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    alvos.forEach((el) => observador.observe(el));
  }

  // Números que sobem no carregamento (data-counter / data-decimals)
  function initCounters() {
    const alvos = document.querySelectorAll('[data-counter]');
    if (!alvos.length) return;

    const casas = (el) => parseInt(el.dataset.decimals || '0', 10);
    const destino = (el) => parseFloat(el.dataset.counter);

    const animar = (el) => {
      const fim = destino(el);
      const decimais = casas(el);
      const duracao = 900;
      const inicio = performance.now();

      const passo = (agora) => {
        const progresso = Math.min(1, (agora - inicio) / duracao);
        const suavizado = 1 - Math.pow(1 - progresso, 3);
        el.textContent = (fim * suavizado).toFixed(decimais);
        if (progresso < 1) requestAnimationFrame(passo);
        else el.textContent = fim.toFixed(decimais);
      };
      requestAnimationFrame(passo);
    };

    const prefereMenosMovimento = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!('IntersectionObserver' in window) || prefereMenosMovimento) {
      alvos.forEach((el) => { el.textContent = destino(el).toFixed(casas(el)); });
      return;
    }

    const observador = new IntersectionObserver((entradas) => {
      entradas.forEach((entrada) => {
        if (!entrada.isIntersecting) return;
        animar(entrada.target);
        observador.unobserve(entrada.target);
      });
    }, { threshold: 0.4 });

    alvos.forEach((el) => observador.observe(el));
  }

  // initMobileMenu e usado pelo face-recognition.js; startImageSimulation e chamado
  // pelo script.js de outras paginas. O restante fica exposto para depuracao.
  window.initMobileMenu = initMobileMenu;
  window.buildWhatsappUrl = buildWhatsappUrl;
  window.initContactForm = initContactForm;
  window.initTryOn = initTryOn;
  window.initScrollReveal = initScrollReveal;
  window.initCounters = initCounters;

  document.addEventListener('DOMContentLoaded', () => {
    initMobileMenu();
    initContactForm();
    initTryOn();
    initScrollReveal();
    initCounters();
  });
})();
