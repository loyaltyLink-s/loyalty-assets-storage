/* =========================================================
   PANEL ADMIN — kelola role pengguna, moderasi ulasan, upload file
   ========================================================= */

let adminUploadState = { path: "", pathChain: [] };

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
  $("#adminUpload").hidden = tab !== "upload";
  if (tab === "reviews") loadAdminReviews();
  if (tab === "upload") loadAdminFolderGrid();
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

// =========================================================
// TAB UPLOAD — navigasi folder (folder-only) + upload/buat folder
// =========================================================
async function loadAdminFolderGrid() {
  const grid = $("#adminFolderGrid");
  grid.innerHTML = `<p class="empty-state">Memuat…</p>`;
  try {
    const items = await fetchItems(adminUploadState.path);
    const folders = items.filter((it) => it.kind === "folder");
    grid.innerHTML = "";
    if (folders.length === 0) grid.innerHTML = `<p class="empty-state">Nggak ada sub-folder di sini. File langsung ke-upload ke folder ini.</p>`;
    folders.forEach((folder) => {
      const card = document.createElement("div");
      card.className = "file-card";
      card.dataset.kind = "folder";
      card.innerHTML = `
        <div class="file-thumb">${iconFor("folder")}</div>
        <div class="file-card-body"><div class="file-name">${escapeHtml(folder.name)}</div><div class="file-meta">Folder</div></div>
        <button class="file-card-delete" title="Hapus folder" aria-label="Hapus folder">✕</button>
      `;
      card.addEventListener("click", () => {
        adminUploadState.pathChain.push({ id: folder.id, name: folder.name });
        adminUploadState.path = folder.id;
        renderAdminUploadBreadcrumb();
        loadAdminFolderGrid();
      });
      card.querySelector(".file-card-delete").addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm(`Hapus folder "${folder.name}" beserta semua isinya?`)) return;
        try {
          await driveWrite("deleteItem", { fileId: folder.id });
          await loadAdminFolderGrid();
        } catch (err) {
          alert("Gagal hapus folder: " + err.message);
        }
      });
      grid.appendChild(card);
    });
  } catch (err) {
    grid.innerHTML = `<p class="empty-state">Gagal memuat: ${err.message}</p>`;
  }
}

function renderAdminUploadBreadcrumb() {
  const el = $("#uploadBreadcrumb");
  const trail = [{ id: "", name: "Home" }, ...adminUploadState.pathChain];
  el.innerHTML = trail.map((t, i) => `<button data-index="${i}">${escapeHtml(t.name)}</button>`).join("");
  el.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      if (idx === 0) { adminUploadState.pathChain = []; adminUploadState.path = ""; }
      else { adminUploadState.pathChain = adminUploadState.pathChain.slice(0, idx); adminUploadState.path = trail[idx].id; }
      renderAdminUploadBreadcrumb();
      loadAdminFolderGrid();
    });
  });
}

function bindAdminUploadEvents() {
  const note = $("#adminUploadNote");

  $("#adminUploadTriggerBtn").addEventListener("click", () => $("#adminFileInput").click());
  $("#adminFileInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    note.style.color = "rgb(var(--text-dim))";
    note.textContent = "Mengunggah " + file.name + "…";
    try {
      const base64Data = await fileToBase64(file);
      await driveWrite("uploadFile", { parentId: adminUploadState.path, name: file.name, mimeType: file.type, base64Data });
      note.style.color = "rgb(var(--g))";
      note.textContent = "Berhasil upload: " + file.name;
      e.target.value = "";
    } catch (err) {
      note.style.color = "rgb(var(--r))";
      note.textContent = "Gagal upload: " + err.message;
    }
  });

  $("#adminNewFolderBtn").addEventListener("click", async () => {
    const name = prompt("Nama folder baru:");
    if (!name) return;
    try {
      await driveWrite("createFolder", { parentId: adminUploadState.path, name });
      await loadAdminFolderGrid();
    } catch (err) {
      note.style.color = "rgb(var(--r))";
      note.textContent = "Gagal buat folder: " + err.message;
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  $$("[data-admin-tab]").forEach((btn) => btn.addEventListener("click", () => switchAdminTab(btn.dataset.adminTab)));
  bindAdminUploadEvents();
});
