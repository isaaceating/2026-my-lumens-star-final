import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBlj362N4O6ERqgFziQ4Gg9W7SEyquKb0g",
  authDomain: "my-lumens-star-2026.firebaseapp.com",
  projectId: "my-lumens-star-2026",
  storageBucket: "my-lumens-star-2026.firebasestorage.app",
  messagingSenderId: "150108062917",
  appId: "1:150108062917:web:f7284392bed27438041cac"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

let currentUser = null;
let isAdmin = false;
let displayImages = [];
let isBusy = false;

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeText(value) {
  return String(value || "").trim();
}

function setStatus(message, type = "") {
  const status = $("displayImageControlMessage");
  if (!status) return;
  status.textContent = message || "";
  status.dataset.statusType = type;
}

function setBusy(nextBusy) {
  isBusy = nextBusy;
  ["uploadDisplayImageButton", "showDisplayImageButton", "refreshDisplayImagesButton"].forEach((id) => {
    const button = $(id);
    if (button) button.disabled = isBusy || !isAdmin;
  });
}

function ensureDisplayImageControls() {
  if ($("displayImageControlPanel")) return;

  const resultControlCard = document.querySelector("#resultDisplayControl .result-control-card");
  const controlMessage = $("resultDisplayControlMessage");
  if (!resultControlCard) return;

  const panel = document.createElement("div");
  panel.id = "displayImageControlPanel";
  panel.className = "result-control-group display-image-control-panel";
  panel.innerHTML = `
    <div class="display-image-control-header">
      <div>
        <h3>滿版圖片畫面</h3>
        <p class="section-desc">上傳活動用圖片，命名後會進入選單；選取後可一鍵切到大螢幕滿版畫面。</p>
      </div>
      <button type="button" id="refreshDisplayImagesButton" class="secondary-button">重新整理圖片</button>
    </div>

    <div class="display-image-uploader">
      <label>圖片名稱
        <input type="text" id="displayImageNameInput" placeholder="例如：決賽正式開始、評分規則、評審介紹" />
      </label>
      <label>選擇圖片
        <input type="file" id="displayImageFileInput" accept="image/*" />
      </label>
      <button type="button" id="uploadDisplayImageButton" class="secondary-button">上傳圖片</button>
    </div>

    <div class="display-image-picker-row">
      <label>選擇要顯示的圖片
        <select id="displayImageSelect">
          <option value="">圖片清單讀取中...</option>
        </select>
      </label>
      <button type="button" id="showDisplayImageButton">顯示滿版圖片</button>
    </div>

    <div id="displayImagePreview" class="display-image-preview hidden"></div>
    <p id="displayImageControlMessage" class="message"></p>
  `;

  if (controlMessage && controlMessage.parentNode === resultControlCard) {
    resultControlCard.insertBefore(panel, controlMessage);
  } else {
    resultControlCard.appendChild(panel);
  }

  $("uploadDisplayImageButton")?.addEventListener("click", uploadDisplayImage);
  $("showDisplayImageButton")?.addEventListener("click", showSelectedDisplayImage);
  $("refreshDisplayImagesButton")?.addEventListener("click", loadDisplayImages);
  $("displayImageSelect")?.addEventListener("change", renderSelectedPreview);
  renderDisplayImageOptions();
}

async function checkAdmin(uid) {
  try {
    const adminSnap = await getDoc(doc(db, "admins", uid));
    return adminSnap.exists() && adminSnap.data().role === "admin";
  } catch (error) {
    console.error("Display image admin check failed:", error);
    return false;
  }
}

async function loadDisplayImages() {
  if (!isAdmin) {
    setStatus("請使用 Admin 帳號登入後管理滿版圖片。", "warning");
    renderDisplayImageOptions();
    return;
  }

  try {
    setBusy(true);
    setStatus("圖片清單讀取中...");
    const snapshot = await getDocs(collection(db, "finalDisplayImages"));
    displayImages = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (!data || !data.url) return;
      displayImages.push({ id: docSnap.id, ...data });
    });
    displayImages.sort((a, b) => {
      const timeA = a.createdAt?.seconds || a.updatedAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || b.updatedAt?.seconds || 0;
      return timeB - timeA;
    });
    renderDisplayImageOptions();
    setStatus(displayImages.length ? `已載入 ${displayImages.length} 張滿版圖片。` : "目前尚未上傳滿版圖片。", "success");
  } catch (error) {
    console.error("Load display images failed:", error);
    setStatus(`圖片清單讀取失敗：${error.message}`, "error");
  } finally {
    setBusy(false);
  }
}

function renderDisplayImageOptions() {
  const select = $("displayImageSelect");
  if (!select) return;

  if (!isAdmin) {
    select.innerHTML = `<option value="">需 Admin 權限</option>`;
    renderSelectedPreview();
    setBusy(false);
    return;
  }

  if (!displayImages.length) {
    select.innerHTML = `<option value="">尚未上傳圖片</option>`;
    renderSelectedPreview();
    return;
  }

  select.innerHTML = `<option value="">請選擇圖片</option>` + displayImages.map((image) => {
    const label = image.name || image.fileName || "未命名圖片";
    return `<option value="${escapeHtml(image.id)}">${escapeHtml(label)}</option>`;
  }).join("");
  renderSelectedPreview();
}

