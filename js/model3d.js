// ── Visor 3D con Three.js + GLTFLoader + OrbitControls ──
(function () {
  const container = document.getElementById('model-viewer');
  const W = container.clientWidth, H = container.clientHeight;

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

  const loader = new THREE.GLTFLoader();
  loader.load(
    CONFIG.model3D,
    (gltf) => {
      document.getElementById('model-msg').style.display = 'none';
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
    },
    null,
    () => {
      document.getElementById('model-msg').innerHTML =
        '<p style="color:#c00;font-size:.74rem;padding:20px;text-align:center">⚠️ Colocá tu archivo 3D en <strong>assets/gorra.glb</strong></p>';
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
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });
})();

