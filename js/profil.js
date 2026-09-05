/* =========================================================
   PROFIL — lihat & edit profil sendiri
   ========================================================= */

const USERNAME_REGEX = /^[A-Za-z0-9]+$/;

function fillProfileForm() {
  const p = appState.profile;
  if (!p) return;
  $("#profileAvatar").src = p.avatar_url || avatarFallback(p.username);
  $("#displayNameInput").value = p.display_name || "";
  $("#usernameInput").value = p.username || "";
  $("#avatarInput").value = p.avatar_url || "";
  const badge = $("#roleBadge");
  badge.textContent = p.role;
  badge.classList.toggle("is-admin", p.role === "admin");
}

async function uploadAvatarFile(file) {
  const note = $("#avatarUploadNote");
  const btn = $("#changeAvatarBtn");

  if (!appState.profile) {
    note.style.color = "rgb(var(--r))";
    note.textContent = "Profil belum siap, coba muat ulang halaman.";
    return;
  }

  if (!file.type.startsWith("image/")) {
    note.style.color = "rgb(var(--r))";
    note.textContent = "File harus berupa gambar.";
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    note.style.color = "rgb(var(--r))";
    note.textContent = "Ukuran foto maksimal 5MB.";
    return;
  }

  btn.disabled = true;
  note.style.color = "rgb(var(--text-dim))";
  note.textContent = "Mengunggah…";

  try {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${appState.profile.id}/avatar.${ext}`;

    const { error: uploadError } = await supabaseClient
      .storage.from("avatars")
      .upload(path, file, { upsert: true, cacheControl: "3600" });
    if (uploadError) throw uploadError;

    const { data } = supabaseClient.storage.from("avatars").getPublicUrl(path);
    const publicUrl = data.publicUrl + "?t=" + Date.now(); // hindari cache foto lama

    const { error: updateError } = await supabaseClient
      .from("profiles")
      .update({ avatar_url: publicUrl })
      .eq("id", appState.profile.id);
    if (updateError) throw updateError;

    appState.profile.avatar_url = publicUrl;
    $("#profileAvatar").src = publicUrl;
    $("#avatarInput").value = publicUrl;
    updateAuthUI();

    note.style.color = "rgb(var(--g))";
    note.textContent = "Foto profil diperbarui.";
  } catch (err) {
    note.style.color = "rgb(var(--r))";
    note.textContent = "Gagal upload: " + err.message;
  } finally {
    btn.disabled = false;
  }
}

async function saveProfile() {
  if (!appState.profile) {
    $("#saveNote").style.color = "rgb(var(--r))";
    $("#saveNote").textContent = "Profil belum siap, coba muat ulang halaman.";
    return;
  }
  const username = $("#usernameInput").value.trim();
  const displayName = $("#displayNameInput").value.trim();
  const avatarUrl = $("#avatarInput").value.trim();

  if (!USERNAME_REGEX.test(username)) {
    $("#usernameNote").textContent = "Username cuma boleh huruf & angka, tanpa spasi/simbol.";
    return;
  }
  $("#usernameNote").textContent = "";

  const { error } = await supabaseClient
    .from("profiles")
    .update({ username, display_name: displayName, avatar_url: avatarUrl || null })
    .eq("id", appState.profile.id);

  const note = $("#saveNote");
  if (error) {
    note.style.color = "rgb(var(--r))";
    note.textContent = error.message.includes("username_alnum_check") || error.message.includes("duplicate")
      ? "Gagal: username tidak valid atau sudah dipakai orang lain."
      : "Gagal: " + error.message;
    return;
  }
  note.style.color = "rgb(var(--g))";
  note.textContent = "Tersimpan.";
  appState.profile.username = username;
  appState.profile.display_name = displayName;
  appState.profile.avatar_url = avatarUrl || null;
  updateAuthUI();
}

document.addEventListener("authready", (e) => {
  const guard = $("#profileGuard");
  const card = $("#profileCard");
  if (!e.detail.session) {
    guard.textContent = "Kamu belum masuk.";
    guard.hidden = false;
    card.hidden = true;
    setTimeout(() => { window.location.href = "login.html"; }, 1200);
    return;
  }
  if (!e.detail.profile) {
    guard.textContent = "Profil gagal dimuat. Error: " + (appState.profileDebugError || "(tidak diketahui, cek console)");
    guard.hidden = false;
    card.hidden = true;
    return;
  }
  guard.hidden = true;
  card.hidden = false;
  fillProfileForm();
});

function bindProfileEvents() {
  $("#saveProfileBtn").addEventListener("click", saveProfile);
  $("#changeAvatarBtn").addEventListener("click", () => $("#avatarFileInput").click());
  $("#avatarFileInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) uploadAvatarFile(file);
  });
  $("#usernameInput").addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/[^A-Za-z0-9]/g, "");
  });
}

document.addEventListener("DOMContentLoaded", bindProfileEvents);
