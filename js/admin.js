const adminCurrency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const statusOptions = ['Aguardando pagamento demonstrativo', 'Em preparação (demo)', 'Enviado (demo)', 'Cancelado (demo)'];
let adminProducts = [];
let adminOrders = [];
let adminCoupons = [];

function html(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function moneyToCents(value) {
  const normalized = String(value ?? '').trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!normalized) return Number.NaN;

  let decimalValue = normalized;
  if (normalized.includes(',')) {
    decimalValue = normalized.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(normalized)) {
    decimalValue = normalized.replace(/\./g, '');
  }

  const amount = Number(decimalValue);
  return Number.isFinite(amount) ? Math.round(amount * 100) : Number.NaN;
}

function validImageSource(value) {
  const source = value.trim();
  if (source.startsWith('/') && !source.startsWith('//') && !source.includes('\\')) return true;
  try {
    const url = new URL(source);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && url !== '/api/admin/login') showLogin();
    throw new Error(data.error || 'Não foi possível concluir a solicitação.');
  }
  return data;
}

function showLogin() {
  document.getElementById('login-section').hidden = false;
  document.getElementById('dashboard').hidden = true;
  document.getElementById('admin-session').hidden = true;
}

function showDashboard(email) {
  document.getElementById('login-section').hidden = true;
  document.getElementById('dashboard').hidden = false;
  document.getElementById('admin-session').hidden = false;
  document.getElementById('admin-email').textContent = email;
  loadProducts().catch((error) => setMessage(error.message, true));
}

function setMessage(message, isError = false) {
  const element = document.getElementById('admin-message');
  element.textContent = message;
  element.classList.toggle('is-error', isError);
}

async function loadProducts() {
  adminProducts = await api('/api/admin/products');
  document.getElementById('products-table').innerHTML = adminProducts.map((product) => `
    <tr>
      <td><strong>${html(product.name)}</strong>${product.demo ? '<small>Catálogo demo</small>' : '<small>Cadastrado no painel</small>'}</td>
      <td>${html(product.category)}</td>
      <td>${adminCurrency.format(product.price_cents / 100)}</td>
      <td>${product.stock}</td>
      <td>${product.active ? 'Ativo' : 'Arquivado'}</td>
      <td><button class="table-action" data-product-action="edit" data-id="${product.id}">Editar</button>
      <button class="table-action" data-product-action="toggle" data-id="${product.id}">${product.active ? 'Arquivar' : 'Reativar'}</button></td>
    </tr>`).join('') || '<tr><td colspan="6">Nenhum produto.</td></tr>';
}

async function loadOrders() {
  adminOrders = await api('/api/admin/orders');
  const tbody = document.getElementById('orders-table');
  tbody.innerHTML = adminOrders.map((order) => `
    <tr>
      <td><strong>${html(order.order_code)}</strong><small>${new Date(order.created_at).toLocaleString('pt-BR')}</small></td>
      <td>${html(order.customer_name)}<small>${html(order.email)}</small></td>
      <td>${order.items.map((item) => `${item.quantity} × ${html(item.name)}`).join('<br>')}</td>
      <td>${adminCurrency.format(order.total_cents / 100)}<small>${html(order.payment_method)} · demo</small></td>
      <td><select class="order-status" data-order-id="${order.id}" aria-label="Status do pedido ${html(order.order_code)}">
        ${statusOptions.map((status) => `<option value="${html(status)}" ${status === order.status ? 'selected' : ''}>${html(status)}</option>`).join('')}
      </select></td>
    </tr>`).join('') || '<tr><td colspan="5">Nenhum pedido demonstrativo até agora.</td></tr>';
}

