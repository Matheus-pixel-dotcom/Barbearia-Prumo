// Configuração da detecção facial
const SUPABASE_URL = 'https://jhfwgucoaykbgoyqibdn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WCFJ3pqXM30no8I7rxsmFg_eXMQBdH0';

let video = null;
let canvas = null;
let stream = null;
let isAnalyzing = false;
let currentDetection = null;

// Recomendações de corte baseadas em formato de rosto
const styleRecommendations = {
  'oval': [
    {
      name: 'Executive Contour',
      description: 'Acabamento polido, social e elegante. Perfeito para rostos ovais.',
      type: 'Clássico social'
    },
    {
      name: 'Mid Fade Moderno',
      description: 'Degradê médio com textura. Realça as proporções naturais.',
      type: 'Moderno texturizado'
    }
  ],
  'round': [
    {
      name: 'Mid Fade Moderno',
      description: 'Degradê médio cria definição lateral. Ideal para rostos redondos.',
      type: 'Moderno texturizado'
    },
    {
      name: 'Buzz Cut com Degradê',
      description: 'Raspado moderno com contorno limpo. Valoriza a mandíbula.',
      type: 'Minimalista e forte'
    }
  ],
  'square': [
    {
      name: 'Buzz Cut com Degradê',
      description: 'Contorno limpo que destaca a mandíbula quadrada.',
      type: 'Minimalista e forte'
    },
    {
      name: 'Executive Contour',
      description: 'Acabamento polido que suaviza traços fortes.',
      type: 'Clássico social'
    }
  ],
  'oblong': [
    {
      name: 'Executive Contour',
      description: 'Volume lateral equilibra proporções verticais.',
      type: 'Clássico social'
    },
    {
      name: 'Mid Fade Moderno',
      description: 'Textura lateral cria largura visual.',
      type: 'Moderno texturizado'
    }
  ]
};

// Inicializar elementos do DOM
function initializeElements() {
  video = document.getElementById('video');
  canvas = document.getElementById('canvas');
  
  if (!video || !canvas) {
    console.error('Elementos de vídeo ou canvas não encontrados');
    return false;
  }
  return true;
}

// Carregar modelos de detecção facial
async function loadFaceModels() {
  try {
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model/';
    
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
      faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL)
    ]);
    
    console.log('Modelos de IA carregados com sucesso');
    return true;
  } catch (error) {
    console.error('Erro ao carregar modelos:', error);
    updateStatus('Erro ao carregar modelos de IA. Tente recarregar a página.', 'error');
    return false;
  }
}

// Iniciar câmera
async function startCamera() {
  try {
    const constraints = {
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user'
      },
      audio: false
    };

    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;

    // Aguardar o vídeo estar pronto
    video.onloadedmetadata = () => {
      video.play();
      isAnalyzing = true;
      updateUIState('running');
      updateStatus('Câmera ativa. Detectando rosto...', 'success');
      
      // Iniciar análise contínua
      detectFace();
    };

  } catch (error) {
    console.error('Erro ao acessar câmera:', error);
    
    if (error.name === 'NotAllowedError') {
      updateStatus('Permissão de câmera negada. Verifique as configurações do navegador.', 'error');
    } else if (error.name === 'NotFoundError') {
      updateStatus('Nenhuma câmera encontrada. Verifique seu dispositivo.', 'error');
    } else {
      updateStatus('Erro ao acessar a câmera. Tente novamente.', 'error');
    }
    
    updateUIState('idle');
  }
}

