import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  orderBy,
  serverTimestamp,
  increment
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBlj362N4O6ERqgFziQ4Gg9W7SEyquKb0g",
  authDomain: "my-lumens-star-2026.firebaseapp.com",
  projectId: "my-lumens-star-2026",
  storageBucket: "my-lumens-star-2026.firebasestorage.app",
  messagingSenderId: "150108062917",
  appId: "1:150108062917:web:f7284392bed27438041cac"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const REGISTRATION_AUTO_CLOSE_TIME = new Date("2026-06-01T00:00:00+08:00");
const EXPECT_VOTE_AUTO_CLOSE_TIME = null; // Admin-controlled; no permanent date lock.

let currentUser = null;
let isCurrentUserAdmin = false;
let adminContestantsCache = [];
let expectVoteLogsCache = [];
let expectVoteSummaryCache = [];
let resetEmployeeVoteCache = null;
let announcementSettingsCache = null;

let isRegistrationToggleBusy = false;
let isExpectVoteToggleBusy = false;

let expectVoteSettingsCache = {
  isOpen: false,
  isAutoClosed: false,
  exists: false,
  autoCloseAt: "2026-07-13T00:00:00+08:00",
  message: ""
};

let registrationSettingsCache = {
  isOpen: null,
  isAutoClosed: false,
  exists: false
};

// -----------------------------
// DOM
// -----------------------------
const adminLoginButton = document.getElementById("adminLoginButton");
const adminLogoutButton = document.getElementById("adminLogoutButton");
const adminUserStatus = document.getElementById("adminUserStatus");
const adminAccessStatus = document.getElementById("adminAccessStatus");
const adminContent = document.getElementById("adminContent");

const refreshAdminDataButton = document.getElementById("refreshAdminDataButton");
const refreshContestantsButton = document.getElementById("refreshContestantsButton");
const refreshExpectVoteStatsButton = document.getElementById("refreshExpectVoteStatsButton");

const expectVoteStatusText = document.getElementById("expectVoteStatusText");
const expectVoteSettingsMessage = document.getElementById("expectVoteSettingsMessage");
const toggleExpectVoteButton = document.getElementById("toggleExpectVoteButton");

const announcementForm = document.getElementById("announcementForm");
const announcementEnabled = document.getElementById("announcementEnabled");
const announcementTitleInput = document.getElementById("announcementTitleInput");
const announcementContentInput = document.getElementById("announcementContentInput");
const announcementButtonTextInput = document.getElementById("announcementButtonTextInput");
const announcementButtonUrlInput = document.getElementById("announcementButtonUrlInput");
const announcementSettingsMessage = document.getElementById("announcementSettingsMessage");
const refreshAnnouncementButton = document.getElementById("refreshAnnouncementButton");
const previewAnnouncementButton = document.getElementById("previewAnnouncementButton");

const overviewRegistrationStatus = document.getElementById("overviewRegistrationStatus");
const overviewContestantCount = document.getElementById("overviewContestantCount");
const overviewPublishedCount = document.getElementById("overviewPublishedCount");
const overviewTotalExpectVotes = document.getElementById("overviewTotalExpectVotes");

const registrationStatusText = document.getElementById("registrationStatusText");
const registrationSettingsMessage = document.getElementById("registrationSettingsMessage");
const toggleRegistrationButton = document.getElementById("toggleRegistrationButton");

const adminContestantsTable = document.getElementById("adminContestantsTable");

const adminTotalExpectVotes = document.getElementById("adminTotalExpectVotes");
const adminVotedEmployees = document.getElementById("adminVotedEmployees");
const adminAverageVotes = document.getElementById("adminAverageVotes");
const adminExpectVoteRankingTable = document.getElementById("adminExpectVoteRankingTable");
const adminExpectVoteSummaryTable = document.getElementById("adminExpectVoteSummaryTable");
const resetEmployeeVoteInput = document.getElementById("resetEmployeeVoteInput");
const lookupEmployeeVoteButton = document.getElementById("lookupEmployeeVoteButton");
const resetEmployeeVoteButton = document.getElementById("resetEmployeeVoteButton");
const resetEmployeeVoteMessage = document.getElementById("resetEmployeeVoteMessage");
const resetEmployeeVoteResult = document.getElementById("resetEmployeeVoteResult");

// Edit Modal DOM
const editModal = document.getElementById("editModal");
const editContestantForm = document.getElementById("editContestantForm");
const closeEditModalButton = document.getElementById("closeEditModalButton");
const cancelEditButton = document.getElementById("cancelEditButton");
const editMessage = document.getElementById("editMessage");

const editContestantId = document.getElementById("editContestantId");
const editName = document.getElementById("editName");
const editStageName = document.getElementById("editStageName");
const editDepartment = document.getElementById("editDepartment");
const editEmployeeId = document.getElementById("editEmployeeId");
const editPerformanceItem = document.getElementById("editPerformanceItem");
const editManualOrder = document.getElementById("editManualOrder");

// -----------------------------
// Init
// -----------------------------
bindStaticEvents();

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  isCurrentUserAdmin = false;

  adminContent?.classList.remove("hidden");

  // 報名頁會建立 Anonymous Auth。
  // 如果 Admin 頁吃到匿名登入，先登出，避免 Google 登入狀態判斷錯亂。
  if (user && user.isAnonymous) {
    adminUserStatus.textContent = "偵測到匿名報名身份，正在切換為管理員登入模式...";
    adminAccessStatus.textContent = "請使用 Google Admin 帳號登入。";
    adminLoginButton.classList.remove("hidden");
    adminLogoutButton.classList.add("hidden");

    try {
      await signOut(auth);
    } catch (error) {
      console.warn("Anonymous admin sign out failed:", error);
    }

    await loadPublicAdminData();
    return;
  }

  if (!user) {
    adminUserStatus.textContent = "尚未登入";
    adminAccessStatus.textContent = "目前為瀏覽模式。登入並具備管理員權限後，才可以編輯資料與查看完整票選明細。";
    adminLoginButton.classList.remove("hidden");
    adminLogoutButton.classList.add("hidden");

    await loadPublicAdminData();
    renderExpectVotePermissionNotice();
    return;
  }

  adminUserStatus.textContent = `已登入：${user.email || "未知帳號"}`;
  adminLoginButton.classList.add("hidden");
  adminLogoutButton.classList.remove("hidden");

  const adminResult = await checkAdmin(user.uid);

  if (!adminResult) {
    adminAccessStatus.textContent = "目前為瀏覽模式。此帳號沒有管理員權限，無法編輯資料或查看票選明細。";
    isCurrentUserAdmin = false;

    await loadPublicAdminData();
    renderExpectVotePermissionNotice();
    return;
  }

  isCurrentUserAdmin = true;
  adminAccessStatus.textContent = "管理員模式已啟用，可以編輯資料與查看票選統計。";

  await loadAllAdminData();
});

