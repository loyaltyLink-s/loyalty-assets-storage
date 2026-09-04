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

async function saveProfile() {
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
  guard.hidden = true;
  card.hidden = false;
  fillProfileForm();
});

function bindProfileEvents() {
  $("#saveProfileBtn").addEventListener("click", saveProfile);
  $("#usernameInput").addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/[^A-Za-z0-9]/g, "");
  });
}

document.addEventListener("DOMContentLoaded", bindProfileEvents);
