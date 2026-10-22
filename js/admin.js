import { supabase } from './supabase-client.js';

let allOrders = [];
let currentProductImages = [];
let selectedReviewId = null;

const PRODUCT_CATEGORIES = [
  'Premium Collection',
  'Top Selling Collection',
  'Ladies Collection',
  "Men's Collection"
];

function formatCurrency(value) {
  return `PKR ${Number(value || 0).toLocaleString()}`;
}

function getVisibleOrders(orders) {
  return (orders || []).filter((order) => !order.is_deleted && !order.deleted_at);
}

function getOrderStatus(order) {
  return String(order?.status || 'pending').toLowerCase();
}

function isRevenueEligible(order) {
  if (order.is_deleted || order.deleted_at || order.exclude_from_revenue) return false;
  const status = getOrderStatus(order);
  return ['confirmed', 'completed'].includes(status);
}

function renderProductImageManager() {
  const manager = document.getElementById('productImageManager');
  if (!manager) return;

  if (currentProductImages.length === 0) {
    manager.innerHTML = '<div style="color:#888; font-size:0.85rem;">No saved images yet.</div>';
    return;
  }

  manager.innerHTML = currentProductImages.map((image, index) => `
    <div class="manager-image-card">
      <img src="${image.image_url}" alt="Product image ${index + 1}" onerror="this.src='https://via.placeholder.com/200x120?text=Image'">
      <div class="image-actions">
        <button type="button" data-action="primary" data-index="${index}">${image.is_primary ? 'Main' : 'Set main'}</button>
        <button type="button" data-action="move-left" data-index="${index}">←</button>
        <button type="button" data-action="move-right" data-index="${index}">→</button>
        <button type="button" data-action="remove" data-index="${index}">Remove</button>
      </div>
    </div>
  `).join('');
}

async function loadProductImagesForProduct(productId) {
  currentProductImages = [];
  if (!productId) return;

  try {
    const { data, error } = await supabase
      .from('product_images')
      .select('*')
      .eq('product_id', productId)
      .order('sort_order', { ascending: true });

    if (!error) {
      currentProductImages = data || [];
      if (currentProductImages.length > 0 && !currentProductImages.some((image) => image.is_primary)) {
        currentProductImages[0].is_primary = true;
      }
    }
  } catch (err) {
    currentProductImages = [];
  }

  renderProductImageManager();
}

