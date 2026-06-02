// ── UI helpers: fade-in observer ──
document.addEventListener('DOMContentLoaded', () => {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold: 0.15 });

  document.querySelectorAll('.fade-in, .section-title, .section-sub, .step-pill').forEach(el => {
    if (!el.classList.contains('fade-in')) el.classList.add('fade-in');
    obs.observe(el);
  });
});