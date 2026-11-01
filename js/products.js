import { supabase } from './supabase-client.js';
import { addToCart, updateCartCount } from './cart.js';

const PRODUCT_CATEGORIES = [
  'All Collections',
  'Premium Collection',
  'Top Selling Collection',
  'Ladies Collection',
  "Men's Collection"
];

const ITEMS_PER_PAGE = 10;
let currentPage = 1;
let allProducts = [];
let currentFilteredProducts = [];
let selectedCategory = 'All Collections';
let productImageMap = {};
let productRatingMap = {};

function normalizeCategory(value) {
  if (!value) return 'Premium Collection';
  const cleaned = String(value).trim();
  if (cleaned === 'All Collections') return 'All Collections';
  return cleaned;
}

function getProductImage(product) {
  const images = productImageMap[product.id] || [];
  const preferred = images.find(image => image.is_primary) || images[0] || null;
  if (preferred?.image_url) return preferred.image_url;
  return product.image_url || 'https://via.placeholder.com/300x200?text=Watch';
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildCategoryNavigation() {
  const categoryNav = document.getElementById('categoryNav');
  if (!categoryNav) return;

  categoryNav.innerHTML = PRODUCT_CATEGORIES.map(category => `
    <button
      type="button"
      class="category-chip ${selectedCategory === category ? 'active' : ''}"
      data-category="${escapeHtml(category)}"
      onclick="applyCategoryFilter('${category.replace(/'/g, "\\'")}')"
    >
      ${category}
    </button>
  `).join('');
}

async function loadProductImages() {
  try {
    const { data, error } = await supabase
      .from('product_images')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) throw error;

    productImageMap = {};
    (data || []).forEach((image) => {
      if (!productImageMap[image.product_id]) {
        productImageMap[image.product_id] = [];
      }
      productImageMap[image.product_id].push(image);
    });
  } catch (err) {
    productImageMap = {};
  }
}

async function loadProductRatings() {
  try {
    const { data, error } = await supabase
      .from('product_reviews')
      .select('product_id, rating')
      .eq('published', true);

    if (error || !data) {
      productRatingMap = {};
      return;
    }

    productRatingMap = {};
    data.forEach((r) => {
      if (!productRatingMap[r.product_id]) {
        productRatingMap[r.product_id] = { sum: 0, count: 0 };
      }
      productRatingMap[r.product_id].sum += Number(r.rating || 0);
      productRatingMap[r.product_id].count += 1;
    });
  } catch (err) {
    productRatingMap = {};
  }
}

async function loadProducts() {
  const loading = document.getElementById('loading');

  try {
    await Promise.all([loadProductImages(), loadProductRatings()]);

    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .eq('in_stock', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    allProducts = products || [];
    if (loading) loading.style.display = 'none';
    buildCategoryNavigation();
    applyCategoryFilter(selectedCategory, false);

  } catch (err) {
    loading.innerHTML = `
      <div class="icon">❌</div>
      <p>Failed to load products. Please refresh.</p>`;
    console.error('Error:', err);
  }
}

function renderProducts(products) {
  const grid = document.getElementById('productsGrid');
  const emptyState = document.getElementById('emptyState');

  if (!grid) return;
  grid.innerHTML = '';

  if (products.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  products.forEach(product => {
    const imageUrl = getProductImage(product);
    const category = normalizeCategory(product.category);

    const ratingInfo = productRatingMap[product.id];
    let ratingBadge = '';
    if (ratingInfo && ratingInfo.count > 0) {
      const avg = (ratingInfo.sum / ratingInfo.count).toFixed(1);
      ratingBadge = `
        <div class="product-card-rating">
          <i class="fas fa-star"></i> <span>${avg}</span> <small>(${ratingInfo.count})</small>
        </div>`;
    }

    const card = document.createElement('div');
    card.className = 'product-card';
    card.innerHTML = `
      <img
        src="${imageUrl}"
        alt="${escapeHtml(product.name)}"
        onclick="goToProduct('${product.id}')"
        onerror="this.src='https://via.placeholder.com/300x200?text=No+Image'"
      >
      <div class="product-info">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <p class="product-category">${category}</p>
          ${ratingBadge}
        </div>
        <p class="product-name" onclick="goToProduct('${product.id}')">${escapeHtml(product.name)}</p>
        <p class="product-price">PKR ${Number(product.price).toLocaleString()}</p>
        ${product.in_stock
          ? `<button class="btn-add-cart"
               onclick="handleAddToCart('${product.id}', '${product.name.replace(/'/g, "\\'")}', ${product.price}, '${String(imageUrl).replace(/'/g, "\\'")}')">
               🛒 Add to Cart
             </button>`
          : `<button class="out-of-stock" disabled>Out of Stock</button>`
        }
      </div>
    `;
    grid.appendChild(card);
  });
}

