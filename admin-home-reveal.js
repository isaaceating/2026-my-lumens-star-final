import { getApps } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js";

const app = getApps()[0];
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const storage = app ? getStorage(app) : null;

let currentUser = null;
let isAdmin = false;
let contestants = [];
let revealSettings = { isRevealed: false };
let isBusy = false;
let unsubscribeReveal = null;

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeText(value) {
  return String(value || "").trim();
}

function setMessage(message, type = "") {
  const element = $("homeRevealControlMessage");
  if (!element) return;
  element.textContent = message || "";
  element.dataset.statusType = type;
}

function setBusy(nextBusy) {
  isBusy = nextBusy;
  [
    "toggleHomeRevealButton",
    "reloadMysteryContestantsButton",
    "uploadMysteryImageButton",
    "removeMysteryImageButton"
  ].forEach((id) => {
    const button = $(id);
    if (button) button.disabled = isBusy || !isAdmin;
  });
}

function ensureHomeRevealControls() {
  if ($("homeRevealControlPanel")) return;

  const contestantManagement = $("contestantManagement");
  if (!contestantManagement) return;

  const toolbar = contestantManagement.querySelector(".admin-toolbar");
  const tableWrap = contestantManagement.querySelector(".admin-table-wrap");
  if (!tableWrap) return;

  const panel = document.createElement("div");
  panel.id = "homeRevealControlPanel";
  panel.className = "admin-form-card home-reveal-admin-card";
  panel.innerHTML = `
    <div class="home-reveal-admin-header">
      <div>
        <p class="section-kicker">Home Contestant Cards</p>
        <h3>首頁歌手卡片公布控制</h3>
        <p class="section-desc">
          最期待投票期間顯示神秘歌手圖；投票結束後，可手動切換首頁為完整歌手卡片。
        </p>
      </div>
      <div class="home-reveal-status-card">
        <span>目前首頁模式</span>
        <strong id="homeRevealStatusText">讀取中...</strong>
      </div>
    </div>

    <div class="home-reveal-action-row">
      <button type="button" id="toggleHomeRevealButton" class="secondary-button">讀取中...</button>
      <button type="button" id="reloadMysteryContestantsButton" class="secondary-button">重新載入選手</button>
    </div>

    <hr class="home-reveal-divider" />

    <div class="mystery-image-admin-grid">
      <label>
        選擇選手
        <select id="mysteryImageContestantSelect">
          <option value="">選手資料載入中...</option>
        </select>
      </label>

      <label>
        上傳 / 更換神秘歌手圖
        <input type="file" id="mysteryImageFileInput" accept="image/*" />
      </label>

      <button type="button" id="uploadMysteryImageButton" class="secondary-button">上傳神秘圖</button>
      <button type="button" id="removeMysteryImageButton" class="danger-button">移除神秘圖</button>
    </div>

    <div id="mysteryImagePreview" class="mystery-image-admin-preview hidden"></div>
    <p id="homeRevealControlMessage" class="message"></p>
  `;

  if (toolbar?.nextSibling) {
    contestantManagement.insertBefore(panel, toolbar.nextSibling);
  } else {
    contestantManagement.insertBefore(panel, tableWrap);
  }

  $("toggleHomeRevealButton")?.addEventListener("click", toggleHomeReveal);
  $("reloadMysteryContestantsButton")?.addEventListener("click", loadContestants);
  $("uploadMysteryImageButton")?.addEventListener("click", uploadMysteryImage);
  $("removeMysteryImageButton")?.addEventListener("click", removeMysteryImage);
  $("mysteryImageContestantSelect")?.addEventListener("change", renderMysteryPreview);

  renderRevealControls();
  renderContestantOptions();
}

async function checkAdmin(uid) {
  if (!db || !uid) return false;
  try {
    const adminSnap = await getDoc(doc(db, "admins", uid));
    return adminSnap.exists() && adminSnap.data().role === "admin";
  } catch (error) {
    console.error("Home reveal admin check failed:", error);
    return false;
  }
}

function startRevealListener() {
  if (!db || unsubscribeReveal) return;
  unsubscribeReveal = onSnapshot(doc(db, "settings", "homeContestantReveal"), (snapshot) => {
    revealSettings = snapshot.exists() ? { isRevealed: snapshot.data().isRevealed === true } : { isRevealed: false };
    renderRevealControls();
  }, (error) => {
    console.error("Load home reveal settings failed:", error);
    setMessage(`首頁公布狀態讀取失敗：${error.message}`, "error");
  });
}

function stopRevealListener() {
  if (!unsubscribeReveal) return;
  unsubscribeReveal();
  unsubscribeReveal = null;
}

