document.addEventListener('DOMContentLoaded', () => {
  // AOS init
  if (window.AOS) AOS.init({ duration: 600, once: true, offset: 60 });

  // Mobile nav toggle
  const toggle = document.querySelector('.nav-toggle');
  const mobileNav = document.querySelector('.nav-links-mobile');
  if (toggle && mobileNav) {
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('open');
      mobileNav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', mobileNav.classList.contains('open'));
    });
  }

  // Back to top
  const backToTop = document.querySelector('.back-to-top');
  if (backToTop) {
    window.addEventListener('scroll', () => {
      backToTop.classList.toggle('visible', window.scrollY > 400);
    });
    backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Quantity stepper on product page
  document.querySelectorAll('.qty-stepper').forEach(stepper => {
    const input = stepper.querySelector('.qty-input');
    stepper.querySelectorAll('.qty-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        let val = parseInt(input.value, 10) || 1;
        const min = parseInt(input.min, 10) || 1;
        const max = parseInt(input.max, 10) || 99;
        if (btn.dataset.action === 'increase') val = Math.min(max, val + 1);
        else val = Math.max(min, val - 1);
        input.value = val;
      });
    });
  });

  // Add to cart (placeholder feedback)
  document.querySelectorAll('.add-to-cart').forEach(btn => {
    btn.addEventListener('click', () => {
      const original = btn.textContent;
      btn.textContent = 'Added ✓';
      btn.disabled = true;
      setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1500);
    });
  });
});
