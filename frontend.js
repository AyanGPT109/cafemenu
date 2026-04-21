import { supabaseClient } from "./supabaseClient.js";

const params = new URLSearchParams(window.location.search);
const cafeId = params.get("cafe");
const tableNumber = params.get("table");

const menuMount = document.getElementById("menuMount");

// Cart functionality
let cart = JSON.parse(localStorage.getItem("cafeCart")) || [];
// Ensure cart items always have an id in multi-cafe mode
cart = cart
  .map((item) => ({
    id: item.id || item.menu_item_id || item.name,
    name: item.name,
    price: Number(item.price),
    quantity: Number(item.quantity || 1),
  }))
  .filter((item) => item.name && !Number.isNaN(item.price) && item.quantity > 0);

// DOM elements
const cartToggle = document.getElementById("cartToggle");
const cartSidebar = document.getElementById("cartSidebar");
const cartClose = document.getElementById("cartClose");
const cartCount = document.getElementById("cartCount");
const cartItems = document.getElementById("cartItems");
const cartTotalEl = document.getElementById("cartTotal");
const clearCartBtn = document.getElementById("clearCartBtn");
const checkoutBtn = document.getElementById("checkoutBtn");
const customerNameInput = document.getElementById("customerName");
const customerPhoneInput = document.getElementById("customerPhone");

// Initialize
updateCartUI();

// Event listeners
cartToggle.addEventListener("click", openCart);
cartClose.addEventListener("click", closeCart);
clearCartBtn.addEventListener("click", clearCart);
checkoutBtn.addEventListener("click", checkout);

// Dynamic menu click handling (works for rendered items)
document.addEventListener("click", (e) => {
  const btn = e.target.closest?.(".add-to-cart-btn");
  if (!btn) {
    return;
  }
  const id = btn.dataset.id;
  const name = btn.dataset.name;
  const price = parseFloat(btn.dataset.price);
  if (!name || Number.isNaN(price)) {
    return;
  }
  addToCart(id, name, price);
});

// Close cart when clicking outside
document.addEventListener("click", (e) => {
  if (!cartSidebar.contains(e.target) && !cartToggle.contains(e.target)) {
    closeCart();
  }
});

function openCart() {
  cartSidebar.classList.add("open");
}

function closeCart() {
  cartSidebar.classList.remove("open");
}

function addToCart(id, name, price) {
  const safeId = id || name;
  const existingItem = cart.find((item) => item.id === safeId);

  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    cart.push({ id: safeId, name, price, quantity: 1 });
  }

  saveCart();
  updateCartUI();
  showAddedFeedback(name);
}

function removeFromCart(id) {
  cart = cart.filter((item) => item.id !== id);
  saveCart();
  updateCartUI();
}

function updateQuantity(id, change) {
  const item = cart.find((entry) => entry.id === id);
  if (!item) {
    return;
  }

  item.quantity += change;
  if (item.quantity <= 0) {
    removeFromCart(id);
    return;
  }

  saveCart();
  updateCartUI();
}

function clearCart() {
  cart = [];
  saveCart();
  updateCartUI();
}

function saveCart() {
  localStorage.setItem("cafeCart", JSON.stringify(cart));
}

