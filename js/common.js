/* =========================================================
   COMMON — dipakai di semua halaman
   (dashboard.html, data.html, profil.html, login.html, admin.html)
   ========================================================= */

let supabaseClient = null;
try {
  supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
} catch (err) {
  console.error("Gagal memuat Supabase (cek koneksi internet / CDN):", err);
}

let appState = {
  session: null,
  profile: null, // { id, username, display_name, avatar_url, role }
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function isAdmin() { return appState.profile && appState.profile.role === "admin"; }
function isLoggedIn() { return !!appState.session; }

function formatSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1e6) return (bytes / 1e3).toFixed(0) + " KB";
  return (bytes / 1e6).toFixed(1) + " MB";
}

function iconFor(kind) {
  const icons = {
    folder: '<path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/>',
    video: '<path d="M4 6h11a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm12 4.2 5-2.7v9l-5-2.7"/>',
    audio: '<path d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>',
    image: '<path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm2 12 4.5-5.5L14 16l2.5-3L21 17"/>',
    text: '<path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm3 8h6M9 15h6M9 7h3"/>',
    other: '<path d="M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/>',
  };
  return `<svg viewBox="0 0 24 24">${icons[kind] || icons.other}</svg>`;
}

function avatarFallback(username) {
  return `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(username || "user")}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function safeProfile(row) {
  return (row && row.profiles) ? row.profiles : {};
}

// =========================================================
// DRIVE — dipakai di halaman Data & Panel Admin
// =========================================================
async function fetchItems(folderId) {
  const url = `${CONFIG.APPS_SCRIPT_URL}?action=list&folderId=${encodeURIComponent(folderId || "")}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.items || [];
}

async function driveWrite(action, payload) {
  if (!appState.session) throw new Error("Belum masuk");
  const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
    method: "POST",
    body: JSON.stringify({ action, accessToken: appState.session.access_token, ...payload }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// dipakai di kartu file/folder (halaman Data & Panel Admin) buat ganti nama
async function renameItemPrompt(item, onSuccess) {
  const newName = prompt("Nama baru:", item.name);
  if (!newName || newName === item.name) return;
  try {
    await driveWrite("renameItem", { fileId: item.id, newName });
    if (onSuccess) onSuccess();
  } catch (err) {
    alert("Gagal ganti nama: " + err.message);
  }
}

// =========================================================
// SESSION & TOPBAR/SIDEBAR (dipakai tiap halaman)
// =========================================================
async function refreshSession() {
  if (!supabaseClient) { updateAuthUI(); return; }
  const { data: { session } } = await supabaseClient.auth.getSession();
  appState.session = session;

  if (session) {
    let { data: profile, error: selectError } = await supabaseClient
      .from("profiles").select("*").eq("id", session.user.id).single();

    if (selectError) console.error("[DEBUG] gagal select profiles:", selectError.message, selectError);

    // baris profil belum ada (mis. trigger gagal jalan) -> buat otomatis, jangan biarkan null
    if (!profile) {
      const meta = session.user.user_metadata || {};
      const fallbackUsername = "user" + session.user.id.replace(/-/g, "").slice(0, 8);
      const { data: created, error: insertError } = await supabaseClient
        .from("profiles")
        .insert({
          id: session.user.id,
          username: fallbackUsername,
          display_name: meta.full_name || meta.name || session.user.email || "Pengguna baru",
          avatar_url: meta.avatar_url || null,
          role: "user",
        })
        .select()
        .single();
      if (insertError) console.error("[DEBUG] gagal insert profiles (self-heal):", insertError.message, insertError);
      profile = created;
      appState.profileDebugError = insertError ? ("insert: " + insertError.message) : (selectError ? ("select: " + selectError.message) : null);
    } else {
      appState.profileDebugError = null;
    }
    appState.profile = profile;
  } else {
    appState.profile = null;
  }
  updateAuthUI();
}

function updateAuthUI() {
  const loggedIn = isLoggedIn();

  const loginBtn = $("#loginBtn");
  const userChip = $("#userChip");
  const navProfile = $("#navProfile");
  const navAdmin = $("#navAdmin");

  if (loginBtn) loginBtn.hidden = loggedIn;
  if (userChip) userChip.hidden = !loggedIn;
  if (navAdmin) navAdmin.hidden = !isAdmin();

  if (navProfile) {
    navProfile.href = loggedIn ? "profil.html" : "login.html";
    navProfile.querySelector("span").textContent = loggedIn ? "Profil Saya" : "Masuk Sekarang";
  }

  if (loggedIn && appState.profile) {
    const handle = $("#userHandle");
    const avatar = $("#userAvatar");
    if (handle) handle.textContent = appState.profile.display_name || "@" + appState.profile.username;
    if (avatar) avatar.src = appState.profile.avatar_url || avatarFallback(appState.profile.username);
  }

  document.dispatchEvent(new CustomEvent("authready", { detail: appState }));
}

async function logout() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  window.location.href = "login.html";
}

function markActiveNav() {
  const current = location.pathname.split("/").pop() || "dashboard.html";
  $$(".nav-item[data-page]").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.page === current);
  });
}

const SIDEBAR_KEY = "sidebarOpen";
const isMobileLayout = () => window.matchMedia("(max-width: 860px)").matches;

