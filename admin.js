import { supabaseClient } from "./supabaseClient.js";

const cafeId = resolveCafeId();
console.log("Cafe ID:", cafeId);

let orders = [];
let previousOrderIds = new Set();
let audioContext;
let latestInsertedOrderId = null;
let menuItems = [];
let previousMenuIds = new Set();
let historyVisible = false;
let clearedOrderIds = new Set();
let orderHistory = [];
let revenueByDate = {};

// DOM elements
const ordersContainer = document.getElementById("ordersContainer");
const totalOrdersEl = document.getElementById("totalOrders");
const pendingOrdersEl = document.getElementById("pendingOrders");
const completedOrdersEl = document.getElementById("completedOrders");
const refreshBtn = document.getElementById("refreshBtn");
const clearAllBtn = document.getElementById("clearAllBtn");
const historyBtn = document.getElementById("historyBtn");
const historySection = document.getElementById("historySection");
const historyContainer = document.getElementById("historyContainer");
const revenueByDateContainer = document.getElementById("revenueByDateContainer");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const closeHistoryBtn = document.getElementById("closeHistoryBtn");
const statusFilter = document.getElementById("statusFilter");
const bulkDeleteBtn = document.getElementById("bulkDeleteBtn");
const menuControlContainer = document.getElementById("menuControlContainer");
const addMenuItemBtn = document.getElementById("addMenuItemBtn");
const newItemCategoryInput = document.getElementById("newItemCategory");
const newItemNameInput = document.getElementById("newItemName");
const newItemPriceInput = document.getElementById("newItemPrice");
const newItemDescriptionInput = document.getElementById("newItemDescription");
const newItemStockInput = document.getElementById("newItemStock");

bulkDeleteBtn.style.display = "none";

// Initialize
initializeAdmin();

async function initializeAdmin() {
  if (!cafeId) {
    alert("Invalid QR");
    ordersContainer.innerHTML = `
      <div class="empty-state">
        <h3>Invalid QR</h3>
        <p>Missing cafe id in URL. Use admin.html?cafe=CAFE_ID</p>
      </div>
    `;
    if (menuControlContainer) {
      menuControlContainer.innerHTML = `
        <div class="empty-state">
          <h3>Invalid QR</h3>
          <p>Missing cafe id in URL. Use admin.html?cafe=CAFE_ID</p>
        </div>
      `;
    }
    refreshBtn.disabled = true;
    clearAllBtn.disabled = true;
    setAddMenuFormDisabled(true);
    return;
  }
  loadHistoryState();
  await fetchMenuItems();
  await fetchOrders();
  subscribeToRealtime();
  subscribeToMenuRealtime();
  unlockAudioOnFirstInteraction();

  // Auto refresh in realtime mode (no manual refresh needed)
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.style.display = "none";
  }
}

function resolveCafeId() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = (params.get("cafe") || params.get("cafe_id") || "").trim();
  if (fromUrl) {
    localStorage.setItem("lastCafeId", fromUrl);
    return fromUrl;
  }

  const fromStorage = (localStorage.getItem("lastCafeId") || "").trim();
  if (fromStorage) {
    return fromStorage;
  }

  const fromPrompt = (window.prompt("Enter cafe ID for admin panel") || "").trim();
  if (fromPrompt) {
    localStorage.setItem("lastCafeId", fromPrompt);
    return fromPrompt;
  }

  return "";
}

// Event listeners
// Refresh button intentionally disabled/hidden (orders auto-update via realtime).

clearAllBtn.addEventListener("click", async () => {
  const ok = confirm("Clear current orders from live queue?");
  if (!ok) {
    return;
  }

  try {
    if (orders.length === 0) {
      alert("No active orders to clear.");
      return;
    }
    archiveOrders(orders);
    for (const order of orders) {
      if (order?.id) {
        clearedOrderIds.add(String(order.id));
      }
    }
    orders = [];
    saveHistoryState();
    renderOrders();
    updateStats();
    renderHistoryView();
    alert("Orders cleared from live queue and moved to history.");
  } catch (err) {
    console.error("Unexpected clear-all error:", err);
    alert("Something went wrong while clearing orders.");
  }
});

