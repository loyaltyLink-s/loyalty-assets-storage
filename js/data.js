/* =========================================================
   DATA — file/folder browser (grid, breadcrumb, modal, upload, ulasan)
   Butuh common.js dimuat sebelum file ini.
   ========================================================= */

let dataState = {
  path: "",
  pathChain: [],
  items: [],
  view: "grid",
  query: "",
  activeModalItem: null,
  replyTarget: null,
};

// ---------- DRIVE ----------
async function fetchItems(folderId) {
  const url = `${CONFIG.APPS_SCRIPT_URL}?action=list&folderId=${encodeURIComponent(folderId || "")}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.items || [];
}

async function fetchTextContent(fileId) {
  const url = `${CONFIG.APPS_SCRIPT_URL}?action=textContent&fileId=${encodeURIComponent(fileId)}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.content || "";
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

// klik = langsung download. Drive sendiri yang atur header download-nya
// selama file di-share "Anyone with link - Viewer" (sudah otomatis dari uploadFile).
function forceDownload(item) {
  const a = document.createElement("a");
  a.href = item.downloadUrl;
  a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ---------- RENDER: grid, breadcrumb ----------
async function loadFolder(folderId, folderName) {
  if (folderId) dataState.pathChain.push({ id: folderId, name: folderName });
  else dataState.pathChain = [];
  dataState.path = folderId || "";
  dataState.query = "";
  $("#searchInput").value = "";
  renderBreadcrumb();
  await refreshGrid();
}

async function refreshGrid() {
  const grid = $("#fileGrid");
  grid.innerHTML = `<p class="empty-state">Memuat…</p>`;
  try {
    dataState.items = await fetchItems(dataState.path);
  } catch (err) {
    grid.innerHTML = `<p class="empty-state">Gagal memuat: ${err.message}</p>`;
    return;
  }
  renderGrid();
}

function renderGrid() {
  const grid = $("#fileGrid");
  const empty = $("#emptyState");
  grid.classList.toggle("is-list", dataState.view === "list");

  let items = dataState.items;
  if (dataState.query.trim()) {
    const q = dataState.query.toLowerCase();
    items = items.filter((it) => it.name.toLowerCase().includes(q));
  }

  grid.innerHTML = "";
  empty.hidden = items.length > 0;

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "file-card";
    card.dataset.kind = item.kind;
    card.innerHTML = `
      <div class="file-thumb">${iconFor(item.kind)}</div>
      <div>
        <div class="file-name">${escapeHtml(item.name)}</div>
        <div class="file-meta">${item.kind === "folder" ? "Folder" : formatSize(item.size)}</div>
      </div>
    `;
    card.addEventListener("click", () => {
      if (item.kind === "folder") loadFolder(item.id, item.name);
      else openModal(item);
    });
    grid.appendChild(card);
  });
}

function renderBreadcrumb() {
  const el = $("#breadcrumb");
  const trail = [{ id: "", name: "Home" }, ...dataState.pathChain];
  el.innerHTML = trail.map((t, i) => `<button data-index="${i}">${escapeHtml(t.name)}</button>`).join("");
  el.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      if (idx === 0) { dataState.pathChain = []; dataState.path = ""; }
      else { dataState.pathChain = dataState.pathChain.slice(0, idx); dataState.path = trail[idx].id; }
      renderBreadcrumb();
      refreshGrid();
    });
  });
}

// ---------- MODAL ----------
async function openModal(item) {
  dataState.activeModalItem = item;
  $("#modalBackdrop").hidden = false;
  $("#modalTitle").textContent = item.name;
  $("#modalMeta").textContent = `${item.kind.toUpperCase()} · ${formatSize(item.size)}`;
  $("#deleteBtn").hidden = !isAdmin();

  const preview = $("#modalPreview");
  const txtPreview = $("#fileTxtPreview");
  txtPreview.hidden = true;
  preview.innerHTML = "";

  if (item.kind === "video" || item.kind === "audio") {
    preview.innerHTML = `<iframe src="${item.viewUrl}" width="100%" height="${item.kind === "video" ? 280 : 90}" allow="autoplay" style="border:0;"></iframe>`;
  } else if (item.kind === "image") {
    preview.innerHTML = `<img src="${item.imageViewUrl}" alt="${escapeHtml(item.name)}">`;
  } else if (item.kind === "text") {
    preview.innerHTML = `<div class="file-thumb" style="width:64px;height:64px;">${iconFor("text")}</div>`;
    txtPreview.hidden = false;
    txtPreview.textContent = "Memuat isi teks…";
    fetchTextContent(item.id).then((content) => { txtPreview.textContent = content; });
  }

  $("#downloadBtn").onclick = () => forceDownload(item);

  switchTab("info");
  await loadReviews(item.id);
}

