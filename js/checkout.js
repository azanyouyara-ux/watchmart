// =============================================
// WATCHMART — CHECKOUT LOGIC
// js/checkout.js
// =============================================

import { supabase } from './supabase-client.js';
import { getCart, getCartTotals, clearCart, updateCartCount } from './cart.js';

// =============================================
// CONSTANTS
// =============================================
const ADMIN_WHATSAPP = '923140138233'; // ← Change to admin WhatsApp number

let selectedPayment = '';

// =============================================
// ON PAGE LOAD
// =============================================
document.addEventListener('DOMContentLoaded', () => {
  updateCartCount();
  renderOrderSummary();
  setupFormValidation();
});

// =============================================
// RENDER ORDER SUMMARY IN CHECKOUT PAGE
// =============================================
export function renderOrderSummary() {
  const cart = getCart();

  // If cart is empty → redirect home
  if (cart.length === 0) {
    window.location.href = 'index.html';
    return;
  }

  const { subtotal, delivery, total } = getCartTotals();

  // Render items list
  const listEl = document.getElementById('orderItemsList');
  if (listEl) {
    listEl.innerHTML = cart.map(item => `
      <div class="summary-row">
        <span>
          ${item.name}
          <span style="color:#888; font-size:0.85rem;">× ${item.quantity}</span>
        </span>
        <span style="font-weight:600; color:var(--primary);">
          PKR ${(item.price * item.quantity).toLocaleString()}
        </span>
      </div>
    `).join('');
  }

  // Update totals
  const subtotalEl = document.getElementById('chkSubtotal');
  const totalEl    = document.getElementById('chkTotal');

  if (subtotalEl) {
    subtotalEl.textContent = `PKR ${subtotal.toLocaleString()}`;
  }
  if (totalEl) {
    totalEl.innerHTML = `<strong>PKR ${total.toLocaleString()}</strong>`;
  }
}

// =============================================
// SELECT PAYMENT METHOD
// =============================================
export function selectPayment(method) {
  selectedPayment = method;

  // Remove selected class from all options
  document.querySelectorAll('.payment-option')
    .forEach(el => el.classList.remove('selected'));

  // Add selected class to chosen option
  const chosen = document.getElementById(`opt-${method}`);
  if (chosen) chosen.classList.add('selected');

  // Show WhatsApp section
  const waCard = document.getElementById('whatsappCard');
  if (waCard) {
    waCard.style.display = 'block';
    waCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Hide any previous error
  hideError();
}

// Make it global
window.selectPayment = selectPayment;

// =============================================
// VALIDATE FORM FIELDS
// =============================================
function validateForm() {
  const fields = [
    { id: 'custName',    label: 'Full Name'    },
    { id: 'custPhone',   label: 'Phone Number' },
    { id: 'custCity',    label: 'City'         },
    { id: 'custAddress', label: 'Address'      },
  ];

  for (const field of fields) {
    const el = document.getElementById(field.id);
    if (!el) continue;

    const value = el.value.trim();
    if (!value) {
      el.style.borderColor = 'var(--danger)';
      el.focus();
      showError(`⚠️ Please enter your ${field.label}!`);
      return false;
    } else {
      el.style.borderColor = '#eee';
    }
  }

  // Phone validation (basic)
  const phone = document.getElementById('custPhone')?.value.trim();
  if (phone && phone.replace(/[^0-9]/g, '').length < 10) {
    document.getElementById('custPhone').style.borderColor = 'var(--danger)';
    showError('⚠️ Please enter a valid phone number!');
    return false;
  }

  return true;
}

// =============================================
// SETUP REAL-TIME FORM VALIDATION
// =============================================
function setupFormValidation() {
  const fieldIds = ['custName', 'custPhone', 'custCity', 'custAddress'];
  fieldIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        if (el.value.trim()) {
          el.style.borderColor = '#eee';
          hideError();
        }
      });
    }
  });
}

