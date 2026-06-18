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

const SETTINGS_DOC_ID = "redCarpetVote";

let currentUser = null;
let authReadyResolve;
let hasLoadedInitialData = false;
let isAnonymousSignInRunning = false;
let hasResolvedAuthReady = false;
let currentEmployeeProfile = null;
let currentRedCarpetVote = null;
let publishedContestants = [];
let selectedContestantId = "";
let employeeLookupTimer = null;
let latestLookupEmployeeId = "";
let redCarpetVoteSettings = {
  isOpen: false,
  message: "紅毯巨星造型獎投票目前尚未開放。"
};

const authReadyPromise = new Promise((resolve) => {
  authReadyResolve = resolve;
});

// DOM
const mobileMenuButton = document.getElementById("mobileMenuButton");
const navLinks = document.getElementById("navLinks");

const employeeIdInput = document.getElementById("employeeIdInput");
const employeeInfoBox = document.getElementById("employeeInfoBox");
const employeeNameText = document.getElementById("employeeNameText");
const employeeDepartmentText = document.getElementById("employeeDepartmentText");
const employeeCompanyText = document.getElementById("employeeCompanyText");

const redCarpetVoteStatusText = document.getElementById("redCarpetVoteStatusText");
const selectedContestantText = document.getElementById("selectedContestantText");
const submitVoteButton = document.getElementById("submitVoteButton");
const voteMessage = document.getElementById("voteMessage");
const contestantsGrid = document.getElementById("contestantsGrid");

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

  submitVoteButton?.addEventListener("click", async () => {
    await submitRedCarpetVote();
  });
}

function handleEmployeeIdInputChange() {
  const employeeId = normalizeEmployeeId(employeeIdInput?.value || "");

  currentEmployeeProfile = null;
  currentRedCarpetVote = null;
  selectedContestantId = "";

  renderEmployeeInfo();

  if (selectedContestantText) {
    selectedContestantText.textContent = "尚未選擇";
  }

  renderContestants();
  renderSubmitState();

  if (employeeLookupTimer) {
    clearTimeout(employeeLookupTimer);
  }

  if (!employeeId) {
    latestLookupEmployeeId = "";
    setMessage("請輸入工號。");
    return;
  }

  if (employeeId.length < 3) {
    latestLookupEmployeeId = "";
    setMessage("請繼續輸入工號。");
    return;
  }

  setMessage("正在準備查詢員工資料...");

  employeeLookupTimer = setTimeout(async () => {
    await handleLookupEmployee();
  }, 500);
}

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
        setMessage("系統登入失敗，請重新整理後再試。");

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

    if (hasLoadedInitialData) {
      return;
    }

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
  if (currentUser) {
    return currentUser;
  }

  let user = await waitForAuthReady();

  if (user) {
    return user;
  }

  try {
    const result = await signInAnonymously(auth);
    currentUser = result.user;
    return result.user;
  } catch (error) {
    console.error("Ensure anonymous sign in failed:", error);
    setMessage("系統登入失敗，請重新整理後再試。");
    return null;
  }
}

async function loadInitialData() {
  await Promise.all([
    loadRedCarpetVoteSettings(),
    loadPublishedContestants()
  ]);

  renderVoteStatus();
  renderSubmitState();
}

async function loadRedCarpetVoteSettings() {
  try {
    const settingsRef = doc(db, "settings", SETTINGS_DOC_ID);
    const settingsSnap = await getDoc(settingsRef);

    if (!settingsSnap.exists()) {
      redCarpetVoteSettings = {
        isOpen: false,
        message: "紅毯巨星造型獎投票目前尚未開放。"
      };

      return;
    }

    const data = settingsSnap.data();

    redCarpetVoteSettings = {
      isOpen: data.isOpen === true,
      message: data.message || (
        data.isOpen === true
          ? "紅毯巨星造型獎投票開放中。"
          : "紅毯巨星造型獎投票目前尚未開放。"
      )
    };
  } catch (error) {
    console.error("Load red carpet vote settings failed:", error);

    redCarpetVoteSettings = {
      isOpen: false,
      message: "投票狀態讀取失敗，請稍後再試。"
    };
  }
}

