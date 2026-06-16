// Reconhecimento facial integrado na página ia-tryon.html
let video = null;
let canvas = null;
let stream = null;
let isAnalyzing = false;
let currentDetection = null;
let modelsLoaded = false;

// Recomendações baseadas em formato de rosto
const faceShapeRecommendations = {
  'oval': {
    shape: 'Oval',
    styles: ['Executive Contour', 'Mid Fade Moderno'],
    analysis: 'Rosto oval com proporções equilibradas. Recomendamos estilos que mantêm o equilíbrio natural.'
  },
  'round': {
    shape: 'Redondo',
    styles: ['Mid Fade Moderno', 'Buzz Cut com Degradê'],
    analysis: 'Rosto redondo detectado. Estilos com degradê lateral ajudam a criar definição.'
  },
  'square': {
    shape: 'Quadrado',
    styles: ['Buzz Cut com Degradê', 'Executive Contour'],
    analysis: 'Rosto quadrado com mandíbula forte. Estilos com contorno limpo destacam os traços.'
  },
  'oblong': {
    shape: 'Alongado',
    styles: ['Executive Contour', 'Mid Fade Moderno'],
    analysis: 'Rosto alongado. Recomendamos volume lateral para equilibrar as proporções.'
  }
};

// Inicializar elementos
function initCameraElements() {
  video = document.getElementById('video');
  canvas = document.getElementById('canvas');
  
  if (!video || !canvas) {
    console.error('Elementos de vídeo ou canvas não encontrados');
    return false;
  }
  return true;
}

// Carregar modelos de IA
async function loadFaceModels() {
  if (modelsLoaded) return true;
  
  try {
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model/';
    
    console.log('Carregando modelos de IA...');
    
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
      faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL)
    ]);
    
    modelsLoaded = true;
    console.log('✓ Modelos carregados com sucesso');
    return true;
  } catch (error) {
    console.error('Erro ao carregar modelos:', error);
    alert('Erro ao carregar modelos de IA. Tente recarregar a página.');
    return false;
  }
}