async function loadContestants() {
  if (!db) return;
  try {
    setBusy(true);
    setMessage("選手資料讀取中...");
    const snapshot = await getDocs(collection(db, "contestants"));
    contestants = [];
    snapshot.forEach((docSnap) => contestants.push({ id: docSnap.id, ...docSnap.data() }));
    contestants.sort(sortContestants);
    renderContestantOptions();
    setMessage(`已載入 ${contestants.length} 位選手。`, "success");
  } catch (error) {
    console.error("Load contestants for mystery images failed:", error);
    setMessage(`選手資料讀取失敗：${error.message}`, "error");
  } finally {
    setBusy(false);
  }
}

function sortContestants(a, b) {
  const orderA = typeof a.manualOrder === "number" ? a.manualOrder : 999;
  const orderB = typeof b.manualOrder === "number" ? b.manualOrder : 999;
  if (orderA !== orderB) return orderA - orderB;
  return (a.registerTime?.seconds || 0) - (b.registerTime?.seconds || 0);
}

function renderRevealControls() {
  const statusText = $("homeRevealStatusText");
  const toggleButton = $("toggleHomeRevealButton");
  const isRevealed = revealSettings.isRevealed === true;

  if (statusText) {
    statusText.textContent = isRevealed ? "完整歌手卡片" : "神秘歌手模式";
  }

  if (toggleButton) {
    toggleButton.textContent = isRevealed ? "切回神秘模式" : "公布完整歌手卡片";
    toggleButton.disabled = isBusy || !isAdmin;
  }
}

function renderContestantOptions() {
  const select = $("mysteryImageContestantSelect");
  if (!select) return;

  if (!isAdmin) {
    select.innerHTML = `<option value="">需 Admin 權限</option>`;
    renderMysteryPreview();
    return;
  }

  if (!contestants.length) {
    select.innerHTML = `<option value="">目前沒有選手資料</option>`;
    renderMysteryPreview();
    return;
  }

  const previousValue = select.value;
  select.innerHTML = contestants.map((contestant, index) => {
    const number = String(index + 1).padStart(2, "0");
    const name = contestant.name || contestant.stageName || "未命名選手";
    const hasImage = contestant.mysteryPhotoUrl ? " ✓" : "";
    return `<option value="${escapeHtml(contestant.id)}">No. ${number}｜${escapeHtml(name)}${hasImage}</option>`;
  }).join("");

  if (previousValue && contestants.some((contestant) => contestant.id === previousValue)) {
    select.value = previousValue;
  }

  renderMysteryPreview();
}

function getSelectedContestant() {
  const selectedId = $("mysteryImageContestantSelect")?.value || "";
  return contestants.find((contestant) => contestant.id === selectedId) || null;
}