function renderPagination(totalItems, page, totalPages, startIndex, endIndex) {
  const wrapper = document.getElementById('paginationWrapper');
  if (!wrapper) return;

  if (totalItems <= ITEMS_PER_PAGE || totalPages <= 1) {
    wrapper.innerHTML = totalItems > 0 ? `
      <div class="pagination-info">Showing all ${totalItems} products</div>
    ` : '';
    return;
  }

  let pageButtonsHtml = '';
  const maxButtons = 5;
  let startPage = Math.max(1, page - Math.floor(maxButtons / 2));
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);

  if (endPage - startPage + 1 < maxButtons) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }

  if (startPage > 1) {
    pageButtonsHtml += `
      <button class="pagination-btn" onclick="changePage(1)">1</button>
      ${startPage > 2 ? '<span class="pagination-dots">…</span>' : ''}
    `;
  }

  for (let p = startPage; p <= endPage; p++) {
    pageButtonsHtml += `
      <button class="pagination-btn ${p === page ? 'active' : ''}" onclick="changePage(${p})">
        ${p}
      </button>
    `;
  }

  if (endPage < totalPages) {
    pageButtonsHtml += `
      ${endPage < totalPages - 1 ? '<span class="pagination-dots">…</span>' : ''}
      <button class="pagination-btn" onclick="changePage(${totalPages})">${totalPages}</button>
    `;
  }

  wrapper.innerHTML = `
    <div class="pagination-controls">
      <button
        class="pagination-btn prev-btn"
        onclick="changePage(${page - 1})"
        ${page === 1 ? 'disabled' : ''}
        aria-label="Previous page"
      >
        ‹ Previous
      </button>

      <div class="pagination-pages">
        ${pageButtonsHtml}
      </div>

      <button
        class="pagination-btn next-btn"
        onclick="changePage(${page + 1})"
        ${page === totalPages ? 'disabled' : ''}
        aria-label="Next page"
      >
        Next ›
      </button>
    </div>

    <div class="pagination-info">
      Showing <strong>${startIndex + 1}–${endIndex}</strong> of <strong>${totalItems}</strong> products
    </div>
  `;
}

function renderProductsPage() {
  const totalItems = currentFilteredProducts.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;

  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems);
  const pageProducts = currentFilteredProducts.slice(startIndex, endIndex);

  renderProducts(pageProducts);
  renderPagination(totalItems, currentPage, totalPages, startIndex, endIndex);

  const productCountEl = document.getElementById('productCount');
  if (productCountEl) {
    productCountEl.textContent = `${totalItems} product${totalItems === 1 ? '' : 's'}`;
  }
}

window.changePage = function (page) {
  const totalPages = Math.ceil(currentFilteredProducts.length / ITEMS_PER_PAGE) || 1;
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  renderProductsPage();

  document.querySelector('.products-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.applyCategoryFilter = function (category, shouldScroll = true) {
  selectedCategory = normalizeCategory(category);
  buildCategoryNavigation();

  const query = document.getElementById('searchInput')?.value.toLowerCase().trim() || '';
  currentFilteredProducts = allProducts.filter((product) => {
    const matchesCategory = selectedCategory === 'All Collections' || normalizeCategory(product.category) === selectedCategory;
    const matchesSearch = !query || product.name.toLowerCase().includes(query) || (product.description || '').toLowerCase().includes(query);
    return matchesCategory && matchesSearch;
  });

  currentPage = 1;
  renderProductsPage();

  if (shouldScroll) {
    document.querySelector('.products-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

window.goToProduct = function (id) {
  localStorage.setItem('watchmart_product_id', id);
  window.location.href = 'product.html';
};

window.handleAddToCart = function (id, name, price, imageUrl) {
  addToCart({ id, name, price: Number(price), imageUrl });
  showToast(`✅ "${name}" added to cart!`);
};

const searchInput = document.getElementById('searchInput');
if (searchInput) {
  searchInput.addEventListener('input', function () {
    const query = this.value.toLowerCase().trim();
    currentFilteredProducts = allProducts.filter((product) => {
      const matchesCategory = selectedCategory === 'All Collections' || normalizeCategory(product.category) === selectedCategory;
      const matchesSearch = !query || product.name.toLowerCase().includes(query) || (product.description || '').toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });

    currentPage = 1;
    renderProductsPage();
  });
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

loadProducts();
updateCartCount();