statusFilter.addEventListener("change", renderOrders);

if (addMenuItemBtn) {
  addMenuItemBtn.addEventListener("click", addMenuItem);
}
if (historyBtn) {
  historyBtn.addEventListener("click", () => {
    historyVisible = true;
    renderHistoryView();
  });
}
if (closeHistoryBtn) {
  closeHistoryBtn.addEventListener("click", () => {
    historyVisible = false;
    renderHistoryView();
  });
}
if (clearHistoryBtn) {
  clearHistoryBtn.addEventListener("click", () => {
    const ok = confirm("Clear history list? Revenue summary will remain.");
    if (!ok) return;
    orderHistory = [];
    saveHistoryState();
    renderHistoryView();
  });
}

function setAddMenuFormDisabled(disabled) {
  if (addMenuItemBtn) addMenuItemBtn.disabled = disabled;
  if (newItemCategoryInput) newItemCategoryInput.disabled = disabled;
  if (newItemNameInput) newItemNameInput.disabled = disabled;
  if (newItemPriceInput) newItemPriceInput.disabled = disabled;
  if (newItemDescriptionInput) newItemDescriptionInput.disabled = disabled;
  if (newItemStockInput) newItemStockInput.disabled = disabled;
}

async function addMenuItem() {
  if (!cafeId) {
    alert("Invalid QR — missing cafe id.");
    return;
  }

  const category = (newItemCategoryInput?.value || "").trim();
  const name = (newItemNameInput?.value || "").trim();
  const priceRaw = newItemPriceInput?.value;
  const price = Number(priceRaw);
  const description = (newItemDescriptionInput?.value || "").trim();
  const stockRaw = newItemStockInput?.value;
  let stock = Number(stockRaw);
  if (!Number.isFinite(stock) || stock < 0) {
    stock = 10;
  }

  if (!name) {
    alert("Please enter an item name.");
    return;
  }
  if (!Number.isFinite(price) || price < 0) {
    alert("Please enter a valid price.");
    return;
  }

  addMenuItemBtn.disabled = true;

  try {
    const row = {
      cafe_id: cafeId,
      category: category || null,
      name,
      price,
      description: description || null,
      is_available: stock > 0,
      stock,
    };

    const { error } = await supabaseClient.from("menu_items").insert(row);

    if (error) {
      console.error("Failed to add menu item:", error);
      alert(
        error.message?.includes("description") || error.code === "PGRST204"
          ? "Could not save item. Add a `description` column (text) to `menu_items` in Supabase, then try again."
          : "Failed to add menu item. Check console and Supabase RLS policies."
      );
      return;
    }

    if (newItemNameInput) newItemNameInput.value = "";
    if (newItemPriceInput) newItemPriceInput.value = "";
    if (newItemDescriptionInput) newItemDescriptionInput.value = "";
    if (newItemStockInput) newItemStockInput.value = "10";
    if (newItemCategoryInput) newItemCategoryInput.value = "";

    alert("Menu item added successfully.");
    await fetchMenuItems();
  } catch (err) {
    console.error("Unexpected add menu item error:", err);
    alert("Something went wrong while adding the item.");
  } finally {
    if (addMenuItemBtn) addMenuItemBtn.disabled = false;
  }
}

async function fetchOrders() {
  try {
    const { data, error } = await supabaseClient
      .from("orders")
      .select("*")
      .eq("cafe_id", cafeId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch orders:", error);
      alert("Failed to fetch orders.");
      return;
    }

    const allOrders = data || [];
    previousOrderIds = new Set(allOrders.map((order) => order.id));
    orders = allOrders.filter((order) => !clearedOrderIds.has(String(order.id)));
    await hydrateOrderItems();
    renderOrders();
    updateStats();
  } catch (err) {
    console.error("Unexpected fetch error:", err);
    alert("Unexpected error while loading orders.");
  }
}

