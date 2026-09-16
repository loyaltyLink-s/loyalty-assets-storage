/* =========================================================
   TANYA GEMINI — chat sederhana yang manggil Gemini API lewat
   backend Apps Script (action: askGemini). Riwayat chat cuma
   disimpan di memori tab ini, reset kalau halaman dibuka ulang.
   ========================================================= */

let geminiHistory = []; // { role: "user" | "assistant", text }

const GEMINI_OWN_KEY_STORAGE = "geminiOwnApiKey";
const GEMINI_OWN_MODEL_STORAGE = "geminiOwnModel";
const GEMINI_DEFAULT_MODEL = "gemini-3.8-flash";

// Dipanggil langsung dari browser pakai API key user sendiri -> gak lewat server sama sekali
async function askGeminiDirect(apiKey, model, messages) {
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.text || "") }],
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents }),
  });
  const body = await res.json();

  if (!res.ok) {
    const msg = (body.error && body.error.message) || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  const candidate = body.candidates && body.candidates[0];
  const parts = candidate && candidate.content && candidate.content.parts;
  const text = parts ? parts.map((p) => p.text || "").join("") : "";
  return text || "(Gemini tidak memberikan jawaban)";
}

document.addEventListener("authready", (e) => {
  const guard = $("#geminiGuard");
  const chat = $("#geminiChat");
  if (!guard || !chat) return;

  if (!e.detail.session) {
    guard.textContent = "Kamu belum masuk, dialihkan ke halaman login…";
    setTimeout(() => { window.location.href = "login.html"; }, 1200);
    return;
  }

  guard.hidden = true;
  chat.hidden = false;
  const input = $("#geminiInput");
  if (input) input.focus();
});

function scrollGeminiToBottom() {
  const box = $("#geminiMessages");
  if (box) box.scrollTop = box.scrollHeight;
}

function appendGeminiBubble(role, text) {
  const welcome = $("#geminiWelcome");
  if (welcome) welcome.remove();

  const box = $("#geminiMessages");
  const bubble = document.createElement("div");
  bubble.className = `gemini-bubble gemini-bubble-${role}`;
  bubble.textContent = text;
  box.appendChild(bubble);
  scrollGeminiToBottom();
  return bubble;
}

function autoGrowGeminiInput() {
  const el = $("#geminiInput");
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 160) + "px";
}

document.addEventListener("DOMContentLoaded", () => {
  // --- panel pengaturan API key / model pribadi ---
  const keyInput = $("#geminiOwnKey");
  const modelInput = $("#geminiOwnModel");
  const panel = $("#geminiSettingsPanel");
  const toggleBtn = $("#geminiSettingsToggle");

  if (keyInput && modelInput) {
    keyInput.value = localStorage.getItem(GEMINI_OWN_KEY_STORAGE) || "";
    modelInput.value = localStorage.getItem(GEMINI_OWN_MODEL_STORAGE) || "";
  }

  if (toggleBtn && panel) {
    toggleBtn.addEventListener("click", () => { panel.hidden = !panel.hidden; });
  }

  const saveBtn = $("#geminiSettingsSave");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const key = keyInput.value.trim();
      const model = modelInput.value.trim();
      if (key) localStorage.setItem(GEMINI_OWN_KEY_STORAGE, key); else localStorage.removeItem(GEMINI_OWN_KEY_STORAGE);
      if (model) localStorage.setItem(GEMINI_OWN_MODEL_STORAGE, model); else localStorage.removeItem(GEMINI_OWN_MODEL_STORAGE);
      panel.hidden = true;
    });
  }

  const clearBtn = $("#geminiSettingsClear");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      localStorage.removeItem(GEMINI_OWN_KEY_STORAGE);
      localStorage.removeItem(GEMINI_OWN_MODEL_STORAGE);
      keyInput.value = "";
      modelInput.value = "";
      panel.hidden = true;
    });
  }

  // --- form kirim pesan ---
  const form = $("#geminiForm");
  const input = $("#geminiInput");
  if (!form || !input) return;

  input.addEventListener("input", autoGrowGeminiInput);
  input.addEventListener("keydown", (ev) => {
    // Enter buat kirim, Shift+Enter buat baris baru
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    input.value = "";
    autoGrowGeminiInput();

    appendGeminiBubble("user", text);
    geminiHistory.push({ role: "user", text });

    const sendBtn = $("#geminiSendBtn");
    sendBtn.disabled = true;
    const typingBubble = appendGeminiBubble("assistant", "Mengetik…");
    typingBubble.classList.add("gemini-bubble-typing");

    try {
      const ownKey = (localStorage.getItem(GEMINI_OWN_KEY_STORAGE) || "").trim();
      let reply;
      if (ownKey) {
        const ownModel = (localStorage.getItem(GEMINI_OWN_MODEL_STORAGE) || "").trim() || GEMINI_DEFAULT_MODEL;
        reply = await askGeminiDirect(ownKey, ownModel, geminiHistory);
      } else {
        const data = await driveWrite("askGemini", { messages: geminiHistory });
        reply = data.reply || "(Gemini tidak memberikan jawaban)";
      }
      typingBubble.classList.remove("gemini-bubble-typing");
      typingBubble.textContent = reply;
      geminiHistory.push({ role: "assistant", text: reply });
    } catch (err) {
      typingBubble.classList.remove("gemini-bubble-typing");
      typingBubble.classList.add("gemini-bubble-error");
      typingBubble.textContent = "Gagal dapat jawaban: " + err.message;
      geminiHistory.pop(); // jangan simpan giliran user kalau jawabannya gagal total
    } finally {
      sendBtn.disabled = false;
      scrollGeminiToBottom();
    }
  });
});
