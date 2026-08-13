// ── CAPFIT Shopping Cart Manager (LocalStorage) ──

const Cart = (() => {
  const STORAGE_KEY = 'capfit_cart_v1';
  const FREE_SHIPPING_THRESHOLD = 39999;
  const _listeners = {};

  function on(event, fn) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(fn);
  }

  function emit(event, payload) {
    (_listeners[event] || []).forEach(fn => fn(payload));
  }

  function loadFromStorage() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('[Cart] Error reading localStorage cart:', e);
      return [];
    }
  }

  function saveToStorage(cartItems) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cartItems));
      emit('cart:updated', cartItems);
      updateCartBadgeUI();
    } catch (e) {
      console.error('[Cart] Error saving cart:', e);
    }
  }

  function getItemKey(productId, colorHex) {
    return `${productId}_${colorHex || 'default'}`;
  }

  function updateCartBadgeUI() {
    const items = loadFromStorage();
    const totalCount = items.reduce((acc, item) => acc + (item.quantity || 1), 0);
    const badges = document.querySelectorAll('.cart-badge');
    badges.forEach(b => {
      b.textContent = totalCount;
      b.style.display = totalCount > 0 ? 'inline-flex' : 'none';
    });
  }

  return {
    on,
    FREE_SHIPPING_THRESHOLD,

    getItems() {
      return loadFromStorage();
    },

    addToCart(product, quantity = 1, selectedColor = null) {
      if (!product || !product.id) return;
      const cart = loadFromStorage();
      const colorHex = selectedColor || (product.colores && product.colores[0]?.hex) || '#111111';
      const key = getItemKey(product.id, colorHex);

      const existingIndex = cart.findIndex(i => getItemKey(i.product.id, i.selectedColor?.hex) === key);

      if (existingIndex > -1) {
        cart[existingIndex].quantity = (cart[existingIndex].quantity || 1) + quantity;
      } else {
        const colorObj = typeof selectedColor === 'object' && selectedColor
          ? selectedColor
          : (product.colores?.find(c => c.hex === colorHex) || { name: 'Default', hex: colorHex });

        cart.push({
          key,
          product,
          quantity,
          selectedColor: colorObj,
          addedAt: Date.now()
        });
      }

      saveToStorage(cart);
      if (window.showToast) {
        window.showToast(`¡${product.nombre} agregado al carrito!`);
      }
    },

    removeFromCart(productId, colorHex = null) {
      let cart = loadFromStorage();
      cart = cart.filter(item => {
        if (item.product.id !== productId) return true;
        if (colorHex && item.selectedColor?.hex !== colorHex) return true;
        return false;
      });
      saveToStorage(cart);
    },

    updateQuantity(productId, colorHex, quantity) {
      const cart = loadFromStorage();
      const target = cart.find(i => i.product.id === productId && (!colorHex || i.selectedColor?.hex === colorHex));
      if (target) {
        if (quantity <= 0) {
          this.removeFromCart(productId, colorHex);
        } else {
          target.quantity = quantity;
          saveToStorage(cart);
        }
      }
    },

    clearCart() {
      saveToStorage([]);
    },

    getSubtotal() {
      const items = loadFromStorage();
      return items.reduce((sum, i) => sum + (i.product.precio || 0) * (i.quantity || 1), 0);
    },

    getItemCount() {
      const items = loadFromStorage();
      return items.reduce((count, i) => count + (i.quantity || 1), 0);
    },

    getFreeShippingProgress() {
      const subtotal = this.getSubtotal();
      if (subtotal >= FREE_SHIPPING_THRESHOLD) return 100;
      return Math.min(100, Math.round((subtotal / FREE_SHIPPING_THRESHOLD) * 100));
    },

    getFreeShippingRemaining() {
      const subtotal = this.getSubtotal();
      return Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
    },

    init() {
      updateCartBadgeUI();
    }
  };
})();

window.Cart = Cart;
window.addEventListener('DOMContentLoaded', () => Cart.init());
