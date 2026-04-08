import { supabaseClient } from "./supabaseClient.js";

const params = new URLSearchParams(window.location.search);
const cafeId = params.get("cafe");
console.log("Cafe ID:", cafeId);

let orders = [];
let previousOrderIds = new Set();
let audioContext;
let latestInsertedOrderId = null;
let menuItems = [];
let previousMenuIds = new Set();

// DOM elements
const ordersContainer = document.getElementById("ordersContainer");
const totalOrdersEl = document.getElementById("totalOrders");
const pendingOrdersEl = document.getElementById("pendingOrders");
const completedOrdersEl = document.getElementById("completedOrders");
const refreshBtn = document.getElementById("refreshBtn");
const clearAllBtn = document.getElementById("clearAllBtn");
const statusFilter = document.getElementById("statusFilter");
const bulkDeleteBtn = document.getElementById("bulkDeleteBtn");
const menuControlContainer = document.getElementById("menuControlContainer");

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
    return;
  }
  await fetchOrders();
  subscribeToRealtime();
  await fetchMenuItems();
  subscribeToMenuRealtime();
  unlockAudioOnFirstInteraction();
}

// Event listeners
refreshBtn.addEventListener("click", async () => {
  await fetchOrders();
  await fetchMenuItems();
  alert("Orders refreshed.");
});

clearAllBtn.addEventListener("click", async () => {
  const ok = confirm("Delete all orders from database?");
  if (!ok) {
    return;
  }

  try {
    const { error } = await supabaseClient.from("orders").delete().eq("cafe_id", cafeId);
    if (error) {
      console.error("Failed to clear orders:", error);
      alert("Failed to clear orders.");
      return;
    }
    alert("All orders cleared.");
    await fetchOrders();
  } catch (err) {
    console.error("Unexpected clear-all error:", err);
    alert("Something went wrong while clearing orders.");
  }
});

statusFilter.addEventListener("change", renderOrders);

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

    const incomingIds = new Set((data || []).map((order) => order.id));
    const hasNewOrder = (data || []).some((order) => !previousOrderIds.has(order.id));
    if (hasNewOrder && previousOrderIds.size > 0) {
      playNewOrderSound();
    }

    previousOrderIds = incomingIds;
    orders = data || [];
    await hydrateOrderItems();
    renderOrders();
    updateStats();
  } catch (err) {
    console.error("Unexpected fetch error:", err);
    alert("Unexpected error while loading orders.");
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

    // If a new item appears, subtle console log
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
        <h3>Menu not available</h3>
        <p>No menu items found for this cafe.</p>
      </div>
    `;
    return;
  }

  menuControlContainer.innerHTML = menuItems
    .map((item) => {
      const available = item.is_available === true;
      const stock = Number.isFinite(Number(item.stock)) ? Number(item.stock) : 0;
      const price = Number.isFinite(Number(item.price)) ? Number(item.price) : 0;
      const badgeStyle = available
        ? "background:#e8f5e9;color:#2e7d32;"
        : "background:#ffebee;color:#c62828;";

      return `
        <div class="order-card ${available ? "done" : "pending"}" style="margin-bottom: 14px;">
          <div class="order-header">
            <div class="order-info">
              <span class="order-id">${escapeHtml(item.name || "Item")}</span>
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
          <span>Cafe: ${cafeId}</span>
          <span class="order-total"></span>
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

    alert(`Order #${orderId} marked as ${nextStatus}.`);
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
    .channel("orders")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "orders", filter: `cafe_id=eq.${cafeId}` },
      (payload) => {
        console.log("New order:", payload.new);
        latestInsertedOrderId = payload?.new?.id ?? null;
        playAlert();
        fetchOrders();
      }
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        console.error("Realtime channel error.");
      }
    });
}

function playAlert() {
  // Use an MP3 file if available (best UX). Falls back to the built-in beep if autoplay is blocked.
  try {
    const audio = new Audio("/alert.mp3");
    audio.volume = 0.9;
    const maybePromise = audio.play();
    if (maybePromise && typeof maybePromise.catch === "function") {
      maybePromise.catch((err) => {
        console.warn("[Alert] Audio play blocked/unavailable, falling back to beep.", err);
        playNewOrderSound();
      });
    }
  } catch (err) {
    console.warn("[Alert] Failed to play /alert.mp3, falling back to beep.", err);
    playNewOrderSound();
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

// Expose status action to inline button handlers
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
