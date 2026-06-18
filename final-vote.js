import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";

import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  runTransaction,
  serverTimestamp
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

// -----------------------------
// Auth State
// -----------------------------
let currentUser = null;
let authReadyResolve;
let hasResolvedAuthReady = false;
let hasLoadedInitialData = false;
let isAnonymousSignInRunning = false;

const authReadyPromise = new Promise((resolve) => {
  authReadyResolve = resolve;
});

// -----------------------------
// Page State
// -----------------------------
let currentEmployeeProfile = null;

let currentRedCarpetVote = null;

let currentFinalAudienceSummary = null;
let currentFinalAudienceLogs = [];

let publishedContestants = [];
let contestantsLoadError = "";

let selectedRedCarpetContestantId = "";
let selectedFinalAudienceContestantIds = [];

let employeeLookupTimer = null;
let latestLookupEmployeeId = "";

let redCarpetVoteSettings = {
  isOpen: false,
  message: "紅毯巨星造型獎投票目前尚未開放。"
};

let finalAudienceVoteSettings = {
  isOpen: false,
  message: "決賽觀眾投票目前尚未開放。"
};

// -----------------------------
// DOM
// -----------------------------
const mobileMenuButton = document.getElementById("mobileMenuButton");
const navLinks = document.getElementById("navLinks");

const employeeIdInput = document.getElementById("employeeIdInput");
const employeeInfoBox = document.getElementById("employeeInfoBox");
const employeeNameText = document.getElementById("employeeNameText");
const employeeDepartmentText = document.getElementById("employeeDepartmentText");
const employeeCompanyText = document.getElementById("employeeCompanyText");
const employeeLookupMessage = document.getElementById("employeeLookupMessage");

const redCarpetVoteStatusText = document.getElementById("redCarpetVoteStatusText");
const finalAudienceVoteStatusText = document.getElementById("finalAudienceVoteStatusText");

const selectedRedCarpetContestantText = document.getElementById("selectedRedCarpetContestantText");
const selectedFinalAudienceContestantText = document.getElementById("selectedFinalAudienceContestantText");

const redCarpetContestantsGrid = document.getElementById("redCarpetContestantsGrid");
const finalAudienceContestantsGrid = document.getElementById("finalAudienceContestantsGrid");

const submitRedCarpetVoteButton = document.getElementById("submitRedCarpetVoteButton");
const submitFinalAudienceVoteButton = document.getElementById("submitFinalAudienceVoteButton");

const redCarpetVoteMessage = document.getElementById("redCarpetVoteMessage");
const finalAudienceVoteMessage = document.getElementById("finalAudienceVoteMessage");

// -----------------------------
// Init
// -----------------------------
init();

function init() {
  setupMobileNav();
  bindEvents();
  setupAuth();
}

function setupMobileNav() {
  if (!mobileMenuButton || !navLinks) return;

  mobileMenuButton.addEventListener("click", () => {
    navLinks.classList.toggle("open");
  });

  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("open");
    });
  });
}

function bindEvents() {
  employeeIdInput?.addEventListener("input", () => {
    handleEmployeeIdInputChange();
  });

  employeeIdInput?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;

    event.preventDefault();

    if (employeeLookupTimer) {
      clearTimeout(employeeLookupTimer);
      employeeLookupTimer = null;
    }

    await handleLookupEmployee();
  });

  submitRedCarpetVoteButton?.addEventListener("click", async () => {
    await submitRedCarpetVote();
  });

  submitFinalAudienceVoteButton?.addEventListener("click", async () => {
    await submitFinalAudienceVotes();
  });
}

// -----------------------------
// Auth
// -----------------------------
function setupAuth() {
  onAuthStateChanged(auth, async (user) => {
    currentUser = user;

    if (!user) {
      if (isAnonymousSignInRunning) return;

      try {
        isAnonymousSignInRunning = true;
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Anonymous sign in failed:", error);
        setEmployeeMessage("系統登入失敗，請重新整理後再試。");

        if (!hasResolvedAuthReady && authReadyResolve) {
          hasResolvedAuthReady = true;
          authReadyResolve(null);
        }
      } finally {
        isAnonymousSignInRunning = false;
      }

      return;
    }

    if (!hasResolvedAuthReady && authReadyResolve) {
      hasResolvedAuthReady = true;
      authReadyResolve(user);
    }

    if (hasLoadedInitialData) return;

    hasLoadedInitialData = true;
    await loadInitialData();
  });
}

