let originalImage = null;
let selectedStyle = null;

const styles = [
  { name: "Fade Clássico", img: "assets/images/cortes/fade1.jpg" },
  { name: "Undercut", img: "assets/images/cortes/undercut.jpg" },
  // adicione mais...
];

document.getElementById('upload-area').addEventListener('click', () => {
  document.getElementById('photo-upload').click();
});

document.getElementById('photo-upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(ev) {
    originalImage = ev.target.result;
    document.getElementById('original-img').src = originalImage;
    document.getElementById('preview-original').classList.remove('hidden');
    document.getElementById('upload-area').classList.add('hidden');
  };
  reader.readAsDataURL(file);
});

// Preencher grid de estilos
const grid = document.getElementById('style-grid');
styles.forEach(style => {
  const div = document.createElement('div');
  div.className = "cursor-pointer rounded-xl overflow-hidden border-2 border-transparent hover:border-amber-500";
  div.innerHTML = `<img src="${style.img}" class="w-full">`;
  div.onclick = () => generateTryOn(style);
  grid.appendChild(div);
});

function generateTryOn(style) {
  selectedStyle = style;
  // Simulação de IA (depois substitua por modelo real)
  document.getElementById('result-img').src = style.img; // placeholder
  document.getElementById('result-area').classList.remove('hidden');
}

function approveCut() {
  alert("✅ Corte aprovado! Enviando para o barbeiro parceiro...");
  // Aqui você pode integrar com EmailJS, WhatsApp API ou backend simples (Firebase)
  window.location.href = "contato.html";
}

function tryAgain() {
  document.getElementById('result-area').classList.add('hidden');
}