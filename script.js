const WHATSAPP_NUMBER = '5541996484980';
const WHATSAPP_BASE = `https://wa.me/${WHATSAPP_NUMBER}`;

// Supabase integration
const SUPABASE_URL = 'https://jhfwgucoaykbgoyqibdn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WCFJ3pqXM30no8I7rxsmFg_eXMQBdH0';

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
      'Olá! Gostaria de agendar um horário no Estúdio Prumo.',
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
  const overlay = document.getElementById('ia-overlay');
  const styleSelection = document.getElementById('style-selection');
  const finalCard = document.getElementById('final-card');
  const resultName = document.getElementById('res-nome');
  const resultType = document.getElementById('res-tipo');
  const resultCta = document.getElementById('result-cta');

  if (!dropArea || !fileInput || !userPhoto) return;

  const showPhoto = (src) => {
    userPhoto.src = src;
    userPhoto.classList.remove('hidden');
    instructionText?.classList.add('hidden');
    resetBtn?.classList.remove('hidden');
  };

  dropArea.addEventListener('click', () => fileInput.click());

  dropArea.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropArea.style.borderColor = 'rgba(245, 158, 11, 0.8)';
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

  resetBtn?.addEventListener('click', () => {
    userPhoto.classList.add('hidden');
    userPhoto.removeAttribute('src');
    instructionText?.classList.remove('hidden');
    resetBtn.classList.add('hidden');
    finalCard?.classList.add('hidden');
    styleSelection?.classList.remove('hidden');
    fileInput.value = '';
  });

  document.querySelectorAll('[data-style-name]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!userPhoto.src || userPhoto.classList.contains('hidden')) {
        alert('Por favor, suba sua foto primeiro para simular.');
        return;
      }

      const styleName = button.getAttribute('data-style-name') || 'Corte personalizado';
      const styleType = button.getAttribute('data-style-type') || 'Visagismo Prumo';

      overlay?.classList.remove('hidden');
      setTimeout(() => {
        overlay?.classList.add('hidden');
        styleSelection?.classList.add('hidden');
        finalCard?.classList.remove('hidden');
        if (resultName) resultName.textContent = styleName;
        if (resultType) resultType.textContent = styleType;
        if (resultCta) {
          resultCta.href = buildWhatsappUrl(`Olá! Usei o simulador de visagismo do Estúdio Prumo e quero agendar o corte ${styleName}.`);
        }
        finalCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Salvar simulação no Supabase
        if (typeof supabaseClient !== 'undefined') {
          supabaseClient.saveFaceSimulation(styleName, styleType, {
            source: 'photo-upload',
            timestamp: new Date().toISOString()
          }).catch(err => console.error('Erro ao salvar simulação:', err));
        }
      }, 1400);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initMobileMenu();
  initContactForm();
  initTryOn();
  
  // Carregar cliente Supabase se disponível
  const script = document.createElement('script');
  script.src = 'supabase-client.js';
  document.head.appendChild(script);
});
