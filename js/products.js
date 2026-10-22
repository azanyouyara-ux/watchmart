import { supabase } from './supabase-client.js';
import { addToCart, updateCartCount } from './cart.js';

const PRODUCT_CATEGORIES = [
  'All Collections',
  'Premium Collection',
  'Top Selling Collection',
  'Ladies Collection',
  "Men's Collection"
];

let allProducts = [];
let selectedCategory = 'All Collections';
let productImageMap = {};

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

async function loadProducts() {
  const loading = document.getElementById('loading');
  const grid = document.getElementById('productsGrid');

  try {
    await loadProductImages();

    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .eq('in_stock', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    allProducts = products || [];
    loading.style.display = 'none';
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

  grid.innerHTML = '';

  if (products.length === 0) {
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  products.forEach(product => {
    const imageUrl = getProductImage(product);
    const category = normalizeCategory(product.category);

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
        <p class="product-category">${category}</p>
        <p class="product-name">${escapeHtml(product.name)}</p>
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

window.applyCategoryFilter = function (category, shouldScroll = true) {
  selectedCategory = normalizeCategory(category);
  buildCategoryNavigation();

  const query = document.getElementById('searchInput')?.value.toLowerCase().trim() || '';
  const filtered = allProducts.filter((product) => {
    const matchesCategory = selectedCategory === 'All Collections' || normalizeCategory(product.category) === selectedCategory;
    const matchesSearch = !query || product.name.toLowerCase().includes(query) || (product.description || '').toLowerCase().includes(query);
    return matchesCategory && matchesSearch;
  });

  renderProducts(filtered);
  document.getElementById('productCount').textContent = `${filtered.length} products`;

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
    const filtered = allProducts.filter((product) => {
      const matchesCategory = selectedCategory === 'All Collections' || normalizeCategory(product.category) === selectedCategory;
      const matchesSearch = !query || product.name.toLowerCase().includes(query) || (product.description || '').toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });

    renderProducts(filtered);
    document.getElementById('productCount').textContent = `${filtered.length} products`;
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