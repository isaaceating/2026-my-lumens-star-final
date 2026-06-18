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
  query,
  where,
  onSnapshot,
  runTransaction,
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

const MAX_EXPECT_VOTES = 3;
const EXPECT_VOTE_AUTO_CLOSE_TIME = new Date("2026-07-13T00:00:00+08:00");

let currentAuthUser = null;
let contestantsCache = [];
let selectedContestantIds = new Set();
let currentEmployeeId = "";
let currentEmployeeProfile = null;

let expectVoteSettingsCache = {
  isOpen: false,
  isAutoClosed: false,
  message: "最期待歌手票選目前未開放"
};

const mobileMenuButton = document.getElementById("mobileMenuButton");
const navLinks = document.getElementById("navLinks");

const employeeIdInput = document.getElementById("employeeIdInput");
const employeeInfoBox = document.getElementById("employeeInfoBox");
const employeeNameText = document.getElementById("employeeNameText");
const employeeDepartmentText = document.getElementById("employeeDepartmentText");
const employeeCompanyText = document.getElementById("employeeCompanyText");

const selectedCountText = document.getElementById("selectedCountText");
const usedVotesText = document.getElementById("usedVotesText");
const submitVoteButton = document.getElementById("submitVoteButton");
const voteMessage = document.getElementById("voteMessage");
const expectVoteGrid = document.getElementById("expectVoteGrid");

const MYSTERY_AVATARS = [
  { key: "mystery-01", label: "神秘歌手 01", icon: "♪", className: "avatar-gold" },
  { key: "mystery-02", label: "神秘歌手 02", icon: "★", className: "avatar-blue" },
  { key: "mystery-03", label: "神秘歌手 03", icon: "♬", className: "avatar-purple" },
  { key: "mystery-04", label: "神秘歌手 04", icon: "◆", className: "avatar-pink" },
  { key: "mystery-05", label: "神秘歌手 05", icon: "✦", className: "avatar-green" },
  { key: "mystery-06", label: "神秘歌手 06", icon: "●", className: "avatar-orange" },
  { key: "mystery-07", label: "神秘歌手 07", icon: "♩", className: "avatar-cyan" },
  { key: "mystery-08", label: "神秘歌手 08", icon: "✧", className: "avatar-red" }
];

init();

