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

                            // Custom order: STL upload + instant estimate
                            const stlForm = document.getElementById('stl-form');
    if (stlForm) {
          const dropzone = document.getElementById('dropzone');
          const fileInput = document.getElementById('stl-input');
          const fileNameEl = document.getElementById('file-name');
          const estimateBtn = document.getElementById('estimate-btn');
          const errorEl = document.getElementById('upload-error');
          const resultEl = document.getElementById('estimate-result');
          const infillSelect = document.getElementById('infill');
          const requestQuoteBtn = document.getElementById('request-quote-btn');

      let selectedFile = null;

      function showError(msg) {
              errorEl.textContent = msg;
              errorEl.hidden = false;
      }
          function clearError() {
                  errorEl.hidden = true;
                  errorEl.textContent = '';
          }

      function setFile(file) {
              if (!file) return;
              if (!file.name.toLowerCase().endsWith('.stl')) {
                        showError('Please choose a .stl file.');
                        return;
              }
              clearError();
              selectedFile = file;
              fileNameEl.textContent = file.name;
              estimateBtn.disabled = false;
              resultEl.hidden = true;
      }

      fileInput.addEventListener('change', () => setFile(fileInput.files[0]));

      ['dragenter', 'dragover'].forEach(evt => {
              dropzone.addEventListener(evt, (e) => {
                        e.preventDefault();
                        dropzone.classList.add('dragover');
              });
      });
          ['dragleave', 'drop'].forEach(evt => {
                  dropzone.addEventListener(evt, (e) => {
                            e.preventDefault();
                            dropzone.classList.remove('dragover');
                  });
          });
          dropzone.addEventListener('drop', (e) => {
                  const file = e.dataTransfer.files && e.dataTransfer.files[0];
                  if (file) {
                            fileInput.files = e.dataTransfer.files;
                            setFile(file);
                  }
          });

      stlForm.addEventListener('submit', async (e) => {
              e.preventDefault();
              if (!selectedFile) return;
              clearError();

                                     const original = estimateBtn.textContent;
              estimateBtn.disabled = true;
              estimateBtn.textContent = 'Crunching numbers…';

                                     try {
                                               const formData = new FormData();
                                               formData.append('stl', selectedFile);
                                               formData.append('infill', infillSelect.value);

                const res = await fetch('/custom-order/estimate', { method: 'POST', body: formData });
                                               const data = await res.json();

                if (!res.ok || !data.ok) {
                            throw new Error(data.error || 'Something went wrong reading that file.');
                }

                renderEstimate(data);
                                     } catch (err) {
                                               showError(err.message || 'Something went wrong. Please try a different file.');
                                               resultEl.hidden = true;
                                     } finally {
                                               estimateBtn.disabled = false;
                                               estimateBtn.textContent = original;
                                     }
      });

      function renderEstimate(data) {
              document.getElementById('estimate-filename').textContent = data.fileName;

            const d = data.dimensionsMm;
              document.getElementById('stat-dimensions').textContent =
                        `${d.x.toFixed(1)} × ${d.y.toFixed(1)} × ${d.z.toFixed(1)} mm`;
              document.getElementById('stat-volume').textContent = `${data.volumeCm3} cm³`;
              document.getElementById('stat-weight').textContent = `${data.weightGrams} g`;
              document.getElementById('stat-time').textContent = `${data.printHours} hr`;
              document.getElementById('stat-infill').textContent = `${data.settings.infillPercent}%`;

            document.getElementById('stat-price').textContent = `$${data.price.toFixed(2)}`;

            const breakdownEl = document.getElementById('estimate-breakdown');
              breakdownEl.innerHTML = '';
              const rows = [
                        ['Base / setup fee', data.breakdown.baseFee],
                        ['Material', data.breakdown.materialCost],
                        ['Print time', data.breakdown.timeCost],
                      ];
              rows.forEach(([label, val]) => {
                        const li = document.createElement('li');
                        li.innerHTML = `<span>${label}</span><span>$${val.toFixed(2)}</span>`;
                        breakdownEl.appendChild(li);
              });

            const summary =
                      `Custom print quote request\n` +
                      `File: ${data.fileName}\n` +
                      `Dimensions: ${d.x.toFixed(1)} x ${d.y.toFixed(1)} x ${d.z.toFixed(1)} mm\n` +
                      `Volume: ${data.volumeCm3} cm³ | Est. weight: ${data.weightGrams} g | Infill: ${data.settings.infillPercent}%\n` +
                      `Est. print time: ${data.printHours} hr\n` +
                      `Estimated price: $${data.price.toFixed(2)} CAD\n\n` +
                      `Hi! I'd like to request a quote for the custom print above.`;

            requestQuoteBtn.href = `/contact?quote=${encodeURIComponent(summary)}`;

            resultEl.hidden = false;
              resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
});
