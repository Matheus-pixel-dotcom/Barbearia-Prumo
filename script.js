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

  // face-recognition.js chama initMobileMenu() sem defini-la — precisa ser global.
  window.initMobileMenu = initMobileMenu;
  window.buildWhatsappUrl = buildWhatsappUrl;
  window.initContactForm = initContactForm;
  window.initTryOn = initTryOn;

  document.addEventListener('DOMContentLoaded', () => {
    initMobileMenu();
    initContactForm();
    initTryOn();
  });
})();
