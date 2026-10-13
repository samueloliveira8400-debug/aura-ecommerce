const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const CART_KEY = 'aura-cart-v1';
const FAVORITES_KEY = 'aura-favorites-v1';
const categoryNames = { perfumes: 'Perfumes', cosmeticos: 'Beleza & cuidados', smartphones: 'Tecnologia' };
let products = [];
let activeFilter = 'todos';
let searchQuery = '';
let toastTimer;
let appliedCoupon = null;

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function updateFavoritesCount() {
  const count = [...favorites].filter((id) => productById(id)).length;
  document.getElementById('favorites-count').textContent = count;
  document.getElementById('favorites-open').setAttribute('aria-label', `Ver favoritos, ${count} ${count === 1 ? 'produto' : 'produtos'}`);
  document.getElementById('favorites-modal-count').textContent = count ? `(${count})` : '';
}

function renderFavorites() {
  const favoriteProducts = products.filter((product) => favorites.has(Number(product.id)));
  const container = document.getElementById('favorite-items');
  container.innerHTML = favoriteProducts.map((product) => `
    <article class="favorite-card" data-favorite-card="${product.id}">
      <button class="favorite-card-image" type="button" data-favorite-action="details" data-id="${product.id}" aria-label="Ver detalhes de ${escapeHTML(product.name)}">
        <img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}" loading="lazy">
      </button>
      <div class="favorite-card-copy">
        <span class="product-category">${escapeHTML(categoryNames[product.category] || 'Seleção especial')}</span>
        <button class="favorite-card-title" type="button" data-favorite-action="details" data-id="${product.id}">${escapeHTML(product.name)}</button>
        <strong>${currency.format(product.price_cents / 100)}</strong>
        <div class="favorite-card-actions">
          <button class="button button-dark" type="button" data-favorite-action="add" data-id="${product.id}">Adicionar à sacola</button>
          <button class="favorite-remove" type="button" data-favorite-action="remove" data-id="${product.id}">Remover</button>
        </div>
      </div>
    </article>
  `).join('');
  document.getElementById('favorites-empty').hidden = favoriteProducts.length > 0;
  container.hidden = favoriteProducts.length === 0;
}

const storedCart = readStorage(CART_KEY, []);
let cart = Array.isArray(storedCart)
  ? storedCart.filter((item) => item && typeof item === 'object' &&
    Number.isSafeInteger(item.id) && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 20)
  : [];