function init() {
  setupMobileNav();
  setupEmployeeIdInput();
  setupSubmitButton();
  setupAnonymousAuth();
  listenToExpectVoteSettings();
  listenToPublishedContestants();
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

function setupEmployeeIdInput() {
  if (!employeeIdInput) return;

  employeeIdInput.addEventListener(
    "input",
    debounce(async () => {
      const nextEmployeeId = normalizeEmployeeId(employeeIdInput.value);

      if (nextEmployeeId === currentEmployeeId) return;

      currentEmployeeId = nextEmployeeId;
      currentEmployeeProfile = null;
      selectedContestantIds.clear();

      updateSelectedUI();
      clearEmployeeInfo();
      renderContestants();

      if (!currentEmployeeId) {
        usedVotesText.textContent = "輸入工號後查詢";
        voteMessage.textContent = getVoteStatus().message;
        return;
      }

      if (!isValidEmployeeId(currentEmployeeId)) {
        usedVotesText.textContent = "工號格式不正確";
        voteMessage.textContent = "請輸入正確工號。";
        return;
      }

      voteMessage.textContent = "正在初始化投票身份...";
      usedVotesText.textContent = "查詢中...";

      try {
        await waitForAuthReady();
      } catch (error) {
        voteMessage.textContent = "投票身份初始化失敗，請重新整理頁面再試。";
        usedVotesText.textContent = "無法投票";
        return;
      }

      voteMessage.textContent = "正在查詢員工資料...";

      const employeeResult = await loadEmployeeProfile(currentEmployeeId);

      if (!employeeResult.ok) {
        if (employeeResult.reason === "permission") {
          voteMessage.textContent = "員工資料讀取權限不足，請確認 Firestore Rules 或重新整理後再試。";
        } else {
          voteMessage.textContent = "查無此工號，請確認後再試。";
        }

        usedVotesText.textContent = "無法投票";
        clearEmployeeInfo();
        return;
      }

      const employeeProfile = employeeResult.profile;

      if (employeeProfile.isActive === false) {
        voteMessage.textContent = "此工號目前未啟用，無法投票。";
        usedVotesText.textContent = "不可投票";
        clearEmployeeInfo();
        return;
      }

      currentEmployeeProfile = employeeProfile;
      renderEmployeeInfo(employeeProfile);

      voteMessage.textContent = "";
      await loadEmployeeVoteSummary(currentEmployeeId);

      const voteStatus = getVoteStatus();
      if (!voteStatus.canVote) {
        voteMessage.textContent = voteStatus.message;
      }
    }, 350)
  );
}

function setupSubmitButton() {
  if (!submitVoteButton) return;

  submitVoteButton.addEventListener("click", async () => {
    await submitExpectVotes();
  });
}

async function setupAnonymousAuth() {
  onAuthStateChanged(auth, (user) => {
    currentAuthUser = user;
  });

  try {
    await waitForAuthReady();
  } catch (error) {
    console.error("Anonymous auth failed:", error);
    voteMessage.textContent = "投票身份初始化失敗，請重新整理頁面再試。";
  }
}

async function waitForAuthReady() {
  if (currentAuthUser) {
    return currentAuthUser;
  }

  if (auth.currentUser) {
    currentAuthUser = auth.currentUser;
    return currentAuthUser;
  }

  try {
    const credential = await signInAnonymously(auth);
    currentAuthUser = credential.user;
    return currentAuthUser;
  } catch (error) {
    console.error("waitForAuthReady failed:", error);
    throw error;
  }
}

function listenToExpectVoteSettings() {
  const settingsRef = doc(db, "settings", "expectVote");

  onSnapshot(
    settingsRef,
    (snapshot) => {
      const now = new Date();
      const isAutoClosed = now >= EXPECT_VOTE_AUTO_CLOSE_TIME;

      if (!snapshot.exists()) {
        expectVoteSettingsCache = {
          isOpen: false,
          isAutoClosed,
          message: "最期待歌手票選目前未開放"
        };

        updateVoteAvailabilityUI();
        return;
      }

      const data = snapshot.data();

      expectVoteSettingsCache = {
        isOpen: data.isOpen === true,
        isAutoClosed,
        message: data.message || ""
      };

      updateVoteAvailabilityUI();
    },
    (error) => {
      console.error("Load expect vote settings failed:", error);

      expectVoteSettingsCache = {
        isOpen: false,
        isAutoClosed: false,
        message: "票選狀態讀取失敗，請稍後再試"
      };

      updateVoteAvailabilityUI();
    }
  );
}

function updateVoteAvailabilityUI() {
  const voteStatus = getVoteStatus();

  if (submitVoteButton) {
    submitVoteButton.disabled = !voteStatus.canVote;
  }

  if (voteMessage && !currentEmployeeId) {
    voteMessage.textContent = voteStatus.message;
  }
}

function listenToPublishedContestants() {
  expectVoteGrid.innerHTML = `<p class="message">神秘歌手載入中...</p>`;

  const contestantsRef = collection(db, "contestants");
  const q = query(contestantsRef, where("publishStatus", "==", true));

  onSnapshot(
    q,
    (snapshot) => {
      contestantsCache = [];

      snapshot.forEach((docSnap) => {
        contestantsCache.push({
          id: docSnap.id,
          ...docSnap.data()
        });
      });

      contestantsCache.sort((a, b) => {
        const orderA = typeof a.manualOrder === "number" ? a.manualOrder : 999;
        const orderB = typeof b.manualOrder === "number" ? b.manualOrder : 999;

        if (orderA !== orderB) return orderA - orderB;

        const timeA = a.registerTime?.seconds || 0;
        const timeB = b.registerTime?.seconds || 0;

        return timeA - timeB;
      });

      preselectContestantFromUrl();
      renderContestants();
    },
    (error) => {
      console.error("Load contestants failed:", error);
      expectVoteGrid.innerHTML = `<p class="message">神秘歌手資料讀取失敗，請稍後再試。</p>`;
    }
  );
}

function preselectContestantFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const contestantId = params.get("contestantId");

  if (!contestantId) return;

  const exists = contestantsCache.some((contestant) => contestant.id === contestantId);
  if (!exists) return;

  if (selectedContestantIds.size < MAX_EXPECT_VOTES) {
    selectedContestantIds.add(contestantId);
  }
}