function closeModal() {
  $("#modalBackdrop").hidden = true;
  $("#modalPreview").innerHTML = "";
  dataState.activeModalItem = null;
  dataState.replyTarget = null;
}

function switchTab(tab) {
  $$(".tab-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === tab));
  $("#tabInfo").hidden = tab !== "info";
  $("#tabReviews").hidden = tab !== "reviews";
}

// ---------- ULASAN BERJENJANG ----------
async function loadReviews(fileId) {
  if (!supabaseClient) { $("#reviewList").innerHTML = `<p class="empty-state">Fitur ulasan belum siap.</p>`; return; }
  const { data, error } = await supabaseClient
    .from("reviews")
    .select("id, content, parent_id, reply_to_username, is_hidden, created_at, profiles(username, avatar_url)")
    .eq("file_id", fileId)
    .order("created_at", { ascending: true });

  if (error) { $("#reviewList").innerHTML = `<p class="empty-state">Gagal memuat ulasan: ${error.message}</p>`; return; }
  renderReviewTree(data || []);
}

function renderReviewTree(rows) {
  const top = rows.filter((r) => !r.parent_id);
  const repliesByParent = {};
  rows.filter((r) => r.parent_id).forEach((r) => {
    if (!repliesByParent[r.parent_id]) repliesByParent[r.parent_id] = [];
    repliesByParent[r.parent_id].push(r);
  });

  const totalReplies = rows.filter((r) => r.parent_id).length;
  $("#reviewTotal").textContent = rows.length;
  $("#replyTotal").textContent = totalReplies;
  $("#reviewCountBadge").textContent = rows.length;

  const list = $("#reviewList");
  list.innerHTML = "";

  top.forEach((review) => {
    const replies = repliesByParent[review.id] || [];
    const reviewProfile = safeProfile(review);
    const wrap = document.createElement("div");
    wrap.className = "review";
    wrap.innerHTML = `
      <div class="review-head">
        <img src="${reviewProfile.avatar_url || avatarFallback(reviewProfile.username)}" alt="">
        <span class="review-user">@${escapeHtml(reviewProfile.username || "pengguna")}</span>
      </div>
      <p class="review-text">${escapeHtml(review.content)}</p>
      <div class="review-actions">
        ${isLoggedIn() ? `<button data-action="reply">Balas</button>` : ""}
        ${replies.length > 0 ? `<button data-action="toggle">${replies.length} balasan • sembunyikan</button>` : ""}
      </div>
      <div class="reply-list"></div>
    `;

    const replyListEl = wrap.querySelector(".reply-list");
    replies.forEach((reply) => {
      const replyProfile = safeProfile(reply);
      const r = document.createElement("div");
      r.className = "review";
      r.innerHTML = `
        <div class="review-head">
          <img src="${replyProfile.avatar_url || avatarFallback(replyProfile.username)}" alt="">
          <span class="review-user">@${escapeHtml(replyProfile.username || "pengguna")} <span class="reply-target">&gt; @${escapeHtml(reply.reply_to_username)}</span></span>
        </div>
        <p class="review-text">${escapeHtml(reply.content)}</p>
        <div class="review-actions">
          ${isLoggedIn() ? `<button data-action="reply">Balas</button>` : ""}
        </div>
      `;
      if (isLoggedIn()) {
        r.querySelector('[data-action="reply"]').addEventListener("click", () => startReply(review.id, replyProfile.username));
      }
      replyListEl.appendChild(r);
    });

    const toggleBtn = wrap.querySelector('[data-action="toggle"]');
    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        replyListEl.hidden = !replyListEl.hidden;
        toggleBtn.textContent = `${replies.length} balasan • ${replyListEl.hidden ? "tampilkan" : "sembunyikan"}`;
      });
    }
    const replyBtn = wrap.querySelector('[data-action="reply"]');
    if (replyBtn) replyBtn.addEventListener("click", () => startReply(review.id, reviewProfile.username));

    list.appendChild(wrap);
  });
}