function bindStaticEvents() {
  adminLoginButton?.addEventListener("click", async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Admin login failed:", error);
      alert(`登入失敗：${error.code}\n${error.message}`);
    }
  });

  adminLogoutButton?.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Admin logout failed:", error);
      alert(`登出失敗：${error.code}\n${error.message}`);
    }
  });

  refreshAdminDataButton?.addEventListener("click", async () => {
    await loadAllAdminData();
  });

  refreshContestantsButton?.addEventListener("click", async () => {
    await loadContestantsForAdmin();
    renderOverview();
    if (isCurrentUserAdmin) {
      await loadExpectVoteStats();
    }
  });

  refreshExpectVoteStatsButton?.addEventListener("click", async () => {
    if (!requireAdminPermission()) return;
    await loadExpectVoteStats();
  });

  refreshAnnouncementButton?.addEventListener("click", async () => {
  await loadAnnouncementSettings();
});

previewAnnouncementButton?.addEventListener("click", () => {
  previewAnnouncementSettings();
});

announcementForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!requireAdminPermission()) return;
  await saveAnnouncementSettings();
});

  lookupEmployeeVoteButton?.addEventListener("click", async () => {
  if (!requireAdminPermission()) return;
  await lookupEmployeeVoteRecord();
});

resetEmployeeVoteInput?.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();

  if (!requireAdminPermission()) return;
  await lookupEmployeeVoteRecord();
});

resetEmployeeVoteButton?.addEventListener("click", async () => {
  if (!requireAdminPermission()) return;
  await resetEmployeeVoteRecord();
});

  toggleRegistrationButton?.addEventListener("click", async () => {
    await toggleRegistrationStatus();
  });

  toggleExpectVoteButton?.addEventListener("click", async () => {
  await toggleExpectVoteStatus();
});

  closeEditModalButton?.addEventListener("click", closeEditModal);
  cancelEditButton?.addEventListener("click", closeEditModal);

  editModal?.addEventListener("click", (event) => {
    if (event.target === editModal) {
      closeEditModal();
    }
  });

  editContestantForm?.addEventListener("submit", handleEditContestantSubmit);
}

// -----------------------------
// Data Loaders
// -----------------------------
async function loadPublicAdminData() {
  await loadRegistrationSettings();
  await loadExpectVoteSettings();
  await loadAnnouncementSettings();
  await loadContestantsForAdmin();
  renderOverview();
}

async function loadAllAdminData() {
  await loadRegistrationSettings();
  await loadExpectVoteSettings();
  await loadAnnouncementSettings();
  await loadContestantsForAdmin();

  if (isCurrentUserAdmin) {
    await loadExpectVoteStats();
  } else {
    renderExpectVotePermissionNotice();
  }

  renderOverview();
}

// -----------------------------
// Admin Check
// -----------------------------
async function checkAdmin(uid) {
  try {
    const adminRef = doc(db, "admins", uid);
    const adminSnap = await getDoc(adminRef);

    if (!adminSnap.exists()) {
      return false;
    }

    const data = adminSnap.data();
    return data.role === "admin";
  } catch (error) {
    console.error("Check admin failed:", error);
    adminAccessStatus.textContent = `管理員驗證失敗：${error.message}`;
    return false;
  }
}

function requireAdminPermission() {
  if (!currentUser) {
    alert("請先使用 Google 登入。");
    return false;
  }

  if (currentUser.isAnonymous) {
    alert("目前是匿名報名身份，請先登出後使用 Google Admin 帳號登入。");
    return false;
  }

  if (!isCurrentUserAdmin) {
    alert("此帳號沒有管理員權限，無法編輯資料。");
    return false;
  }

  return true;
}

// -----------------------------
// Registration Settings
// -----------------------------
async function getRegistrationSettingsFromFirestore() {
  const settingsRef = doc(db, "settings", "registration");
  const settingsSnap = await getDoc(settingsRef);

  const now = new Date();
  const isPastAutoCloseTime = now >= REGISTRATION_AUTO_CLOSE_TIME;

  if (settingsSnap.exists()) {
    const data = settingsSnap.data();

    return {
      isOpen: data.isOpen === true,
      isAutoClosed: false,
      exists: true
    };
  }

  return {
    isOpen: !isPastAutoCloseTime,
    isAutoClosed: isPastAutoCloseTime,
    exists: false
  };
}

async function loadRegistrationSettings() {
  try {
    if (!registrationStatusText || !toggleRegistrationButton) return;

    registrationStatusText.textContent = "報名狀態讀取中...";
    toggleRegistrationButton.textContent = "讀取中...";

    registrationSettingsCache = await getRegistrationSettingsFromFirestore();

    renderRegistrationSettings();
    renderOverview();
  } catch (error) {
    console.error("Load registration settings failed:", error);

    if (registrationStatusText) {
      registrationStatusText.textContent = `報名狀態讀取失敗：${error.message}`;
    }

    if (toggleRegistrationButton) {
      toggleRegistrationButton.textContent = "重新讀取失敗";
    }

    if (registrationSettingsMessage) {
      registrationSettingsMessage.textContent = "請確認 Firestore Rules 與 settings/registration 是否設定正確。";
    }
  }
}

function renderRegistrationSettings() {
  const isOpen = registrationSettingsCache.isOpen === true;

  if (registrationStatusText) {
    registrationStatusText.textContent = isOpen
      ? "目前狀態：報名開放中"
      : "目前狀態：報名已關閉";
  }

  if (toggleRegistrationButton) {
    if (isRegistrationToggleBusy) {
      toggleRegistrationButton.textContent = "更新中...";
    } else {
      toggleRegistrationButton.textContent = isOpen ? "關閉報名" : "開啟報名";
    }
  }

  if (registrationSettingsMessage) {
    if (!isCurrentUserAdmin) {
      registrationSettingsMessage.textContent = "只有 Admin 可以手動開啟或關閉報名。";
    } else if (registrationSettingsCache.isAutoClosed) {
      registrationSettingsMessage.textContent = "目前因超過 2026/6/1 00:00，系統已自動視為報名截止。Admin 可手動重新開啟。";
    } else {
      registrationSettingsMessage.textContent = "";
    }
  }
}