async function addOrderToUI(order) {
  if (!order || !order.id) {
    return;
  }
  if (clearedOrderIds.has(String(order.id))) {
    return;
  }
  if (previousOrderIds.has(order.id) || orders.some((existing) => existing.id === order.id)) {
    return;
  }

  let hydratedItems = [];
  try {
    const { data, error } = await supabaseClient
      .from("order_items")
      .select("*")
      .eq("order_id", order.id);

    if (error) {
      console.error("Failed to fetch new order items:", error);
    } else {
      hydratedItems = data || [];
    }
  } catch (err) {
    console.error("Unexpected new order items fetch error:", err);
  }

  latestInsertedOrderId = order.id;
  previousOrderIds.add(order.id);
  orders.unshift({
    ...order,
    _items: hydratedItems,
  });
  renderOrders();
  updateStats();
}

function archiveOrders(ordersToArchive) {
  const nowIso = new Date().toISOString();
  for (const order of ordersToArchive || []) {
    const total = calculateOrderTotal(order);
    const dateKey = formatDateKey(order?.created_at || nowIso);
    revenueByDate[dateKey] = Number(revenueByDate[dateKey] || 0) + total;

    orderHistory.unshift({
      id: order.id,
      table_number: order.table_number,
      customer_name: order.customer_name,
      phone_number: order.phone_number,
      status: order.status,
      created_at: order.created_at || nowIso,
      archived_at: nowIso,
      total,
      items: Array.isArray(order._items) ? order._items : [],
    });
  }
}

async function hydrateOrderItems() {
  try {
    const orderIds = orders.map((o) => o.id).filter(Boolean);
    if (orderIds.length === 0) {
      return;
    }

    const { data, error } = await supabaseClient
      .from("order_items")
      .select("*")
      .in("order_id", orderIds);

    if (error) {
      console.error("Failed to fetch order items:", error);
      return;
    }

    const itemsByOrder = new Map();
    for (const row of data || []) {
      if (!itemsByOrder.has(row.order_id)) {
        itemsByOrder.set(row.order_id, []);
      }
      itemsByOrder.get(row.order_id).push(row);
    }

    orders = orders.map((o) => ({
      ...o,
      _items: itemsByOrder.get(o.id) || [],
    }));
  } catch (err) {
    console.error("Unexpected order items hydrate error:", err);
  }
}

async function fetchMenuItems() {
  if (!menuControlContainer) {
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("menu_items")
      .select("*")
      .eq("cafe_id", cafeId)
      .order("name", { ascending: true });

    if (error) {
      console.error("Failed to fetch menu items:", error);
      menuControlContainer.innerHTML = `
        <div class="empty-state">
          <h3>Menu not available</h3>
          <p>Could not load menu items.</p>
        </div>
      `;
      return;
    }

    const incomingIds = new Set((data || []).map((i) => i.id));
    const hasChange = (data || []).some((i) => !previousMenuIds.has(i.id));
    previousMenuIds = incomingIds;

    menuItems = data || [];
    renderMenuControl();

    if (hasChange && incomingIds.size > 0) {
      console.log("[Menu] Menu items updated.");
    }
  } catch (err) {
    console.error("Unexpected menu fetch error:", err);
  }
}

