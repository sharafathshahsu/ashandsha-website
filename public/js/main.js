document.addEventListener('DOMContentLoaded', () => {
    // AOS init (disabled on mobile to reduce main-thread work and avoid layout shift)
                            if (window.AOS) AOS.init({ duration: 600, once: true, offset: 60, disable: 'mobile' });

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

                            // Custom order: model upload + instant estimate
                            const stlForm = document.getElementById('stl-form');
    if (stlForm) {
          const dropzone = document.getElementById('dropzone');
          const fileInput = document.getElementById('stl-input');
          const fileNameEl = document.getElementById('file-name');
          const estimateBtn = document.getElementById('estimate-btn');
          const errorEl = document.getElementById('upload-error');
          const resultEl = document.getElementById('estimate-result');
          const infillSelect = document.getElementById('infill');
          const materialSelect = document.getElementById('material');
          const multicolorToggle = document.getElementById('multicolor-toggle');
          const colorCountSelect = document.getElementById('color-count');
          const colorSwatchRow = document.getElementById('color-swatch-row');
          const requestQuoteBtn = document.getElementById('request-quote-btn');
          const previewEmpty = document.getElementById('preview-empty');
          const previewCanvas = document.getElementById('preview-canvas');
          const sizeWarningEl = document.getElementById('size-warning');

      const ACCEPTED_EXTENSIONS = ['.stl', '.obj', '.3mf'];

      let selectedFile = null;

      function showError(msg) {
              errorEl.textContent = msg;
              errorEl.hidden = false;
      }
          function clearError() {
                  errorEl.hidden = true;
                  errorEl.textContent = '';
          }

      function showSizeWarning(dims) {
              if (sizeWarningEl) {
                        sizeWarningEl.textContent =
                                    `This model is ${dims.x.toFixed(0)} × ${dims.y.toFixed(0)} × ${dims.z.toFixed(0)} mm, ` +
                                    `which exceeds our 256 × 256 × 256 mm max build size. We may be able to split it into parts — mention this when you request a quote.`;
                        sizeWarningEl.hidden = false;
              }
      }
          function hideSizeWarning() {
                  if (sizeWarningEl) sizeWarningEl.hidden = true;
          }

      function updateColorSwatches() {
              if (!colorSwatchRow) return;
              const enabled = multicolorToggle && multicolorToggle.checked;
              colorSwatchRow.hidden = !enabled;
              if (colorCountSelect) colorCountSelect.disabled = !enabled;
              if (!enabled) return;
              const count = parseInt(colorCountSelect.value, 10) || 1;
              colorSwatchRow.querySelectorAll('.color-swatch').forEach((el, i) => {
                        el.hidden = i >= count;
              });
      }
          if (multicolorToggle) {
                  multicolorToggle.addEventListener('change', updateColorSwatches);
                  colorCountSelect.addEventListener('change', updateColorSwatches);
                  updateColorSwatches();
          }

      function setFile(file) {
              if (!file) return;
              const lower = file.name.toLowerCase();
              if (!ACCEPTED_EXTENSIONS.some(ext => lower.endsWith(ext))) {
                        showError('Please choose an .stl, .obj, or .3mf file.');
                        return;
              }
              clearError();
              hideSizeWarning();
              selectedFile = file;
              fileNameEl.textContent = file.name;
              estimateBtn.disabled = false;
              resultEl.hidden = true;

            // Live 3D preview + client-side size check (works even before the
            // server responds, since the viewer reads the bounding box locally).
            if (window.ModelViewer && previewCanvas) {
                      if (previewEmpty) previewEmpty.hidden = true;
                      previewCanvas.hidden = false;
                      window.ModelViewer.loadFile(file)
                        .then((dims) => {
                                      if (dims && [dims.x, dims.y, dims.z].some(d => d > 256)) {
                                                      showSizeWarning(dims);
                                      }
                        })
                        .catch(() => {
                                      // Preview is best-effort — estimate can still proceed without it.
                                           if (previewEmpty) {
                                                           previewEmpty.hidden = false;
                                                           previewEmpty.textContent = 'Preview unavailable for this file, but the estimate will still work.';
                                           }
                                      previewCanvas.hidden = true;
                        });
            }
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
                                               formData.append('model', selectedFile);
                                               formData.append('infill', infillSelect.value);
                                               if (materialSelect) formData.append('material', materialSelect.value);

                const multicolor = multicolorToggle && multicolorToggle.checked;
                                               const colorCount = multicolor ? (parseInt(colorCountSelect.value, 10) || 1) : 1;
                                               formData.append('colorCount', colorCount);

                const colors = [];
                                               if (colorSwatchRow) {
                                                           colorSwatchRow.querySelectorAll('.color-swatch input[type="color"]').forEach((input, i) => {
                                                                         if (i < colorCount) colors.push(input.value);
                                                           });
                                               }

                const res = await fetch('/custom-order/estimate', { method: 'POST', body: formData });
                                               const data = await res.json();

                if (!res.ok || !data.ok) {
                            throw new Error(data.error || 'Something went wrong reading that file.');
                }

                renderEstimate(data, colors);
                                     } catch (err) {
                                               showError(err.message || 'Something went wrong. Please try a different file.');
                                               resultEl.hidden = true;
                                     } finally {
                                               estimateBtn.disabled = false;
                                               estimateBtn.textContent = original;
                                     }
      });

      function renderEstimate(data, colors) {
              document.getElementById('estimate-filename').textContent = data.fileName;

            const d = data.dimensionsMm;
              document.getElementById('stat-dimensions').textContent =
                        `${d.x.toFixed(1)} × ${d.y.toFixed(1)} × ${d.z.toFixed(1)} mm`;
              document.getElementById('stat-volume').textContent = `${data.volumeCm3} cm³`;
              document.getElementById('stat-weight').textContent = `${data.weightGrams} g`;
              document.getElementById('stat-time').textContent = `${data.printHours} hr`;
              document.getElementById('stat-infill').textContent = `${data.settings.infillPercent}%`;
              const materialEl = document.getElementById('stat-material');
              if (materialEl) materialEl.textContent = data.settings.material;

            document.getElementById('stat-price').textContent = `$${data.price.toFixed(2)}`;

            if (data.oversized) {
                      showSizeWarning(d);
            } else {
                      hideSizeWarning();
            }

            const breakdownEl = document.getElementById('estimate-breakdown');
              breakdownEl.innerHTML = '';
              const rows = [
                        ['Base / setup fee', data.breakdown.baseFee],
                        ['Material', data.breakdown.materialCost],
                        ['Print time', data.breakdown.timeCost],
                      ];
              if (data.breakdown.colorFee) {
                        rows.push([`Multicolour swap fee (${data.settings.colorCount} colours)`, data.breakdown.colorFee]);
              }
              rows.forEach(([label, val]) => {
                        const li = document.createElement('li');
                        li.innerHTML = `<span>${label}</span><span>$${val.toFixed(2)}</span>`;
                        breakdownEl.appendChild(li);
              });

            const colorNote = colors.length > 1 ? `Colours: ${colors.join(', ')}\n` : '';
              const sizeNote = data.oversized
                ? `\nNote: this model exceeds the 256mm max build size — may need to be split into parts.\n`
                        : '';

            const summary =
                      `Custom print quote request\n` +
                      `File: ${data.fileName}\n` +
                      `Dimensions: ${d.x.toFixed(1)} x ${d.y.toFixed(1)} x ${d.z.toFixed(1)} mm\n` +
                      `Volume: ${data.volumeCm3} cm³ | Est. weight: ${data.weightGrams} g | Infill: ${data.settings.infillPercent}%\n` +
                      `Material: ${data.settings.material} | Colours: ${data.settings.colorCount}\n` +
                      colorNote +
                      `Est. print time: ${data.printHours} hr\n` +
                      `Estimated price: $${data.price.toFixed(2)} CAD\n` +
                      sizeNote +
                      `\nHi! I'd like to request a quote for the custom print above.`;

            requestQuoteBtn.href = `/contact?quote=${encodeURIComponent(summary)}`;

            resultEl.hidden = false;
              resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
});