async function toggleRegistrationStatus() {
  if (isRegistrationToggleBusy) return;

  if (!requireAdminPermission()) {
    await loadRegistrationSettings();
    return;
  }

  try {
    isRegistrationToggleBusy = true;
    renderRegistrationSettings();

    const latestSettings = await getRegistrationSettingsFromFirestore();
    const currentStatus = latestSettings.isOpen === true;
    const nextStatus = !currentStatus;
    const actionText = nextStatus ? "開啟" : "關閉";

    const confirmed = confirm(`確定要${actionText}報名嗎？`);

    if (!confirmed) {
      registrationSettingsCache = latestSettings;
      isRegistrationToggleBusy = false;
      renderRegistrationSettings();
      return;
    }

    const settingsRef = doc(db, "settings", "registration");

    await setDoc(
      settingsRef,
      {
        isOpen: nextStatus,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.email || "",
        updatedByUid: currentUser.uid
      },
      { merge: true }
    );

    registrationSettingsCache = await getRegistrationSettingsFromFirestore();

    alert(`報名已${nextStatus ? "開啟" : "關閉"}。`);
  } catch (error) {
    console.error("Toggle registration status failed:", error);
    alert(`更新報名狀態失敗：${error.code || ""} ${error.message || ""}`);
  } finally {
    isRegistrationToggleBusy = false;
    await loadRegistrationSettings();
  }
}

// -----------------------------
// Expect Vote Settings
// -----------------------------
async function getExpectVoteSettingsFromFirestore() {
  const settingsRef = doc(db, "settings", "expectVote");
  const settingsSnap = await getDoc(settingsRef);

  const now = new Date();
  const isPastAutoCloseTime = Boolean(EXPECT_VOTE_AUTO_CLOSE_TIME && now >= EXPECT_VOTE_AUTO_CLOSE_TIME);

  if (settingsSnap.exists()) {
    const data = settingsSnap.data();

    return {
      isOpen: data.isOpen === true,
      isAutoClosed: isPastAutoCloseTime,
      exists: true,
      autoCloseAt: data.autoCloseAt || "2026-07-13T00:00:00+08:00",
      message: data.message || ""
    };
  }

  return {
    isOpen: false,
    isAutoClosed: isPastAutoCloseTime,
    exists: false,
    autoCloseAt: "2026-07-13T00:00:00+08:00",
    message: ""
  };
}

async function loadExpectVoteSettings() {
  try {
    if (!expectVoteStatusText || !toggleExpectVoteButton) return;

    expectVoteStatusText.textContent = "票選狀態讀取中...";
    toggleExpectVoteButton.textContent = "讀取中...";

    expectVoteSettingsCache = await getExpectVoteSettingsFromFirestore();

    renderExpectVoteSettings();
  } catch (error) {
    console.error("Load expect vote settings failed:", error);

    if (expectVoteStatusText) {
      expectVoteStatusText.textContent = `票選狀態讀取失敗：${error.message}`;
    }

    if (toggleExpectVoteButton) {
      toggleExpectVoteButton.textContent = "重新讀取失敗";
    }

    if (expectVoteSettingsMessage) {
      expectVoteSettingsMessage.textContent = "請確認 Firestore Rules 與 settings/expectVote 是否設定正確。";
    }
  }
}

function renderExpectVoteSettings() {
  const isOpen = expectVoteSettingsCache.isOpen === true;
  const isAutoClosed = expectVoteSettingsCache.isAutoClosed === true;

  if (expectVoteStatusText) {
    if (isAutoClosed) {
      expectVoteStatusText.textContent = "目前狀態：已達自動關閉時間，票選已關閉";
    } else {
      expectVoteStatusText.textContent = isOpen
        ? "目前狀態：最期待票選開放中"
        : "目前狀態：最期待票選已關閉";
    }
  }

  if (toggleExpectVoteButton) {
    if (isExpectVoteToggleBusy) {
      toggleExpectVoteButton.textContent = "更新中...";
    } else if (isAutoClosed) {
      toggleExpectVoteButton.textContent = "已自動關閉";
    } else {
      toggleExpectVoteButton.textContent = isOpen ? "關閉票選" : "開啟票選";
    }

    toggleExpectVoteButton.disabled = isExpectVoteToggleBusy || isAutoClosed;
  }

  if (expectVoteSettingsMessage) {
    if (!isCurrentUserAdmin) {
      expectVoteSettingsMessage.textContent = "只有 Admin 可以手動開啟或關閉最期待票選。";
    } else if (isAutoClosed) {
      expectVoteSettingsMessage.textContent = "系統已達 2026/7/13 00:00 自動關閉時間。若需重新開放，建議先調整程式設定後再開啟。";
    } else if (isOpen) {
      expectVoteSettingsMessage.textContent = "目前前台可以送出最期待歌手票選。自動關閉時間：2026/7/13 00:00。";
    } else {
      expectVoteSettingsMessage.textContent = "目前前台不可送出最期待歌手票選。";
    }
  }
}

async function toggleExpectVoteStatus() {
  if (isExpectVoteToggleBusy) return;

  if (!requireAdminPermission()) {
    await loadExpectVoteSettings();
    return;
  }

  const now = new Date();

  if (EXPECT_VOTE_AUTO_CLOSE_TIME && now >= EXPECT_VOTE_AUTO_CLOSE_TIME) {
    alert("已達 2026/7/13 00:00 自動關閉時間，無法再從後台開啟票選。");
    await loadExpectVoteSettings();
    return;
  }

  try {
    isExpectVoteToggleBusy = true;
    renderExpectVoteSettings();

    const latestSettings = await getExpectVoteSettingsFromFirestore();
    const currentStatus = latestSettings.isOpen === true && latestSettings.isAutoClosed !== true;
    const nextStatus = !currentStatus;
    const actionText = nextStatus ? "開啟" : "關閉";

    const confirmed = confirm(`確定要${actionText}最期待歌手票選嗎？`);

    if (!confirmed) {
      expectVoteSettingsCache = latestSettings;
      isExpectVoteToggleBusy = false;
      renderExpectVoteSettings();
      return;
    }

    const settingsRef = doc(db, "settings", "expectVote");

    await setDoc(
      settingsRef,
      {
        isOpen: nextStatus,
        autoCloseAt: "2026-07-13T00:00:00+08:00",
        message: nextStatus
          ? "最期待歌手票選開放中"
          : "最期待歌手票選目前未開放",
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.email || "",
        updatedByUid: currentUser.uid
      },
      { merge: true }
    );

    expectVoteSettingsCache = await getExpectVoteSettingsFromFirestore();

    alert(`最期待歌手票選已${nextStatus ? "開啟" : "關閉"}。`);
  } catch (error) {
    console.error("Toggle expect vote status failed:", error);
    alert(`更新最期待票選狀態失敗：${error.code || ""} ${error.message || ""}`);
  } finally {
    isExpectVoteToggleBusy = false;
    await loadExpectVoteSettings();
  }
}

