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

function bindCommonEvents() {
  const menuBtn = $("#menuBtn");
  const sidebar = $("#sidebar");
  const scrim = $("#sidebarScrim");
  if (menuBtn && sidebar && scrim) {
    menuBtn.addEventListener("click", () => { sidebar.classList.add("is-open"); scrim.classList.add("is-visible"); });
    scrim.addEventListener("click", () => { sidebar.classList.remove("is-open"); scrim.classList.remove("is-visible"); });
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