function setSidebarState(sidebar, scrim, open, { animate = true } = {}) {
  if (!animate) sidebar.classList.add("no-transition");
  sidebar.classList.toggle("is-open", open);
  scrim.classList.toggle("is-visible", open);
  sessionStorage.setItem(SIDEBAR_KEY, open ? "1" : "0");
  if (!animate) {
    // paksa reflow dulu baru lepas no-transition, biar animasi normal balik lagi buat interaksi selanjutnya
    void sidebar.offsetWidth;
    requestAnimationFrame(() => sidebar.classList.remove("no-transition"));
  }
}

function bindSidebarSwipe(sidebar, scrim, setOpen) {
  const EDGE_ZONE = 24; // px dari tepi kiri layar buat mulai geser membuka
  const DRAG_THRESHOLD = 6; // px sebelum gerakan dianggap "geser", biar tap biasa gak keganggu

  let dragging = false;
  let axisLocked = null; // "x" (horizontal, ini yang kita tangani) atau "y" (biarin scroll biasa)
  let startX = 0, startY = 0, startTime = 0, baseAmount = 0, sidebarWidth = 0;

  function currentAmount() {
    return sidebar.classList.contains("is-open") ? sidebarWidth : 0;
  }

  function resetVisualDrag() {
    sidebar.classList.remove("is-dragging");
    scrim.classList.remove("is-dragging");
    sidebar.style.transform = "";
    scrim.style.opacity = "";
  }

  function onPointerDown(e) {
    if (!isMobileLayout()) return;
    const open = sidebar.classList.contains("is-open");
    const withinSidebar = sidebar.contains(e.target);
    const withinScrim = scrim.contains(e.target);

    if (!open && e.clientX > EDGE_ZONE) return; // sidebar ketutup & bukan mulai dari tepi kiri -> abaikan
    if (open && !withinSidebar && !withinScrim) return; // sidebar kebuka tapi sentuhan di luar sidebar/scrim

    sidebarWidth = sidebar.offsetWidth;
    dragging = true;
    axisLocked = null;
    startX = e.clientX;
    startY = e.clientY;
    startTime = Date.now();
    baseAmount = currentAmount();
  }

  function onPointerMove(e) {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (axisLocked === null) {
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      axisLocked = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (axisLocked === "y") { dragging = false; return; } // gerakan vertikal -> biarin scroll jalan normal
      sidebar.classList.add("is-dragging");
      scrim.classList.add("is-dragging");
    }
    if (axisLocked !== "x") return;

    e.preventDefault();
    const amount = Math.min(sidebarWidth, Math.max(0, baseAmount + dx));
    sidebar.style.transform = `translateX(${amount - sidebarWidth}px)`;
    scrim.style.opacity = String(amount / sidebarWidth);
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    if (axisLocked !== "x") { resetVisualDrag(); return; }

    const dx = e.clientX - startX;
    const elapsed = Math.max(1, Date.now() - startTime);
    const velocity = dx / elapsed; // px per ms
    const amount = Math.min(sidebarWidth, Math.max(0, baseAmount + dx));
    const ratio = amount / sidebarWidth;

    // flick cepat langsung nurut arah geseran, kalau pelan baru dicek udah lewat setengah apa belum
    const open = Math.abs(velocity) > 0.5 ? velocity > 0 : ratio > 0.5;

    resetVisualDrag();
    setOpen(open);
  }

  document.addEventListener("pointerdown", onPointerDown, { passive: true });
  document.addEventListener("pointermove", onPointerMove, { passive: false });
  document.addEventListener("pointerup", onPointerUp, { passive: true });
  document.addEventListener("pointercancel", () => { dragging = false; resetVisualDrag(); }, { passive: true });
}

function bindCommonEvents() {
  const menuBtn = $("#menuBtn");
  const sidebar = $("#sidebar");
  const scrim = $("#sidebarScrim");
  if (menuBtn && sidebar && scrim) {
    const setOpen = (open, opts) => setSidebarState(sidebar, scrim, open, opts);

    // tombol X buat nutup, ditaruh nempel sama judul di dalam sidebar sendiri —
    // biar tetap kepencet meski sidebar lagi kebuka penuh dan nutupin tombol garis-3 di topbar
    const brand = sidebar.querySelector(".sidebar-brand");
    if (brand && !brand.querySelector("#sidebarCloseBtn")) {
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.id = "sidebarCloseBtn";
      closeBtn.className = "icon-btn only-mobile sidebar-close-btn";
      closeBtn.setAttribute("aria-label", "Tutup menu");
      closeBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';
      closeBtn.addEventListener("click", () => setOpen(false));
      brand.appendChild(closeBtn);
    }

    // pulihkan status sidebar dari halaman sebelumnya, tanpa animasi slide biar gak "muncul lagi" pas load
    if (isMobileLayout() && sessionStorage.getItem(SIDEBAR_KEY) === "1") {
      setOpen(true, { animate: false });
    }

    menuBtn.addEventListener("click", () => setOpen(!sidebar.classList.contains("is-open")));
    scrim.addEventListener("click", () => setOpen(false));

    bindSidebarSwipe(sidebar, scrim, setOpen);
  }
  const logoutBtn = $("#logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", logout);

  if (supabaseClient) supabaseClient.auth.onAuthStateChange(() => { refreshSession(); });
}

async function initCommon() {
  bindCommonEvents();
  markActiveNav();
  await refreshSession();
}

document.addEventListener("DOMContentLoaded", initCommon);