// -----------------------------
// Announcement Settings
// -----------------------------
async function getAnnouncementSettingsFromFirestore() {
  const announcementRef = doc(db, "settings", "announcement");
  const announcementSnap = await getDoc(announcementRef);

  if (!announcementSnap.exists()) {
    return {
      exists: false,
      enabled: false,
      title: "最期待歌手票選即將開放",
      content: "7/6–7/10 開放全體員工票選，每人 3 票，選出你最期待登場的歌手！",
      buttonText: "查看票選資訊",
      buttonUrl: "#expectVote"
    };
  }

  const data = announcementSnap.data();

  return {
    exists: true,
    enabled: data.enabled === true,
    title: data.title || "",
    content: data.content || "",
    buttonText: data.buttonText || "",
    buttonUrl: data.buttonUrl || ""
  };
}

async function loadAnnouncementSettings() {
  try {
    if (announcementSettingsMessage) {
      announcementSettingsMessage.textContent = "公告設定讀取中...";
    }

    announcementSettingsCache = await getAnnouncementSettingsFromFirestore();

    renderAnnouncementSettings();

    if (announcementSettingsMessage) {
      announcementSettingsMessage.textContent = announcementSettingsCache.exists
        ? "公告設定已讀取。"
        : "尚未建立公告設定，目前前台會使用預設公告。";
    }
  } catch (error) {
    console.error("Load announcement settings failed:", error);

    if (announcementSettingsMessage) {
      announcementSettingsMessage.textContent = `公告設定讀取失敗：${error.message}`;
    }
  }
}

function renderAnnouncementSettings() {
  if (!announcementSettingsCache) return;

  if (announcementEnabled) {
    announcementEnabled.checked = announcementSettingsCache.enabled === true;
  }

  if (announcementTitleInput) {
    announcementTitleInput.value = announcementSettingsCache.title || "";
  }

  if (announcementContentInput) {
    announcementContentInput.value = announcementSettingsCache.content || "";
  }

  if (announcementButtonTextInput) {
    announcementButtonTextInput.value = announcementSettingsCache.buttonText || "";
  }

  if (announcementButtonUrlInput) {
    announcementButtonUrlInput.value = announcementSettingsCache.buttonUrl || "";
  }
}

async function saveAnnouncementSettings() {
  if (!requireAdminPermission()) return;

  const enabled = announcementEnabled?.checked === true;
  const title = String(announcementTitleInput?.value || "").trim();
  const content = String(announcementContentInput?.value || "").trim();
  const buttonText = String(announcementButtonTextInput?.value || "").trim();
  const buttonUrl = String(announcementButtonUrlInput?.value || "").trim();

  if (enabled && !title) {
    announcementSettingsMessage.textContent = "啟用公告時，請填寫公告標題。";
    return;
  }

  if (enabled && !content) {
    announcementSettingsMessage.textContent = "啟用公告時，請填寫公告內容。";
    return;
  }

  try {
    const submitButton = announcementForm?.querySelector("button[type='submit']");

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "儲存中...";
    }

    if (announcementSettingsMessage) {
      announcementSettingsMessage.textContent = "公告設定儲存中...";
    }

    const announcementRef = doc(db, "settings", "announcement");

    await setDoc(
      announcementRef,
      {
        enabled,
        title,
        content,
        buttonText: buttonText || "查看詳情",
        buttonUrl: buttonUrl || "#",
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.email || "",
        updatedByUid: currentUser.uid
      },
      { merge: true }
    );

    announcementSettingsCache = await getAnnouncementSettingsFromFirestore();
    renderAnnouncementSettings();

    if (announcementSettingsMessage) {
      announcementSettingsMessage.textContent = enabled
        ? "公告已儲存並啟用。前台重新整理後會顯示公告。"
        : "公告已儲存，目前為關閉狀態。";
    }
  } catch (error) {
    console.error("Save announcement settings failed:", error);

    if (announcementSettingsMessage) {
      announcementSettingsMessage.textContent = `公告設定儲存失敗：${error.message}`;
    }
  } finally {
    const submitButton = announcementForm?.querySelector("button[type='submit']");

    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "儲存公告設定";
    }
  }
}

function previewAnnouncementSettings() {
  const enabled = announcementEnabled?.checked === true;
  const title = String(announcementTitleInput?.value || "").trim() || "未填寫公告標題";
  const content = String(announcementContentInput?.value || "").trim() || "未填寫公告內容";
  const buttonText = String(announcementButtonTextInput?.value || "").trim() || "查看詳情";
  const buttonUrl = String(announcementButtonUrlInput?.value || "").trim() || "#";

  alert(
    `公告預覽\n\n狀態：${enabled ? "啟用" : "關閉"}\n標題：${title}\n\n內容：\n${content}\n\n按鈕：${buttonText}\n連結：${buttonUrl}`
  );
}