function renderMenuControl() {
  if (!menuControlContainer) {
    return;
  }

  if (!menuItems || menuItems.length === 0) {
    menuControlContainer.innerHTML = `
      <div class="empty-state">
        <h3>No menu items yet</h3>
        <p>Use <strong>Add menu item</strong> above to create one. They appear here and on the customer menu.</p>
      </div>
    `;
    return;
  }

  menuControlContainer.innerHTML = menuItems
    .map((item) => {
      const available = item.is_available === true;
      const stock = Number.isFinite(Number(item.stock)) ? Number(item.stock) : 0;
      const price = Number.isFinite(Number(item.price)) ? Number(item.price) : 0;
      const shortDesc = (item.description || "").trim();
      const badgeStyle = available
        ? "background:#e8f5e9;color:#2e7d32;"
        : "background:#ffebee;color:#c62828;";

      return `
        <div class="order-card ${available ? "done" : "pending"}" style="margin-bottom: 14px;">
          <div class="order-header">
            <div class="order-info" style="flex-direction: column; align-items: flex-start; gap: 4px;">
              <span class="order-id">${escapeHtml(item.name || "Item")}</span>
              ${
                shortDesc
                  ? `<span style="font-size:0.85rem;font-weight:500;opacity:0.85;">${escapeHtml(shortDesc)}</span>`
                  : ""
              }
              <span class="order-status" style="${badgeStyle}">${available ? "available" : "out of stock"}</span>
            </div>
            <div class="order-actions">
              <button class="status-btn preparing" onclick="setItemAvailable('${item.id}', true)">Mark Available</button>
              <button class="status-btn done" onclick="setItemAvailable('${item.id}', false)" style="background:#e53935;">Mark Out of Stock</button>
            </div>
          </div>

          <div class="order-items" style="display:flex; gap:12px; flex-wrap:wrap;">
            <div class="order-item" style="gap:10px;">
              <span class="item-name">Price</span>
              <input
                type="number"
                min="0"
                step="1"
                value="${price}"
                style="max-width:120px; padding:8px; border-radius:10px; border:1px solid rgba(255,255,255,0.12); background:rgba(0,0,0,0.08); color:inherit;"
                id="price_${item.id}"
              >
              <button class="status-btn preparing" onclick="updateItemPrice('${item.id}')">Update Price</button>
            </div>

            <div class="order-item" style="gap:10px;">
              <span class="item-name">Stock</span>
              <input
                type="number"
                min="0"
                step="1"
                value="${stock}"
                style="max-width:120px; padding:8px; border-radius:10px; border:1px solid rgba(255,255,255,0.12); background:rgba(0,0,0,0.08); color:inherit;"
                id="stock_${item.id}"
              >
              <button class="status-btn preparing" onclick="updateItemStock('${item.id}')">Update Stock</button>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderOrders() {
  const filterValue = statusFilter ? statusFilter.value : "all";
  const filteredOrders =
    filterValue === "all"
      ? orders
      : orders.filter((order) => order.status === filterValue);
  const priceMap = buildPriceMap(menuItems);

  if (filteredOrders.length === 0) {
    ordersContainer.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 2C9.55228 2 10 2.44772 10 3C10 3.55228 9.55228 4 9 4C8.44772 4 8 3.55228 8 3C8 2.44772 8.44772 2 9 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M20 2C20.5523 2 21 2.44772 21 3C21 3.55228 20.5523 4 20 4C19.4477 4 19 3.55228 19 3C19 2.44772 19.4477 2 20 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M1 1H5L7.68 14.39C7.77144 14.8504 8.02191 15.264 8.38755 15.5583C8.75318 15.8526 9.2107 16.009 9.68 16H19.4C19.8693 16.009 20.3268 15.8526 20.6925 15.5583C21.0581 15.264 21.3086 14.8504 21.4 14.39L23 6H6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <h3>No ${filterValue === "all" ? "" : filterValue} orders</h3>
        <p>${filterValue === "all" ? "Orders will appear here when customers place them" : `No ${filterValue} orders found`}</p>
      </div>
    `;
    return;
  }

  ordersContainer.innerHTML = filteredOrders
    .map((order) => {
      const items = Array.isArray(order._items) ? order._items : [];
      const totalBill = items.reduce((sum, it) => {
        const qty = Number(it.quantity || 0);
        const key = normalizeItemName(it.item_name || "");
        const unit = priceMap.get(key) ?? 0;
        return sum + unit * (Number.isFinite(qty) ? qty : 0);
      }, 0);
      const tableLabel = Number.isFinite(Number(order.table_number))
        ? `Table ${order.table_number}`
        : "Table -";
      const customerName = (order.customer_name || "").trim() || "-";
      const phoneNumber = (order.phone_number || "").trim() || "-";
      const isNewHighlight = latestInsertedOrderId && order.id === latestInsertedOrderId;
      return `
      <div class="order-card ${order.status}" data-order-id="${order.id}" ${
        isNewHighlight ? 'style="outline:2px solid rgba(255, 193, 7, 0.55); box-shadow: 0 0 0 6px rgba(255, 193, 7, 0.14);"' : ""
      }>
        <div class="order-header">
          <div class="order-info">
            <span class="order-id">Order: ${String(order.id).slice(0, 8)}</span>
            <span class="order-time">${formatTime(order.created_at)}</span>
            <span class="order-status ${order.status}">${order.status}</span>
          </div>
          <div class="order-actions">
            ${
              order.status !== "preparing" && order.status !== "done"
                ? `<button class="status-btn preparing" onclick="updateOrderStatus('${order.id}', 'preparing')">Preparing</button>`
                : ""
            }
            ${
              order.status !== "done"
                ? `<button class="status-btn done" onclick="updateOrderStatus('${order.id}', 'done')">Done</button>`
                : ""
            }
          </div>
        </div>
        <div class="order-items" style="padding-bottom: 0;">
          <div class="order-item">
            <span class="item-name">Name</span>
            <span class="item-quantity"></span>
            <span class="item-price">${escapeHtml(customerName)}</span>
          </div>
          <div class="order-item">
            <span class="item-name">Phone</span>
            <span class="item-quantity"></span>
            <span class="item-price">${escapeHtml(phoneNumber)}</span>
          </div>
          <div class="order-item">
            <span class="item-name">Table</span>
            <span class="item-quantity"></span>
            <span class="item-price">${escapeHtml(tableLabel)}</span>
          </div>
        </div>
        <div class="order-items">
          ${items
            .map(
              (item) => `
            <div class="order-item">
              <span class="item-name">${escapeHtml(item.item_name || "Item")}</span>
              <span class="item-quantity">x${item.quantity || 1}</span>
              <span class="item-price"></span>
            </div>
          `
            )
            .join("")}
        </div>
        <div class="order-footer">
          <span></span>
          <span class="order-total">Total: &#8377;${formatMoney(totalBill)}</span>
        </div>
      </div>
    `;
    })
    .join("");

  if (latestInsertedOrderId) {
    const id = latestInsertedOrderId;
    setTimeout(() => {
      if (latestInsertedOrderId === id) {
        latestInsertedOrderId = null;
        renderOrders();
      }
    }, 6500);
  }
}

function updateStats() {
  const total = orders.length;
  const pending = orders.filter((order) => order.status === "pending").length;
  const done = orders.filter((order) => order.status === "done").length;

  totalOrdersEl.textContent = total;
  pendingOrdersEl.textContent = pending;
  completedOrdersEl.textContent = done;
}

function calculateOrderTotal(order) {
  const items = Array.isArray(order?._items) ? order._items : [];
  const priceMap = buildPriceMap(menuItems);
  return items.reduce((sum, it) => {
    const qty = Number(it?.quantity || 0);
    const key = normalizeItemName(it?.item_name || "");
    const unit = priceMap.get(key) ?? 0;
    return sum + (Number.isFinite(qty) ? qty : 0) * unit;
  }, 0);
}

async function updateOrderStatus(orderId, nextStatus) {
  try {
    const { error } = await supabaseClient
      .from("orders")
      .update({ status: nextStatus })
      .eq("id", orderId)
      .eq("cafe_id", cafeId);

    if (error) {
      console.error("Failed to update status:", error);
      alert("Failed to update status.");
      return;
    }
    orders = orders.map((order) =>
      String(order.id) === String(orderId)
        ? {
            ...order,
            status: nextStatus,
          }
        : order
    );
    renderOrders();
    updateStats();
  } catch (err) {
    console.error("Unexpected status update error:", err);
    alert("Unexpected error while updating status.");
  }
}

async function setItemAvailable(itemId, isAvailable) {
  try {
    const { error } = await supabaseClient
      .from("menu_items")
      .update({ is_available: Boolean(isAvailable) })
      .eq("id", itemId)
      .eq("cafe_id", cafeId);

    if (error) {
      console.error("Failed to toggle availability:", error);
      alert("Failed to update availability.");
      return;
    }

    alert("Availability updated.");
  } catch (err) {
    console.error("Unexpected availability update error:", err);
    alert("Something went wrong.");
  }
}

async function updateItemStock(itemId) {
  const input = document.getElementById(`stock_${itemId}`);
  const nextStock = Math.max(0, Number(input?.value ?? 0));

  if (!Number.isFinite(nextStock)) {
    alert("Invalid stock value.");
    return;
  }

  try {
    const { error } = await supabaseClient
      .from("menu_items")
      .update({ stock: nextStock, is_available: nextStock > 0 })
      .eq("id", itemId)
      .eq("cafe_id", cafeId);

    if (error) {
      console.error("Failed to update stock:", error);
      alert("Failed to update stock.");
      return;
    }

    alert("Stock updated.");
  } catch (err) {
    console.error("Unexpected stock update error:", err);
    alert("Something went wrong.");
  }
}

async function updateItemPrice(itemId) {
  const input = document.getElementById(`price_${itemId}`);
  const nextPrice = Math.max(0, Number(input?.value ?? 0));

  if (!Number.isFinite(nextPrice)) {
    alert("Invalid price value.");
    return;
  }

  try {
    const { error } = await supabaseClient
      .from("menu_items")
      .update({ price: nextPrice })
      .eq("id", itemId)
      .eq("cafe_id", cafeId);

    if (error) {
      console.error("Failed to update price:", error);
      alert("Failed to update price.");
      return;
    }

    alert("Price updated.");
  } catch (err) {
    console.error("Unexpected price update error:", err);
    alert("Something went wrong.");
  }
}

function formatTime(timestamp) {
  if (!timestamp) {
    return "-";
  }
  const date = new Date(timestamp);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function subscribeToRealtime() {
  supabaseClient
    .channel("orders-channel")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "orders", filter: `cafe_id=eq.${cafeId}` },
      async (payload) => {
        console.log("Realtime order:", payload.new);
        const incomingOrder = payload?.new;
        if (!incomingOrder) {
          return;
        }
        if (String(incomingOrder.cafe_id) !== String(cafeId)) {
          return;
        }
        if (clearedOrderIds.has(String(incomingOrder.id))) {
          return;
        }
        await addOrderToUI(incomingOrder);
        playAlert();
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "orders", filter: `cafe_id=eq.${cafeId}` },
      (payload) => {
        const updatedOrder = payload?.new;
        if (!updatedOrder?.id) {
          return;
        }
        if (clearedOrderIds.has(String(updatedOrder.id))) {
          return;
        }
        orders = orders.map((order) =>
          String(order.id) === String(updatedOrder.id)
            ? {
                ...order,
                ...updatedOrder,
              }
            : order
        );
        renderOrders();
        updateStats();
      }
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        console.error("Realtime channel error.");
      }
    });
}