function getCartTotal() {
  return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function updateCartUI() {
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  cartCount.textContent = totalItems;
  if (cartTotalEl) {
    cartTotalEl.innerHTML = `&#8377;${getCartTotal()}`;
  }

  if (cart.length === 0) {
    cartItems.innerHTML = '<p class="cart-empty">Your cart is empty</p>';
    return;
  }

  cartItems.innerHTML = cart
    .map(
      (item) => `
      <div class="cart-item">
        <div class="cart-item-info">
          <h4>${item.name}</h4>
          <span>&#8377;${item.price}</span>
        </div>
        <div class="cart-item-controls">
          <button class="quantity-btn" onclick="updateQuantity('${item.id}', -1)">-</button>
          <span class="quantity">${item.quantity}</span>
          <button class="quantity-btn" onclick="updateQuantity('${item.id}', 1)">+</button>
          <button class="remove-btn" onclick="removeFromCart('${item.id}')">&times;</button>
        </div>
      </div>
    `
    )
    .join("");
}

function showAddedFeedback(itemName) {
  const feedback = document.createElement("div");
  feedback.className = "add-feedback";
  feedback.textContent = `${itemName} added to cart!`;
  document.body.appendChild(feedback);

  setTimeout(() => {
    feedback.remove();
  }, 2000);
}

initializeCafeMenu();

async function initializeCafeMenu() {
  if (!cafeId) {
    showInvalidQr();
    return;
  }

  if (!tableNumber) {
    showInvalidQr();
    return;
  }

  if (!menuMount) {
    console.error("menuMount not found in DOM.");
    return;
  }

  // Optional: show which table is ordering (no UI redesign)
  console.log(`[Cafe] cafe=${cafeId} table=${tableNumber}`);

  const cafeName = await fetchCafeName();
  const cafeNameHeading = document.getElementById("cafeNameHeading");
  if (cafeNameHeading && cafeName) {
    cafeNameHeading.textContent = cafeName;
  }

  menuMount.innerHTML = `
    <section class="menu-section">
      <div class="section-heading">
        <p class="eyebrow">Menu</p>
        <h2 id="menuTitle">${escapeHtml(cafeName || "Choose your items")}</h2>
      </div>

      <div class="menu-grid">
        <article class="menu-card menu-card--accent">
          <div class="menu-card__header">
            <p class="menu-card__index">Cafe</p>
            <p class="menu-card__blurb">Live menu (fetched from Supabase).</p>
          </div>
          <div class="menu-list" id="menuList">
            <div class="menu-item">
              <div>
                <h3>Loading menu...</h3>
                <p>Please wait.</p>
              </div>
              <div class="menu-item__footer">
                <span></span>
                <button class="add-to-cart-btn" disabled>Add to Cart</button>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>
  `;

  await fetchAndRenderMenu();
  subscribeToMenuRealtime();
}

async function fetchCafeName() {
  try {
    const { data, error } = await supabaseClient
      .from("cafes")
      .select("name")
      .eq("id", cafeId)
      .single();
    if (error) {
      console.warn("[Cafe] Failed to fetch cafe name:", error);
      return null;
    }
    return (data?.name || "").trim() || null;
  } catch (err) {
    console.warn("[Cafe] Unexpected cafe name error:", err);
    return null;
  }
}

function showInvalidQr() {
  if (menuMount) {
    menuMount.innerHTML = `
      <section class="menu-section">
        <div class="section-heading">
          <p class="eyebrow">Invalid QR</p>
          <h2>Invalid QR</h2>
          <p>Missing cafe id. Please scan the correct QR code.</p>
        </div>
      </section>
    `;
  }
  checkoutBtn.disabled = true;
  alert("Invalid QR");
}

async function fetchAndRenderMenu() {
  try {
    const { data, error } = await supabaseClient
      .from("menu_items")
      .select("*")
      .eq("cafe_id", cafeId)
      .eq("is_available", true);

    if (error) {
      console.error("Failed to fetch menu:", error);
      menuMount.innerHTML = `
        <section class="menu-section">
          <div class="section-heading">
            <p class="eyebrow">Menu not available</p>
            <h2>Menu not available</h2>
            <p>Please try again later.</p>
          </div>
        </section>
      `;
      alert("Menu not available");
      return;
    }

    if (!data || data.length === 0) {
      menuMount.innerHTML = `
        <section class="menu-section">
          <div class="section-heading">
            <p class="eyebrow">Menu not available</p>
            <h2>Menu not available</h2>
            <p>No items found for this cafe.</p>
          </div>
        </section>
      `;
      alert("Menu not available");
      return;
    }

    const menuList = document.getElementById("menuList");
    if (!menuList) {
      return;
    }

    // Stable display order
    const visibleItems = [...data].sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    if (!visibleItems || visibleItems.length === 0) {
      menuMount.innerHTML = `
        <section class="menu-section">
          <div class="section-heading">
            <p class="eyebrow">Menu not available</p>
            <h2>Menu not available</h2>
            <p>No available items for this cafe.</p>
          </div>
        </section>
      `;
      alert("Menu not available");
      return;
    }

    const grouped = groupByCategory(visibleItems);
    const categorySections = Object.entries(grouped)
      .map(([category, items]) => {
        const heading = escapeHtml(category);
        const itemsHtml = items.map(renderMenuItem).join("");
        return `
          <section class="category-block">
            <h2 class="category-title">${heading}</h2>
            <div class="menu-grid">${itemsHtml}</div>
          </section>
        `;
      })
      .join("");

    if (!categorySections) {
      menuMount.innerHTML = `
        <section class="menu-section">
          <div class="section-heading">
            <p class="eyebrow">Menu not available</p>
            <h2>Menu not available</h2>
            <p>No categorized items found for this cafe.</p>
          </div>
        </section>
      `;
      return;
    }

    menuList.innerHTML = `
      <div class="menu-categories">
        ${categorySections}
      </div>
    `;
  } catch (err) {
    console.error("Unexpected menu load error:", err);
    alert("Menu not available");
  }
}

function groupByCategory(items) {
  const grouped = (items || []).reduce((acc, item) => {
    const category = item?.category?.trim();
    if (!category) return acc;

    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {});
  return Object.fromEntries(Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)));
}