function renderContestants() {
  if (!expectVoteGrid) return;

  if (!contestantsCache.length) {
    expectVoteGrid.innerHTML = `<p class="message">目前尚無已公開的神秘歌手。</p>`;
    return;
  }

  expectVoteGrid.innerHTML = contestantsCache
    .map((contestant, index) => {
      const number = String(index + 1).padStart(2, "0");
      const stageName = contestant.stageName
        ? `A.K.A. ${escapeHtml(contestant.stageName)}`
        : "A.K.A. 神秘登場";

      const avatar = getMysteryAvatar(contestant, index);
      const isSelected = selectedContestantIds.has(contestant.id);

      return `
        <article class="contestant-card mystery-contestant-card expect-vote-card ${isSelected ? "selected" : ""}">
          <button
            type="button"
            class="expect-vote-select-button"
            data-id="${escapeHtml(contestant.id)}"
            aria-pressed="${isSelected ? "true" : "false"}"
          >
            <div class="mystery-avatar ${avatar.className}" aria-label="${escapeHtml(avatar.label)}">
              <div class="mystery-avatar-glow"></div>
              <div class="mystery-avatar-head"></div>
              <div class="mystery-avatar-body"></div>
              <div class="mystery-avatar-badge">${escapeHtml(avatar.icon)}</div>
            </div>

            <div class="contestant-body">
              <div class="contestant-meta-row">
                <span class="contestant-number">No. ${number}</span>
                <span class="contestant-status">${isSelected ? "已選擇" : "匿名公開中"}</span>
              </div>

              <h3 class="contestant-name">???</h3>
              <p class="contestant-stage">${stageName}</p>

              <p class="contestant-teaser">
                ${isSelected ? "已加入本次票選名單。" : "點選卡片，加入你 / 妳的最期待名單。"}
              </p>

              <span class="vote-card-check">${isSelected ? "已選擇" : "選擇這位歌手"}</span>
            </div>
          </button>
        </article>
      `;
    })
    .join("");

  document.querySelectorAll(".expect-vote-select-button").forEach((button) => {
    button.addEventListener("click", () => {
      toggleContestantSelection(button.dataset.id);
    });
  });

  updateSelectedUI();
}

function toggleContestantSelection(contestantId) {
  if (!contestantId) return;

  voteMessage.textContent = "";

  const voteStatus = getVoteStatus();

  if (!voteStatus.canVote) {
    voteMessage.textContent = voteStatus.message;
    return;
  }

  if (selectedContestantIds.has(contestantId)) {
    selectedContestantIds.delete(contestantId);
    renderContestants();
    return;
  }

  if (selectedContestantIds.size >= MAX_EXPECT_VOTES) {
    voteMessage.textContent = `每人最多 ${MAX_EXPECT_VOTES} 票，且不可重複投給同一位歌手。`;
    return;
  }

  selectedContestantIds.add(contestantId);
  renderContestants();
}

async function loadEmployeeProfile(employeeId) {
  try {
    const employeeRef = doc(db, "employees", employeeId);
    const employeeSnap = await getDoc(employeeRef);

    if (!employeeSnap.exists()) {
      return {
        ok: false,
        reason: "not-found"
      };
    }

    return {
      ok: true,
      profile: {
        id: employeeSnap.id,
        ...employeeSnap.data()
      }
    };
  } catch (error) {
    console.error("Load employee profile failed:", error);

    return {
      ok: false,
      reason: "permission",
      error
    };
  }
}

function renderEmployeeInfo(employeeProfile) {
  if (!employeeInfoBox) return;

  employeeNameText.textContent = employeeProfile.name || "—";
  employeeDepartmentText.textContent = employeeProfile.department || "—";
  employeeCompanyText.textContent = employeeProfile.company || "—";

  employeeInfoBox.classList.remove("hidden");
}

function clearEmployeeInfo() {
  currentEmployeeProfile = null;

  if (!employeeInfoBox) return;

  employeeNameText.textContent = "—";
  employeeDepartmentText.textContent = "—";
  employeeCompanyText.textContent = "—";

  employeeInfoBox.classList.add("hidden");
}