function renderMysteryPreview() {
  const preview = $("mysteryImagePreview");
  if (!preview) return;

  const contestant = getSelectedContestant();
  if (!contestant) {
    preview.classList.add("hidden");
    preview.innerHTML = "";
    return;
  }

  const imageUrl = contestant.mysteryPhotoUrl || contestant.photoUrl || "";
  preview.classList.remove("hidden");
  preview.innerHTML = `
    <div class="mystery-preview-image-wrap">
      ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(contestant.name || "神秘歌手圖")}" />` : `<div class="mystery-preview-placeholder">尚未上傳神秘圖</div>`}
    </div>
    <div class="mystery-preview-info">
      <strong>${escapeHtml(contestant.name || "未命名選手")}</strong>
      <span>A.K.A. ${escapeHtml(contestant.stageName || "—")}</span>
      <span>${contestant.mysteryPhotoUrl ? "已設定神秘圖" : "尚未設定神秘圖"}</span>
    </div>
  `;
}

async function toggleHomeReveal() {
  if (!requireAdmin()) return;

  const nextStatus = revealSettings.isRevealed !== true;
  const actionText = nextStatus ? "公布完整歌手卡片" : "切回神秘歌手模式";
  const confirmed = confirm(`確定要${actionText}嗎？\n\n此設定會立即影響首頁顯示。`);
  if (!confirmed) return;

  try {
    setBusy(true);
    setMessage("首頁歌手卡片狀態更新中...");
    await setDoc(doc(db, "settings", "homeContestantReveal"), {
      isRevealed: nextStatus,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser.email || "",
      updatedByUid: currentUser.uid
    }, { merge: true });
    setMessage(nextStatus ? "首頁已切換為完整歌手卡片。" : "首頁已切回神秘歌手模式。", "success");
  } catch (error) {
    console.error("Toggle home reveal failed:", error);
    setMessage(`首頁公布狀態更新失敗：${error.message}`, "error");
  } finally {
    setBusy(false);
  }
}

async function uploadMysteryImage() {
  if (!requireAdmin()) return;

  const contestant = getSelectedContestant();
  const file = $("mysteryImageFileInput")?.files?.[0];

  if (!contestant) {
    alert("請先選擇選手。");
    return;
  }

  if (!file) {
    alert("請先選擇要上傳的神秘歌手圖。");
    return;
  }

  if (!file.type.startsWith("image/")) {
    alert("請上傳圖片檔。");
    return;
  }

  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `contestant-mystery-images/${contestant.id}-${Date.now()}-${safeFileName}`;

  try {
    setBusy(true);
    setMessage("神秘歌手圖上傳中...");

    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, file, { contentType: file.type || "image/png" });
    const url = await getDownloadURL(storageRef);

    if (contestant.mysteryPhotoPath && contestant.mysteryPhotoPath !== storagePath) {
      try {
        await deleteObject(ref(storage, contestant.mysteryPhotoPath));
      } catch (error) {
        if (error?.code !== "storage/object-not-found") {
          console.warn("Old mystery image delete failed:", error);
        }
      }
    }

    await updateDoc(doc(db, "contestants", contestant.id), {
      mysteryPhotoUrl: url,
      mysteryPhotoPath: storagePath,
      mysteryPhotoName: normalizeText(file.name),
      updatedAt: serverTimestamp(),
      updatedBy: currentUser.email || "",
      updatedByUid: currentUser.uid
    });

    const fileInput = $("mysteryImageFileInput");
    if (fileInput) fileInput.value = "";

    await loadContestants();
    const select = $("mysteryImageContestantSelect");
    if (select) select.value = contestant.id;
    renderMysteryPreview();
    setMessage(`「${contestant.name || contestant.stageName || "選手"}」的神秘圖已更新。`, "success");
  } catch (error) {
    console.error("Upload mystery image failed:", error);
    setMessage(`神秘圖上傳失敗：${error.message}`, "error");
  } finally {
    setBusy(false);
  }
}

async function removeMysteryImage() {
  if (!requireAdmin()) return;

  const contestant = getSelectedContestant();
  if (!contestant) {
    alert("請先選擇選手。");
    return;
  }

  if (!contestant.mysteryPhotoUrl && !contestant.mysteryPhotoPath) {
    alert("這位選手目前沒有神秘圖。 ");
    return;
  }

  const confirmed = confirm(`確定要移除「${contestant.name || contestant.stageName || "選手"}」的神秘圖嗎？`);
  if (!confirmed) return;

  try {
    setBusy(true);
    setMessage("神秘圖移除中...");

    if (contestant.mysteryPhotoPath) {
      try {
        await deleteObject(ref(storage, contestant.mysteryPhotoPath));
      } catch (error) {
        if (error?.code !== "storage/object-not-found") throw error;
      }
    }

    await updateDoc(doc(db, "contestants", contestant.id), {
      mysteryPhotoUrl: "",
      mysteryPhotoPath: "",
      mysteryPhotoName: "",
      updatedAt: serverTimestamp(),
      updatedBy: currentUser.email || "",
      updatedByUid: currentUser.uid
    });

    await loadContestants();
    const select = $("mysteryImageContestantSelect");
    if (select) select.value = contestant.id;
    renderMysteryPreview();
    setMessage("神秘圖已移除。", "success");
  } catch (error) {
    console.error("Remove mystery image failed:", error);
    setMessage(`神秘圖移除失敗：${error.message}`, "error");
  } finally {
    setBusy(false);
  }
}

function requireAdmin() {
  if (!currentUser) {
    alert("請先使用 Google Admin 帳號登入。");
    return false;
  }

  if (!isAdmin) {
    alert("此帳號沒有 Admin 權限。");
    return false;
  }

  if (!db || !storage) {
    alert("Firebase 尚未初始化，請重新整理頁面。 ");
    return false;
  }

  return true;
}

ensureHomeRevealControls();
const observer = new MutationObserver(ensureHomeRevealControls);
observer.observe(document.body, { childList: true, subtree: true });

if (auth) {
  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    isAdmin = false;
    ensureHomeRevealControls();

    if (!user || user.isAnonymous) {
      stopRevealListener();
      contestants = [];
      revealSettings = { isRevealed: false };
      renderRevealControls();
      renderContestantOptions();
      setMessage("請使用 Google Admin 帳號登入後管理首頁歌手卡片與神秘圖。", "warning");
      setBusy(false);
      return;
    }

    isAdmin = await checkAdmin(user.uid);
    if (!isAdmin) {
      stopRevealListener();
      contestants = [];
      renderRevealControls();
      renderContestantOptions();
      setMessage("此帳號沒有 Admin 權限，無法管理首頁歌手卡片與神秘圖。", "error");
      setBusy(false);
      return;
    }

    startRevealListener();
    await loadContestants();
  });
}
