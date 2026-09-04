/* =========================================================
   PANEL ADMIN — kelola role pengguna & moderasi ulasan
   ========================================================= */

document.addEventListener("authready", (e) => {
  const guard = $("#adminGuard");
  const content = $("#adminContent");
  if (!e.detail.session) {
    guard.textContent = "Kamu belum masuk.";
    setTimeout(() => { window.location.href = "login.html"; }, 1200);
    return;
  }
  if (e.detail.profile && e.detail.profile.role !== "admin") {
    guard.textContent = "Halaman ini khusus admin.";
    setTimeout(() => { window.location.href = "index.html"; }, 1200);
    return;
  }
  if (e.detail.profile && e.detail.profile.role === "admin") {
    guard.hidden = true;
    content.hidden = false;
    loadAdminUsers();
  }
});

function switchAdminTab(tab) {
  $$("[data-admin-tab]").forEach((b) => b.classList.toggle("is-active", b.dataset.adminTab === tab));
  $("#adminUsers").hidden = tab !== "users";
  $("#adminReviews").hidden = tab !== "reviews";
  if (tab === "reviews") loadAdminReviews();
}

async function loadAdminUsers() {
  const list = $("#userList");
  list.innerHTML = "<p class=\"empty-state\">Memuat…</p>";
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, username, display_name, avatar_url, role")
    .order("created_at", { ascending: true });

  if (error) { list.innerHTML = `<p class="empty-state">Gagal memuat: ${error.message}</p>`; return; }

  list.innerHTML = "";
  (data || []).forEach((user) => {
    const row = document.createElement("div");
    row.className = "admin-row";
    const admin = user.role === "admin";
    row.innerHTML = `
      <img src="${user.avatar_url || avatarFallback(user.username)}" alt="">
      <div class="admin-row-main">
        <div class="admin-row-name">${escapeHtml(user.display_name || "(tanpa nama)")}</div>
        <div class="admin-row-sub">@${escapeHtml(user.username)}</div>
      </div>
      <span class="role-badge ${admin ? "is-admin" : ""}">${admin ? "admin" : "user"}</span>
      <button class="btn-ghost" data-current="${user.role}">${admin ? "Jadikan user" : "Jadikan admin"}</button>
    `;
    row.querySelector("button").addEventListener("click", (e) => {
      const newRole = e.target.dataset.current === "admin" ? "user" : "admin";
      toggleUserRole(user.id, newRole);
    });
    list.appendChild(row);
  });
}

async function toggleUserRole(userId, newRole) {
  if (userId === appState.profile.id && newRole === "user") {
    if (!confirm("Kamu bakal kehilangan akses admin sendiri. Lanjut?")) return;
  }
  const { error } = await supabaseClient.from("profiles").update({ role: newRole }).eq("id", userId);
  if (error) { alert("Gagal ubah role: " + error.message); return; }
  await loadAdminUsers();
  if (userId === appState.profile.id) await refreshSession();
}

async function loadAdminReviews() {
  const list = $("#allReviewList");
  list.innerHTML = "<p class=\"empty-state\">Memuat…</p>";
  const { data, error } = await supabaseClient
    .from("reviews")
    .select("id, file_id, content, is_hidden, created_at, profiles(username)")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) { list.innerHTML = `<p class="empty-state">Gagal memuat: ${error.message}</p>`; return; }

  list.innerHTML = "";
  (data || []).forEach((review) => {
    const profile = safeProfile(review);
    const row = document.createElement("div");
    row.className = "admin-row admin-row-review";
    row.innerHTML = `
      <div class="admin-row-sub"><span>@${escapeHtml(profile.username || "pengguna")} · file ${escapeHtml(review.file_id)}</span></div>
      <p class="review-text">${escapeHtml(review.content)}</p>
      <div class="review-actions">
        <button data-action="hide">${review.is_hidden ? "Tampilkan" : "Sembunyikan"}</button>
        <button data-action="delete">Hapus</button>
      </div>
    `;
    row.querySelector('[data-action="hide"]').addEventListener("click", async () => {
      await supabaseClient.from("reviews").update({ is_hidden: !review.is_hidden }).eq("id", review.id);
      loadAdminReviews();
    });
    row.querySelector('[data-action="delete"]').addEventListener("click", async () => {
      if (!confirm("Hapus ulasan ini?")) return;
      await supabaseClient.from("reviews").delete().eq("id", review.id);
      loadAdminReviews();
    });
    list.appendChild(row);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  $$("[data-admin-tab]").forEach((btn) => btn.addEventListener("click", () => switchAdminTab(btn.dataset.adminTab)));
});