function renderMenuItem(item) {
  const name = item.name || "Item";
  const price = Number(item.price || 0);
  const stock = Number.isFinite(Number(item.stock)) ? Number(item.stock) : 0;
  const showFewLeft = stock > 0 && stock <= 3;
  const outOfStock = stock <= 0;
  const stockHint = outOfStock ? "Out of stock" : showFewLeft ? "Only few left" : "Freshly prepared.";
  const desc = (item.description || "").trim();
  const subline = desc ? `${escapeHtml(desc)} · ${escapeHtml(stockHint)}` : escapeHtml(stockHint);
  return `
          <article class="menu-card menu-item-card">
            <div class="top menu-item-card__top">
              <h3 class="menu-item-card__name">${escapeHtml(name)}</h3>
              <span class="menu-item-card__price">&#8377;${price}</span>
            </div>
            <p class="menu-item-card__desc">${subline}</p>
            <div class="menu-item-card__footer">
              <button
                class="add-to-cart-btn"
                data-id="${escapeAttr(item.id)}"
                data-name="${escapeAttr(name)}"
                data-price="${price}"
                ${outOfStock ? "disabled" : ""}
              >
                ${outOfStock ? "Out of Stock" : "Add to Cart"}
              </button>
            </div>
          </article>
        `;
}

function subscribeToMenuRealtime() {
  supabaseClient
    .channel("menu")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "menu_items", filter: `cafe_id=eq.${cafeId}` },
      async () => {
        await fetchAndRenderMenu();
      }
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        console.error("Menu realtime channel error.");
      }
    });
}

async function checkout() {
  if (cart.length === 0) {
    alert("Your cart is empty.");
    return;
  }

  if (!cafeId) {
    alert("Invalid QR");
    return;
  }

  const name = (customerNameInput?.value || "").trim();
  const phone = (customerPhoneInput?.value || "").trim();

  if (!name) {
    alert("Please enter your name.");
    return;
  }

  if (!phone) {
    alert("Please enter your phone number.");
    return;
  }

  checkoutBtn.disabled = true;

  try {
    const parsedTable = parseInt(tableNumber, 10);
    if (!Number.isFinite(parsedTable)) {
      alert("Invalid QR");
      return;
    }

    // STEP 1: Create order
    const { data: order, error: orderError } = await supabaseClient
      .from("orders")
      .insert({
        cafe_id: cafeId,
        table_number: parsedTable,
        customer_name: name,
        phone_number: phone,
        status: "pending",
      })
      .select()
      .single();

    if (orderError) {
      console.error("Failed to create order:", orderError);
      alert("Failed to place order. Please try again.");
      return;
    }

    // STEP 2: Insert order items
    const itemsPayload = cart.map((item) => ({
      order_id: order.id,
      item_name: item.name,
      quantity: item.quantity,
    }));

    const { error: itemsError } = await supabaseClient.from("order_items").insert(itemsPayload);
    if (itemsError) {
      console.error("Failed to insert order items:", itemsError);
      alert("Order created but items failed to save. Please contact staff.");
      return;
    }

    alert("Order placed successfully!");
    clearCart();
    closeCart();
    if (customerNameInput) customerNameInput.value = "";
    if (customerPhoneInput) customerPhoneInput.value = "";
  } catch (err) {
    console.error("Unexpected checkout error:", err);
    alert("Something went wrong while placing your order.");
  } finally {
    checkoutBtn.disabled = false;
  }
}

// Make functions globally available for inline onclick handlers.
window.updateQuantity = updateQuantity;
window.removeFromCart = removeFromCart;

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(text) {
  // Same as HTML escape; keeps attributes safe.
  return escapeHtml(text);
}
