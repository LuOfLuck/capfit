// ── Fondo animado con ondas ──
(function () {
  const c = document.getElementById('bg-canvas');
  const ctx = c.getContext('2d');
  let W, H, t = 0;

  function resize() { W = c.width = window.innerWidth; H = c.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize);

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#f2f2f0';
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      const yB = H * (0.28 + i * 0.13), amp = 38 + i * 13,
            freq = 0.006 - i * 0.0005, spd = 0.011 + i * 0.003,
            al = 0.035 + (5 - i) * 0.013;
      for (let x = 0; x <= W; x += 4) {
        const y = yB + Math.sin(x * freq + t * spd + i * 1.3) * amp
                     + Math.sin(x * freq * 1.8 - t * spd * 0.6) * amp * 0.35;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(0,0,0,${al})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.42);
    g.addColorStop(0, 'rgba(255,255,255,0.52)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    t++;
    requestAnimationFrame(draw);
  }
  draw();
})();