async function waitForAuthReady() {
  if (currentUser) return currentUser;

  const user = await authReadyPromise;

  if (user) {
    currentUser = user;
    return user;
  }

  return null;
}

async function ensureSignedIn() {
  if (currentUser) return currentUser;

  const user = await waitForAuthReady();

  if (user) return user;

  try {
    const result = await signInAnonymously(auth);
    currentUser = result.user;
    return result.user;
  } catch (error) {
    console.error("Ensure anonymous sign in failed:", error);
    setEmployeeMessage("系統登入失敗，請重新整理後再試。");
    return null;
  }
}

// -----------------------------
// Initial Data
// -----------------------------
async function loadInitialData() {
  await Promise.all([
    loadVoteSettings(),
    loadPublishedContestants()
  ]);

  renderVoteStatus();
  renderAllContestants();
  renderSubmitState();
}

async function loadVoteSettings() {
  const [redCarpetSettings, finalAudienceSettings] = await Promise.all([
    getVoteSetting("redCarpetVote", "紅毯巨星造型獎投票目前尚未開放。"),
    getVoteSetting("finalAudienceVote", "決賽觀眾投票目前尚未開放。")
  ]);

  redCarpetVoteSettings = redCarpetSettings;
  finalAudienceVoteSettings = finalAudienceSettings;
}

async function getVoteSetting(settingId, defaultMessage) {
  try {
    const settingsRef = doc(db, "settings", settingId);
    const settingsSnap = await getDoc(settingsRef);

    if (!settingsSnap.exists()) {
      return {
        isOpen: false,
        message: defaultMessage
      };
    }

    const data = settingsSnap.data();

    return {
      isOpen: data.isOpen === true,
      message: data.message || defaultMessage
    };
  } catch (error) {
    console.error(`Load ${settingId} failed:`, error);

    return {
      isOpen: false,
      message: "投票狀態讀取失敗，請稍後再試。"
    };
  }
}