// =============================================
// BUILD WHATSAPP MESSAGE
// =============================================
function buildWhatsAppMessage() {
  const name    = document.getElementById('custName')?.value.trim();
  const phone   = document.getElementById('custPhone')?.value.trim();
  const city    = document.getElementById('custCity')?.value.trim();
  const address = document.getElementById('custAddress')?.value.trim();

  const cart = getCart();
  const { subtotal, delivery, total } = getCartTotals();

  const itemLines = cart.map(item =>
    `  • ${item.name} × ${item.quantity} = PKR ${(item.price * item.quantity).toLocaleString()}`
  ).join('\n');

  const message = `
🛍️ *NEW ORDER — WATCHMART*
━━━━━━━━━━━━━━━━━━━━━━━
👤 *Customer Name:* ${name}
📱 *WhatsApp:* ${phone}
🏙️ *City:* ${city}
📍 *Address:* ${address}
━━━━━━━━━━━━━━━━━━━━━━━
📦 *Order Items:*
${itemLines}
━━━━━━━━━━━━━━━━━━━━━━━
💵 Subtotal:       PKR ${subtotal.toLocaleString()}
🚚 Delivery:       PKR ${delivery.toLocaleString()}
💰 *TOTAL PAYABLE: PKR ${total.toLocaleString()}*
━━━━━━━━━━━━━━━━━━━━━━━
💳 *Payment Via:* ${selectedPayment.toUpperCase()}
📸 *Sending payment screenshot now...*
━━━━━━━━━━━━━━━━━━━━━━━
  `.trim();

  return message;
}

// =============================================
// OPEN WHATSAPP
// =============================================
export function openWhatsApp() {
  if (!validateForm()) return;

  if (!selectedPayment) {
    showError('⚠️ Please select a payment method first!');
    return;
  }

  const message = buildWhatsAppMessage();
  const waUrl = `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(message)}`;
  window.open(waUrl, '_blank');
}

window.openWhatsApp = openWhatsApp;

// =============================================
// CONFIRM ORDER → SAVE TO SUPABASE
// =============================================
export async function confirmOrder() {
  // Validate all fields
  if (!validateForm()) return;

  if (!selectedPayment) {
    showError('⚠️ Please select a payment method first!');
    return;
  }

  const name    = document.getElementById('custName').value.trim();
  const phone   = document.getElementById('custPhone').value.trim();
  const city    = document.getElementById('custCity').value.trim();
  const address = document.getElementById('custAddress').value.trim();

  const cart = getCart();
  const { subtotal, delivery, total } = getCartTotals();

  // Show loading state on button
  const confirmBtn = document.getElementById('confirmBtn');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = '⏳ Placing Order...';
  }

  try {
    // Save order to Supabase
    const { error } = await supabase.from('orders').insert([{
      customer_name:    name,
      customer_phone:   phone,
      customer_city:    city,
      customer_address: address,
      items:            cart,
      subtotal:         subtotal,
      delivery_charge:  delivery,
      total:            total,
      payment_method:   selectedPayment,
      status:           'pending'
    }]);

    if (error) throw error;

    // Success → clear cart and redirect
    clearCart();
    window.location.href = 'order-success.html';

  } catch (err) {
    console.error('Order error:', err);
    showError('❌ Order could not be placed. Please check your connection and try again.');

    // Reset button
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = '✅ I Have Sent the Payment Screenshot';
    }
  }
}

window.confirmOrder = confirmOrder;

// =============================================
// ERROR HELPERS
// =============================================
function showError(message) {
  const errorEl = document.getElementById('orderError');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
    errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function hideError() {
  const errorEl = document.getElementById('orderError');
  if (errorEl) errorEl.style.display = 'none';
}

// =============================================
// GET CUSTOMER DATA (for use in checkout.html)
// =============================================
export function getCustomerData() {
  return {
    name:    document.getElementById('custName')?.value.trim()    || '',
    phone:   document.getElementById('custPhone')?.value.trim()   || '',
    city:    document.getElementById('custCity')?.value.trim()    || '',
    address: document.getElementById('custAddress')?.value.trim() || '',
  };
}