async function loadCoupons() {
  adminCoupons = await api('/api/admin/coupons');
  document.getElementById('coupons-table').innerHTML = adminCoupons.map((coupon) => {
    const discount = coupon.discount_type === 'percent'
      ? `${coupon.discount_value}%`
      : adminCurrency.format(coupon.discount_value / 100);
    const usage = coupon.usage_limit === null
      ? `${coupon.usage_count} · sem limite`
      : `${coupon.usage_count} / ${coupon.usage_limit}`;
    const expiresAt = coupon.expires_at ? new Date(coupon.expires_at).toLocaleString('pt-BR') : 'Sem validade';
    const expired = coupon.expires_at && Date.parse(coupon.expires_at) <= Date.now();
    const status = !coupon.active ? 'Inativo' : expired ? 'Expirado' : 'Ativo';
    return `<tr>
      <td><strong>${html(coupon.code)}</strong></td>
      <td>${discount}</td>
      <td>${adminCurrency.format(coupon.minimum_subtotal_cents / 100)}</td>
      <td>${usage}</td>
      <td>${html(expiresAt)}</td>
      <td>${status}</td>
      <td><button class="table-action" data-coupon-action="edit" data-id="${coupon.id}">Editar</button>
      <button class="table-action" data-coupon-action="toggle" data-id="${coupon.id}">${coupon.active ? 'Desativar' : 'Ativar'}</button>
      <button class="table-action" data-coupon-action="delete" data-id="${coupon.id}">Excluir</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="7">Nenhum cupom cadastrado.</td></tr>';
}

function closeProductForm() {
  const form = document.getElementById('product-form');
  form.reset();
  form.elements.id.value = '';
  form.hidden = true;
  document.getElementById('product-form-error').textContent = '';
}

function closeCouponForm() {
  const form = document.getElementById('coupon-form');
  form.reset();
  form.elements.id.value = '';
  form.elements.minimumSubtotal.value = '0';
  form.hidden = true;
  document.getElementById('coupon-form-error').textContent = '';
}

function updateCouponValueLabel() {
  const type = document.getElementById('coupon-form').elements.discountType.value;
  const label = document.getElementById('coupon-value-label');
  const input = label.querySelector('input');
  label.firstChild.textContent = type === 'percent' ? 'Desconto (%)' : 'Desconto (R$)';
  input.max = type === 'percent' ? '100' : '1000000';
  input.step = type === 'percent' ? '1' : '0.01';
}

function editCoupon(id) {
  const coupon = adminCoupons.find((item) => Number(item.id) === Number(id));
  if (!coupon) return;
  const form = document.getElementById('coupon-form');
  form.hidden = false;
  form.elements.id.value = coupon.id;
  form.elements.code.value = coupon.code;
  form.elements.discountType.value = coupon.discount_type;
  form.elements.discountValue.value = coupon.discount_type === 'percent'
    ? coupon.discount_value
    : (coupon.discount_value / 100).toFixed(2);
  form.elements.minimumSubtotal.value = (coupon.minimum_subtotal_cents / 100).toFixed(2);
  form.elements.usageLimit.value = coupon.usage_limit ?? '';
  form.elements.expiresAt.value = coupon.expires_at
    ? new Date(coupon.expires_at).toISOString().slice(0, 16)
    : '';
  document.getElementById('coupon-form-title').textContent = `Editar cupom ${coupon.code}`;
  updateCouponValueLabel();
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function editProduct(id) {
  const product = adminProducts.find((item) => Number(item.id) === Number(id));
  if (!product) return;
  const form = document.getElementById('product-form');
  form.hidden = false;
  form.elements.id.value = product.id;
  form.elements.name.value = product.name;
  form.elements.category.value = product.category;
  form.elements.price.value = (product.price_cents / 100).toFixed(2);
  form.elements.oldPrice.value = product.old_price_cents ? (product.old_price_cents / 100).toFixed(2) : '';
  form.elements.stock.value = product.stock;
  form.elements.badge.value = product.badge || '';
  form.elements.image.value = product.image;
  form.elements.description.value = product.description;
  document.getElementById('product-form-title').textContent = `Editar: ${product.name}`;
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.getElementById('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const error = document.getElementById('login-error');
  error.textContent = '';
  const submit = form.querySelector('button[type="submit"], button:not([type])');
  submit.disabled = true;
  try {
    const data = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email: form.elements.email.value, password: form.elements.password.value })
    });
    form.reset();
    showDashboard(data.email);
  } catch (requestError) {
    error.textContent = requestError.message;
  } finally {
    submit.disabled = false;
  }
});

document.getElementById('logout-button').addEventListener('click', async () => {
  try {
    await api('/api/admin/logout', { method: 'POST' });
    showLogin();
  } catch (error) {
    setMessage(error.message, true);
  }
});

document.querySelectorAll('.admin-tab').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('.admin-tab').forEach((item) => {
    const active = item === tab;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('#dashboard > .admin-panel').forEach((panel) => {
    panel.hidden = panel.id !== `${tab.dataset.tab}-panel`;
  });
  if (tab.dataset.tab === 'orders') loadOrders().catch((error) => setMessage(error.message, true));
  if (tab.dataset.tab === 'coupons') loadCoupons().catch((error) => setMessage(error.message, true));
}));

document.getElementById('new-product').addEventListener('click', () => {
  closeProductForm();
  document.getElementById('product-form-title').textContent = 'Adicionar produto';
  document.getElementById('product-form').hidden = false;
  document.getElementById('product-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
document.getElementById('cancel-product').addEventListener('click', closeProductForm);
document.getElementById('product-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  const error = document.getElementById('product-form-error');
  error.textContent = '';
  const payload = {
    name: values.name.trim(), category: values.category, description: values.description.trim(),
    priceCents: moneyToCents(values.price), oldPriceCents: values.oldPrice ? moneyToCents(values.oldPrice) : null,
    image: values.image.trim(), badge: values.badge.trim(), stock: Number(values.stock)
  };
  if (!validImageSource(payload.image)) {
    error.textContent = 'Informe uma URL HTTPS válida ou um caminho local iniciado por /.';
    form.elements.image.setAttribute('aria-invalid', 'true');
    form.elements.image.focus();
    return;
  }
  form.elements.image.removeAttribute('aria-invalid');
  if (!Number.isSafeInteger(payload.priceCents) || payload.priceCents < 1 ||
      (payload.oldPriceCents !== null && (!Number.isSafeInteger(payload.oldPriceCents) || payload.oldPriceCents < 0))) {
    error.textContent = 'Informe os valores em reais, por exemplo 5000 ou 5.000,00.';
    return;
  }
  try {
    const id = values.id;
    await api(id ? `/api/admin/products/${id}` : '/api/admin/products', {
      method: id ? 'PUT' : 'POST', body: JSON.stringify(payload)
    });
    closeProductForm();
    await loadProducts();
    setMessage(id ? 'Produto atualizado.' : 'Produto cadastrado.');
  } catch (requestError) {
    error.textContent = requestError.message;
  }
});

document.getElementById('products-table').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-product-action]');
  if (!button) return;
  const product = adminProducts.find((item) => Number(item.id) === Number(button.dataset.id));
  if (!product) return;
  if (button.dataset.productAction === 'edit') {
    editProduct(product.id);
    return;
  }
  try {
    await api(`/api/admin/products/${product.id}`, {
      method: 'PUT', body: JSON.stringify({ active: !product.active })
    });
    await loadProducts();
    setMessage(product.active ? 'Produto arquivado (não removido do histórico).' : 'Produto reativado.');
  } catch (error) {
    setMessage(error.message, true);
  }
});

document.getElementById('orders-table').addEventListener('change', async (event) => {
  const select = event.target.closest('[data-order-id]');
  if (!select) return;
  try {
    await api(`/api/admin/orders/${select.dataset.orderId}`, {
      method: 'PATCH', body: JSON.stringify({ status: select.value })
    });
    setMessage('Status demonstrativo atualizado.');
  } catch (error) {
    setMessage(error.message, true);
    loadOrders().catch((loadError) => setMessage(loadError.message, true));
  }
});
document.getElementById('refresh-orders').addEventListener('click', () => loadOrders().then(() => setMessage('Lista atualizada.')).catch((error) => setMessage(error.message, true)));

document.getElementById('new-coupon').addEventListener('click', () => {
  closeCouponForm();
  document.getElementById('coupon-form-title').textContent = 'Adicionar cupom';
  document.getElementById('coupon-form').hidden = false;
  updateCouponValueLabel();
  document.getElementById('coupon-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
document.getElementById('cancel-coupon').addEventListener('click', closeCouponForm);
document.getElementById('coupon-form').elements.discountType.addEventListener('change', updateCouponValueLabel);
document.getElementById('coupon-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  const error = document.getElementById('coupon-form-error');
  error.textContent = '';
  const payload = {
    code: values.code.trim().toUpperCase(),
    discountType: values.discountType,
    discountValue: values.discountType === 'percent' ? Number(values.discountValue) : moneyToCents(values.discountValue),
    minimumSubtotalCents: moneyToCents(values.minimumSubtotal || 0),
    usageLimit: values.usageLimit ? Number(values.usageLimit) : null,
    expiresAt: values.expiresAt ? new Date(values.expiresAt).toISOString() : null
  };
  try {
    const id = values.id;
    await api(id ? `/api/admin/coupons/${id}` : '/api/admin/coupons', {
      method: id ? 'PUT' : 'POST', body: JSON.stringify(payload)
    });
    closeCouponForm();
    await loadCoupons();
    setMessage(id ? 'Cupom atualizado.' : 'Cupom cadastrado.');
  } catch (requestError) {
    error.textContent = requestError.message;
  }
});

document.getElementById('coupons-table').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-coupon-action]');
  if (!button) return;
  const coupon = adminCoupons.find((item) => Number(item.id) === Number(button.dataset.id));
  if (!coupon) return;
  if (button.dataset.couponAction === 'edit') {
    editCoupon(coupon.id);
    return;
  }
  try {
    if (button.dataset.couponAction === 'toggle') {
      await api(`/api/admin/coupons/${coupon.id}`, {
        method: 'PUT', body: JSON.stringify({ active: !coupon.active })
      });
      setMessage(coupon.active ? 'Cupom desativado.' : 'Cupom ativado.');
    } else if (button.dataset.couponAction === 'delete') {
      if (!window.confirm(`Excluir o cupom ${coupon.code}?`)) return;
      await api(`/api/admin/coupons/${coupon.id}`, { method: 'DELETE' });
      setMessage('Cupom excluído.');
    }
    await loadCoupons();
  } catch (error) {
    setMessage(error.message, true);
  }
});

api('/api/admin/me').then((data) => showDashboard(data.email)).catch(() => showLogin());