async function uploadProductImage(file) {
  const STORAGE_BUCKET = 'product-images';
  if (!file) return '';

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Only JPG, PNG, WEBP, and GIF images are allowed.');
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Image size must be under 5MB.');
  }

  const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(fileName, file, {
    cacheControl: '3600',
    upsert: false
  });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message || 'Unknown storage error.'}`);
  }

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fileName);
  return data?.publicUrl || '';
}

function syncProductImageManagerEvents() {
  const manager = document.getElementById('productImageManager');
  if (!manager) return;

  manager.onclick = (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const index = Number(button.dataset.index);
    const action = button.dataset.action;

    if (action === 'remove') {
      currentProductImages = currentProductImages.filter((_, idx) => idx !== index);
      if (currentProductImages.length > 0 && !currentProductImages.some((image) => image.is_primary)) {
        currentProductImages[0].is_primary = true;
      }
      renderProductImageManager();
      return;
    }

    if (action === 'primary') {
      currentProductImages = currentProductImages.map((image, idx) => ({ ...image, is_primary: idx === index }));
      renderProductImageManager();
      return;
    }

    if (action === 'move-left') {
      if (index <= 0) return;
      [currentProductImages[index - 1], currentProductImages[index]] = [currentProductImages[index], currentProductImages[index - 1]];
      renderProductImageManager();
    }

    if (action === 'move-right') {
      if (index >= currentProductImages.length - 1) return;
      [currentProductImages[index], currentProductImages[index + 1]] = [currentProductImages[index + 1], currentProductImages[index]];
      renderProductImageManager();
    }
  };
}

function resetProductModal() {
  document.getElementById('modalTitle').textContent = 'Add New Product';
  document.getElementById('editProductId').value = '';
  document.getElementById('pName').value = '';
  document.getElementById('pPrice').value = '';
  document.getElementById('pDesc').value = '';
  document.getElementById('pImageUrl').value = '';
  document.getElementById('pImageFiles').value = '';
  document.getElementById('pCategory').value = 'Premium Collection';
  document.getElementById('pInStock').checked = true;
  currentProductImages = [];
  renderProductImageManager();
}

async function syncProductImages(productId, imageList, primaryUrl) {
  if (!productId || imageList.length === 0) return;

  try {
    const { data: existingRows } = await supabase
      .from('product_images')
      .select('*')
      .eq('product_id', productId);

    const keepIds = new Set(imageList.filter((image) => image.id).map((image) => image.id));
    const toDelete = (existingRows || []).filter((row) => !keepIds.has(row.id));

    if (toDelete.length > 0) {
      await supabase.from('product_images').delete().in('id', toDelete.map((row) => row.id));
    }

    const normalized = imageList.map((image, index) => ({
      id: image.id || null,
      product_id: productId,
      image_url: image.image_url || primaryUrl,
      sort_order: index,
      is_primary: image.image_url === primaryUrl || (!primaryUrl && index === 0)
    }));

    for (const image of normalized) {
      if (image.id) {
        await supabase
          .from('product_images')
          .update({
            image_url: image.image_url,
            sort_order: image.sort_order,
            is_primary: image.is_primary
          })
          .eq('id', image.id);
      } else {
        const { id: _unused, ...imagePayload } = image;
        await supabase.from('product_images').insert([imagePayload]);
      }
    }
  } catch (err) {
    console.warn('Image sync skipped because the image table is not available yet:', err);
  }
}

// =============================================
// LOGIN PAGE LOGIC
// =============================================
if (document.getElementById('loginBtn')) {
  const errorBox = document.getElementById('errorBox');
  const successBox = document.getElementById('successBox');
  const loginBtn = document.getElementById('loginBtn');
  const debugBox = document.getElementById('debugBox');

  async function checkConnection() {
    try {
      const { error } = await supabase
        .from('products')
        .select('id')
        .limit(1);

      if (error && error.code !== 'PGRST116') {
        debugBox.innerHTML = `
          <p>❌ <strong>Connection Error:</strong></p>
          <p style="color:red;">${error.message}</p>
        `;
      } else {
        debugBox.innerHTML = `
          <p>✅ <strong>Supabase Connected!</strong></p>
          <p>Enter your credentials to login</p>
        `;
        debugBox.style.background = '#d4edda';
        debugBox.style.color = '#155724';
      }
    } catch (err) {
      debugBox.innerHTML = `
        <p>❌ <strong>Failed to connect:</strong></p>
        <p style="color:red;">${err.message}</p>
      `;
    }
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    window.location.href = 'dashboard.html';
  }

  window.login = async function () {
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;

    errorBox.style.display = 'none';
    successBox.style.display = 'none';

    if (!email || !password) {
      errorBox.textContent = '⚠️ Please enter email and password!';
      errorBox.style.display = 'block';
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = '⏳ Signing in...';

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        let errorMsg = '❌ Login failed. ';
        if (error.message.includes('Invalid login')) {
          errorMsg += 'Wrong email or password!';
        } else if (error.message.includes('Email not confirmed')) {
          errorMsg += 'Please confirm your email first.';
        } else if (error.status === 400) {
          errorMsg += 'Bad request — Check your Supabase keys!';
        } else {
          errorMsg += error.message;
        }

        errorBox.textContent = errorMsg;
        errorBox.style.display = 'block';
      } else {
        successBox.textContent = '✅ Login successful! Redirecting...';
        successBox.style.display = 'block';
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 1000);
      }
    } catch (err) {
      errorBox.textContent = `❌ Unexpected error: ${err.message}`;
      errorBox.style.display = 'block';
    }

    loginBtn.disabled = false;
    loginBtn.textContent = '🔐 Sign In';
  };

  checkConnection();
}

// =============================================
// DASHBOARD PAGE LOGIC
// =============================================
if (document.getElementById('section-dashboard')) {
  async function init() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      window.location.href = 'index.html';
      return;
    }

    const adminEmail = document.getElementById('adminEmail');
    if (adminEmail) adminEmail.textContent = session.user.email;

    await loadStats();
    await loadAdminProducts();
    await loadOrders();
    await loadReviewsForAdmin();
  }

  window.logout = async function () {
    await supabase.auth.signOut();
    window.location.href = 'index.html';
  };

  window.showSection = function (section) {
    ['dashboard', 'products', 'reviews', 'orders'].forEach((item) => {
      const sectionEl = document.getElementById(`section-${item}`);
      const navEl = document.getElementById(`nav-${item}`);
      if (sectionEl) sectionEl.style.display = 'none';
      if (navEl) navEl.classList.remove('active');
    });

    const activeSection = document.getElementById(`section-${section}`);
    const activeNav = document.getElementById(`nav-${section}`);
    if (activeSection) activeSection.style.display = 'block';
    if (activeNav) activeNav.classList.add('active');
  };

  async function loadStats() {
    const { data: orders } = await supabase.from('orders').select('*');
    const { data: products } = await supabase.from('products').select('id');

    if (!orders) return;

    const visibleOrders = getVisibleOrders(orders);
    const total = visibleOrders.length;
    const revenue = visibleOrders.filter(isRevenueEligible).reduce((sum, order) => sum + Number(order.total || 0), 0);
    const pending = visibleOrders.filter((order) => getOrderStatus(order) === 'pending').length;
    const completed = visibleOrders.filter((order) => getOrderStatus(order) === 'completed').length;

    const totalOrdersEl = document.getElementById('stat-total-orders');
    const revenueEl = document.getElementById('stat-revenue');
    const pendingEl = document.getElementById('stat-pending');
    const completedEl = document.getElementById('stat-completed');
    const productsEl = document.getElementById('stat-products');

    if (totalOrdersEl) totalOrdersEl.textContent = total;
    if (revenueEl) revenueEl.textContent = formatCurrency(revenue);
    if (pendingEl) pendingEl.textContent = pending;
    if (completedEl) completedEl.textContent = completed;
    if (productsEl) productsEl.textContent = products?.length || 0;

    const badge = document.getElementById('pendingBadge');
    if (pending > 0 && badge) {
      badge.textContent = pending;
      badge.style.display = 'inline';
    } else if (badge) {
      badge.style.display = 'none';
    }

    const recent = [...visibleOrders]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5);

    const recentOrdersList = document.getElementById('recentOrdersList');
    if (recentOrdersList) {
      recentOrdersList.innerHTML = recent.length === 0
        ? '<p style="color:#888; text-align:center; padding:20px;">No orders yet.</p>'
        : recent.map((order) => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid #f5f5f5;">
              <div>
                <p style="font-weight:600; color:var(--primary);">${order.customer_name}</p>
                <p style="color:#888; font-size:0.82rem;">${new Date(order.created_at).toLocaleDateString()}</p>
              </div>
              <div style="text-align:right;">
                <p style="font-weight:bold; color:var(--danger);">${formatCurrency(order.total)}</p>
                <span class="badge badge-${getOrderStatus(order)}">${getOrderStatus(order).toUpperCase()}</span>
              </div>
            </div>`).join('');
    }
  }

  async function loadAdminProducts() {
    const grid = document.getElementById('adminProductsGrid');
    if (!grid) return;

    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !products) {
      grid.innerHTML = '<p style="color:red;">Failed to load products.</p>';
      return;
    }

    if (products.length === 0) {
      grid.innerHTML = `
        <div style="text-align:center; padding:60px; color:#888; grid-column:1/-1;">
          <div style="font-size:3rem;">📦</div>
          <p>No products yet. Add your first product!</p>
        </div>`;
      return;
    }

    const imageMap = {};
    try {
      const { data: imageRows } = await supabase.from('product_images').select('*');
      (imageRows || []).forEach((image) => {
        if (!imageMap[image.product_id]) imageMap[image.product_id] = [];
        imageMap[image.product_id].push(image);
      });
    } catch (err) {
      // ignored if migration not applied yet
    }

    grid.innerHTML = products.map((product) => {
      const productImages = imageMap[product.id] || [];
      const mainImage = (productImages.find((image) => image.is_primary) || productImages[0])?.image_url || product.image_url || 'https://via.placeholder.com/300x160?text=Watch';
      const productCategory = product.category || 'Premium Collection';

      return `
        <div class="admin-product-card">
          <img src="${mainImage}"
               alt="${product.name}"
               onerror="this.src='https://via.placeholder.com/300x160?text=Watch'">
          <div class="p-body">
            <p class="p-name">${product.name}</p>
            <p class="p-category" style="font-size:0.75rem; color:#666; font-weight:700; margin-bottom:8px;">🏷️ ${productCategory}</p>
            <p class="p-price">${formatCurrency(product.price)}</p>
            <span class="badge ${product.in_stock ? 'badge-completed' : 'badge-cancelled'}">
              ${product.in_stock ? '✅ In Stock' : '❌ Out of Stock'}
            </span>
            <div class="card-actions">
              <button class="btn-edit" onclick="editProduct(${JSON.stringify(product).replace(/"/g, '&quot;')})">
                ✏️ Edit
              </button>
              <button class="btn-delete" onclick="deleteProduct('${product.id}')">
                🗑️ Delete
              </button>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  window.openProductModal = function () {
    resetProductModal();
    document.getElementById('productModal').style.display = 'block';
  };

  window.editProduct = async function (product) {
    document.getElementById('modalTitle').textContent = 'Edit Product';
    document.getElementById('editProductId').value = product.id;
    document.getElementById('pName').value = product.name;
    document.getElementById('pPrice').value = product.price;
    document.getElementById('pDesc').value = product.description || '';
    document.getElementById('pImageUrl').value = product.image_url || '';
    document.getElementById('pCategory').value = product.category || 'Premium Collection';
    document.getElementById('pInStock').checked = product.in_stock;
    currentProductImages = [];
    await loadProductImagesForProduct(product.id);
    document.getElementById('productModal').style.display = 'block';
  };

  window.closeModal = function () {
    document.getElementById('productModal').style.display = 'none';
  };

  window.saveProduct = async function () {
    const id = document.getElementById('editProductId').value;
    const name = document.getElementById('pName').value.trim();
    const price = Number(document.getElementById('pPrice').value);
    const description = document.getElementById('pDesc').value.trim();
    const inStock = document.getElementById('pInStock').checked;
    const category = document.getElementById('pCategory').value || 'Premium Collection';
    const pastedUrl = document.getElementById('pImageUrl').value.trim();
    const selectedFiles = Array.from(document.getElementById('pImageFiles').files || []);

    if (!name || !price) {
      alert('⚠️ Product name and price are required!');
      return;
    }

    const progress = document.getElementById('uploadProgress');
    const sharedImages = [...currentProductImages];

    if (pastedUrl && !sharedImages.some((image) => image.image_url === pastedUrl)) {
      sharedImages.push({ id: null, image_url: pastedUrl, is_primary: sharedImages.length === 0, sort_order: sharedImages.length });
    }

    try {
      if (progress) progress.style.display = 'block';

      const uploadedUrls = await Promise.all(selectedFiles.map(async (file) => {
        const result = await uploadProductImage(file);
        return result || null;
      }));

      uploadedUrls.filter(Boolean).forEach((url) => {
        if (!sharedImages.some((image) => image.image_url === url)) {
          sharedImages.push({ id: null, image_url: url, is_primary: sharedImages.length === 0, sort_order: sharedImages.length });
        }
      });

      if (sharedImages.length > 0 && !sharedImages.some((image) => image.is_primary)) {
        sharedImages[0].is_primary = true;
      }

      const primaryImage = sharedImages.find((image) => image.is_primary) || sharedImages[0];
      const finalImageUrl = primaryImage?.image_url || '';

      const productData = {
        name,
        price,
        description,
        image_url: finalImageUrl,
        category,
        in_stock: inStock,
        updated_at: new Date().toISOString()
      };

      let savedProductId = id;
      if (id) {
        const { error: updateError } = await supabase.from('products').update(productData).eq('id', id);
        if (updateError) throw updateError;
      } else {
        const { data, error: insertError } = await supabase.from('products').insert([productData]).select('id').single();
        if (insertError) throw insertError;
        savedProductId = data.id;
      }

      await syncProductImages(savedProductId, sharedImages, finalImageUrl);

      if (progress) progress.style.display = 'none';
      alert(`✅ Product ${id ? 'updated' : 'added'} successfully!`);
      window.closeModal();
      await loadAdminProducts();
      await loadStats();
    } catch (err) {
      if (progress) progress.style.display = 'none';
      console.error('saveProduct failed:', err);
      alert(`❌ Failed to save product: ${err.message}`);
    }
  };

  window.deleteProduct = async function (id) {
    if (!confirm('⚠️ Are you sure you want to delete this product?')) return;

    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) {
      alert('❌ Failed to delete product.');
      return;
    }

    alert('🗑️ Product deleted successfully!');
    await loadAdminProducts();
    await loadStats();
  };

  async function loadOrders() {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      const container = document.getElementById('ordersContainer');
      if (container) {
        container.innerHTML = '<p style="color:red;">Failed to load orders.</p>';
      }
      return;
    }

    allOrders = getVisibleOrders(orders || []);
    renderOrders(allOrders);
  }

  function renderOrders(orders) {
    const container = document.getElementById('ordersContainer');
    if (!container) return;

    if (orders.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="icon">📭</div>
          <h3>No orders found</h3>
        </div>`;
      return;
    }

    container.innerHTML = orders.map((order) => {
      const date = new Date(order.created_at).toLocaleString('en-PK');
      const items = Array.isArray(order.items)
        ? order.items.map((item) => `${item.name} × ${item.quantity}`).join(', ')
        : '—';
      const status = getOrderStatus(order);

      return `
        <div class="order-card">
          <div class="order-header">
            <div>
              <p style="font-weight:800; color:var(--primary); font-size:1rem;">${order.customer_name}</p>
              <p class="order-id">Order ID: ${order.id}</p>
            </div>
            <div style="text-align:right;">
              <span class="badge badge-${status}">${status.toUpperCase()}</span>
              <p style="color:#888; font-size:0.82rem; margin-top:5px;">${date}</p>
            </div>
          </div>

          <div class="order-info">
            <div class="order-info-item"><strong>📱 Phone:</strong> ${order.customer_phone}</div>
            <div class="order-info-item"><strong>🏙️ City:</strong> ${order.customer_city}</div>
            <div class="order-info-item" style="grid-column:1/-1;"><strong>📍 Address:</strong> ${order.customer_address}</div>
            <div class="order-info-item" style="grid-column:1/-1;"><strong>📦 Items:</strong> ${items}</div>
            <div class="order-info-item"><strong>💳 Payment:</strong> ${order.payment_method?.toUpperCase()}</div>
            <div class="order-info-item"><strong>💰 Total:</strong> <span style="color:var(--danger); font-weight:bold;">${formatCurrency(order.total)}</span></div>
          </div>

          <div class="order-actions">
            <button class="btn-sm" style="background:#cce5ff; color:#004085;" onclick="updateStatus('${order.id}', 'confirmed')">✅ Confirm</button>
            <button class="btn-sm" style="background:#d4edda; color:#155724;" onclick="updateStatus('${order.id}', 'completed')">🚚 Completed</button>
            <button class="btn-sm" style="background:#f8d7da; color:#721c24;" onclick="updateStatus('${order.id}', 'cancelled')">❌ Cancel</button>
            <button class="btn-sm" style="background:#111827; color:white;" onclick="deleteOrder('${order.id}')">🗑️ Delete</button>
            <a href="https://wa.me/${String(order.customer_phone || '').replace(/[^0-9]/g, '')}" target="_blank" class="btn-sm" style="background:#25D366; color:white; text-decoration:none; display:inline-flex; align-items:center; gap:5px;">
              💬 WhatsApp
            </a>
          </div>
        </div>`;
    }).join('');
  }

  window.filterOrders = function () {
    const filter = document.getElementById('statusFilter')?.value || 'all';
    const filtered = filter === 'all'
      ? allOrders
      : allOrders.filter((order) => getOrderStatus(order) === filter);
    renderOrders(filtered);
  };

  window.updateStatus = async function (orderId, status) {
    const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
    if (error) {
      alert('❌ Status update failed.');
      return;
    }

    alert(`✅ Order marked as "${status}" successfully!`);
    await loadOrders();
    await loadStats();
  };

  window.deleteOrder = async function (orderId) {
    if (!confirm('⚠️ Delete this order? This removes it from the dashboard and revenue totals without touching unrelated records.')) return;

    try {
      const { error } = await supabase.from('orders').update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        exclude_from_revenue: true
      }).eq('id', orderId);

      if (error) throw error;
    } catch (err) {
      const { error: fallbackError } = await supabase.from('orders').delete().eq('id', orderId);
      if (fallbackError) {
        console.error('Delete order error:', fallbackError);
        alert('❌ Failed to delete order.');
        return;
      }
    }

    alert('🗑️ Order deleted successfully. Revenue and counts were refreshed.');
    await loadOrders();
    await loadStats();
  };

  async function loadReviewsForAdmin() {
    const productSelect = document.getElementById('reviewProductId');
    const reviewsList = document.getElementById('reviewsListAdmin');
    if (!productSelect || !reviewsList) return;

    try {
      const { data: products } = await supabase.from('products').select('id,name').order('created_at', { ascending: false });
      productSelect.innerHTML = '<option value="">Select product</option>' + (products || []).map((product) => `
        <option value="${product.id}">${product.name}</option>
      `).join('');

      const { data: reviews, error } = await supabase
        .from('product_reviews')
        .select('*')
        .order('review_date', { ascending: false });

      if (error) throw error;

      if (!reviews || reviews.length === 0) {
        reviewsList.innerHTML = '<div class="empty-state"><div class="icon">⭐</div><h3>No reviews yet</h3></div>';
        return;
      }

      reviewsList.innerHTML = reviews.map((review) => `
        <div class="review-item">
          <div class="review-item-header">
            <div>
              <strong>${review.reviewer_name}</strong>
              <div class="review-meta">${new Date(review.review_date || review.created_at).toLocaleDateString()} • ${review.rating}/5 stars</div>
            </div>
            <span class="badge ${review.published ? 'badge-completed' : 'badge-cancelled'}">${review.published ? 'Published' : 'Draft'}</span>
          </div>
          <p>${(review.review_text || '').replace(/\n/g, '<br>')}</p>
          <div class="review-actions">
            <button class="btn-sm" style="background:#cce5ff; color:#004085;" onclick="editReview(${JSON.stringify(review).replace(/"/g, '&quot;')})">✏️ Edit</button>
            <button class="btn-sm" style="background:#d4edda; color:#155724;" onclick="toggleReviewPublish('${review.id}', ${!review.published})">${review.published ? 'Hide' : 'Publish'}</button>
            <button class="btn-sm" style="background:#f8d7da; color:#721c24;" onclick="deleteReview('${review.id}')">🗑️ Delete</button>
          </div>
        </div>
      `).join('');
    } catch (err) {
      console.error('Review list failed:', err);
      reviewsList.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><h3>Review table not ready</h3><p>Run the SQL migration before managing reviews.</p></div>';
    }
  }

  window.resetReviewForm = function () {
    selectedReviewId = null;
    const productSelect = document.getElementById('reviewProductId');
    const reviewerName = document.getElementById('reviewerName');
    const reviewText = document.getElementById('reviewText');
    const reviewRating = document.getElementById('reviewRating');
    const reviewPublished = document.getElementById('reviewPublished');

    if (productSelect) productSelect.value = '';
    if (reviewerName) reviewerName.value = '';
    if (reviewText) reviewText.value = '';
    if (reviewRating) reviewRating.value = '5';
    if (reviewPublished) reviewPublished.checked = true;
  };

  window.editReview = function (review) {
    selectedReviewId = review.id;
    document.getElementById('reviewProductId').value = review.product_id;
    document.getElementById('reviewerName').value = review.reviewer_name;
    document.getElementById('reviewRating').value = String(review.rating || 5);
    document.getElementById('reviewText').value = review.review_text || '';
    document.getElementById('reviewPublished').checked = !!review.published;
    document.getElementById('section-reviews').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  window.saveReview = async function () {
    const productId = document.getElementById('reviewProductId').value;
    const reviewerName = document.getElementById('reviewerName').value.trim();
    const reviewText = document.getElementById('reviewText').value.trim();
    const rating = Number(document.getElementById('reviewRating').value);
    const published = document.getElementById('reviewPublished').checked;

    if (!productId || !reviewerName || !reviewText) {
      alert('⚠️ Please select a product, reviewer name, and review text.');
      return;
    }

    const payload = {
      product_id: productId,
      reviewer_name: reviewerName,
      review_text: reviewText,
      rating,
      published,
      review_date: new Date().toISOString()
    };

    try {
      if (selectedReviewId) {
        const { error } = await supabase.from('product_reviews').update(payload).eq('id', selectedReviewId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('product_reviews').insert([payload]);
        if (error) throw error;
      }

      alert('✅ Review saved successfully.');
      resetReviewForm();
      await loadReviewsForAdmin();
    } catch (err) {
      console.error('saveReview error:', err);
      alert('❌ Review could not be saved. Run the SQL migration or check your Supabase permissions.');
    }
  };

  window.toggleReviewPublish = async function (reviewId, publish) {
    try {
      const { error } = await supabase.from('product_reviews').update({ published: publish }).eq('id', reviewId);
      if (error) throw error;
      await loadReviewsForAdmin();
    } catch (err) {
      alert('❌ Could not update review visibility.');
    }
  };

  window.deleteReview = async function (reviewId) {
    if (!confirm('⚠️ Delete this review permanently?')) return;

    try {
      const { error } = await supabase.from('product_reviews').delete().eq('id', reviewId);
      if (error) throw error;
      await loadReviewsForAdmin();
    } catch (err) {
      alert('❌ Could not delete this review.');
    }
  };

  const productModal = document.getElementById('productModal');
  if (productModal) {
    const imageFilesInput = document.getElementById('pImageFiles');
    if (imageFilesInput) {
      imageFilesInput.addEventListener('change', () => {
        const extraFiles = Array.from(imageFilesInput.files || []);
        extraFiles.forEach((file) => {
          if (!file.type.startsWith('image/')) return;
          currentProductImages.push({ id: null, image_url: URL.createObjectURL(file), is_primary: currentProductImages.length === 0, sort_order: currentProductImages.length });
        });
        renderProductImageManager();
      });
    }
  }

  syncProductImageManagerEvents();
  init();
}