async function loadPublishedContestants() {
  if (!contestantsGrid) return;

  contestantsGrid.innerHTML = `
    <p class="message">參賽者資料載入中...</p>
  `;

  try {
    const contestantsRef = collection(db, "contestants");
    const q = query(
      contestantsRef,
      where("publishStatus", "==", true)
    );

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

    renderContestants();
  } catch (error) {
    console.error("Load contestants failed:", error);

    contestantsGrid.innerHTML = `
      <p class="message">參賽者資料讀取失敗：${escapeHtml(error.message)}</p>
    `;
  }
}

function renderContestants() {
  if (!contestantsGrid) return;

  if (!publishedContestants.length) {
    contestantsGrid.innerHTML = `
      <p class="message">目前尚無公開參賽者。</p>
    `;

    return;
  }

  contestantsGrid.innerHTML = publishedContestants
    .map((contestant, index) => {
      const number = String(index + 1).padStart(2, "0");
      const isSelected = contestant.id === selectedContestantId;
      const stageName = contestant.stageName || "—";
      const photoUrl = contestant.photoUrl || "";

      const selectedClass = isSelected ? "selected" : "";

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

      return `
        <article class="contestant-card expect-vote-card red-carpet-card ${selectedClass}">
          <button
            type="button"
            class="expect-vote-select-button red-carpet-select-button"
            data-id="${escapeHtml(contestant.id)}"
          >
            ${photoBlock}

            <div class="contestant-body">
              <div class="contestant-meta-row">
                <span class="contestant-number">No. ${number}</span>
                <span class="contestant-status">紅毯造型獎</span>
              </div>

              <h3 class="red-carpet-contestant-name">${escapeHtml(contestant.name || "—")}</h3>
              <p class="contestant-stage">A.K.A. ${escapeHtml(stageName)}</p>

              <p class="contestant-teaser">
                ${escapeHtml(contestant.performanceItem || "決賽舞台即將登場")}
              </p>

              <span class="vote-card-check">
                ${isSelected ? "已選擇" : "選擇這位"}
              </span>
            </div>
          </button>
        </article>
      `;
    })
    .join("");

  document.querySelectorAll(".red-carpet-select-button").forEach((button) => {
    button.addEventListener("click", () => {
      const contestantId = button.dataset.id || "";
      selectContestant(contestantId);
    });
  });
}

function selectContestant(contestantId) {
  if (currentRedCarpetVote) {
    setMessage("你已完成紅毯巨星造型獎投票，無法再次選擇。");
    return;
  }

  if (redCarpetVoteSettings.isOpen !== true) {
    setMessage(redCarpetVoteSettings.message || "紅毯巨星造型獎投票目前尚未開放。");
    return;
  }

  selectedContestantId = contestantId;

  const selectedContestant = publishedContestants.find((item) => item.id === selectedContestantId);

  if (selectedContestantText) {
    selectedContestantText.textContent = selectedContestant
      ? selectedContestant.stageName || selectedContestant.name || "已選擇"
      : "尚未選擇";
  }

  setMessage("");
  renderContestants();
  renderSubmitState();
}