function startReply(reviewId, username) {
  dataState.replyTarget = { reviewId, username };
  const input = $("#reviewInput");
  input.placeholder = `Membalas @${username}…`;
  input.focus();
}

async function submitReview() {
  if (!isLoggedIn()) { alert("Masuk dulu ya buat kasih ulasan."); return; }
  const input = $("#reviewInput");
  const content = input.value.trim();
  if (!content || !dataState.activeModalItem) return;

  const payload = {
    file_id: dataState.activeModalItem.id,
    user_id: appState.profile.id,
    content,
    parent_id: dataState.replyTarget ? dataState.replyTarget.reviewId : null,
    reply_to_username: dataState.replyTarget ? dataState.replyTarget.username : null,
  };
  const { error } = await supabaseClient.from("reviews").insert(payload);
  if (error) { alert("Gagal mengirim ulasan: " + error.message); return; }

  input.value = "";
  input.placeholder = "Tulis ulasan… (masuk dulu ya)";
  dataState.replyTarget = null;
  await loadReviews(dataState.activeModalItem.id);
}

// ---------- EVENTS ----------
function bindDataEvents() {
  $("#searchInput").addEventListener("input", (e) => { dataState.query = e.target.value; renderGrid(); });

  $("#viewToggle").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    dataState.view = btn.dataset.mode;
    $$("#viewToggle button").forEach((b) => b.classList.toggle("is-active", b === btn));
    renderGrid();
  });

  $("#manageBtn").addEventListener("click", () => { $("#managePopover").hidden = !$("#managePopover").hidden; });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".popover-wrap")) $("#managePopover").hidden = true;
  });

  $("#uploadTriggerBtn").addEventListener("click", () => $("#fileInput").click());
  $("#fileInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const base64Data = await fileToBase64(file);
      await driveWrite("uploadFile", { parentId: dataState.path, name: file.name, mimeType: file.type, base64Data });
      $("#managePopover").hidden = true;
      await refreshGrid();
    } catch (err) { alert("Gagal upload: " + err.message); }
  });
  $("#newFolderBtn").addEventListener("click", async () => {
    const name = prompt("Nama folder baru:");
    if (!name) return;
    try {
      await driveWrite("createFolder", { parentId: dataState.path, name });
      $("#managePopover").hidden = true;
      await refreshGrid();
    } catch (err) { alert("Gagal buat folder: " + err.message); }
  });

  $("#deleteBtn").addEventListener("click", async () => {
    if (!dataState.activeModalItem) return;
    if (!confirm(`Hapus "${dataState.activeModalItem.name}"?`)) return;
    try {
      await driveWrite("deleteItem", { fileId: dataState.activeModalItem.id });
      closeModal();
      await refreshGrid();
    } catch (err) { alert("Gagal hapus: " + err.message); }
  });

  $("#shareBtn").addEventListener("click", () => {
    if (!dataState.activeModalItem) return;
    navigator.share
      ? navigator.share({ title: dataState.activeModalItem.name, url: dataState.activeModalItem.downloadUrl })
      : window.open(dataState.activeModalItem.downloadUrl, "_blank");
  });

  $("#modalClose").addEventListener("click", closeModal);
  $("#modalBackdrop").addEventListener("click", (e) => { if (e.target.id === "modalBackdrop") closeModal(); });
  $$(".tab-btn").forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
  $("#reviewSubmit").addEventListener("click", submitReview);
}

document.addEventListener("authready", () => {
  $("#manageBtn").hidden = !isAdmin();
  if (dataState.activeModalItem) $("#deleteBtn").hidden = !isAdmin();
});

async function initData() {
  bindDataEvents();
  await loadFolder("", "");
}

document.addEventListener("DOMContentLoaded", initData);