async function loadPublishedContestants() {
  contestantsLoadError = "";

  try {
    if (redCarpetContestantsGrid) {
      redCarpetContestantsGrid.innerHTML = `<p class="message">參賽者資料載入中...</p>`;
    }

    if (finalAudienceContestantsGrid) {
      finalAudienceContestantsGrid.innerHTML = `<p class="message">參賽者資料載入中...</p>`;
    }

    const contestantsRef = collection(db, "contestants");
    const q = query(contestantsRef, where("publishStatus", "==", true));
    const snapshot = await getDocs(q);

    publishedContestants = [];

    snapshot.forEach((docSnap) => {
      publishedContestants.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    publishedContestants.sort((a, b) => {
      const orderA = typeof a.manualOrder === "number" ? a.manualOrder : 999;
      const orderB = typeof b.manualOrder === "number" ? b.manualOrder : 999;

      if (orderA !== orderB) return orderA - orderB;

      const timeA = a.registerTime?.seconds || 0;
      const timeB = b.registerTime?.seconds || 0;

      return timeA - timeB;
    });
  } catch (error) {
    console.error("Load contestants failed:", error);
    contestantsLoadError = error.message || "參賽者資料讀取失敗";
    publishedContestants = [];
  }
}

// -----------------------------
// Employee Lookup
// -----------------------------
function handleEmployeeIdInputChange() {
  const employeeId = normalizeEmployeeId(employeeIdInput?.value || "");

  currentEmployeeProfile = null;

  currentRedCarpetVote = null;

  currentFinalAudienceSummary = null;
  currentFinalAudienceLogs = [];

  selectedRedCarpetContestantId = "";
  selectedFinalAudienceContestantIds = [];

  renderEmployeeInfo();
  renderVoteStatus();
  updateSelectedContestantText("redCarpet");
  updateSelectedContestantText("finalAudience");
  renderAllContestants();
  renderSubmitState();

  if (employeeLookupTimer) {
    clearTimeout(employeeLookupTimer);
  }

  if (!employeeId) {
    latestLookupEmployeeId = "";
    setEmployeeMessage("請輸入工號，系統會自動查詢投票狀態。");
    return;
  }

  if (employeeId.length < 3) {
    latestLookupEmployeeId = "";
    setEmployeeMessage("請繼續輸入工號。");
    return;
  }

  setEmployeeMessage("正在準備查詢員工資料...");

  employeeLookupTimer = setTimeout(async () => {
    await handleLookupEmployee();
  }, 500);
}

async function handleLookupEmployee() {
  const employeeId = normalizeEmployeeId(employeeIdInput?.value || "");

  if (!employeeId) {
    setEmployeeMessage("請輸入工號。");
    return;
  }

  if (employeeId.length < 3) {
    setEmployeeMessage("請繼續輸入工號。");
    return;
  }

  latestLookupEmployeeId = employeeId;

  const user = await ensureSignedIn();

  if (!user) {
    setEmployeeMessage("系統尚未完成登入，請重新整理後再試。");
    return;
  }

  currentEmployeeProfile = null;

  currentRedCarpetVote = null;

  currentFinalAudienceSummary = null;
  currentFinalAudienceLogs = [];

  selectedRedCarpetContestantId = "";
  selectedFinalAudienceContestantIds = [];

  renderEmployeeInfo();
  renderVoteStatus();
  updateSelectedContestantText("redCarpet");
  updateSelectedContestantText("finalAudience");
  renderAllContestants();
  renderSubmitState();

  try {
    setEmployeeMessage("正在查詢員工資料與投票狀態...");

    const employeeRef = doc(db, "employees", employeeId);
    const redCarpetVoteRef = doc(db, "redCarpetVotes", employeeId);
    const finalAudienceSummaryRef = doc(db, "finalAudienceVoteSummary", employeeId);

    let employeeSnap;
    let redCarpetVoteSnap;
    let finalAudienceSummarySnap;

    try {
      employeeSnap = await getDoc(employeeRef);
    } catch (error) {
      console.error("Read employee failed:", error);
      setEmployeeMessage(`員工資料讀取失敗：${error.message}`);
      return;
    }

    try {
      redCarpetVoteSnap = await getDoc(redCarpetVoteRef);
    } catch (error) {
      console.error("Read red carpet vote failed:", error);
      setEmployeeMessage(`紅毯投票狀態讀取失敗：${error.message}`);
      return;
    }

    try {
      finalAudienceSummarySnap = await getDoc(finalAudienceSummaryRef);
    } catch (error) {
      console.error("Read final audience summary failed:", error);
      setEmployeeMessage(`決賽觀眾投票狀態讀取失敗：${error.message}`);
      return;
    }

    if (employeeId !== latestLookupEmployeeId) {
      return;
    }

    if (!employeeSnap.exists()) {
      setEmployeeMessage("查無此工號，請確認輸入是否正確。");
      return;
    }

    const employeeData = employeeSnap.data();

    if (employeeData.isActive !== true) {
      setEmployeeMessage("此工號目前不是有效員工，無法參與投票。");
      return;
    }

    currentEmployeeProfile = {
      employeeId,
      name: employeeData.name || "",
      department: employeeData.department || "",
      company: employeeData.company || ""
    };

    if (redCarpetVoteSnap.exists()) {
      currentRedCarpetVote = {
        id: redCarpetVoteSnap.id,
        ...redCarpetVoteSnap.data()
      };

      selectedRedCarpetContestantId = currentRedCarpetVote.contestantId || "";
    }

    if (finalAudienceSummarySnap.exists()) {
      currentFinalAudienceSummary = {
        id: finalAudienceSummarySnap.id,
        ...finalAudienceSummarySnap.data()
      };

      selectedFinalAudienceContestantIds = Array.isArray(currentFinalAudienceSummary.votedContestantIds)
        ? [...currentFinalAudienceSummary.votedContestantIds]
        : [];
    }

    renderEmployeeInfo();
    renderVoteStatus();
    updateSelectedContestantText("redCarpet");
    updateSelectedContestantText("finalAudience");
    renderAllContestants();
    renderSubmitState();

    const finalUsedVotes = Number(currentFinalAudienceSummary?.usedVotes || 0);

    if (currentRedCarpetVote && finalUsedVotes >= 3) {
      setEmployeeMessage("你已完成紅毯投票與 3 票決賽觀眾投票，感謝參與。");
    } else {
      setEmployeeMessage("員工驗證成功，請依目前開放項目進行投票。");
    }
  } catch (error) {
    console.error("Lookup employee failed:", error);
    setEmployeeMessage(`查詢失敗：${error.message}`);
  }
}

function renderEmployeeInfo() {
  if (!employeeInfoBox) return;

  if (!currentEmployeeProfile) {
    employeeInfoBox.classList.add("hidden");

    if (employeeNameText) employeeNameText.textContent = "—";
    if (employeeDepartmentText) employeeDepartmentText.textContent = "—";
    if (employeeCompanyText) employeeCompanyText.textContent = "—";

    return;
  }

  employeeInfoBox.classList.remove("hidden");

  if (employeeNameText) employeeNameText.textContent = currentEmployeeProfile.name || "—";
  if (employeeDepartmentText) employeeDepartmentText.textContent = currentEmployeeProfile.department || "—";
  if (employeeCompanyText) employeeCompanyText.textContent = currentEmployeeProfile.company || "—";
}

// -----------------------------
// Rendering
// -----------------------------
function renderVoteStatus() {
  if (redCarpetVoteStatusText) {
    if (currentRedCarpetVote) {
      redCarpetVoteStatusText.textContent = "已投票";
    } else {
      redCarpetVoteStatusText.textContent = redCarpetVoteSettings.isOpen === true
        ? "開放中"
        : "未開放";
    }
  }

  if (finalAudienceVoteStatusText) {
    const finalUsedVotes = Number(currentFinalAudienceSummary?.usedVotes || 0);

    if (finalUsedVotes >= 3) {
      finalAudienceVoteStatusText.textContent = "已投滿 3 票";
    } else if (finalUsedVotes > 0) {
      finalAudienceVoteStatusText.textContent = `已投 ${finalUsedVotes} / 3`;
    } else {
      finalAudienceVoteStatusText.textContent = finalAudienceVoteSettings.isOpen === true
        ? "開放中"
        : "未開放";
    }
  }
}

function renderAllContestants() {
  renderContestants({
    grid: redCarpetContestantsGrid,
    voteType: "redCarpet",
    selectedContestantIds: selectedRedCarpetContestantId ? [selectedRedCarpetContestantId] : [],
    isLocked: Boolean(currentRedCarpetVote),
    statusLabel: "紅毯造型獎"
  });

  const finalUsedVotes = Number(currentFinalAudienceSummary?.usedVotes || 0);

  renderContestants({
    grid: finalAudienceContestantsGrid,
    voteType: "finalAudience",
    selectedContestantIds: selectedFinalAudienceContestantIds,
    isLocked: finalUsedVotes >= 3,
    statusLabel: "決賽觀眾投票"
  });
}

function renderContestants({
  grid,
  voteType,
  selectedContestantIds,
  isLocked,
  statusLabel
}) {
  if (!grid) return;

  if (contestantsLoadError) {
    grid.innerHTML = `<p class="message">參賽者資料讀取失敗：${escapeHtml(contestantsLoadError)}</p>`;
    return;
  }

  if (!publishedContestants.length) {
    grid.innerHTML = `<p class="message">目前尚無公開參賽者。</p>`;
    return;
  }

  const submittedFinalIds = Array.isArray(currentFinalAudienceSummary?.votedContestantIds)
    ? currentFinalAudienceSummary.votedContestantIds
    : [];

  grid.innerHTML = publishedContestants
    .map((contestant, index) => {
      const number = String(index + 1).padStart(2, "0");
      const isSelected = selectedContestantIds.includes(contestant.id);
      const isSubmittedFinalVote = voteType === "finalAudience" && submittedFinalIds.includes(contestant.id);

      const selectedClass = isSelected ? "selected" : "";
      const stageName = contestant.stageName || "—";
      const photoUrl = contestant.photoUrl || "";

      const photoBlock = photoUrl
        ? `
          <img
            class="red-carpet-photo"
            src="${escapeHtml(photoUrl)}"
            alt="${escapeHtml(contestant.name || "")}"
          />
        `
        : `
          <div class="red-carpet-photo-placeholder">
            <span>${escapeHtml(stageName.slice(0, 1) || "★")}</span>
          </div>
        `;

      let checkText = "選擇這位";

      if (isSelected && voteType === "redCarpet") {
        checkText = "已選擇";
      }

      if (isSelected && voteType === "finalAudience") {
        checkText = isSubmittedFinalVote ? "已送出" : "已選擇";
      }

      return `
        <article class="contestant-card expect-vote-card final-vote-card ${selectedClass}">
          <button
            type="button"
            class="expect-vote-select-button final-vote-select-button"
            data-vote-type="${escapeHtml(voteType)}"
            data-id="${escapeHtml(contestant.id)}"
            ${isLocked ? "disabled" : ""}
          >
            ${photoBlock}

            <div class="contestant-body">
              <div class="contestant-meta-row">
                <span class="contestant-number">No. ${number}</span>
                <span class="contestant-status">${escapeHtml(statusLabel)}</span>
              </div>

              <h3 class="red-carpet-contestant-name">${escapeHtml(contestant.name || "—")}</h3>
              <p class="contestant-stage">A.K.A. ${escapeHtml(stageName)}</p>

              <p class="contestant-teaser">
                ${escapeHtml(contestant.performanceItem || "決賽舞台即將登場")}
              </p>

              <span class="vote-card-check">
                ${checkText}
              </span>
            </div>
          </button>
        </article>
      `;
    })
    .join("");

  grid.querySelectorAll(".final-vote-select-button").forEach((button) => {
    button.addEventListener("click", () => {
      const type = button.dataset.voteType || "";
      const contestantId = button.dataset.id || "";
      selectContestant(type, contestantId);
    });
  });
}

function updateSelectedContestantText(voteType) {
  if (voteType === "redCarpet") {
    const contestant = publishedContestants.find((item) => {
      return item.id === selectedRedCarpetContestantId;
    });

    if (selectedRedCarpetContestantText) {
      selectedRedCarpetContestantText.textContent = contestant
        ? contestant.stageName || contestant.name || "已選擇"
        : "尚未選擇";
    }
  }

  if (voteType === "finalAudience") {
    const selectedContestants = selectedFinalAudienceContestantIds
      .map((id) => {
        return publishedContestants.find((item) => item.id === id);
      })
      .filter(Boolean);

    if (selectedFinalAudienceContestantText) {
      selectedFinalAudienceContestantText.textContent = selectedContestants.length
        ? selectedContestants
            .map((item) => item.stageName || item.name || "未命名選手")
            .join("、")
        : "尚未選擇，請選滿 3 位";
    }
  }
}

function renderSubmitState() {
  if (submitRedCarpetVoteButton) {
    const canSubmitRedCarpet =
      redCarpetVoteSettings.isOpen === true &&
      currentEmployeeProfile &&
      !currentRedCarpetVote &&
      Boolean(selectedRedCarpetContestantId);

    submitRedCarpetVoteButton.disabled = !canSubmitRedCarpet;
  }

  if (submitFinalAudienceVoteButton) {
    const existingIds = Array.isArray(currentFinalAudienceSummary?.votedContestantIds)
      ? currentFinalAudienceSummary.votedContestantIds
      : [];

    const finalUsedVotes = existingIds.length;

    const hasNewSelection = selectedFinalAudienceContestantIds.some((id) => {
      return !existingIds.includes(id);
    });

    const canSubmitFinalAudience =
      finalAudienceVoteSettings.isOpen === true &&
      currentEmployeeProfile &&
      finalUsedVotes < 3 &&
      selectedFinalAudienceContestantIds.length === 3 &&
      hasNewSelection;

    submitFinalAudienceVoteButton.disabled = !canSubmitFinalAudience;
  }
}

// -----------------------------
// Selection
// -----------------------------
function selectContestant(voteType, contestantId) {
  if (voteType === "redCarpet") {
    if (currentRedCarpetVote) {
      setRedCarpetMessage("你已完成紅毯巨星造型獎投票，無法再次選擇。");
      return;
    }

    if (redCarpetVoteSettings.isOpen !== true) {
      setRedCarpetMessage(redCarpetVoteSettings.message || "紅毯巨星造型獎投票目前尚未開放。");
      return;
    }

    selectedRedCarpetContestantId = contestantId;
    updateSelectedContestantText("redCarpet");
    setRedCarpetMessage("");
  }

  if (voteType === "finalAudience") {
    const existingIds = Array.isArray(currentFinalAudienceSummary?.votedContestantIds)
      ? currentFinalAudienceSummary.votedContestantIds
      : [];

    if (existingIds.length >= 3) {
      setFinalAudienceMessage("你已完成 3 票決賽觀眾投票，無法再次選擇。");
      return;
    }

    if (finalAudienceVoteSettings.isOpen !== true) {
      setFinalAudienceMessage(finalAudienceVoteSettings.message || "決賽觀眾投票目前尚未開放。");
      return;
    }

    if (existingIds.includes(contestantId)) {
      setFinalAudienceMessage("這位參賽者已完成送出，不能取消。");
      return;
    }

    const alreadySelected = selectedFinalAudienceContestantIds.includes(contestantId);

    if (alreadySelected) {
      selectedFinalAudienceContestantIds = selectedFinalAudienceContestantIds.filter((id) => {
        return id !== contestantId;
      });
    } else {
      if (selectedFinalAudienceContestantIds.length >= 3) {
        setFinalAudienceMessage("決賽觀眾投票最多選擇 3 位參賽者。");
        return;
      }

      selectedFinalAudienceContestantIds.push(contestantId);
    }

    updateSelectedContestantText("finalAudience");
    setFinalAudienceMessage("");
  }

  renderAllContestants();
  renderSubmitState();
}

// -----------------------------
// Submit Red Carpet Vote
// -----------------------------
async function submitRedCarpetVote() {
  const user = await ensureSignedIn();

  if (!user) {
    setRedCarpetMessage("系統尚未完成登入，請重新整理後再試。");
    return;
  }

  if (redCarpetVoteSettings.isOpen !== true) {
    setRedCarpetMessage(redCarpetVoteSettings.message || "紅毯巨星造型獎投票目前尚未開放。");
    return;
  }

  if (!currentEmployeeProfile) {
    setRedCarpetMessage("請先輸入工號並完成員工驗證。");
    return;
  }

  if (currentRedCarpetVote) {
    setRedCarpetMessage("你已完成紅毯巨星造型獎投票，無法重複投票。");
    return;
  }

  if (!selectedRedCarpetContestantId) {
    setRedCarpetMessage("請先選擇一位參賽者。");
    return;
  }

  const selectedContestant = publishedContestants.find((item) => {
    return item.id === selectedRedCarpetContestantId;
  });

  if (!selectedContestant) {
    setRedCarpetMessage("找不到選擇的參賽者，請重新整理後再試。");
    return;
  }

  const confirmed = confirm(
    `確定要把「紅毯巨星造型獎」投給「${selectedContestant.stageName || selectedContestant.name || "此參賽者"}」嗎？\n\n送出後無法自行修改。`
  );

  if (!confirmed) return;

  try {
    submitRedCarpetVoteButton.disabled = true;
    submitRedCarpetVoteButton.textContent = "送出中...";
    setRedCarpetMessage("紅毯投票送出中...");

    const employeeId = currentEmployeeProfile.employeeId;
    const voteRef = doc(db, "redCarpetVotes", employeeId);
    const contestantRef = doc(db, "contestants", selectedRedCarpetContestantId);

    await runTransaction(db, async (transaction) => {
      const voteSnap = await transaction.get(voteRef);
      const contestantSnap = await transaction.get(contestantRef);

      if (voteSnap.exists()) {
        throw new Error("ALREADY_VOTED");
      }

      if (!contestantSnap.exists()) {
        throw new Error("CONTESTANT_NOT_FOUND");
      }

      const contestantData = contestantSnap.data();

      if (contestantData.publishStatus !== true) {
        throw new Error("CONTESTANT_NOT_PUBLIC");
      }

      transaction.set(voteRef, {
        employeeId,
        employeeName: currentEmployeeProfile.name || "",
        employeeDepartment: currentEmployeeProfile.department || "",
        employeeCompany: currentEmployeeProfile.company || "",
        contestantId: selectedRedCarpetContestantId,
        createdAt: serverTimestamp()
      });
    });

    currentRedCarpetVote = {
      id: employeeId,
      employeeId,
      contestantId: selectedRedCarpetContestantId
    };

    setRedCarpetMessage("紅毯巨星造型獎投票成功！");
    renderVoteStatus();
    renderAllContestants();
    renderSubmitState();
  } catch (error) {
    console.error("Submit red carpet vote failed:", error);

    if (error.message === "ALREADY_VOTED") {
      setRedCarpetMessage("你已完成紅毯巨星造型獎投票，無法重複投票。");
    } else if (error.message === "CONTESTANT_NOT_FOUND") {
      setRedCarpetMessage("找不到選擇的參賽者，請重新整理後再試。");
    } else if (error.message === "CONTESTANT_NOT_PUBLIC") {
      setRedCarpetMessage("此參賽者目前未公開，無法投票。");
    } else {
      setRedCarpetMessage(`投票失敗：${error.message}`);
    }
  } finally {
    submitRedCarpetVoteButton.textContent = "送出紅毯造型獎投票";
    renderSubmitState();
  }
}

// -----------------------------
// Submit Final Audience Votes
// -----------------------------
async function submitFinalAudienceVotes() {
  const user = await ensureSignedIn();

  if (!user) {
    setFinalAudienceMessage("系統尚未完成登入，請重新整理後再試。");
    return;
  }

  if (finalAudienceVoteSettings.isOpen !== true) {
    setFinalAudienceMessage(finalAudienceVoteSettings.message || "決賽觀眾投票目前尚未開放。");
    return;
  }

  if (!currentEmployeeProfile) {
    setFinalAudienceMessage("請先輸入工號並完成員工驗證。");
    return;
  }

  const employeeId = currentEmployeeProfile.employeeId;

  const existingIds = Array.isArray(currentFinalAudienceSummary?.votedContestantIds)
    ? currentFinalAudienceSummary.votedContestantIds
    : [];

  if (existingIds.length >= 3) {
    setFinalAudienceMessage("你已完成 3 票決賽觀眾投票，無法重複投票。");
    return;
  }

  if (selectedFinalAudienceContestantIds.length !== 3) {
    setFinalAudienceMessage("決賽觀眾投票請選滿 3 位參賽者後再送出。");
    return;
  }

  const uniqueSelectedIds = [...new Set(selectedFinalAudienceContestantIds)];

  if (uniqueSelectedIds.length !== selectedFinalAudienceContestantIds.length) {
    setFinalAudienceMessage("同一位參賽者不可重複投票。");
    return;
  }

  const newIds = uniqueSelectedIds.filter((id) => {
    return !existingIds.includes(id);
  });

  if (!newIds.length) {
    setFinalAudienceMessage("沒有新的投票需要送出。");
    return;
  }

  const selectedContestants = uniqueSelectedIds
    .map((id) => publishedContestants.find((item) => item.id === id))
    .filter(Boolean);

  if (selectedContestants.length !== uniqueSelectedIds.length) {
    setFinalAudienceMessage("部分選擇的參賽者不存在，請重新整理後再試。");
    return;
  }

  const confirmed = confirm(
    `確定要送出決賽觀眾投票嗎？\n\n你選擇的是：\n${selectedContestants
      .map((item, index) => `${index + 1}. ${item.stageName || item.name || "未命名選手"}`)
      .join("\n")}\n\n送出後無法自行修改。`
  );

  if (!confirmed) return;

  try {
    submitFinalAudienceVoteButton.disabled = true;
    submitFinalAudienceVoteButton.textContent = "送出中...";
    setFinalAudienceMessage("決賽觀眾投票送出中...");

    const summaryRef = doc(db, "finalAudienceVoteSummary", employeeId);

    await runTransaction(db, async (transaction) => {
      const summarySnap = await transaction.get(summaryRef);

      let transactionExistingIds = [];

      if (summarySnap.exists()) {
        const summaryData = summarySnap.data();

        transactionExistingIds = Array.isArray(summaryData.votedContestantIds)
          ? summaryData.votedContestantIds
          : [];

        if (Number(summaryData.usedVotes || 0) >= 3) {
          throw new Error("ALREADY_VOTED");
        }
      }

      const mergedIds = [...new Set([...transactionExistingIds, ...uniqueSelectedIds])];

      if (mergedIds.length > 3) {
        throw new Error("TOO_MANY_VOTES");
      }

      if (mergedIds.length !== 3) {
        throw new Error("NEED_THREE_VOTES");
      }

      const transactionNewIds = mergedIds.filter((id) => {
        return !transactionExistingIds.includes(id);
      });

      const contestantRefs = transactionNewIds.map((contestantId) => {
        return doc(db, "contestants", contestantId);
      });

      const logRefs = transactionNewIds.map((contestantId) => {
        return doc(db, "finalAudienceVoteLogs", `${employeeId}_${contestantId}`);
      });

      const contestantSnaps = [];
      const logSnaps = [];

      for (const contestantRef of contestantRefs) {
        contestantSnaps.push(await transaction.get(contestantRef));
      }

      for (const logRef of logRefs) {
        logSnaps.push(await transaction.get(logRef));
      }

      contestantSnaps.forEach((contestantSnap) => {
        if (!contestantSnap.exists()) {
          throw new Error("CONTESTANT_NOT_FOUND");
        }

        if (contestantSnap.data().publishStatus !== true) {
          throw new Error("CONTESTANT_NOT_PUBLIC");
        }
      });

      logSnaps.forEach((logSnap) => {
        if (logSnap.exists()) {
          throw new Error("DUPLICATE_VOTE");
        }
      });

      transactionNewIds.forEach((contestantId) => {
        const logRef = doc(db, "finalAudienceVoteLogs", `${employeeId}_${contestantId}`);

        transaction.set(logRef, {
          employeeId,
          employeeName: currentEmployeeProfile.name || "",
          employeeDepartment: currentEmployeeProfile.department || "",
          employeeCompany: currentEmployeeProfile.company || "",
          contestantId,
          createdAt: serverTimestamp()
        });
      });

      transaction.set(
        summaryRef,
        {
          employeeId,
          employeeName: currentEmployeeProfile.name || "",
          employeeDepartment: currentEmployeeProfile.department || "",
          employeeCompany: currentEmployeeProfile.company || "",
          usedVotes: mergedIds.length,
          votedContestantIds: mergedIds,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp()
        },
        { merge: true }
      );
    });

    currentFinalAudienceSummary = {
      id: employeeId,
      employeeId,
      employeeName: currentEmployeeProfile.name || "",
      employeeDepartment: currentEmployeeProfile.department || "",
      employeeCompany: currentEmployeeProfile.company || "",
      usedVotes: uniqueSelectedIds.length,
      votedContestantIds: uniqueSelectedIds
    };

    selectedFinalAudienceContestantIds = [...uniqueSelectedIds];

    setFinalAudienceMessage("決賽觀眾投票成功，感謝參與！");
    renderVoteStatus();
    updateSelectedContestantText("finalAudience");
    renderAllContestants();
    renderSubmitState();
  } catch (error) {
    console.error("Submit final audience votes failed:", error);

    if (error.message === "ALREADY_VOTED") {
      setFinalAudienceMessage("你已完成 3 票決賽觀眾投票，無法重複投票。");
    } else if (error.message === "TOO_MANY_VOTES") {
      setFinalAudienceMessage("決賽觀眾投票最多 3 票。");
    } else if (error.message === "NEED_THREE_VOTES") {
      setFinalAudienceMessage("決賽觀眾投票請選滿 3 位參賽者後再送出。");
    } else if (error.message === "DUPLICATE_VOTE") {
      setFinalAudienceMessage("同一位參賽者不可重複投票。");
    } else if (error.message === "CONTESTANT_NOT_FOUND") {
      setFinalAudienceMessage("找不到選擇的參賽者，請重新整理後再試。");
    } else if (error.message === "CONTESTANT_NOT_PUBLIC") {
      setFinalAudienceMessage("部分參賽者目前未公開，無法投票。");
    } else {
      setFinalAudienceMessage(`投票失敗：${error.message}`);
    }
  } finally {
    submitFinalAudienceVoteButton.textContent = "送出決賽觀眾投票（需選滿 3 位）";
    renderSubmitState();
  }
}

// -----------------------------
// Messages / Utils
// -----------------------------
function setEmployeeMessage(message) {
  setMessage(employeeLookupMessage, message);
}

function setRedCarpetMessage(message) {
  setMessage(redCarpetVoteMessage, message);
}

function setFinalAudienceMessage(message) {
  setMessage(finalAudienceVoteMessage, message);
}

function setMessage(element, message) {
  if (element) {
    element.textContent = message;
  }
}

function normalizeEmployeeId(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

console.log("Final vote page loaded.");