async function loadEmployeeVoteSummary(employeeId) {
  try {
    const summaryRef = doc(db, "expectVoteSummary", employeeId);
    const summarySnap = await getDoc(summaryRef);

    if (!summarySnap.exists()) {
      usedVotesText.textContent = `0 / ${MAX_EXPECT_VOTES}`;
      return;
    }

    const data = summarySnap.data();
    const usedVotes = Number(data.usedVotes || 0);
    const votedIds = Array.isArray(data.votedContestantIds) ? data.votedContestantIds : [];

    usedVotesText.textContent = `${usedVotes} / ${MAX_EXPECT_VOTES}`;

    selectedContestantIds.forEach((id) => {
      if (votedIds.includes(id)) {
        selectedContestantIds.delete(id);
      }
    });

    updateSelectedUI();
    renderContestants();
  } catch (error) {
    console.error("Load employee vote summary failed:", error);
    usedVotesText.textContent = "查詢失敗";
  }
}

async function submitExpectVotes() {
  try {
    voteMessage.textContent = "";

    const voteStatus = getVoteStatus();

    if (!voteStatus.canVote) {
      voteMessage.textContent = voteStatus.message;
      return;
    }

    const employeeId = normalizeEmployeeId(employeeIdInput.value);

    if (!employeeId) {
      voteMessage.textContent = "請先輸入工號。";
      return;
    }

    if (!isValidEmployeeId(employeeId)) {
      voteMessage.textContent = "工號格式不正確，請確認後再送出。";
      return;
    }

    try {
      await waitForAuthReady();
    } catch (error) {
      voteMessage.textContent = "投票身份初始化失敗，請重新整理頁面再試。";
      return;
    }

    if (!currentEmployeeProfile || currentEmployeeProfile.employeeId !== employeeId) {
      const employeeResult = await loadEmployeeProfile(employeeId);

      if (!employeeResult.ok) {
        if (employeeResult.reason === "permission") {
          voteMessage.textContent = "員工資料讀取權限不足，請重新整理後再試。";
        } else {
          voteMessage.textContent = "查無此工號，請確認後再送出。";
        }

        return;
      }

      const employeeProfile = employeeResult.profile;

      if (employeeProfile.isActive === false) {
        voteMessage.textContent = "此工號目前未啟用，無法投票。";
        return;
      }

      currentEmployeeProfile = employeeProfile;
      renderEmployeeInfo(employeeProfile);
    }

    if (!currentAuthUser) {
      voteMessage.textContent = "投票身份尚未初始化完成，請稍後再試。";
      return;
    }

    const selectedIds = [...selectedContestantIds];

    if (!selectedIds.length) {
      voteMessage.textContent = "請至少選擇 1 位歌手。";
      return;
    }

    if (selectedIds.length > MAX_EXPECT_VOTES) {
      voteMessage.textContent = `每人最多 ${MAX_EXPECT_VOTES} 票。`;
      return;
    }

    submitVoteButton.disabled = true;
    submitVoteButton.textContent = "送出中...";

await runTransaction(db, async (transaction) => {
  const summaryRef = doc(db, "expectVoteSummary", employeeId);
  const summarySnap = await transaction.get(summaryRef);

  const summaryData = summarySnap.exists() ? summarySnap.data() : {};
  const currentUsedVotes = Number(summaryData.usedVotes || 0);
  const currentVotedIds = Array.isArray(summaryData.votedContestantIds)
    ? summaryData.votedContestantIds
    : [];

  if (currentUsedVotes >= MAX_EXPECT_VOTES) {
    throw new Error("VOTE_LIMIT_REACHED");
  }

  if (currentUsedVotes + selectedIds.length > MAX_EXPECT_VOTES) {
    throw new Error("VOTE_LIMIT_EXCEEDED");
  }

  const duplicatedIds = selectedIds.filter((id) => currentVotedIds.includes(id));
  if (duplicatedIds.length > 0) {
    throw new Error("DUPLICATED_CONTESTANT");
  }

  const voteTargets = [];

  // 重要：transaction 內要先完成所有 reads
  for (const contestantId of selectedIds) {
    const contestantRef = doc(db, "contestants", contestantId);
    const logRef = doc(db, "expectVoteLogs", `${employeeId}_${contestantId}`);

    const contestantSnap = await transaction.get(contestantRef);
    const logSnap = await transaction.get(logRef);

    voteTargets.push({
      contestantId,
      contestantRef,
      logRef,
      contestantSnap,
      logSnap
    });
  }

  // 所有 reads 完成後，才開始檢查與寫入
  for (const target of voteTargets) {
    if (!target.contestantSnap.exists()) {
      throw new Error("CONTESTANT_NOT_FOUND");
    }

    const contestantData = target.contestantSnap.data();

    if (contestantData.publishStatus !== true) {
      throw new Error("CONTESTANT_NOT_PUBLIC");
    }

    if (target.logSnap.exists()) {
      throw new Error("DUPLICATED_CONTESTANT");
    }
  }

  // 寫入 logs 與更新選手票數
  for (const target of voteTargets) {
    transaction.set(target.logRef, {
      employeeId,
      employeeName: currentEmployeeProfile.name || "",
      employeeDepartment: currentEmployeeProfile.department || "",
      employeeCompany: currentEmployeeProfile.company || "",
      contestantId: target.contestantId,
      createdAt: serverTimestamp()
    });

    transaction.update(target.contestantRef, {
      expectVoteCount: increment(1)
    });
  }

  const nextVotedIds = [...currentVotedIds, ...selectedIds];
  const nextUsedVotes = currentUsedVotes + selectedIds.length;

  transaction.set(
    summaryRef,
    {
      employeeId,
      employeeName: currentEmployeeProfile.name || "",
      employeeDepartment: currentEmployeeProfile.department || "",
      employeeCompany: currentEmployeeProfile.company || "",
      usedVotes: nextUsedVotes,
      votedContestantIds: nextVotedIds,
      updatedAt: serverTimestamp(),
      createdAt: summaryData.createdAt || serverTimestamp()
    },
    { merge: true }
  );
});

    voteMessage.textContent = "投票成功！感謝你 / 妳的最期待應援。";
    selectedContestantIds.clear();
    updateSelectedUI();

    await loadEmployeeVoteSummary(employeeId);
    renderContestants();
  } catch (error) {
    console.error("Submit expect votes failed:", error);
    voteMessage.textContent = getFriendlyVoteError(error);
  } finally {
    submitVoteButton.disabled = !getVoteStatus().canVote;
    submitVoteButton.textContent = "送出最期待票選";
  }
}