function playAlert() {
  try {
    const audio = new Audio("/sound.mp3");
    audio.play().catch(() => console.log("Autoplay blocked"));
  } catch (err) {
    console.warn("[Alert] Failed to play /sound.mp3.", err);
  }
}

function subscribeToMenuRealtime() {
  supabaseClient
    .channel("menu")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "menu_items", filter: `cafe_id=eq.${cafeId}` },
      async () => {
        await fetchMenuItems();
      }
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        console.error("Menu realtime channel error.");
      }
    });
}

function unlockAudioOnFirstInteraction() {
  const unlock = () => {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    document.removeEventListener("click", unlock);
  };
  document.addEventListener("click", unlock);
}

function playNewOrderSound() {
  if (!audioContext) {
    return;
  }

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 880;
  gainNode.gain.value = 0.12;

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.18);
}

window.updateOrderStatus = updateOrderStatus;
window.setItemAvailable = setItemAvailable;
window.updateItemStock = updateItemStock;
window.updateItemPrice = updateItemPrice;

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildPriceMap(items) {
  const map = new Map();
  for (const it of items || []) {
    const name = normalizeItemName(it?.name || "");
    const price = Number(it?.price || 0);
    if (!name) continue;
    map.set(name, Number.isFinite(price) ? price : 0);
  }
  return map;
}