// Parar câmera
function stopCamera() {
  isAnalyzing = false;
  
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  
  video.srcObject = null;
  updateUIState('idle');
  updateStatus('Câmera desativada', 'idle');
  
  // Limpar canvas
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Detectar rosto em tempo real
async function detectFace() {
  if (!isAnalyzing || !video.srcObject) return;

  try {
    // Redimensionar canvas para o tamanho do vídeo
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Detectar faces
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceExpressions()
      .withAgeAndGender();

    // Desenhar detecções
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (detections.length > 0) {
      const detection = detections[0]; // Usar a primeira face detectada
      currentDetection = detection;

      // Desenhar caixa de detecção
      const box = detection.detection.box;
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3;
      ctx.strokeRect(box.x, box.y, box.width, box.height);

      // Atualizar posição da caixa visual
      updateFaceBox(box);

      // Analisar características faciais
      analyzeFeatures(detection);

      updateStatus('Rosto detectado! Analisando características...', 'success');
    } else {
      updateStatus('Nenhum rosto detectado. Tente se posicionar melhor.', 'warning');
      document.getElementById('face-box').classList.add('hidden');
      clearAnalysis();
    }

  } catch (error) {
    console.error('Erro na detecção:', error);
  }

  // Continuar análise
  requestAnimationFrame(detectFace);
}

// Atualizar posição da caixa de detecção
function updateFaceBox(box) {
  const faceBox = document.getElementById('face-box');
  faceBox.style.left = box.x + 'px';
  faceBox.style.top = box.y + 'px';
  faceBox.style.width = box.width + 'px';
  faceBox.style.height = box.height + 'px';
  faceBox.classList.remove('hidden');
}

// Analisar características faciais
function analyzeFeatures(detection) {
  const landmarks = detection.landmarks.positions;
  const box = detection.detection.box;
  const confidence = Math.round(detection.detection.score * 100);

  // Calcular formato do rosto
  const faceShape = calculateFaceShape(landmarks, box);
  
  // Calcular simetria
  const symmetry = calculateSymmetry(landmarks);

  // Calcular proporção da fronte
  const foreheadRatio = calculateForeheadRatio(landmarks, box);

  // Atualizar painel de análise
  updateMetrics({
    shape: faceShape,
    symmetry: symmetry,
    foreheadRatio: foreheadRatio,
    confidence: confidence
  });

  // Gerar recomendações
  generateRecommendations(faceShape);
}

// Calcular formato do rosto
function calculateFaceShape(landmarks, box) {
  // Pontos-chave: 0=queixo, 16=topo, 8=queixo inferior
  const chin = landmarks[8];
  const top = landmarks[27];
  const left = landmarks[0];
  const right = landmarks[16];

  const width = box.width;
  const height = box.height;
  const ratio = width / height;

  // Lógica simplificada para classificação
  if (ratio > 0.75) return 'round';
  if (ratio < 0.65) return 'oblong';
  if (ratio > 0.72 && ratio < 0.75) return 'square';
  return 'oval';
}

// Calcular simetria
function calculateSymmetry(landmarks) {
  // Comparar pontos esquerdo e direito
  const leftEye = landmarks[36];
  const rightEye = landmarks[45];
  const leftCheek = landmarks[2];
  const rightCheek = landmarks[14];

  const eyeDistance = Math.abs(leftEye.x - rightEye.x);
  const cheekDistance = Math.abs(leftCheek.x - rightCheek.x);

  // Calcular simetria em percentual
  const symmetryScore = Math.min(eyeDistance, cheekDistance) / Math.max(eyeDistance, cheekDistance);
  const symmetryPercent = Math.round(symmetryScore * 100);

  return symmetryPercent + '%';
}

// Calcular proporção da fronte
function calculateForeheadRatio(landmarks, box) {
  const top = landmarks[27];
  const chin = landmarks[8];
  
  const foreheadHeight = top.y - box.y;
  const totalHeight = box.height;
  
  const ratio = Math.round((foreheadHeight / totalHeight) * 100);
  return ratio + '%';
}

// Atualizar métricas na UI
function updateMetrics(metrics) {
  const metricsCard = document.getElementById('metrics-card');
  metricsCard.classList.remove('hidden');

  document.getElementById('face-shape').textContent = 
    metrics.shape.charAt(0).toUpperCase() + metrics.shape.slice(1);
  document.getElementById('symmetry').textContent = metrics.symmetry;
  document.getElementById('forehead-ratio').textContent = metrics.foreheadRatio;
  document.getElementById('confidence').textContent = metrics.confidence + '%';
}

// Gerar recomendações de corte
function generateRecommendations(faceShape) {
  const recommendations = styleRecommendations[faceShape] || styleRecommendations['oval'];
  const recommendationsCard = document.getElementById('recommendations-card');
  const recommendationsList = document.getElementById('recommendations-list');

  // Limpar recomendações anteriores
  recommendationsList.innerHTML = '';

  recommendations.forEach((rec, index) => {
    const item = document.createElement('div');
    item.className = 'recommendation-item';
    item.innerHTML = `
      <div class="recommendation-title">${rec.name}</div>
      <div class="recommendation-desc">${rec.description}</div>
    `;
    
    item.addEventListener('click', () => {
      selectRecommendation(rec);
    });

    recommendationsList.appendChild(item);
  });

  recommendationsCard.classList.remove('hidden');
  document.getElementById('action-card').classList.remove('hidden');
}

// Selecionar recomendação e preparar agendamento
function selectRecommendation(recommendation) {
  const whatsappUrl = buildWhatsappUrl(
    `Olá! Usei a câmera IA do Estúdio Prumo e gostaria de agendar o corte ${recommendation.name}.`
  );
  
  const scheduleBtn = document.getElementById('schedule-btn');
  scheduleBtn.href = whatsappUrl;
}

// Construir URL do WhatsApp
function buildWhatsappUrl(message) {
  const WHATSAPP_NUMBER = '5541996484980';
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

// Limpar análise
function clearAnalysis() {
  document.getElementById('metrics-card').classList.add('hidden');
  document.getElementById('recommendations-card').classList.add('hidden');
  document.getElementById('action-card').classList.add('hidden');
}

// Atualizar status
function updateStatus(message, type = 'info') {
  const statusDiv = document.getElementById('analysis-status');
  const statusIndicator = document.getElementById('status');

  statusDiv.textContent = message;

  if (type === 'success') {
    statusIndicator.classList.remove('hidden');
  } else {
    statusIndicator.classList.add('hidden');
  }
}

// Atualizar estado da UI
function updateUIState(state) {
  const startBtn = document.getElementById('start-btn');
  const stopBtn = document.getElementById('stop-btn');
  const captureBtn = document.getElementById('capture-btn');

  if (state === 'running') {
    startBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');
    captureBtn.classList.remove('hidden');
  } else {
    startBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
    captureBtn.classList.add('hidden');
  }
}

// Event listeners
document.addEventListener('DOMContentLoaded', async () => {
  // Inicializar menu móvel
  initMobileMenu();

  if (!initializeElements()) return;

  // Carregar modelos
  const modelsLoaded = await loadFaceModels();
  if (!modelsLoaded) return;

  // Botão iniciar câmera
  document.getElementById('start-btn').addEventListener('click', startCamera);

  // Botão parar câmera
  document.getElementById('stop-btn').addEventListener('click', stopCamera);

  // Botão capturar
  document.getElementById('capture-btn').addEventListener('click', () => {
    if (currentDetection) {
      selectRecommendation(
        styleRecommendations['oval'][0] // Usar recomendação padrão
      );
    }
  });

  updateStatus('Clique em "Iniciar câmera" para começar a análise.', 'info');
});

// Limpar recursos ao sair da página
window.addEventListener('beforeunload', () => {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
});
