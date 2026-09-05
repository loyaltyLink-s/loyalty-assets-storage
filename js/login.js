/* =========================================================
   LOGIN — magic link + OAuth (Google, GitHub) + Turnstile captcha
   ========================================================= */

let turnstileToken = null;
let turnstileWidgetId = null;

function renderTurnstile() {
  if (typeof turnstile === "undefined" || !CONFIG.TURNSTILE_SITE_KEY) return;
  turnstileWidgetId = turnstile.render("#turnstileWidget", {
    sitekey: CONFIG.TURNSTILE_SITE_KEY,
    callback: (token) => { turnstileToken = token; },
    "expired-callback": () => { turnstileToken = null; },
  });
}
window.onTurnstileLoad = renderTurnstile;

async function sendMagicLink() {
  if (!supabaseClient) return;
  const email = $("#emailInput").value.trim();
  if (!email) return;
  if (CONFIG.TURNSTILE_SITE_KEY && !turnstileToken) {
    $("#loginNote").textContent = "Selesaikan verifikasi captcha dulu ya.";
    return;
  }
  const btn = $("#sendLinkBtn");
  btn.disabled = true;
  const basePath = window.location.pathname.replace(/login\.html$/, "");
  const emailRedirectTo = window.location.origin + basePath + "index.html";
  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: { emailRedirectTo, captchaToken: turnstileToken || undefined },
  });
  btn.disabled = false;
  $("#loginNote").textContent = error ? "Gagal: " + error.message : "Link masuk sudah dikirim, cek email kamu.";
  if (turnstileWidgetId !== null) turnstile.reset(turnstileWidgetId);
  turnstileToken = null;
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
