/* =========================================================
   DASHBOARD — total file, folder, dan ukuran (rekursif, semua sub-folder)
   ========================================================= */

async function loadStats() {
  try {
    const res = await fetch(`${CONFIG.APPS_SCRIPT_URL}?action=stats`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    $("#statFiles").textContent = data.fileCount;
    $("#statFolders").textContent = data.folderCount;
    $("#statSize").textContent = formatSize(data.totalSize);
  } catch (err) {
    $("#statFiles").textContent = "—";
    $("#statFolders").textContent = "—";
    $("#statSize").textContent = "—";
    console.error("Gagal memuat statistik:", err);
  }
}

document.addEventListener("DOMContentLoaded", loadStats);
