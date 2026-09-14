// Painel de configuração do Nano Banana (o ⚙️ dentro do chat).
// Separa a UI do núcleo: nano-banana.js não toca no DOM, então dá para testá-lo isolado.
(function () {
  'use strict';

  const els = {};

  function api() {
    return window.NanoBanana;
  }

  function refreshStatus() {
    if (!els.text || !api()) return;
    const mode = api().mode();
    const cfg = api().getConfig();

    els.status.classList.remove('is-on', 'is-warn');

    if (mode === 'proxy') {
      els.status.classList.add('is-on');
      els.text.textContent = `IA de imagem ativa via proxy — ${cfg.model}`;
    } else if (mode === 'apiKey') {
      els.status.classList.add('is-warn');
      els.text.textContent = `IA ativa com chave no navegador (modo teste) — ${cfg.model}`;
    } else {
      els.text.textContent = 'IA de imagem desligada — configure para gerar a simulação na foto.';
    }
  }

  function openModal() {
    if (!api()) return;
    const cfg = api().getConfig();
    els.endpoint.value = cfg.endpoint || '';
    els.apikey.value = '';   // nunca reexibir uma chave salva
    els.model.value = cfg.model;
    els.modal.hidden = false;
    els.endpoint.focus();
    syncWarning();
  }

  function closeModal() {
    els.modal.hidden = true;
  }

  function syncWarning() {
    // aviso aparece só quando o usuário está prestes a salvar uma chave no navegador
    const viaKey = !els.endpoint.value.trim() && els.apikey.value.trim();
    els.warning.hidden = !viaKey;
  }

  function save() {
    if (!api()) return;
    const endpoint = els.endpoint.value.trim();
    const apiKey = els.apikey.value.trim();

    if (!endpoint && !apiKey) {
      els.warning.hidden = false;
      els.warning.textContent = 'Informe a URL do proxy ou uma chave de API.';
      return;
    }

    const patch = { endpoint, model: els.model.value };
    if (apiKey) patch.apiKey = apiKey;
    // proxy e chave direta não convivem: o proxy sempre ganha, então limpamos a outra
    if (endpoint) patch.apiKey = '';

    api().saveConfig(patch);
    closeModal();
    refreshStatus();

    // avisa o chat que agora dá para gerar
    if (window.ReloIA?.onConfigChanged) window.ReloIA.onConfigChanged();
  }

  function clear() {
    if (!api()) return;
    api().clearConfig();
    closeModal();
    refreshStatus();
    if (window.ReloIA?.onConfigChanged) window.ReloIA.onConfigChanged();
  }

  function init() {
    els.status = document.getElementById('nb-status');
    els.text = document.getElementById('nb-status-text');
    els.openBtn = document.getElementById('nb-config-btn');
    els.modal = document.getElementById('nb-modal');
    els.closeBtn = document.getElementById('nb-modal-close');
    els.endpoint = document.getElementById('nb-endpoint');
    els.apikey = document.getElementById('nb-apikey');
    els.model = document.getElementById('nb-model');
    els.warning = document.getElementById('nb-modal-warning');
    els.saveBtn = document.getElementById('nb-save');
    els.clearBtn = document.getElementById('nb-clear');

    if (!els.status || !els.modal) return;   // página sem o painel

    if (!api()) {
      els.text.textContent = 'IA de imagem indisponível (nano-banana.js não carregou).';
      return;
    }

    els.openBtn.addEventListener('click', openModal);
    els.closeBtn.addEventListener('click', closeModal);
    els.saveBtn.addEventListener('click', save);
    els.clearBtn.addEventListener('click', clear);
    els.endpoint.addEventListener('input', syncWarning);
    els.apikey.addEventListener('input', syncWarning);

    els.modal.addEventListener('click', (e) => {
      if (e.target === els.modal) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !els.modal.hidden) closeModal();
    });

    refreshStatus();
  }

  window.NanoBananaUI = { refreshStatus, openModal, closeModal };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