function getVoteStatus() {
  const now = new Date();

  if (now >= EXPECT_VOTE_AUTO_CLOSE_TIME) {
    return {
      canVote: false,
      message: "最期待歌手票選已結束，感謝大家參與。"
    };
  }

  if (expectVoteSettingsCache.isOpen !== true) {
    return {
      canVote: false,
      message: expectVoteSettingsCache.message || "最期待歌手票選目前未開放。"
    };
  }

  return {
    canVote: true,
    message: expectVoteSettingsCache.message || "最期待歌手票選開放中。"
  };
}

function getFriendlyVoteError(error) {
  const message = error?.message || "";

  if (message.includes("VOTE_LIMIT_REACHED")) {
    return "此工號已用完 3 票，無法再次投票。";
  }

  if (message.includes("VOTE_LIMIT_EXCEEDED")) {
    return "本次選擇票數超過剩餘可用票數，請重新選擇。";
  }

  if (message.includes("DUPLICATED_CONTESTANT")) {
    return "此工號已投過其中一位歌手，不能重複投給同一位。";
  }

  if (message.includes("CONTESTANT_NOT_FOUND")) {
    return "其中一位歌手資料不存在，請重新整理後再試。";
  }

  if (message.includes("CONTESTANT_NOT_PUBLIC")) {
    return "其中一位歌手目前未開放票選。";
  }

  if (message.includes("permission")) {
    return "目前沒有投票寫入權限，請確認 Firestore Rules。";
  }

  return "投票失敗，請稍後再試。";
}

function updateSelectedUI() {
  if (selectedCountText) {
    selectedCountText.textContent = `${selectedContestantIds.size} / ${MAX_EXPECT_VOTES}`;
  }
}

function getMysteryAvatar(contestant, index) {
  const selectedKey = contestant.mysteryAvatar || contestant.avatarKey || "";

  const matchedAvatar = MYSTERY_AVATARS.find((avatar) => avatar.key === selectedKey);
  if (matchedAvatar) return matchedAvatar;

  return MYSTERY_AVATARS[index % MYSTERY_AVATARS.length];
}

function normalizeEmployeeId(value) {
  return String(value || "").trim();
}

function isValidEmployeeId(employeeId) {
  return /^[A-Za-z0-9_-]{3,20}$/.test(employeeId);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function debounce(callback, delay = 300) {
  let timer = null;

  return (...args) => {
    window.clearTimeout(timer);

    timer = window.setTimeout(() => {
      callback(...args);
    }, delay);
  };
}