function getSelectedImage() {
  const selectedId = $("displayImageSelect")?.value || "";
  return displayImages.find((image) => image.id === selectedId) || null;
}

function renderSelectedPreview() {
  const preview = $("displayImagePreview");
  if (!preview) return;

  const selected = getSelectedImage();
  if (!selected) {
    preview.classList.add("hidden");
    preview.innerHTML = "";
    return;
  }

  preview.classList.remove("hidden");
  preview.innerHTML = `
    <img src="${escapeHtml(selected.url)}" alt="${escapeHtml(selected.name || "滿版圖片預覽")}" />
    <div>
      <strong>${escapeHtml(selected.name || "未命名圖片")}</strong>
      <span>${escapeHtml(selected.fileName || "")}</span>
    </div>
  `;
}

async function uploadDisplayImage() {
  if (!isAdmin || !currentUser) {
    alert("請先使用 Google Admin 帳號登入。");
    return;
  }

  const fileInput = $("displayImageFileInput");
  const nameInput = $("displayImageNameInput");
  const file = fileInput?.files?.[0];

  if (!file) {
    setStatus("請先選擇要上傳的圖片。", "warning");
    alert("請先選擇要上傳的圖片。");
    return;
  }

  if (!file.type.startsWith("image/")) {
    setStatus("檔案格式不正確，請上傳圖片檔。", "error");
    alert("請上傳圖片檔。");
    return;
  }

  const imageName = normalizeText(nameInput?.value) || file.name.replace(/\.[^.]+$/, "") || "未命名圖片";
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `final-display-images/${Date.now()}-${safeFileName}`;

  try {
    setBusy(true);
    setStatus("圖片上傳中，請稍候...");
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, file, { contentType: file.type || "image/png" });
    const url = await getDownloadURL(storageRef);

    const docRef = await addDoc(collection(db, "finalDisplayImages"), {
      name: imageName,
      fileName: file.name,
      url,
      storagePath,
      size: file.size || 0,
      contentType: file.type || "",
      createdAt: serverTimestamp(),
      createdBy: currentUser.email || "",
      createdByUid: currentUser.uid
    });

    if (fileInput) fileInput.value = "";
    if (nameInput) nameInput.value = "";
    await loadDisplayImages();
    const select = $("displayImageSelect");
    if (select) select.value = docRef.id;
    renderSelectedPreview();
    setStatus(`「${imageName}」已上傳並加入選單。`, "success");
  } catch (error) {
    console.error("Upload display image failed:", error);
    setStatus(`圖片上傳失敗：${error.message}`, "error");
  } finally {
    setBusy(false);
  }
}

async function showSelectedDisplayImage() {
  if (!isAdmin || !currentUser) {
    alert("請先使用 Google Admin 帳號登入。");
    return;
  }

  const selected = getSelectedImage();
  if (!selected) {
    setStatus("請先從選單選擇要顯示的圖片。", "warning");
    alert("請先選擇圖片。");
    return;
  }

  try {
    setBusy(true);
    setStatus("正在切換大螢幕滿版圖片...");
    await setDoc(doc(db, "settings", "finalResultControl"), {
      mode: "fullImage",
      awardName: selected.name || "滿版圖片",
      contestantId: "",
      countdownStatus: "stopped",
      fullImageId: selected.id,
      fullImageName: selected.name || "滿版圖片",
      fullImageUrl: selected.url,
      displayMessage: selected.name || "滿版圖片",
      updatedAt: serverTimestamp(),
      updatedBy: currentUser.email || "",
      updatedByUid: currentUser.uid
    }, { merge: true });
    setStatus(`已顯示滿版圖片：「${selected.name || "未命名圖片"}」。`, "success");
  } catch (error) {
    console.error("Show display image failed:", error);
    setStatus(`滿版圖片顯示失敗：${error.message}`, "error");
  } finally {
    setBusy(false);
  }
}

ensureDisplayImageControls();
const observer = new MutationObserver(ensureDisplayImageControls);
observer.observe(document.body, { childList: true, subtree: true });

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  isAdmin = false;
  ensureDisplayImageControls();

  if (!user || user.isAnonymous) {
    setStatus("請使用 Google Admin 帳號登入後管理滿版圖片。", "warning");
    displayImages = [];
    renderDisplayImageOptions();
    setBusy(false);
    return;
  }

  isAdmin = await checkAdmin(user.uid);
  if (!isAdmin) {
    setStatus("此帳號沒有 Admin 權限，無法管理滿版圖片。", "error");
    displayImages = [];
    renderDisplayImageOptions();
    setBusy(false);
    return;
  }

  await loadDisplayImages();
});