// -----------------------------
// Contestants
// -----------------------------
async function loadContestantsForAdmin() {
  try {
    adminContent?.classList.remove("hidden");

    adminContestantsTable.innerHTML = `
      <tr>
        <td colspan="8">資料讀取中...</td>
      </tr>
    `;

    const contestantsRef = collection(db, "contestants");
    const q = query(contestantsRef, orderBy("manualOrder", "asc"));
    const snapshot = await getDocs(q);

    const contestants = [];

    snapshot.forEach((docSnap) => {
      contestants.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    contestants.sort((a, b) => {
      const orderA = typeof a.manualOrder === "number" ? a.manualOrder : 999;
      const orderB = typeof b.manualOrder === "number" ? b.manualOrder : 999;

      if (orderA !== orderB) return orderA - orderB;

      const timeA = a.registerTime?.seconds || 0;
      const timeB = b.registerTime?.seconds || 0;

      return timeA - timeB;
    });

    adminContestantsCache = contestants;
    renderAdminContestants(contestants);
    renderOverview();
  } catch (error) {
    console.error("Load admin contestants failed:", error);

    adminContestantsTable.innerHTML = `
      <tr>
        <td colspan="8">資料讀取失敗：${escapeHtml(error.message)}</td>
      </tr>
    `;
  }
}

function renderAdminContestants(contestants) {
  if (!contestants.length) {
    adminContestantsTable.innerHTML = `
      <tr>
        <td colspan="8">目前尚無報名資料</td>
      </tr>
    `;
    return;
  }

  adminContestantsTable.innerHTML = contestants
    .map((contestant) => {
      const isPublished = contestant.publishStatus === true;
      const statusLabel = isPublished ? "已公開" : "未公開";
      const statusClass = isPublished ? "status-published" : "status-hidden";

      const stageName = contestant.stageName ? contestant.stageName : "—";
      const manualOrder = typeof contestant.manualOrder === "number"
        ? contestant.manualOrder
        : 999;

      const expectVoteCount = Number(contestant.expectVoteCount || 0);

      const orderCell = isCurrentUserAdmin
        ? `
          <input
            class="admin-order-input"
            type="number"
            value="${manualOrder}"
            data-id="${contestant.id}"
          />
        `
        : `
          <span>${manualOrder}</span>
        `;

      const actionCell = isCurrentUserAdmin
        ? `
          <div class="admin-row-actions">
            <button
              type="button"
              class="edit-contestant-button admin-edit-button"
              data-id="${contestant.id}"
            >
              編輯
            </button>

            <button
              type="button"
              class="toggle-publish-button"
              data-id="${contestant.id}"
              data-current="${isPublished}"
            >
              ${isPublished ? "隱藏" : "公開"}
            </button>

            <button
              type="button"
              class="save-order-button secondary-button"
              data-id="${contestant.id}"
            >
              儲存排序
            </button>

            <button
              type="button"
              class="delete-contestant-button danger-button"
              data-id="${contestant.id}"
              data-name="${escapeHtml(contestant.name || "")}"
            >
              刪除
            </button>
          </div>
        `
        : `
          <span class="admin-small-text">僅管理員可編輯</span>
        `;

      const photoCell = contestant.photoUrl
        ? `
          <img
            class="admin-photo"
            src="${escapeHtml(contestant.photoUrl)}"
            alt="${escapeHtml(contestant.name || "")}"
          />
        `
        : `
          <span class="admin-small-text">無照片</span>
        `;

      return `
        <tr>
          <td>${photoCell}</td>

          <td>
            <span class="status-badge ${statusClass}">
              ${statusLabel}
            </span>
          </td>

          <td>${orderCell}</td>

          <td>
            <strong>${escapeHtml(contestant.name || "")}</strong>
            <div class="admin-small-text">A.K.A. ${escapeHtml(stageName)}</div>
          </td>

          <td>
            ${escapeHtml(contestant.department || "")}
            <div class="admin-small-text">工號：${escapeHtml(contestant.employeeId || "")}</div>
          </td>

          <td>${escapeHtml(contestant.performanceItem || "")}</td>

          <td>
            <strong class="admin-number-highlight">${expectVoteCount}</strong>
          </td>

          <td>${actionCell}</td>
        </tr>
      `;
    })
    .join("");

  bindAdminRowEvents();
}

function bindAdminRowEvents() {
  if (!isCurrentUserAdmin) return;

  document.querySelectorAll(".edit-contestant-button").forEach((button) => {
    button.addEventListener("click", () => {
      if (!requireAdminPermission()) return;

      const contestantId = button.dataset.id;
      openEditModal(contestantId);
    });
  });

  document.querySelectorAll(".toggle-publish-button").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!requireAdminPermission()) return;

      const contestantId = button.dataset.id;
      const currentStatus = button.dataset.current === "true";

      await togglePublishStatus(contestantId, !currentStatus);
    });
  });

  document.querySelectorAll(".save-order-button").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!requireAdminPermission()) return;

      const contestantId = button.dataset.id;
      const input = document.querySelector(`.admin-order-input[data-id="${contestantId}"]`);

      if (!input) return;

      const value = Number(input.value);

      if (Number.isNaN(value)) {
        alert("排序請輸入數字。");
        return;
      }

      await updateManualOrder(contestantId, value);
    });
  });

  document.querySelectorAll(".delete-contestant-button").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!requireAdminPermission()) return;

      const contestantId = button.dataset.id;
      const contestantName = button.dataset.name || "此選手";

      await deleteContestant(contestantId, contestantName);
    });
  });
}

