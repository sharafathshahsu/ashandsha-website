// Cart logic — stored in localStorage, shared across all pages.
(function () {
  const CART_KEY = 'ashAndShaCart';

  function getCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartBadge();
  }

  function addToCart(item, qty) {
    qty = Math.max(1, parseInt(qty, 10) || 1);
    const cart = getCart();
    const existing = cart.find(i => i.id === item.id);
    if (existing) {
      existing.qty += qty;
    } else {
      cart.push({
        id: item.id,
        name: item.name,
        price: parseFloat(item.price),
        image: item.image,
        qty,
      });
    }
    saveCart(cart);
  }

  function updateQty(id, qty) {
    qty = parseInt(qty, 10);
    let cart = getCart();
    if (!qty || qty < 1) {
      cart = cart.filter(i => i.id !== id);
    } else {
      const item = cart.find(i => i.id === id);
      if (item) item.qty = qty;
    }
    saveCart(cart);
    return cart;
  }

  function removeFromCart(id) {
    const cart = getCart().filter(i => i.id !== id);
    saveCart(cart);
    return cart;
  }

  function clearCart() {
    localStorage.removeItem(CART_KEY);
    updateCartBadge();
  }

  function cartCount(cart) {
    return (cart || getCart()).reduce((sum, i) => sum + i.qty, 0);
  }

  function cartTotal(cart) {
    return (cart || getCart()).reduce((sum, i) => sum + i.qty * i.price, 0);
  }

  function updateCartBadge() {
    const count = cartCount();
    document.querySelectorAll('.cart-badge').forEach(el => {
      el.textContent = count;
    });
  }

  function flashAdded(btn) {
    if (!btn) return;
    const original = btn.textContent;
    btn.textContent = 'Added ✓';
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = original;
      btn.disabled = false;
    }, 1200);
  }

  function renderCartPage() {
    const root = document.getElementById('cart-page');
    if (!root) return;

    const emptyEl = document.getElementById('cart-empty');
    const listEl = document.getElementById('cart-list');
    const summaryEl = document.getElementById('cart-summary');
    const subtotalEl = document.getElementById('cart-subtotal');
    const checkoutBtn = document.getElementById('checkout-btn');
    const checkoutError = document.getElementById('checkout-error');

    const cart = getCart();

    if (!cart.length) {
      if (emptyEl) emptyEl.hidden = false;
      if (listEl) listEl.hidden = true;
      if (summaryEl) summaryEl.hidden = true;
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    if (listEl) listEl.hidden = false;
    if (summaryEl) summaryEl.hidden = false;

    listEl.innerHTML = '';
    cart.forEach(item => {
      const row = document.createElement('div');
      row.className = 'cart-item';
      row.innerHTML = `
        <img class="cart-item-img" src="${item.image}" alt="${item.name}">
        <div class="cart-item-info">
          <h3>${item.name}</h3>
          <div class="cart-item-price">$${item.price.toFixed(2)} each</div>
        </div>
        <div class="cart-item-qty">
          <div class="qty-stepper">
            <button type="button" class="qty-btn" data-action="decrease" aria-label="Decrease quantity">−</button>
            <input type="number" class="qty-input" value="${item.qty}" min="1" max="20" aria-label="Quantity" data-id="${item.id}">
            <button type="button" class="qty-btn" data-action="increase" aria-label="Increase quantity">+</button>
          </div>
        </div>
        <div class="cart-item-line-total">$${(item.price * item.qty).toFixed(2)}</div>
        <button type="button" class="cart-remove" data-id="${item.id}" aria-label="Remove item">✕</button>
      `;
      listEl.appendChild(row);

      const stepper = row.querySelector('.qty-stepper');
      const input = row.querySelector('.qty-input');
      stepper.querySelectorAll('.qty-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          let val = parseInt(input.value, 10) || 1;
          if (btn.dataset.action === 'increase') val = Math.min(20, val + 1);
          else val = Math.max(1, val - 1);
          input.value = val;
          updateQty(item.id, val);
          renderCartPage();
        });
      });
      input.addEventListener('change', () => {
        updateQty(item.id, input.value);
        renderCartPage();
      });

      row.querySelector('.cart-remove').addEventListener('click', () => {
        removeFromCart(item.id);
        renderCartPage();
      });
    });

    if (subtotalEl) subtotalEl.textContent = `$${cartTotal(cart).toFixed(2)}`;

    if (checkoutBtn) {
      checkoutBtn.onclick = async () => {
        if (checkoutError) {
          checkoutError.hidden = true;
          checkoutError.textContent = '';
        }
        const original = checkoutBtn.textContent;
        checkoutBtn.disabled = true;
        checkoutBtn.textContent = 'Redirecting to checkout…';

        try {
          const res = await fetch('/checkout/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: getCart().map(i => ({ id: i.id, qty: i.qty })),
            }),
          });
          const data = await res.json();
          if (!res.ok || !data.url) {
            throw new Error(data.error || 'Could not start checkout. Please try again.');
          }
          window.location.href = data.url;
        } catch (err) {
          if (checkoutError) {
            checkoutError.textContent = err.message || 'Something went wrong. Please try again.';
            checkoutError.hidden = false;
          }
          checkoutBtn.disabled = false;
          checkoutBtn.textContent = original;
        }
      };
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateCartBadge();

    // Bind all "Add to Cart" buttons (product page + product cards)
    document.querySelectorAll('.add-to-cart').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const id = btn.dataset.id;
        const name = btn.dataset.name;
        const price = btn.dataset.price;
        const image = btn.dataset.image;
        if (!id) return;

        let qty = 1;
        const qtyInput = document.getElementById('product-qty');
        if (qtyInput) qty = qtyInput.value;

        addToCart({ id, name, price, image }, qty);
        flashAdded(btn);
      });
    });

    renderCartPage();

    // Clear cart after a successful checkout
    if (document.getElementById('checkout-success')) {
      clearCart();
    }
  });
})();