function normalizeItemName(name) {
  return String(name || "").trim().toLowerCase();
}

function formatMoney(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toString();
}

function loadHistoryState() {
  const clearedRaw = localStorage.getItem(getStorageKey("cleared_order_ids"));
  const historyRaw = localStorage.getItem(getStorageKey("order_history"));
  const revenueRaw = localStorage.getItem(getStorageKey("revenue_by_date"));

  try {
    const parsedCleared = JSON.parse(clearedRaw || "[]");
    clearedOrderIds = new Set(Array.isArray(parsedCleared) ? parsedCleared.map((id) => String(id)) : []);
  } catch {
    clearedOrderIds = new Set();
  }

  try {
    const parsedHistory = JSON.parse(historyRaw || "[]");
    orderHistory = Array.isArray(parsedHistory) ? parsedHistory : [];
  } catch {
    orderHistory = [];
  }

  try {
    const parsedRevenue = JSON.parse(revenueRaw || "{}");
    revenueByDate = parsedRevenue && typeof parsedRevenue === "object" ? parsedRevenue : {};
  } catch {
    revenueByDate = {};
  }
}

function saveHistoryState() {
  localStorage.setItem(getStorageKey("cleared_order_ids"), JSON.stringify(Array.from(clearedOrderIds)));
  localStorage.setItem(getStorageKey("order_history"), JSON.stringify(orderHistory));
  localStorage.setItem(getStorageKey("revenue_by_date"), JSON.stringify(revenueByDate));
}

