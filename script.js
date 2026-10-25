document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;
  const header = document.querySelector('.site-header');
  const navToggle = document.querySelector('.menu-toggle');
  const navLinks = document.querySelector('.nav-links');
  const cartToggle = document.querySelector('[data-cart-toggle]');
  const cartDrawer = document.querySelector('.cart-drawer');
  const cartClose = document.querySelector('.cart-close');
  const cartCount = document.querySelector('.cart-count');
  const cartItemsList = document.querySelector('.cart-items');
  const cartSubtotal = document.querySelector('[data-cart-total]');
  const cartNote = document.querySelector('.cart-note');
  const checkoutForm = document.querySelector('#checkout-form');
  const consultationForm = document.querySelector('#consultation-form');
  const contactForm = document.querySelector('#contact-form');
  const searchInput = document.querySelector('#product-search');
  const filterButtons = document.querySelectorAll('[data-filter]');
  const productCards = document.querySelectorAll('.product-card');

  const isGitHubPages = location.hostname.endsWith('.github.io');
  const STORAGE_KEY = 'pooja-rajputt-cart';
  let cart;
  try {
    const savedCart = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    cart = Array.isArray(savedCart) ? savedCart.flatMap((item) => {
      const product = [...productCards].find((card) => card.dataset.productId === item?.id);
      if (!product || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
        return [];
      }
      return [{
        id: product.dataset.productId,
        name: product.dataset.productName,
        price: Number(product.dataset.productPrice),
        quantity: item.quantity
      }];
    }) : [];
  } catch (error) {
    console.error('Could not read the saved cart:', error);
    cart = [];
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function saveCart() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch (error) {
      console.error('Could not save the cart:', error);
    }
    renderCart();
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(value);
  }

  function getCartItemCount() {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }

  function renderCart() {
    if (!cartItemsList || !cartCount || !cartSubtotal) return;

    cartCount.textContent = getCartItemCount();

    if (!cart.length) {
      cartItemsList.innerHTML = '<div class="cart-empty">Your cart is empty.</div>';
      cartSubtotal.textContent = formatCurrency(0);
      if (checkoutForm) checkoutForm.querySelector('button[type="submit"]').disabled = true;
      if (cartNote) {
        cartNote.textContent = isGitHubPages
          ? 'Online order requests are unavailable on this free static website.'
          : 'Add spiritual essentials to begin your ritual shopping.';
      }
      return;
    }

    if (checkoutForm) {
      checkoutForm.querySelector('button[type="submit"]').disabled = isGitHubPages;
    }
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    cartSubtotal.textContent = formatCurrency(total);

    if (cartNote) {
      cartNote.textContent = isGitHubPages
        ? 'Your cart is saved in this browser; online order requests are unavailable.'
        : `${getCartItemCount()} item${getCartItemCount() === 1 ? '' : 's'} selected`;
    }

    cartItemsList.innerHTML = cart
      .map(
        (item) => `
          <div class="cart-item" data-id="${item.id}">
            <div class="cart-item-info">
              <div class="cart-item-name">${escapeHtml(item.name)}</div>
              <div class="cart-item-price">${formatCurrency(item.price)} each</div>
            </div>
            <div class="quantity-controls">
              <button class="qty-btn" type="button" data-action="decrease" data-id="${item.id}">−</button>
              <span>${item.quantity}</span>
              <button class="qty-btn" type="button" data-action="increase" data-id="${item.id}">+</button>
            </div>
            <button class="cart-item-remove" type="button" data-action="remove" data-id="${item.id}">Remove</button>
          </div>
        `
      )
      .join('');
  }

  function addToCart(button) {
    const product = button.closest('.product-card');
    if (!product) return;

    const id = product.dataset.productId;
    const name = product.dataset.productName;
    const price = Number(product.dataset.productPrice);

    const existing = cart.find((item) => item.id === id);
    if (existing) {
      existing.quantity += 1;
    } else {
      cart.push({ id, name, price, quantity: 1 });
    }

    saveCart();
    openCart();
  }

  function updateQuantity(id, delta) {
    const item = cart.find((entry) => entry.id === id);
    if (!item) return;

    item.quantity += delta;
    if (item.quantity <= 0) {
      cart = cart.filter((entry) => entry.id !== id);
    }

    saveCart();
  }

  function removeFromCart(id) {
    cart = cart.filter((item) => item.id !== id);
    saveCart();
  }

  function openCart() {
    if (cartDrawer) cartDrawer.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeCart() {
    if (cartDrawer) cartDrawer.classList.remove('open');
    document.body.style.overflow = '';
  }

  function setActiveFilter(button) {
    filterButtons.forEach((item) => item.classList.toggle('active', item === button));
  }

  function filterProducts() {
    const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
    const searchValue = searchInput ? searchInput.value.trim().toLowerCase() : '';

    productCards.forEach((card) => {
      const category = card.dataset.productCategory || '';
      const title = card.dataset.productName || '';
      const matchesFilter = activeFilter === 'all' || category === activeFilter;
      const matchesSearch = !searchValue || title.toLowerCase().includes(searchValue);
      card.style.display = matchesFilter && matchesSearch ? 'block' : 'none';
    });
  }

  function showFormMessage(input, type, message) {
    const formStatus = input.closest('form')?.querySelector('.form-status');
    if (!formStatus) return;

    formStatus.textContent = message;
    formStatus.classList.remove('success', 'error');
    formStatus.classList.add(type === 'success' ? 'success' : 'error');
  }

  async function sendFormData(form, endpoint, payload) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Request could not be completed. Please try again.');
    }
    return result;
  }

  async function validateConsultationForm(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const name = form.querySelector('#consult-name').value.trim();
    const phone = form.querySelector('#consult-phone').value.trim();
    const service = form.querySelector('#consult-service').value;
    const message = form.querySelector('#consult-message').value.trim();

    if (!name || !phone || !service || !message) {
      showFormMessage(form, 'error', 'Please fill in all consultation details.');
      return;
    }

    if (phone.length < 7) {
      showFormMessage(form, 'error', 'Please enter a valid phone number.');
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
      const result = await sendFormData(form, '/api/consultations', { name, phone, service, message });
      showFormMessage(form, 'success', result.message);
      form.reset();
    } catch (error) {
      showFormMessage(form, 'error', error.message || 'Could not submit your enquiry. Please try again.');
    } finally {
      submitButton.disabled = false;
    }
  }

  async function validateContactForm(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const name = form.querySelector('#contact-name').value.trim();
    const email = form.querySelector('#contact-email').value.trim();
    const message = form.querySelector('#contact-message').value.trim();

    if (!name || !email || !message) {
      showFormMessage(form, 'error', 'Please complete the name, email and message fields.');
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      showFormMessage(form, 'error', 'Please enter a valid email address.');
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
      const result = await sendFormData(form, '/api/contact', { name, email, message });
      showFormMessage(form, 'success', result.message);
      form.reset();
    } catch (error) {
      showFormMessage(form, 'error', error.message || 'Could not send your message. Please try again.');
    } finally {
      submitButton.disabled = false;
    }
  }

  async function submitOrder(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!cart.length) {
      showFormMessage(form, 'error', 'Add a product to your cart before placing an order.');
      return;
    }

    const name = form.querySelector('#order-name').value.trim();
    const phone = form.querySelector('#order-phone').value.trim();
    const address = form.querySelector('#order-address').value.trim();
    if (!name || !phone || !address || phone.length < 7) {
      showFormMessage(form, 'error', 'Enter your name, a valid phone number, and delivery address.');
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
      const result = await sendFormData(form, '/api/orders', {
        name,
        phone,
        address,
        items: cart.map(({ id, quantity }) => ({ id, quantity }))
      });
      showFormMessage(form, 'success', `${result.message} Total: ${formatCurrency(result.orderTotal)}.`);
      form.reset();
      cart = [];
      saveCart();
    } catch (error) {
      showFormMessage(form, 'error', error.message || 'Could not place the order. Please try again.');
    } finally {
      submitButton.disabled = !cart.length;
    }
  }

  function setupWhatsAppButtons() {
    document.querySelectorAll('[data-whatsapp]').forEach((button) => {
      const message = button.dataset.whatsapp || 'Namaste Pooja Mam, I would like to enquire';
      button.addEventListener('click', () => {
        const whatsappUrl = `https://wa.me/919876543210?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
      });
    });
  }

  function setupScrollNav() {
    document.querySelectorAll('a[href^="#"]').forEach((link) => {
      link.addEventListener('click', (event) => {
        const targetId = link.getAttribute('href');
        if (!targetId || targetId === '#') return;

        const target = document.querySelector(targetId);
        if (!target) return;

        event.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });

        if (navLinks && navLinks.classList.contains('open')) {
          navLinks.classList.remove('open');
        }
      });
    });
  }

  if (header) {
    const onScroll = () => {
      if (window.scrollY > 16) {
        header.style.boxShadow = '0 10px 24px rgba(74, 23, 37, 0.06)';
      } else {
        header.style.boxShadow = 'none';
      }
    };

    window.addEventListener('scroll', onScroll);
    onScroll();
  }

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
    });
  }

  if (cartToggle) {
    cartToggle.addEventListener('click', openCart);
  }

  if (cartClose) {
    cartClose.addEventListener('click', closeCart);
  }

  if (cartDrawer) {
    cartDrawer.addEventListener('click', (event) => {
      if (event.target === cartDrawer) closeCart();
    });
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const actionElement = target.closest('[data-action]');
    if (actionElement) {
      const action = actionElement.dataset.action;
      const id = actionElement.dataset.id;

      if (action === 'increase') updateQuantity(id, 1);
      if (action === 'decrease') updateQuantity(id, -1);
      if (action === 'remove') removeFromCart(id);
    }

    const addButton = target.closest('[data-add-to-cart]');
    if (addButton) {
      addToCart(addButton);
    }

    const filterButton = target.closest('[data-filter]');
    if (filterButton) {
      setActiveFilter(filterButton);
      filterProducts();
    }
  });

  if (consultationForm) {
    consultationForm.addEventListener('submit', validateConsultationForm);
  }

  if (contactForm) {
    contactForm.addEventListener('submit', validateContactForm);
  }

  if (checkoutForm) {
    checkoutForm.addEventListener('submit', submitOrder);
  }

  if (isGitHubPages) {
    if (consultationForm) {
      consultationForm.querySelector('button[type="submit"]').disabled = true;
      showFormMessage(consultationForm, 'error', 'Online consultation bookings are unavailable on this free static website. Please contact Pooja Rajputt directly.');
    }
    if (contactForm) {
      contactForm.querySelector('button[type="submit"]').disabled = true;
      showFormMessage(contactForm, 'error', 'Online contact messages are unavailable on this free static website. Please contact Pooja Rajputt directly.');
    }
  }

  if (searchInput) {
    searchInput.addEventListener('input', filterProducts);
  }

  filterButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.filter === 'all');
  });

  renderCart();
  setupWhatsAppButtons();
  setupScrollNav();
  filterProducts();

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeCart();
  });
});