// -----------------------------
// Expect Vote Stats
// -----------------------------
async function loadExpectVoteStats() {
  if (!isCurrentUserAdmin) {
    renderExpectVotePermissionNotice();
    return;
  }

  try {
    adminExpectVoteRankingTable.innerHTML = `
      <tr>
        <td colspan="6">票選資料讀取中...</td>
      </tr>
    `;

    adminExpectVoteSummaryTable.innerHTML = `
      <tr>
        <td colspan="5">員工投票資料讀取中...</td>
      </tr>
    `;

    const [logsSnapshot, summarySnapshot] = await Promise.all([
      getDocs(collection(db, "expectVoteLogs")),
      getDocs(collection(db, "expectVoteSummary"))
    ]);

    expectVoteLogsCache = [];
    expectVoteSummaryCache = [];

    logsSnapshot.forEach((docSnap) => {
      expectVoteLogsCache.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    summarySnapshot.forEach((docSnap) => {
      expectVoteSummaryCache.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    renderExpectVoteStats();
    renderOverview();
  } catch (error) {
    console.error("Load expect vote stats failed:", error);

    adminExpectVoteRankingTable.innerHTML = `
      <tr>
        <td colspan="6">票選統計讀取失敗：${escapeHtml(error.message)}</td>
      </tr>
    `;

    adminExpectVoteSummaryTable.innerHTML = `
      <tr>
        <td colspan="5">員工投票資料讀取失敗：${escapeHtml(error.message)}</td>
      </tr>
    `;
  }
}

function renderExpectVoteStats() {
  const totalVotes = expectVoteLogsCache.length;

  const votedEmployees = expectVoteSummaryCache.filter((item) => {
    return Number(item.usedVotes || 0) > 0;
  });

  const averageVotes = votedEmployees.length
    ? totalVotes / votedEmployees.length
    : 0;

  if (adminTotalExpectVotes) {
    adminTotalExpectVotes.textContent = totalVotes;
  }

  if (adminVotedEmployees) {
    adminVotedEmployees.textContent = votedEmployees.length;
  }

  if (adminAverageVotes) {
    adminAverageVotes.textContent = averageVotes.toFixed(1);
  }

  renderExpectVoteRanking(totalVotes);
  renderExpectVoteSummary();
}

function renderExpectVoteRanking(totalVotes) {
  if (!adminContestantsCache.length) {
    adminExpectVoteRankingTable.innerHTML = `
      <tr>
        <td colspan="6">目前尚無選手資料。</td>
      </tr>
    `;
    return;
  }

  const rankedContestants = [...adminContestantsCache]
    .map((contestant) => {
      const countFromLogs = expectVoteLogsCache.filter((log) => {
        return log.contestantId === contestant.id;
      }).length;

      const countFromContestant = Number(contestant.expectVoteCount || 0);
      const voteCount = Math.max(countFromLogs, countFromContestant);

      return {
        ...contestant,
        expectVoteCountComputed: voteCount
      };
    })
    .sort((a, b) => {
      const voteDiff = b.expectVoteCountComputed - a.expectVoteCountComputed;
      if (voteDiff !== 0) return voteDiff;

      const orderA = typeof a.manualOrder === "number" ? a.manualOrder : 999;
      const orderB = typeof b.manualOrder === "number" ? b.manualOrder : 999;

      return orderA - orderB;
    });

  adminExpectVoteRankingTable.innerHTML = rankedContestants
    .map((contestant, index) => {
      const rank = index + 1;
      const voteCount = contestant.expectVoteCountComputed;
      const percent = totalVotes > 0 ? (voteCount / totalVotes) * 100 : 0;
      const percentText = `${percent.toFixed(1)}%`;

      const stageName = contestant.stageName || "—";
      const publishStatus = contestant.publishStatus === true ? "已公開" : "未公開";
      const statusClass = contestant.publishStatus === true ? "status-published" : "status-hidden";

      return `
        <tr>
          <td>
            <span class="vote-rank-badge">${rank}</span>
          </td>

          <td>
            <strong>${escapeHtml(contestant.name || "—")}</strong>
            <div class="admin-small-text">No. ${escapeHtml(String(contestant.manualOrder ?? "—"))}</div>
          </td>

          <td>
            A.K.A. ${escapeHtml(stageName)}
          </td>

          <td>
            <span class="status-badge ${statusClass}">
              ${publishStatus}
            </span>
          </td>

          <td>
            <strong class="admin-number-highlight">${voteCount}</strong>
          </td>

          <td>
            <div class="vote-percent-bar" aria-label="${percentText}">
              <span style="width: ${Math.min(percent, 100)}%;"></span>
            </div>
            <span class="vote-percent-text">${percentText}</span>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderExpectVoteSummary() {
  const votedEmployees = [...expectVoteSummaryCache]
    .filter((item) => Number(item.usedVotes || 0) > 0)
    .sort((a, b) => {
      const voteDiff = Number(b.usedVotes || 0) - Number(a.usedVotes || 0);
      if (voteDiff !== 0) return voteDiff;

      return String(a.employeeId || "").localeCompare(String(b.employeeId || ""));
    });

  if (!votedEmployees.length) {
    adminExpectVoteSummaryTable.innerHTML = `
      <tr>
        <td colspan="5">目前尚無員工投票資料。</td>
      </tr>
    `;
    return;
  }

  adminExpectVoteSummaryTable.innerHTML = votedEmployees
    .map((item) => {
      return `
        <tr>
          <td>${escapeHtml(item.employeeId || item.id || "")}</td>
          <td>${escapeHtml(item.employeeName || "")}</td>
          <td>${escapeHtml(item.employeeDepartment || "")}</td>
          <td>${escapeHtml(item.employeeCompany || "")}</td>
          <td>
            <strong class="admin-number-highlight">${Number(item.usedVotes || 0)} / 3</strong>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderExpectVotePermissionNotice() {
  if (adminTotalExpectVotes) adminTotalExpectVotes.textContent = "—";
  if (adminVotedEmployees) adminVotedEmployees.textContent = "—";
  if (adminAverageVotes) adminAverageVotes.textContent = "—";

  if (adminExpectVoteRankingTable) {
    adminExpectVoteRankingTable.innerHTML = `
      <tr>
        <td colspan="6">請使用 Admin 帳號登入後查看票選統計。</td>
      </tr>
    `;
  }

  if (adminExpectVoteSummaryTable) {
    adminExpectVoteSummaryTable.innerHTML = `
      <tr>
        <td colspan="5">請使用 Admin 帳號登入後查看員工投票明細。</td>
      </tr>
    `;
  }
}

// -----------------------------
// Employee Vote Reset
// -----------------------------
async function lookupEmployeeVoteRecord() {
  if (!requireAdminPermission()) return;

  const employeeId = normalizeEmployeeId(resetEmployeeVoteInput?.value || "");

  resetEmployeeVoteCache = null;

  if (resetEmployeeVoteButton) {
    resetEmployeeVoteButton.disabled = true;
  }

  if (resetEmployeeVoteResult) {
    resetEmployeeVoteResult.classList.remove("hidden");
    resetEmployeeVoteResult.innerHTML = `
      <p class="section-desc">投票紀錄查詢中...</p>
    `;
  }

  if (resetEmployeeVoteMessage) {
    resetEmployeeVoteMessage.textContent = "";
  }

  if (!employeeId) {
    if (resetEmployeeVoteMessage) {
      resetEmployeeVoteMessage.textContent = "請先輸入工號。";
    }

    if (resetEmployeeVoteResult) {
      resetEmployeeVoteResult.innerHTML = `
        <p class="section-desc">請先輸入工號並查詢投票紀錄。</p>
      `;
    }

    return;
  }

  try {
    const employeeRef = doc(db, "employees", employeeId);
    const summaryRef = doc(db, "expectVoteSummary", employeeId);
    const logsRef = collection(db, "expectVoteLogs");
    const logsQuery = query(logsRef, where("employeeId", "==", employeeId));

    const [employeeSnap, summarySnap, logsSnapshot] = await Promise.all([
      getDoc(employeeRef),
      getDoc(summaryRef),
      getDocs(logsQuery)
    ]);

    const employeeData = employeeSnap.exists()
      ? {
          id: employeeSnap.id,
          ...employeeSnap.data()
        }
      : null;

    const summaryData = summarySnap.exists()
      ? {
          id: summarySnap.id,
          ...summarySnap.data()
        }
      : null;

    const logs = [];

    logsSnapshot.forEach((docSnap) => {
      logs.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    logs.sort((a, b) => {
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeA - timeB;
    });

    const contestantIdsFromLogs = logs
      .map((log) => log.contestantId)
      .filter(Boolean);

    const contestantIdsFromSummary = Array.isArray(summaryData?.votedContestantIds)
      ? summaryData.votedContestantIds
      : [];

    const mergedContestantIds = [
      ...new Set([...contestantIdsFromLogs, ...contestantIdsFromSummary])
    ];

    const contestantMap = new Map(
      adminContestantsCache.map((contestant) => [contestant.id, contestant])
    );

    resetEmployeeVoteCache = {
      employeeId,
      employeeData,
      summaryData,
      logs,
      contestantIdsFromLogs,
      contestantIdsFromSummary,
      mergedContestantIds
    };

    renderEmployeeVoteLookupResult(resetEmployeeVoteCache, contestantMap);

    const canReset = logs.length > 0 || summaryData;

    if (resetEmployeeVoteButton) {
      resetEmployeeVoteButton.disabled = !canReset;
    }

    if (resetEmployeeVoteMessage) {
      resetEmployeeVoteMessage.textContent = canReset
        ? "已查詢到此工號的票選資料。重置前請再次確認內容。"
        : "此工號目前沒有最期待票選紀錄。";
    }
  } catch (error) {
    console.error("Lookup employee vote record failed:", error);

    resetEmployeeVoteCache = null;

    if (resetEmployeeVoteButton) {
      resetEmployeeVoteButton.disabled = true;
    }

    if (resetEmployeeVoteMessage) {
      resetEmployeeVoteMessage.textContent = `查詢失敗：${error.message}`;
    }

    if (resetEmployeeVoteResult) {
      resetEmployeeVoteResult.innerHTML = `
        <p class="section-desc">投票紀錄查詢失敗，請確認 Firestore Rules 或稍後再試。</p>
      `;
    }
  }
}

function renderEmployeeVoteLookupResult(record, contestantMap) {
  if (!resetEmployeeVoteResult) return;

  const employeeName = record.employeeData?.name
    || record.summaryData?.employeeName
    || record.logs[0]?.employeeName
    || "—";

  const employeeDepartment = record.employeeData?.department
    || record.summaryData?.employeeDepartment
    || record.logs[0]?.employeeDepartment
    || "—";

  const employeeCompany = record.employeeData?.company
    || record.summaryData?.employeeCompany
    || record.logs[0]?.employeeCompany
    || "—";

  const summaryUsedVotes = Number(record.summaryData?.usedVotes || 0);
  const logCount = record.logs.length;

  const votedContestantRows = record.mergedContestantIds.length
    ? record.mergedContestantIds
        .map((contestantId) => {
          const contestant = contestantMap.get(contestantId);
          const logExists = record.contestantIdsFromLogs.includes(contestantId);
          const summaryExists = record.contestantIdsFromSummary.includes(contestantId);

          return `
            <li>
              <strong>${escapeHtml(contestant?.name || "未知選手")}</strong>
              <span>A.K.A. ${escapeHtml(contestant?.stageName || "—")}</span>
              <span class="admin-small-text">ID：${escapeHtml(contestantId)}</span>
              <span class="admin-small-text">
                ${logExists ? "Log 存在" : "Log 不存在"}｜${summaryExists ? "Summary 存在" : "Summary 不存在"}
              </span>
            </li>
          `;
        })
        .join("")
    : `
      <li>
        <span>目前沒有已投選手紀錄。</span>
      </li>
    `;

  const warning = summaryUsedVotes !== logCount
    ? `
      <p class="message">
        注意：Summary 已用票數為 ${summaryUsedVotes}，但 Logs 實際筆數為 ${logCount}。
        重置時會以 Logs 作為扣回選手票數的依據，並刪除此工號的 Summary。
      </p>
    `
    : "";

  resetEmployeeVoteResult.classList.remove("hidden");
  resetEmployeeVoteResult.innerHTML = `
    <div class="employee-vote-reset-profile">
      <div>
        <span>工號</span>
        <strong>${escapeHtml(record.employeeId)}</strong>
      </div>
      <div>
        <span>姓名</span>
        <strong>${escapeHtml(employeeName)}</strong>
      </div>
      <div>
        <span>部門</span>
        <strong>${escapeHtml(employeeDepartment)}</strong>
      </div>
      <div>
        <span>公司</span>
        <strong>${escapeHtml(employeeCompany)}</strong>
      </div>
      <div>
        <span>Logs 票數</span>
        <strong>${logCount}</strong>
      </div>
      <div>
        <span>Summary 已用票數</span>
        <strong>${summaryUsedVotes}</strong>
      </div>
    </div>

    ${warning}

    <div class="employee-vote-reset-list">
      <h4>此工號已投歌手</h4>
      <ul>
        ${votedContestantRows}
      </ul>
    </div>
  `;
}

async function resetEmployeeVoteRecord() {
  if (!requireAdminPermission()) return;

  if (!resetEmployeeVoteCache) {
    alert("請先查詢工號投票紀錄。");
    return;
  }

  const { employeeId, logs, summaryData } = resetEmployeeVoteCache;

  if (!logs.length && !summaryData) {
    alert("此工號沒有可重置的票選資料。");
    return;
  }

  const firstConfirm = confirm(
    `確定要重置工號「${employeeId}」的最期待投票嗎？\n\n此動作會刪除該工號的投票紀錄，並扣回對應神秘歌手票數。`
  );

  if (!firstConfirm) return;

  const secondConfirm = confirm(
    `再次確認：真的要重置工號「${employeeId}」嗎？\n\n此動作無法從前台復原。`
  );

  if (!secondConfirm) return;

  try {
    if (resetEmployeeVoteButton) {
      resetEmployeeVoteButton.disabled = true;
      resetEmployeeVoteButton.textContent = "重置中...";
    }

    if (resetEmployeeVoteMessage) {
      resetEmployeeVoteMessage.textContent = "正在重置此工號的投票資料...";
    }

    const batch = writeBatch(db);
    const contestantVoteDeltaMap = new Map();

    logs.forEach((log) => {
      if (!log.id) return;

      const logRef = doc(db, "expectVoteLogs", log.id);
      batch.delete(logRef);

      if (log.contestantId) {
        const currentCount = contestantVoteDeltaMap.get(log.contestantId) || 0;
        contestantVoteDeltaMap.set(log.contestantId, currentCount + 1);
      }
    });

    if (summaryData) {
      const summaryRef = doc(db, "expectVoteSummary", employeeId);
      batch.delete(summaryRef);
    }

    contestantVoteDeltaMap.forEach((count, contestantId) => {
      const contestantRef = doc(db, "contestants", contestantId);
      batch.update(contestantRef, {
        expectVoteCount: increment(-count),
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.email || "",
        updatedByUid: currentUser.uid
      });
    });

    await batch.commit();

    resetEmployeeVoteCache = null;

    if (resetEmployeeVoteMessage) {
      resetEmployeeVoteMessage.textContent = `工號 ${employeeId} 的投票已重置完成。`;
    }

    await loadContestantsForAdmin();
    await loadExpectVoteStats();

    if (resetEmployeeVoteInput) {
      resetEmployeeVoteInput.value = employeeId;
    }

    await lookupEmployeeVoteRecord();

    alert("此工號投票已重置完成。");
  } catch (error) {
    console.error("Reset employee vote record failed:", error);

    if (resetEmployeeVoteMessage) {
      resetEmployeeVoteMessage.textContent = `重置失敗：${error.message}`;
    }

    alert(`重置失敗：${error.message}`);
  } finally {
    if (resetEmployeeVoteButton) {
      resetEmployeeVoteButton.textContent = "重置此工號投票";
    }
  }
}

// -----------------------------
// Edit Modal
// -----------------------------
function openEditModal(contestantId) {
  if (!requireAdminPermission()) return;

  const contestant = adminContestantsCache.find((item) => item.id === contestantId);

  if (!contestant) {
    alert("找不到這位選手資料，請重新整理後再試。");
    return;
  }

  editContestantId.value = contestant.id;
  editName.value = contestant.name || "";
  editStageName.value = contestant.stageName || "";
  editDepartment.value = contestant.department || "";
  editEmployeeId.value = contestant.employeeId || "";
  editPerformanceItem.value = contestant.performanceItem || "";
  editManualOrder.value = typeof contestant.manualOrder === "number"
    ? contestant.manualOrder
    : 999;

  editMessage.textContent = "";
  editModal.classList.remove("hidden");
}

function closeEditModal() {
  editModal.classList.add("hidden");
  editContestantForm.reset();
  editMessage.textContent = "";
}

async function handleEditContestantSubmit(event) {
  event.preventDefault();

  if (!requireAdminPermission()) return;

  const contestantId = editContestantId.value;
  const name = editName.value.trim();
  const stageName = editStageName.value.trim();
  const department = editDepartment.value.trim();
  const employeeId = editEmployeeId.value.trim();
  const performanceItem = editPerformanceItem.value.trim();
  const manualOrder = Number(editManualOrder.value);

  if (!contestantId) {
    editMessage.textContent = "找不到選手 ID。";
    return;
  }

  if (!name || !department || !employeeId || !performanceItem) {
    editMessage.textContent = "請完整填寫姓名、部門、工號與演唱歌曲。";
    return;
  }

  if (Number.isNaN(manualOrder)) {
    editMessage.textContent = "排序請輸入數字。";
    return;
  }

  try {
    const submitButton = editContestantForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    submitButton.textContent = "儲存中...";
    editMessage.textContent = "資料儲存中...";

    const contestantRef = doc(db, "contestants", contestantId);

    await updateDoc(contestantRef, {
      name,
      stageName,
      department,
      employeeId,
      performanceItem,
      manualOrder,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser.email,
      updatedByUid: currentUser.uid
    });

    editMessage.textContent = "儲存成功。";

    await loadContestantsForAdmin();

    if (isCurrentUserAdmin) {
      await loadExpectVoteStats();
    }

    setTimeout(() => {
      closeEditModal();
    }, 500);
  } catch (error) {
    console.error("Update contestant failed:", error);
    editMessage.textContent = `儲存失敗：${error.message}`;
  } finally {
    const submitButton = editContestantForm.querySelector("button[type='submit']");
    submitButton.disabled = false;
    submitButton.textContent = "儲存修改";
  }
}

// -----------------------------
// Update Actions
// -----------------------------
async function togglePublishStatus(contestantId, nextStatus) {
  if (!requireAdminPermission()) return;

  try {
    const label = nextStatus ? "公開" : "隱藏";
    const confirmed = confirm(`確定要${label}這位選手嗎？`);

    if (!confirmed) return;

    const contestantRef = doc(db, "contestants", contestantId);

    await updateDoc(contestantRef, {
      publishStatus: nextStatus,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser.email,
      updatedByUid: currentUser.uid
    });

    await loadContestantsForAdmin();

    if (isCurrentUserAdmin) {
      await loadExpectVoteStats();
    }

    alert(`${label}成功。`);
  } catch (error) {
    console.error("Toggle publish failed:", error);
    alert(`更新公開狀態失敗：${error.message}`);
  }
}

async function updateManualOrder(contestantId, manualOrder) {
  if (!requireAdminPermission()) return;

  try {
    const contestantRef = doc(db, "contestants", contestantId);

    await updateDoc(contestantRef, {
      manualOrder,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser.email,
      updatedByUid: currentUser.uid
    });

    await loadContestantsForAdmin();

    if (isCurrentUserAdmin) {
      await loadExpectVoteStats();
    }

    alert("排序更新成功。");
  } catch (error) {
    console.error("Update order failed:", error);
    alert(`排序更新失敗：${error.message}`);
  }
}

async function deleteContestant(contestantId, contestantName) {
  if (!requireAdminPermission()) return;

  const firstConfirm = confirm(
    `確定要刪除「${contestantName}」嗎？\n\n此動作會刪除選手資料，且前台不會再顯示。`
  );

  if (!firstConfirm) return;

  const secondConfirm = confirm(
    `再次確認：真的要刪除「${contestantName}」嗎？\n\n此動作無法從前台復原。`
  );

  if (!secondConfirm) return;

  try {
    const contestantRef = doc(db, "contestants", contestantId);

    await deleteDoc(contestantRef);

    await loadContestantsForAdmin();

    if (isCurrentUserAdmin) {
      await loadExpectVoteStats();
    }

    alert("選手資料已刪除。");
  } catch (error) {
    console.error("Delete contestant failed:", error);
    alert(`刪除失敗：${error.message}`);
  }
}

// -----------------------------
// Overview
// -----------------------------
function renderOverview() {
  const isOpen = registrationSettingsCache.isOpen === true;
  const totalContestants = adminContestantsCache.length;
  const publishedContestants = adminContestantsCache.filter((item) => item.publishStatus === true).length;
  const totalExpectVotes = expectVoteLogsCache.length;

  if (overviewRegistrationStatus) {
    overviewRegistrationStatus.textContent = isOpen ? "開放中" : "已關閉";
  }

  if (overviewContestantCount) {
    overviewContestantCount.textContent = totalContestants;
  }

  if (overviewPublishedCount) {
    overviewPublishedCount.textContent = publishedContestants;
  }

  if (overviewTotalExpectVotes) {
    overviewTotalExpectVotes.textContent = isCurrentUserAdmin ? totalExpectVotes : "—";
  }
}

// -----------------------------
// Utils
// -----------------------------
function normalizeEmployeeId(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  if (value === undefined || value === null) return "";

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

console.log("Admin page v2.0 expect-vote-stats loaded.");