function getStorageKey(name) {
  return `admin_${name}_${cafeId}`;
}

function renderHistoryView() {
  if (!historySection || !historyContainer || !revenueByDateContainer) {
    return;
  }

  historySection.style.display = historyVisible ? "" : "none";
  if (!historyVisible) {
    return;
  }

  const revenueRows = Object.entries(revenueByDate).sort(([a], [b]) => (a < b ? 1 : -1));
  if (revenueRows.length === 0) {
    revenueByDateContainer.innerHTML = `
      <div class="empty-state">
        <h3>No revenue yet</h3>
        <p>Revenue will appear date-wise after orders are cleared to history.</p>
      </div>
    `;
  } else {
    revenueByDateContainer.innerHTML = `
      <div class="order-card done">
        <div class="order-header">
          <div class="order-info">
            <span class="order-id">Revenue By Date</span>
          </div>
        </div>
        <div class="order-items">
          ${revenueRows
            .map(
              ([date, amount]) => `
            <div class="order-item">
              <span class="item-name">${escapeHtml(date)}</span>
              <span class="item-quantity"></span>
              <span class="item-price">&#8377;${formatMoney(amount)}</span>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `;
  }

  if (orderHistory.length === 0) {
    historyContainer.innerHTML = `
      <div class="empty-state">
        <h3>No order history</h3>
        <p>Cleared orders will appear here.</p>
      </div>
    `;
    return;
  }

  historyContainer.innerHTML = orderHistory
    .map((entry) => {
      const items = Array.isArray(entry.items) ? entry.items : [];
      return `
        <div class="order-card done">
          <div class="order-header">
            <div class="order-info">
              <span class="order-id">Order: ${String(entry.id || "").slice(0, 8)}</span>
              <span class="order-time">${formatTime(entry.created_at)}</span>
              <span class="order-status done">${escapeHtml(entry.status || "done")}</span>
            </div>
          </div>
          <div class="order-items">
            ${items
              .map(
                (item) => `
              <div class="order-item">
                <span class="item-name">${escapeHtml(item.item_name || "Item")}</span>
                <span class="item-quantity">x${item.quantity || 1}</span>
                <span class="item-price"></span>
              </div>
            `
              )
              .join("")}
          </div>
          <div class="order-footer">
            <span>Archived: ${formatTime(entry.archived_at)}</span>
            <span class="order-total">Total: &#8377;${formatMoney(entry.total || 0)}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function formatDateKey(timestamp) {
  const date = timestamp ? new Date(timestamp) : new Date();
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }
  return date.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