// Iniciar câmera
async function startCamera() {
  try {
    // Carregar modelos antes de iniciar câmera
    if (!modelsLoaded) {
      const loaded = await loadFaceModels();
      if (!loaded) return;
    }

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

    video.onloadedmetadata = () => {
      video.play();
      isAnalyzing = true;
      
      // Mostrar interface de câmera
      document.getElementById('instruction-text').classList.add('hidden');
      document.getElementById('camera-mode').classList.remove('hidden');
      document.getElementById('camera-status').style.display = 'flex';
      document.getElementById('camera-btn').style.display = 'none';
      document.getElementById('reset-btn').classList.add('hidden');
      
      // Iniciar detecção contínua
      detectFaceRealtime();
    };

  } catch (error) {
    console.error('Erro ao acessar câmera:', error);
    
    let errorMsg = 'Erro ao acessar a câmera.';
    if (error.name === 'NotAllowedError') {
      errorMsg = 'Permissão de câmera negada. Verifique as configurações do navegador.';
    } else if (error.name === 'NotFoundError') {
      errorMsg = 'Nenhuma câmera encontrada neste dispositivo.';
    }
    
    alert(errorMsg);
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
  
  // Resetar interface
  document.getElementById('camera-mode').classList.add('hidden');
  document.getElementById('camera-status').style.display = 'none';
  document.getElementById('instruction-text').classList.remove('hidden');
  document.getElementById('camera-btn').style.display = 'block';
  
  // Limpar canvas
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Detectar rosto em tempo real
async function detectFaceRealtime() {
  if (!isAnalyzing || !video.srcObject) return;

  try {
    // Redimensionar canvas
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Detectar faces
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceExpressions()
      .withAgeAndGender();

    // Limpar overlay anterior
    const overlay = document.getElementById('face-overlay');
    overlay.innerHTML = '';

    if (detections.length > 0) {
      const detection = detections[0];
      currentDetection = detection;

      const box = detection.detection.box;
      
      // Criar elemento de caixa de detecção
      const faceBox = document.createElement('div');
      faceBox.className = 'face-box';
      faceBox.style.left = box.x + 'px';
      faceBox.style.top = box.y + 'px';
      faceBox.style.width = box.width + 'px';
      faceBox.style.height = box.height + 'px';
      
      overlay.appendChild(faceBox);
    }

  } catch (error) {
    console.error('Erro na detecção:', error);
  }

  // Continuar análise
  requestAnimationFrame(detectFaceRealtime);
}

// Capturar e analisar rosto
async function captureAndAnalyze() {
  if (!currentDetection) {
    alert('Nenhum rosto detectado. Tente se posicionar melhor.');
    return;
  }

  try {
    // Parar câmera
    stopCamera();

    // Desenhar frame atual no canvas
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    // Converter canvas para imagem
    const imageData = canvas.toDataURL('image/jpeg');

    // Mostrar imagem capturada
    const userPhoto = document.getElementById('user-photo');
    userPhoto.src = imageData;
    userPhoto.classList.remove('hidden');
    document.getElementById('camera-btn').style.display = 'none';
    document.getElementById('reset-btn').classList.remove('hidden');

    // Analisar características
    analyzeDetection(currentDetection);

  } catch (error) {
    console.error('Erro ao capturar:', error);
    alert('Erro ao capturar imagem.');
  }
}

// Analisar características do rosto
function analyzeDetection(detection) {
  const landmarks = detection.landmarks.positions;
  const box = detection.detection.box;
  const confidence = Math.round(detection.detection.score * 100);

  // Calcular formato do rosto
  const faceShape = calculateFaceShape(landmarks, box);
  
  // Calcular simetria
  const symmetry = calculateSymmetry(landmarks);

  // Calcular proporção da fronte
  const foreheadRatio = calculateForeheadRatio(landmarks, box);

  // Obter recomendações
  const recommendation = faceShapeRecommendations[faceShape] || faceShapeRecommendations['oval'];

  // Armazenar dados para uso posterior
  window.currentAnalysis = {
    faceShape: faceShape,
    shapeName: recommendation.shape,
    symmetry: symmetry,
    foreheadRatio: foreheadRatio,
    confidence: confidence,
    analysis: recommendation.analysis,
    recommendedStyles: recommendation.styles
  };

  console.log('Análise completa:', window.currentAnalysis);
}

// Calcular formato do rosto
function calculateFaceShape(landmarks, box) {
  const width = box.width;
  const height = box.height;
  const ratio = width / height;

  // Classificação simplificada
  if (ratio > 0.75) return 'round';
  if (ratio < 0.65) return 'oblong';
  if (ratio > 0.72 && ratio < 0.75) return 'square';
  return 'oval';
}

// Calcular simetria
function calculateSymmetry(landmarks) {
  const leftEye = landmarks[36];
  const rightEye = landmarks[45];
  const leftCheek = landmarks[2];
  const rightCheek = landmarks[14];

  const eyeDistance = Math.abs(leftEye.x - rightEye.x);
  const cheekDistance = Math.abs(leftCheek.x - rightCheek.x);

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

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  const cameraBtn = document.getElementById('camera-btn');
  const closeCameraBtn = document.getElementById('close-camera-btn');
  const captureBtn = document.getElementById('capture-btn');
  const resetBtn = document.getElementById('reset-btn');

  if (cameraBtn) {
    cameraBtn.addEventListener('click', startCamera);
  }

  if (closeCameraBtn) {
    closeCameraBtn.addEventListener('click', stopCamera);
  }

  if (captureBtn) {
    captureBtn.addEventListener('click', captureAndAnalyze);
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      document.getElementById('user-photo').classList.add('hidden');
      document.getElementById('user-photo').removeAttribute('src');
      document.getElementById('camera-btn').style.display = 'block';
      resetBtn.classList.add('hidden');
      document.getElementById('style-selection').classList.remove('hidden');
      document.getElementById('final-card').classList.add('hidden');
      currentDetection = null;
      window.currentAnalysis = null;
    });
  }

  // Interceptar seleção de estilo para incluir análise
  document.querySelectorAll('[data-style-name]').forEach((button) => {
    button.addEventListener('click', function(e) {
      // Verificar se há foto ou câmera foi usada
      const userPhoto = document.getElementById('user-photo');
      if (!userPhoto.src || userPhoto.classList.contains('hidden')) {
        alert('Por favor, suba sua foto ou use a câmera primeiro para simular.');
        return;
      }

      const styleName = this.getAttribute('data-style-name') || 'Corte personalizado';
      const styleType = this.getAttribute('data-style-type') || 'Visagismo Prumo';

      // Mostrar overlay de carregamento
      const overlay = document.getElementById('ia-overlay');
      overlay?.classList.remove('hidden');

      setTimeout(() => {
        overlay?.classList.add('hidden');
        document.getElementById('style-selection')?.classList.add('hidden');
        document.getElementById('final-card')?.classList.remove('hidden');
        
        document.getElementById('res-nome').textContent = styleName;
        document.getElementById('res-tipo').textContent = styleType;

        // Mostrar análise se disponível
        if (window.currentAnalysis) {
          const analysisDetails = document.getElementById('analysis-details');
          analysisDetails.style.display = 'block';
          document.getElementById('analysis-text').textContent = window.currentAnalysis.analysis;

          // Salvar no Supabase
          if (typeof supabaseClient !== 'undefined') {
            supabaseClient.saveFaceSimulation(styleName, styleType, {
              source: 'camera-realtime',
              faceShape: window.currentAnalysis.faceShape,
              symmetry: window.currentAnalysis.symmetry,
              confidence: window.currentAnalysis.confidence,
              timestamp: new Date().toISOString()
            }).catch(err => console.error('Erro ao salvar:', err));
          }
        }

        // Atualizar link do WhatsApp
        const resultCta = document.getElementById('result-cta');
        const whatsappMessage = `Olá! Usei o simulador de visagismo do Estúdio Prumo e quero agendar o corte ${styleName}.`;
        resultCta.href = `https://wa.me/5541996484980?text=${encodeURIComponent(whatsappMessage)}`;

        document.getElementById('final-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 1400);
    });
  });
});

// Limpar recursos ao sair
window.addEventListener('beforeunload', () => {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
});
