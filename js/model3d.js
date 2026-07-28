// ── Visor 3D con Three.js + GLTFLoader + OrbitControls ──
(function () {
  // Verificar que CONFIG existe
  if (typeof CONFIG === 'undefined') {
    console.error('[Model3D] ❌ CONFIG no está definido. Asegurate de cargar config.js antes de model3d.js');
    const container = document.getElementById('model-viewer');
    if (container) {
      container.innerHTML = '<p style="color:#c00;font-size:.74rem;padding:20px;text-align:center">⚠️ Error de configuración. Recargá la página.</p>';
    }
    return;
  }

  const container = document.getElementById('model-viewer');
  if (!container) {
    console.error('[Model3D] ❌ No se encontró #model-viewer');
    return;
  }

  const W = container.clientWidth || 400;
  const H = container.clientHeight || 400;

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(W, H);
  renderer.outputEncoding = THREE.sRGBEncoding;
  container.appendChild(renderer.domElement);

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, W / H, 0.01, 100);
  camera.position.set(0, 0.5, 3.2);

  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const key  = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(3, 5, 4);  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffeedd, 0.5); fill.position.set(-4, 2, -2); scene.add(fill);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping  = true;
  controls.dampingFactor  = 0.08;
  controls.enableZoom     = false;
  controls.enablePan      = false;
  controls.autoRotate     = true;
  controls.autoRotateSpeed = 2.2;
  controls.minPolarAngle  = Math.PI * 0.25;
  controls.maxPolarAngle  = Math.PI * 0.72;

  const modelPath = CONFIG.model3D || 'assets/hat.glb';
  console.log('[Model3D] Cargando modelo:', modelPath);

  const loader = new THREE.GLTFLoader();
  loader.load(
    modelPath,
    (gltf) => {
      const msgEl = document.getElementById('model-msg');
      if (msgEl) msgEl.style.display = 'none';

      const model  = gltf.scene;
      const box    = new THREE.Box3().setFromObject(model);
      const size   = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale  = 1.6 / Math.max(size.x, size.y, size.z);
      model.scale.setScalar(scale);
      model.position.sub(center.multiplyScalar(scale));
      model.position.y += 0.05;
      model.userData.baseY = model.position.y;
      scene.add(model);
      console.log('[Model3D] ✅ Modelo cargado correctamente');
    },
    (progress) => {
      // Opcional: mostrar progreso de carga
      if (progress.lengthComputable) {
        const percent = Math.round((progress.loaded / progress.total) * 100);
        console.log('[Model3D] Cargando... ' + percent + '%');
      }
    },
    (error) => {
      console.warn('[Model3D] Modelo 3D no encontrado, mostrando vista interactiva 2D:', error);
      const msgEl = document.getElementById('model-msg');
      if (msgEl) msgEl.style.display = 'none';
      
      // Render clean fallback image inside viewer container
      container.innerHTML = `
        <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;position:relative">
          <img src="assets/gorras/Gorra_negra_frente.webp" alt="Gorra CAPFIT" class="hero-floating-cap" style="width:85%;max-width:360px;object-fit:contain;filter:drop-shadow(0 20px 30px rgba(0,0,0,0.15))">
        </div>
      `;
    }
  );

  let ft = 0;
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    ft += 0.012;
    scene.children.forEach(o => {
      if (o.userData.baseY !== undefined)
        o.position.y = o.userData.baseY + Math.sin(ft) * 0.055;
    });
    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener('resize', () => {
    const w = container.clientWidth || 400;
    const h = container.clientHeight || 400;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });
})();