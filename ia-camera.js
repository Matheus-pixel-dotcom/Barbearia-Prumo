// Reconhecimento facial integrado na página ia-tryon.html
let video = null;
let canvas = null;
let stream = null;
let isAnalyzing = false;
let currentDetection = null;
let modelsLoaded = false;
let detectionAnimationId = null;

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
  
  if (!video) {
    console.error('Elemento de vídeo não encontrado');
    return false;
  }
  if (!canvas) {
    console.error('Elemento de canvas não encontrado');
    return false;
  }
  
  // Configurar atributos do vídeo
  video.setAttribute('playsinline', 'true');
  video.setAttribute('autoplay', 'true');
  video.setAttribute('muted', 'true');
  
  return true;
}

// Carregar modelos de IA com retry
async function loadFaceModels(retryCount = 0) {
  if (modelsLoaded) return true;
  
  try {
    // Verificar se Face-API está disponível
    if (typeof faceapi === 'undefined') {
      console.warn('Face-API não carregado ainda, tentando novamente...');
      if (retryCount < 3) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return loadFaceModels(retryCount + 1);
      }
      throw new Error('Face-API não conseguiu carregar após 3 tentativas');
    }

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
    return false;
  }
}

// Iniciar câmera com melhor tratamento de erros
async function startCamera() {
  try {
    console.log('Iniciando câmera...');

    // Carregar modelos antes de iniciar câmera
    if (!modelsLoaded) {
      console.log('Carregando modelos de IA...');
      const loaded = await loadFaceModels();
      if (!loaded) {
        showCameraError('Não foi possível carregar os modelos de IA. Verifique sua conexão com a internet e tente novamente.');
        return;
      }
    }

    // Verificar suporte a getUserMedia
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showCameraError('Seu navegador não suporta acesso à câmera. Use Chrome, Firefox, Safari ou Edge.');
      return;
    }

    const constraints = {
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user'
      },
      audio: false
    };

    console.log('Solicitando acesso à câmera...');
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    console.log('✓ Câmera acessada com sucesso');
    video.srcObject = stream;

    // Aguardar vídeo estar pronto
    return new Promise((resolve) => {
      video.onloadedmetadata = () => {
        console.log('✓ Vídeo carregado');
        
        // Garantir que o vídeo está tocando
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.error('Erro ao reproduzir vídeo:', error);
            showCameraError('Erro ao reproduzir vídeo. Tente novamente.');
            resolve(false);
          });
        }

        isAnalyzing = true;
        
        // Mostrar interface de câmera
        document.getElementById('instruction-text').classList.add('hidden');
        document.getElementById('camera-mode').classList.remove('hidden');
        document.getElementById('camera-status').style.display = 'flex';
        document.getElementById('camera-btn').style.display = 'none';
        document.getElementById('reset-btn').classList.add('hidden');
        
        // Iniciar detecção contínua
        detectFaceRealtime();
        resolve(true);
      };

      video.onerror = (error) => {
        console.error('Erro no vídeo:', error);
        showCameraError('Erro ao carregar o vídeo da câmera.');
        resolve(false);
      };

      // Timeout de 10 segundos
      setTimeout(() => {
        if (video.readyState < 2) {
          console.error('Timeout ao carregar vídeo');
          showCameraError('Timeout ao carregar a câmera. Tente novamente.');
          stopCamera();
          resolve(false);
        }
      }, 10000);
    });

  } catch (error) {
    console.error('Erro ao acessar câmera:', error);
    
    let errorMsg = 'Erro ao acessar a câmera.';
    
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      errorMsg = 'Permissão de câmera negada. Verifique as configurações do navegador e tente novamente.';
    } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      errorMsg = 'Nenhuma câmera encontrada neste dispositivo.';
    } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      errorMsg = 'A câmera está sendo usada por outro aplicativo. Feche outros apps e tente novamente.';
    } else if (error.name === 'SecurityError') {
      errorMsg = 'Erro de segurança. Certifique-se de estar usando HTTPS.';
    } else if (error.message) {
      errorMsg = `Erro: ${error.message}`;
    }
    
    showCameraError(errorMsg);
  }
}

// Mostrar erro de câmera
function showCameraError(message) {
  console.error('Erro de câmera:', message);
  alert(message);
  stopCamera();
}

// Parar câmera
function stopCamera() {
  console.log('Parando câmera...');
  isAnalyzing = false;
  
  // Cancelar animation frame
  if (detectionAnimationId) {
    cancelAnimationFrame(detectionAnimationId);
    detectionAnimationId = null;
  }
  
  if (stream) {
    stream.getTracks().forEach(track => {
      track.stop();
      console.log('Track parado:', track.kind);
    });
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
  
  console.log('✓ Câmera parada');
}

// Detectar rosto em tempo real
async function detectFaceRealtime() {
  if (!isAnalyzing || !video.srcObject) {
    return;
  }

  try {
    // Verificar se vídeo está pronto
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      detectionAnimationId = requestAnimationFrame(detectFaceRealtime);
      return;
    }

    // Redimensionar canvas
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Detectar faces com timeout
    const detectionPromise = faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceExpressions()
      .withAgeAndGender();

    // Timeout de 5 segundos
    const detectionWithTimeout = Promise.race([
      detectionPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout na detecção')), 5000)
      )
    ]);

    const detections = await detectionWithTimeout;

    // Limpar overlay anterior
    const overlay = document.getElementById('face-overlay');
    overlay.innerHTML = '';

    if (detections && detections.length > 0) {
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
    console.warn('Erro na detecção (não crítico):', error.message);
  }

  // Continuar análise
  detectionAnimationId = requestAnimationFrame(detectFaceRealtime);
}

// Capturar e analisar rosto
async function captureAndAnalyze() {
  if (!currentDetection) {
    alert('Nenhum rosto detectado. Tente se posicionar melhor.');
    return;
  }

  try {
    console.log('Capturando e analisando...');
    
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
    
    console.log('✓ Captura e análise concluídas');

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
  
  const foreheadHeight = top.y - box.y;
  const totalHeight = box.height;
  
  const ratio = Math.round((foreheadHeight / totalHeight) * 100);
  return ratio + '%';
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  console.log('Inicializando ia-camera.js...');
  
  const cameraBtn = document.getElementById('camera-btn');
  const closeCameraBtn = document.getElementById('close-camera-btn');
  const captureBtn = document.getElementById('capture-btn');
  const resetBtn = document.getElementById('reset-btn');

  if (!initCameraElements()) {
    console.error('Falha ao inicializar elementos de câmera');
    return;
  }

  if (cameraBtn) {
    cameraBtn.addEventListener('click', () => {
      console.log('Botão de câmera clicado');
      startCamera();
    });
  }

  if (closeCameraBtn) {
    closeCameraBtn.addEventListener('click', () => {
      console.log('Botão de fechar câmera clicado');
      stopCamera();
    });
  }

  if (captureBtn) {
    captureBtn.addEventListener('click', () => {
      console.log('Botão de capturar clicado');
      captureAndAnalyze();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      console.log('Botão de reset clicado');
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

  console.log('✓ ia-camera.js inicializado com sucesso');
});

// Limpar recursos ao sair
window.addEventListener('beforeunload', () => {
  console.log('Limpando recursos...');
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
  if (detectionAnimationId) {
    cancelAnimationFrame(detectionAnimationId);
  }
});