async function handleLookupEmployee() {
  const employeeId = normalizeEmployeeId(employeeIdInput?.value || "");

  if (!employeeId) {
    setMessage("請輸入工號。");
    return;
  }

  if (employeeId.length < 3) {
    setMessage("請繼續輸入工號。");
    return;
  }

  latestLookupEmployeeId = employeeId;

  const user = await ensureSignedIn();

  if (!user) {
    setMessage("系統尚未完成登入，請重新整理後再試。");
    return;
  }

  console.log("Red carpet lookup auth uid:", user.uid);

  currentEmployeeProfile = null;
  currentRedCarpetVote = null;

  renderEmployeeInfo();
  renderSubmitState();

  try {
    setMessage("正在查詢員工資料與投票狀態...");

    const employeeRef = doc(db, "employees", employeeId);
    const voteRef = doc(db, "redCarpetVotes", employeeId);

    const [employeeSnap, voteSnap] = await Promise.all([
      getDoc(employeeRef),
      getDoc(voteRef)
    ]);

    if (!employeeSnap.exists()) {
      setMessage("查無此工號，請確認輸入是否正確。");
      return;
    }

    if (employeeId !== latestLookupEmployeeId) {
  return;
}
    
    const employeeData = employeeSnap.data();

    if (employeeData.isActive !== true) {
      setMessage("此工號目前不是有效員工，無法參與投票。");
      return;
    }

    currentEmployeeProfile = {
      employeeId,
      name: employeeData.name || "",
      department: employeeData.department || "",
      company: employeeData.company || ""
    };

    if (voteSnap.exists()) {
      currentRedCarpetVote = {
        id: voteSnap.id,
        ...voteSnap.data()
      };

      const votedContestant = publishedContestants.find((item) => {
        return item.id === currentRedCarpetVote.contestantId;
      });

      selectedContestantId = currentRedCarpetVote.contestantId || "";

      if (selectedContestantText) {
        selectedContestantText.textContent = votedContestant
          ? votedContestant.stageName || votedContestant.name || "已投票"
          : "已投票";
      }

      setMessage("你已完成紅毯巨星造型獎投票，感謝參與。");
    } else {
      setMessage("員工驗證成功，請選擇一位參賽者後送出投票。");
    }

    renderEmployeeInfo();
    renderContestants();
    renderSubmitState();
  } catch (error) {
    console.error("Lookup employee failed:", error);
    setMessage(`查詢失敗：${error.message}`);
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

  if (employeeNameText) {
    employeeNameText.textContent = currentEmployeeProfile.name || "—";
  }

  if (employeeDepartmentText) {
    employeeDepartmentText.textContent = currentEmployeeProfile.department || "—";
  }

  if (employeeCompanyText) {
    employeeCompanyText.textContent = currentEmployeeProfile.company || "—";
  }
}

function renderVoteStatus() {
  if (!redCarpetVoteStatusText) return;

  redCarpetVoteStatusText.textContent = redCarpetVoteSettings.isOpen === true
    ? "開放中"
    : "未開放";
}

function renderSubmitState() {
  if (!submitVoteButton) return;

  const canSubmit =
    redCarpetVoteSettings.isOpen === true &&
    currentEmployeeProfile &&
    !currentRedCarpetVote &&
    selectedContestantId;

  submitVoteButton.disabled = !canSubmit;
}

async function submitRedCarpetVote() {
  const user = await ensureSignedIn();

  if (!user) {
    setMessage("系統尚未完成登入，請重新整理後再試。");
    return;
  }

  console.log("Red carpet submit auth uid:", user.uid);

  if (redCarpetVoteSettings.isOpen !== true) {
    setMessage(redCarpetVoteSettings.message || "紅毯巨星造型獎投票目前尚未開放。");
    return;
  }

  if (!currentEmployeeProfile) {
    setMessage("請先輸入工號並完成員工驗證。");
    return;
  }

  if (currentRedCarpetVote) {
    setMessage("你已完成投票，無法重複投票。");
    return;
  }

  if (!selectedContestantId) {
    setMessage("請先選擇一位參賽者。");
    return;
  }

  const selectedContestant = publishedContestants.find((item) => item.id === selectedContestantId);

  if (!selectedContestant) {
    setMessage("找不到選擇的參賽者，請重新整理後再試。");
    return;
  }

  const confirmed = confirm(
    `確定要把紅毯巨星造型獎投給「${selectedContestant.stageName || selectedContestant.name || "此參賽者"}」嗎？\n\n送出後無法自行修改。`
  );

  if (!confirmed) return;

  try {
    submitVoteButton.disabled = true;
    submitVoteButton.textContent = "送出中...";
    setMessage("投票送出中...");

    const employeeId = currentEmployeeProfile.employeeId;
    const voteRef = doc(db, "redCarpetVotes", employeeId);
    const contestantRef = doc(db, "contestants", selectedContestantId);

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
        contestantId: selectedContestantId,
        createdAt: serverTimestamp()
      });
    });

    currentRedCarpetVote = {
      id: employeeId,
      employeeId,
      contestantId: selectedContestantId
    };

    setMessage("投票成功！感謝你參與紅毯巨星造型獎投票。");
    renderContestants();
    renderSubmitState();
  } catch (error) {
    console.error("Submit red carpet vote failed:", error);

    if (error.message === "ALREADY_VOTED") {
      setMessage("你已完成紅毯巨星造型獎投票，無法重複投票。");
    } else if (error.message === "CONTESTANT_NOT_FOUND") {
      setMessage("找不到選擇的參賽者，請重新整理後再試。");
    } else if (error.message === "CONTESTANT_NOT_PUBLIC") {
      setMessage("此參賽者目前未公開，無法投票。");
    } else {
      setMessage(`投票失敗：${error.message}`);
    }
  } finally {
    submitVoteButton.textContent = "送出紅毯投票";
    renderSubmitState();
  }
}

function setMessage(message) {
  if (voteMessage) {
    voteMessage.textContent = message;
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

console.log("Red carpet vote page loaded.");