const storedFavorites = readStorage(FAVORITES_KEY, []);
let favorites = new Set(Array.isArray(storedFavorites)
  ? storedFavorites.filter((id) => Number.isSafeInteger(id))
  : []);

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function saveCart() {
  if (appliedCoupon) {
    appliedCoupon = null;
    const codeInput = document.getElementById('coupon-code');
    const message = document.getElementById('coupon-message');
    if (codeInput) codeInput.value = '';
    if (message) message.textContent = 'A sacola mudou. Aplique o cupom novamente.';
  }
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  renderCart();
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

function productById(id) {
  return products.find((product) => Number(product.id) === Number(id));
}

function renderProducts() {
  const grid = document.getElementById('product-grid');
  const empty = document.getElementById('empty-state');
  const term = searchQuery.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let filtered = products.filter((product) => {
    const matchesCategory = activeFilter === 'todos' ||
      (activeFilter === 'favoritos' ? favorites.has(Number(product.id)) : product.category === activeFilter);
    const searchable = `${product.name} ${product.description} ${categoryNames[product.category] || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return matchesCategory && (!term || searchable.includes(term));
  });
  const sort = document.getElementById('sort-select').value;
  if (sort === 'price-asc') filtered.sort((a, b) => a.price_cents - b.price_cents);
  if (sort === 'price-desc') filtered.sort((a, b) => b.price_cents - a.price_cents);
  if (sort === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  document.getElementById('results-message').textContent = `${filtered.length} ${filtered.length === 1 ? 'produto encontrado' : 'produtos encontrados'}`;
  document.getElementById('collection-title').textContent = activeFilter === 'favoritos' ? 'Seus favoritos' : 'A curadoria da estação';
  empty.querySelector('h3').textContent = activeFilter === 'favoritos' ? 'Você ainda não salvou favoritos' : 'Nenhum resultado por aqui';
  empty.querySelector('p').textContent = activeFilter === 'favoritos'
    ? 'Toque no coração de um produto para encontrá-lo aqui.'
    : 'Tente buscar por outro nome ou categoria.';
  document.getElementById('reset-search').textContent = activeFilter === 'favoritos' ? 'Ver todos os produtos' : 'Limpar busca';
  empty.hidden = filtered.length > 0;
  grid.hidden = filtered.length === 0;
  grid.innerHTML = filtered.map((product) => `
    <article class="product-card" data-product-card="${product.id}">
      <div class="product-image-wrap" data-action="details" data-id="${product.id}" tabindex="0" role="button" aria-label="Ver detalhes de ${escapeHTML(product.name)}">
        <img class="product-image" src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}" loading="lazy">
        ${product.badge ? `<span class="product-badge">${escapeHTML(product.badge)}</span>` : ''}
        <button class="favorite-button${favorites.has(Number(product.id)) ? ' is-favorite' : ''}" data-action="favorite" data-id="${product.id}" aria-label="${favorites.has(Number(product.id)) ? 'Remover dos' : 'Adicionar aos'} favoritos" aria-pressed="${favorites.has(Number(product.id))}">${favorites.has(Number(product.id)) ? '♥' : '♡'}</button>
        <button class="quick-add" data-action="add" data-id="${product.id}">Adicionar à sacola</button>
      </div>
      <div class="product-meta">
        <span class="product-category">${escapeHTML(categoryNames[product.category] || 'Seleção especial')}</span>
        <button class="product-title plain-button" data-action="details" data-id="${product.id}">${escapeHTML(product.name)}</button>
        <div class="product-price"><span>${currency.format(product.price_cents / 100)}</span>${product.old_price_cents ? `<del>${currency.format(product.old_price_cents / 100)}</del>` : ''}</div>
        <div class="product-demo">${product.demo ? 'Produto de catálogo demonstrativo' : 'Produto cadastrado no painel demonstrativo'}</div>
      </div>
    </article>
  `).join('');
}

function updateCartCount() {
  const quantity = cart.reduce((sum, item) => sum + item.quantity, 0);
  document.getElementById('cart-count').textContent = quantity;
  document.getElementById('cart-open').setAttribute('aria-label', `Abrir sacola, ${quantity} ${quantity === 1 ? 'item' : 'itens'}`);
  document.getElementById('drawer-count').textContent = `(${quantity})`;
}

function renderCart() {
  cart = cart.filter((item) => productById(item.id) && Number.isInteger(item.quantity) && item.quantity > 0);
  const container = document.getElementById('cart-items');
  const subtotal = cart.reduce((sum, item) => {
    const product = productById(item.id);
    return sum + (product ? product.price_cents * item.quantity : 0);
  }, 0);
  const quantity = cart.reduce((sum, item) => sum + item.quantity, 0);
  container.innerHTML = cart.map((item) => {
    const product = productById(item.id);
    return `<article class="cart-item">
      <img src="${escapeHTML(product.image)}" alt="">
      <div><h3 class="cart-item-name">${escapeHTML(product.name)}</h3><div class="cart-item-price">${currency.format(product.price_cents / 100)}</div>
      <div class="quantity-control" aria-label="Quantidade de ${escapeHTML(product.name)}">
        <button data-cart-action="decrease" data-id="${product.id}" aria-label="Diminuir quantidade">−</button><span>${item.quantity}</span>
        <button data-cart-action="increase" data-id="${product.id}" aria-label="Aumentar quantidade">+</button>
      </div></div>
      <button class="cart-item-remove" data-cart-action="remove" data-id="${product.id}">Remover</button>
    </article>`;
  }).join('');
  document.getElementById('cart-empty').hidden = quantity > 0;
  document.getElementById('cart-summary').hidden = quantity === 0;
  document.getElementById('cart-subtotal').textContent = currency.format(subtotal / 100);
  document.getElementById('shipping-message').textContent = subtotal >= 25000
    ? 'Você ganhou frete demonstrativo grátis!'
    : `Faltam ${currency.format((25000 - subtotal) / 100)} para o frete demonstrativo grátis.`;
  updateCartCount();
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function addToCart(id) {
  const product = productById(id);
  if (!product) return;
  const current = cart.find((item) => Number(item.id) === Number(id));
  if (current) current.quantity = Math.min(20, current.quantity + 1);
  else cart.push({ id: Number(id), quantity: 1 });
  saveCart();
  showToast(`${product.name} adicionado à sacola.`);
}

function openOverlay(element) {
  document.getElementById('overlay').hidden = false;
  element.hidden = false;
  document.body.classList.add('has-overlay');
  const close = element.querySelector('[data-close]');
  if (close) close.focus();
}

function closeOverlays() {
  document.getElementById('overlay').hidden = true;
  document.querySelectorAll('.cart-drawer, .modal').forEach((element) => { element.hidden = true; });
  document.body.classList.remove('has-overlay');
}

function openProductDetails(id) {
  const product = productById(id);
  if (!product) return;
  document.getElementById('product-detail').innerHTML = `
    <div class="product-detail">
      <img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}">
      <div class="product-detail-copy">
        <span class="product-category">${escapeHTML(categoryNames[product.category] || 'Seleção especial')}</span>
        <h2 id="product-modal-title">${escapeHTML(product.name)}</h2>
        <div class="product-price"><span>${currency.format(product.price_cents / 100)}</span>${product.old_price_cents ? `<del>${currency.format(product.old_price_cents / 100)}</del>` : ''}</div>
        <p>${escapeHTML(product.description)}</p>
        <p class="product-demo">Produto demonstrativo. Imagem ilustrativa e disponibilidade fictícia.</p>
        <button class="button button-dark" data-action="add" data-id="${product.id}">Adicionar à sacola <span aria-hidden="true">→</span></button>
      </div>
    </div>`;
  openOverlay(document.getElementById('product-modal'));
}

function goToCheckoutStep(step) {
  document.querySelectorAll('.checkout-step').forEach((section) => { section.hidden = Number(section.dataset.step) !== step; });
  document.getElementById('checkout-step-label').textContent = step === 1 ? 'Seus dados' : 'Pagamento mock';
  document.querySelectorAll('.step-dot').forEach((dot, index) => dot.classList.toggle('is-current', index < step));
  document.querySelector('.checkout-steps').setAttribute('aria-label', `Etapa ${step} de 2`);
}

function estimateShipping(postalCode, subtotal) {
  if (subtotal >= 25000) return 0;
  const digits = postalCode.replace(/\D/g, '');
  return Number(digits.slice(-1)) % 2 === 0 ? 1490 : 1990;
}

function updateCheckoutTotals() {
  const form = document.getElementById('checkout-form');
  const values = Object.fromEntries(new FormData(form).entries());
  const subtotal = cart.reduce((sum, item) => sum + productById(item.id).price_cents * item.quantity, 0);
  const shipping = estimateShipping(values.postalCode || '', subtotal);
  const discount = appliedCoupon ? appliedCoupon.discountCents : 0;
  document.getElementById('checkout-subtotal').textContent = currency.format(subtotal / 100);
  document.getElementById('checkout-shipping').textContent = currency.format(shipping / 100);
  document.getElementById('checkout-total').textContent = currency.format((subtotal - discount + shipping) / 100);
  document.getElementById('coupon-discount-row').hidden = !appliedCoupon;
  document.getElementById('checkout-discount').textContent = `− ${currency.format(discount / 100)}`;
  document.getElementById('coupon-applied-code').textContent = appliedCoupon ? `(${appliedCoupon.code})` : '';
}

async function loadProducts() {
  const response = await fetch('/api/products');
  if (!response.ok) throw new Error('Não foi possível carregar o catálogo.');
  products = await response.json();
  updateFavoritesCount();
  renderProducts();
  renderCart();
}

document.getElementById('product-grid').addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const id = Number(target.dataset.id);
  if (target.dataset.action === 'add') {
    event.stopPropagation();
    addToCart(id);
  } else if (target.dataset.action === 'details') {
    openProductDetails(id);
  } else if (target.dataset.action === 'favorite') {
    event.stopPropagation();
    if (favorites.has(id)) favorites.delete(id);
    else favorites.add(id);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
    updateFavoritesCount();
    renderProducts();
    if (!document.getElementById('favorites-modal').hidden) renderFavorites();
    showToast(favorites.has(id) ? 'Adicionado aos favoritos.' : 'Removido dos favoritos.');
  }
});
document.getElementById('product-detail').addEventListener('click', (event) => {
  const target = event.target.closest('[data-action="add"]');
  if (!target) return;
  addToCart(Number(target.dataset.id));
});
document.getElementById('product-grid').addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-action="details"]')) {
    event.preventDefault();
    openProductDetails(event.target.dataset.id);
  }
});
document.getElementById('cart-items').addEventListener('click', (event) => {
  const button = event.target.closest('[data-cart-action]');
  if (!button) return;
  const item = cart.find((entry) => Number(entry.id) === Number(button.dataset.id));
  if (!item) return;
  if (button.dataset.cartAction === 'remove') cart = cart.filter((entry) => entry !== item);
  if (button.dataset.cartAction === 'increase') item.quantity = Math.min(20, item.quantity + 1);
  if (button.dataset.cartAction === 'decrease') item.quantity -= 1;
  saveCart();
});

document.getElementById('search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  searchQuery = document.getElementById('search-input').value.trim();
  renderProducts();
  document.getElementById('colecao').scrollIntoView({ behavior: 'smooth' });
});
document.getElementById('search-input').addEventListener('input', (event) => {
  searchQuery = event.target.value.trim();
  renderProducts();
});
document.querySelectorAll('[data-filter], [data-category]').forEach((button) => {
  button.addEventListener('click', (event) => {
    if (button.tagName === 'A') event.preventDefault();
    activeFilter = button.dataset.filter || button.dataset.category;
    document.querySelectorAll('.filter-chip').forEach((chip) => {
      const isActive = chip.dataset.filter === activeFilter;
      chip.classList.toggle('is-active', isActive);
      chip.setAttribute('aria-pressed', String(isActive));
    });
    renderProducts();
    if (button.tagName === 'A') document.getElementById('colecao').scrollIntoView({ behavior: 'smooth' });
  });
});
document.getElementById('clear-filters').addEventListener('click', (event) => {
  event.preventDefault();
  activeFilter = 'todos';
  searchQuery = '';
  document.getElementById('search-input').value = '';
  document.querySelectorAll('.filter-chip').forEach((chip) => {
    const active = chip.dataset.filter === 'todos';
    chip.classList.toggle('is-active', active);
    chip.setAttribute('aria-pressed', String(active));
  });
  renderProducts();
});
document.getElementById('sort-select').addEventListener('change', renderProducts);
document.getElementById('reset-search').addEventListener('click', () => {
  searchQuery = '';
  activeFilter = 'todos';
  document.getElementById('search-input').value = '';
  document.querySelector('[data-filter="todos"]').click();
});

document.getElementById('favorites-open').addEventListener('click', () => {
  renderFavorites();
  openOverlay(document.getElementById('favorites-modal'));
});

document.getElementById('favorite-items').addEventListener('click', (event) => {
  const button = event.target.closest('[data-favorite-action]');
  if (!button) return;
  const id = Number(button.dataset.id);
  if (button.dataset.favoriteAction === 'details') {
    openProductDetails(id);
    return;
  }
  if (button.dataset.favoriteAction === 'add') {
    addToCart(id);
    return;
  }
  if (button.dataset.favoriteAction === 'remove') {
    favorites.delete(id);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
    updateFavoritesCount();
    renderFavorites();
    renderProducts();
    showToast('Removido dos favoritos.');
  }
});

document.getElementById('cart-open').addEventListener('click', () => openOverlay(document.getElementById('cart-drawer')));
document.getElementById('account-open').addEventListener('click', () => {
  document.getElementById('account-results').innerHTML = '';
  openOverlay(document.getElementById('account-modal'));
});
document.getElementById('checkout-open').addEventListener('click', () => {
  if (!cart.length) return;
  document.getElementById('checkout-error').textContent = '';
  document.getElementById('checkout-success').hidden = true;
  document.getElementById('checkout-form').hidden = false;
  document.getElementById('coupon-message').textContent = '';
  goToCheckoutStep(1);
  document.getElementById('checkout-modal').querySelector('.checkout-heading').hidden = false;
  closeOverlays();
  openOverlay(document.getElementById('checkout-modal'));
});
document.getElementById('overlay').addEventListener('click', closeOverlays);
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', closeOverlays));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeOverlays(); });

document.getElementById('checkout-next').addEventListener('click', () => {
  const form = document.getElementById('checkout-form');
  const requiredFields = [...form.querySelectorAll('[data-step="1"] input[required]')];
  const invalid = requiredFields.find((field) => !field.reportValidity());
  if (invalid) return;
  updateCheckoutTotals();
  document.getElementById('checkout-error').textContent = '';
  goToCheckoutStep(2);
  document.querySelector('.checkout-step[data-step="2"] h3').focus?.();
});
document.getElementById('checkout-back').addEventListener('click', () => goToCheckoutStep(1));

document.getElementById('apply-coupon').addEventListener('click', async () => {
  const codeInput = document.getElementById('coupon-code');
  const message = document.getElementById('coupon-message');
  const code = codeInput.value.trim().toUpperCase();
  message.textContent = '';
  if (!code) {
    message.textContent = 'Digite o código do cupom.';
    return;
  }
  const button = document.getElementById('apply-coupon');
  button.disabled = true;
  try {
    const response = await fetch('/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, items: cart.map(({ id, quantity }) => ({ id, quantity })) })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível validar este cupom.');
    appliedCoupon = { code: result.code, discountCents: result.discountCents };
    message.textContent = `Cupom aplicado: desconto de ${currency.format(result.discountCents / 100)}.`;
    document.getElementById('remove-coupon').hidden = false;
    updateCheckoutTotals();
  } catch (error) {
    appliedCoupon = null;
    document.getElementById('remove-coupon').hidden = true;
    updateCheckoutTotals();
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.getElementById('remove-coupon').addEventListener('click', () => {
  appliedCoupon = null;
  document.getElementById('coupon-code').value = '';
  document.getElementById('coupon-message').textContent = 'Cupom removido.';
  document.getElementById('remove-coupon').hidden = true;
  updateCheckoutTotals();
});

document.getElementById('checkout-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  const subtotal = cart.reduce((sum, item) => sum + productById(item.id).price_cents * item.quantity, 0);
  const payload = {
    customer: { name: values.name, email: values.email, phone: values.phone },
    address: {
      postalCode: values.postalCode, state: values.state.toUpperCase(), street: values.street,
      number: values.number, complement: values.complement, neighborhood: values.neighborhood, city: values.city
    },
    items: cart.map(({ id, quantity }) => ({ id, quantity })),
    paymentMethod: values.paymentMethod,
    couponCode: appliedCoupon ? appliedCoupon.code : undefined
  };
  const submit = document.getElementById('place-order');
  const error = document.getElementById('checkout-error');
  submit.disabled = true;
  submit.textContent = 'Registrando pedido demonstrativo…';
  error.textContent = '';
  try {
    const response = await fetch('/api/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível registrar o pedido.');
    document.getElementById('checkout-form').hidden = true;
    document.querySelector('.checkout-heading').hidden = true;
    document.getElementById('checkout-success').hidden = false;
    document.getElementById('checkout-success').innerHTML = `
      <div class="success-icon" aria-hidden="true">✧</div><h3>Seu pedido de demonstração está registrado.</h3>
      <p>Nenhuma cobrança ou transação real foi realizada. Você pode consultar este pedido usando ${escapeHTML(values.email)} em “Minha conta”.</p>
      <div class="order-result"><strong>Pedido ${escapeHTML(result.orderCode)}</strong><br>${result.couponCode ? `Cupom ${escapeHTML(result.couponCode)}: − ${currency.format(result.discountCents / 100)}<br>` : ''}Total simulado: ${currency.format(result.totalCents / 100)}<br>Status: ${escapeHTML(result.status)}</div>
      <button class="button button-dark" type="button" id="finish-order">Voltar à loja</button>`;
    cart = [];
    saveCart();
    document.getElementById('finish-order').addEventListener('click', closeOverlays);
  } catch (requestError) {
    error.textContent = requestError.message;
  } finally {
    submit.disabled = false;
    submit.innerHTML = 'Concluir pedido demonstrativo <span aria-hidden="true">→</span>';
  }
});

document.getElementById('account-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = document.getElementById('account-email').value.trim();
  const results = document.getElementById('account-results');
  results.textContent = 'Buscando pedidos…';
  try {
    const response = await fetch(`/api/account/orders?email=${encodeURIComponent(email)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível consultar seus pedidos.');
    if (!data.orders.length) {
      results.innerHTML = '<p class="account-order">Nenhum pedido demonstrativo encontrado para este e-mail.</p>';
      return;
    }
    results.innerHTML = data.orders.map((order) => `<article class="account-order">
      <strong>Pedido ${escapeHTML(order.orderCode)}</strong><span>${new Date(`${order.createdAt.replace(' ', 'T')}Z`).toLocaleDateString('pt-BR')} · ${currency.format(order.totalCents / 100)}</span>
      <span>${escapeHTML(order.status)}</span><p>${order.items.map((item) => `${item.quantity} × ${escapeHTML(item.name)}`).join('<br>')}</p>
    </article>`).join('');
  } catch (error) {
    results.textContent = error.message;
  }
});

document.getElementById('newsletter-form').addEventListener('submit', (event) => {
  event.preventDefault();
  document.getElementById('newsletter-message').textContent = 'Obrigado! Nesta demonstração, seu e-mail não foi armazenado.';
  event.currentTarget.reset();
});

loadProducts().catch((error) => {
  document.getElementById('results-message').textContent = error.message;
  document.getElementById('empty-state').hidden = false;
  document.getElementById('empty-state').querySelector('h3').textContent = 'Não foi possível carregar a loja';
});
