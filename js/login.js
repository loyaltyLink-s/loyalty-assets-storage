/* =========================================================
   LOGIN — magic link + OAuth (Google, GitHub)
   ========================================================= */

async function sendMagicLink() {
  if (!supabaseClient) return;
  const email = $("#emailInput").value.trim();
  if (!email) return;
  const btn = $("#sendLinkBtn");
  btn.disabled = true;
  const { error } = await supabaseClient.auth.signInWithOtp({ email });
  btn.disabled = false;
  $("#loginNote").textContent = error ? "Gagal: " + error.message : "Link masuk sudah dikirim, cek email kamu.";
}

async function loginWithProvider(provider) {
  if (!supabaseClient) return;
  // otomatis ikut folder tempat login.html berada, jadi tetap benar
  // walau situsnya di-hosting di subfolder (mis. /loyalty-assets-storage/)
  const basePath = window.location.pathname.replace(/login\.html$/, "");
  const redirectTo = window.location.origin + basePath + "index.html";
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider,
    options: { redirectTo },
  });
  if (error) $("#loginNote").textContent = "Gagal: " + error.message;
}

// kalau ternyata udah login (buka /login.html padahal session masih aktif), lempar ke dashboard
document.addEventListener("authready", (e) => {
  if (e.detail.session) window.location.href = "index.html";
});

function bindLoginEvents() {
  $("#sendLinkBtn").addEventListener("click", sendMagicLink);
  $("#googleLoginBtn").addEventListener("click", () => loginWithProvider("google"));
  $("#githubLoginBtn").addEventListener("click", () => loginWithProvider("github"));
}

document.addEventListener("DOMContentLoaded", bindLoginEvents);
