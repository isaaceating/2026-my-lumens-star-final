import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

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

let currentUser = null;

let resultControl = {
  mode: "preVotingStandby",
  countdownEndAt: null,
  countdownRemainingSeconds: 0,
  countdownStatus: "stopped",
  expectedRedCarpetVoters: 80,
  expectedFinalAudienceVoters: 80,
  showLiveStats: true,
  displayMessage: "請準備手機，等待主持人開放投票。"
};

let contestantsCache = [];
let redCarpetVotesCache = [];
let finalAudienceLogsCache = [];
let finalAudienceSummaryCache = [];

let countdownTimer = null;
let hasStartedSnapshots = false;

// DOM
const resultsLoginScreen = document.getElementById("resultsLoginScreen");
const resultsDisplayScreen = document.getElementById("resultsDisplayScreen");
const resultsLoginButton = document.getElementById("resultsLoginButton");
const resultsLoginMessage = document.getElementById("resultsLoginMessage");
const resultsMainTitle = document.getElementById("resultsMainTitle");
const resultsStatusBadge = document.getElementById("resultsStatusBadge");

const preVotingStandbyScreen = document.getElementById("preVotingStandbyScreen");
const liveVotingScreen = document.getElementById("liveVotingScreen");
const beforeRevealStandbyScreen = document.getElementById("beforeRevealStandbyScreen");
const intermissionScreen = document.getElementById("intermissionScreen");
const awardRevealScreen = document.getElementById("awardRevealScreen");

const preVotingMessageText = document.getElementById("preVotingMessageText");
const beforeRevealMessageText = document.getElementById("beforeRevealMessageText");
const intermissionMessageText = document.getElementById("intermissionMessageText");

const voteQrImage = document.getElementById("voteQrImage");
const voteUrlText = document.getElementById("voteUrlText");

const countdownKicker = document.getElementById("countdownKicker");
const countdownTitle = document.getElementById("countdownTitle");
const countdownText = document.getElementById("countdownText");
const countdownHintText = document.getElementById("countdownHintText");

const liveStatsGrid = document.getElementById("liveStatsGrid");
const liveProgressPanel = document.getElementById("liveProgressPanel");

const liveRedCarpetTotalVotes = document.getElementById("liveRedCarpetTotalVotes");
const liveFinalAudienceTotalVotes = document.getElementById("liveFinalAudienceTotalVotes");
const liveFinalCompletedEmployees = document.getElementById("liveFinalCompletedEmployees");
const liveFinalTopVotes = document.getElementById("liveFinalTopVotes");
const liveUpdatedAtText = document.getElementById("liveUpdatedAtText");

const redCarpetLiveBar = document.getElementById("redCarpetLiveBar");
const finalAudienceLiveBar = document.getElementById("finalAudienceLiveBar");

const awardRevealKicker = document.getElementById("awardRevealKicker");
const awardRevealTitle = document.getElementById("awardRevealTitle");
const awardRevealContent = document.getElementById("awardRevealContent");

init();

function init() {
  setupVoteUrl();
  bindEvents();
  setupAuth();
}

function bindEvents() {
  resultsLoginButton?.addEventListener("click", async () => {
    try {
      setLoginMessage("Google 登入中...");
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Results login failed:", error);
      setLoginMessage(`登入失敗：${error.message}`);
    }
  });
}

function setupAuth() {
  onAuthStateChanged(auth, async (user) => {
    currentUser = user;

    if (!user) {
      showLoginScreen("請使用 Admin Google 帳號登入後再投影。");
      return;
    }

    const adminResult = await checkAdmin(user.uid);

    if (!adminResult) {
      showLoginScreen("此帳號沒有 Admin 權限，無法讀取決賽即時資料。");
      return;
    }

    showDisplayScreen();

    if (!hasStartedSnapshots) {
      hasStartedSnapshots = true;
      startSnapshots();
    }
  });
}

async function checkAdmin(uid) {
  try {
    const adminRef = doc(db, "admins", uid);
    const adminSnap = await getDoc(adminRef);

    return adminSnap.exists() && adminSnap.data().role === "admin";
  } catch (error) {
    console.error("Check results admin failed:", error);
    setLoginMessage(`管理員驗證失敗：${error.message}`);
    return false;
  }
}

function showLoginScreen(message) {
  resultsLoginScreen?.classList.remove("hidden");
  resultsDisplayScreen?.classList.add("hidden");
  setLoginMessage(message);
}

function showDisplayScreen() {
  resultsLoginScreen?.classList.add("hidden");
  resultsDisplayScreen?.classList.remove("hidden");
}

function startSnapshots() {
  onSnapshot(doc(db, "settings", "finalResultControl"), (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data();

      resultControl = {
        mode: data.mode || "preVotingStandby",
        countdownEndAt: data.countdownEndAt || null,
        countdownRemainingSeconds: Number(data.countdownRemainingSeconds || 0),
        countdownStatus: data.countdownStatus || "stopped",
        expectedRedCarpetVoters: Number(data.expectedRedCarpetVoters || data.expectedVoters || 80),
        expectedFinalAudienceVoters: Number(data.expectedFinalAudienceVoters || data.expectedVoters || 80),
        showLiveStats: data.showLiveStats !== false,
        displayMessage: data.displayMessage || "請掃描 QR Code 完成紅毯投票與決賽觀眾投票",
        awardName: data.awardName || "",
        contestantId: data.contestantId || ""
      };
    }

    renderMode();
    startCountdownTimer();
  }, (error) => {
    console.error("Listen final result control failed:", error);
  });

  onSnapshot(collection(db, "contestants"), (snapshot) => {
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

    renderLiveStats();
    renderMode();
  }, (error) => {
    console.error("Listen contestants failed:", error);
  });

  onSnapshot(collection(db, "redCarpetVotes"), (snapshot) => {
    redCarpetVotesCache = [];

    snapshot.forEach((docSnap) => {
      redCarpetVotesCache.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    renderLiveStats();
  }, (error) => {
    console.error("Listen red carpet votes failed:", error);
  });

  onSnapshot(collection(db, "finalAudienceVoteLogs"), (snapshot) => {
    finalAudienceLogsCache = [];

    snapshot.forEach((docSnap) => {
      finalAudienceLogsCache.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    renderLiveStats();
  }, (error) => {
    console.error("Listen final audience logs failed:", error);
  });

  onSnapshot(collection(db, "finalAudienceVoteSummary"), (snapshot) => {
    finalAudienceSummaryCache = [];

    snapshot.forEach((docSnap) => {
      finalAudienceSummaryCache.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    renderLiveStats();
  }, (error) => {
    console.error("Listen final audience summary failed:", error);
  });
}

function renderMode() {
  const mode = resultControl.mode || "preVotingStandby";

  hideAllModeScreens();
  updateStatusBadge(mode);

  if (mode === "preVotingStandby") {
    if (resultsMainTitle) {
      resultsMainTitle.textContent = "決賽投票即將開始";
    }

    if (preVotingMessageText) {
      preVotingMessageText.textContent =
        resultControl.displayMessage || "請準備手機，等待主持人開放投票。";
    }

    preVotingStandbyScreen?.classList.remove("hidden");
    return;
  }

  if (mode === "liveVoting" || mode === "votingPaused") {
    if (resultsMainTitle) {
      resultsMainTitle.textContent = mode === "votingPaused"
        ? "投票倒數暫停"
        : "決賽投票進行中";
    }

    liveVotingScreen?.classList.remove("hidden");
    renderLiveStats();
    updateCountdown();
    return;
  }

  if (mode === "beforeRevealStandby" || mode === "standby") {
    if (resultsMainTitle) {
      resultsMainTitle.textContent = "成績公布即將開始";
    }

    if (beforeRevealMessageText) {
      beforeRevealMessageText.textContent =
        resultControl.displayMessage || "請稍候，頒獎結果即將揭曉。";
    }

    beforeRevealStandbyScreen?.classList.remove("hidden");
    return;
  }

  if (mode === "intermission") {
    if (resultsMainTitle) {
      resultsMainTitle.textContent = "中場休息";
    }

    if (intermissionMessageText) {
      intermissionMessageText.textContent =
        resultControl.displayMessage || "請稍候，精彩節目即將繼續。";
    }

    intermissionScreen?.classList.remove("hidden");
    return;
  }

  if (resultsMainTitle) {
    resultsMainTitle.textContent = "決賽獎項公布";
  }

  awardRevealScreen?.classList.remove("hidden");
  renderAwardPlaceholder(mode);
}

function hideAllModeScreens() {
  [
    preVotingStandbyScreen,
    liveVotingScreen,
    beforeRevealStandbyScreen,
    intermissionScreen,
    awardRevealScreen
  ].forEach((screen) => {
    screen?.classList.add("hidden");
  });
}

function updateStatusBadge(mode) {
  if (!resultsStatusBadge) return;

  const isLive = mode === "liveVoting";
  const isPaused = mode === "votingPaused";

  resultsStatusBadge.classList.toggle("paused", isPaused);
  resultsStatusBadge.classList.toggle("standby", !isLive && !isPaused);

  resultsStatusBadge.innerHTML = `
    <span></span>
    ${isLive ? "LIVE" : isPaused ? "PAUSED" : "STANDBY"}
  `;
}

function renderAwardPlaceholder(mode) {
  const modeMap = {
    redCarpetWinner: "紅毯巨星造型獎",
    thirdPlace: "第三名",
    secondPlace: "第二名",
    firstPlace: "第一名",
    starScoutDrawing: "最強星探獎抽獎",
    starScoutWinners: "最強星探獎",
    allWinners: "得獎名單總覽"
  };

  const awardName = resultControl.awardName || modeMap[mode] || "獎項公布";

  if (awardRevealKicker) {
    awardRevealKicker.textContent = "Award Reveal";
  }

  if (awardRevealTitle) {
    awardRevealTitle.textContent = awardName;
  }

  if (awardRevealContent) {
    awardRevealContent.textContent = "即將揭曉";
  }
}

function renderLiveStats() {
  const finalVoteCountMap = getVoteCountMap(finalAudienceLogsCache);
  const topFinalVotes = finalVoteCountMap.size
    ? Math.max(...Array.from(finalVoteCountMap.values()))
    : 0;

  const completedEmployees = finalAudienceSummaryCache.filter((item) => {
    return Number(item.usedVotes || 0) >= 3;
  }).length;

  const expectedRedCarpetVotes = Math.max(
    1,
    Number(resultControl.expectedRedCarpetVoters || resultControl.expectedVoters || 80)
  );

  const expectedFinalAudienceVotes = Math.max(
    1,
    Number(resultControl.expectedFinalAudienceVoters || resultControl.expectedVoters || 80)
  );

  const showLiveStats = resultControl.showLiveStats !== false;

  if (liveStatsGrid) {
    liveStatsGrid.classList.toggle("hidden", !showLiveStats);
  }

  if (liveProgressPanel) {
    liveProgressPanel.classList.toggle("hidden", !showLiveStats);
  }

  // 上方四個統計卡片
  animateNumber(liveRedCarpetTotalVotes, redCarpetVotesCache.length);
  animateNumber(liveFinalAudienceTotalVotes, finalAudienceLogsCache.length);
  animateNumber(liveFinalCompletedEmployees, completedEmployees);
  animateNumber(liveFinalTopVotes, topFinalVotes);

  // 長條改成「兩個都看票數」
  const redCarpetPercent = (redCarpetVotesCache.length / expectedRedCarpetVotes) * 100;
  const finalAudiencePercent = (finalAudienceLogsCache.length / expectedFinalAudienceVotes) * 100;

  if (redCarpetLiveBar) {
    redCarpetLiveBar.style.width = `${Math.min(redCarpetPercent, 100)}%`;
  }

  if (finalAudienceLiveBar) {
    finalAudienceLiveBar.style.width = `${Math.min(finalAudiencePercent, 100)}%`;
  }

  if (liveUpdatedAtText) {
    liveUpdatedAtText.textContent = `即時更新：${new Date().toLocaleTimeString("zh-TW", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    })}`;
  }
}

function startCountdownTimer() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
  }

  updateCountdown();

  countdownTimer = setInterval(() => {
    updateCountdown();
  }, 1000);
}

function updateCountdown() {
  const mode = resultControl.mode || "preVotingStandby";
  const countdownStatus = resultControl.countdownStatus || "stopped";

  if (mode === "votingPaused" || countdownStatus === "paused") {
    const remainingSeconds = Math.max(0, Number(resultControl.countdownRemainingSeconds || 0));

    if (countdownKicker) {
      countdownKicker.textContent = "Paused";
    }

    if (countdownTitle) {
      countdownTitle.textContent = "投票倒數暫停";
    }

    if (countdownText) {
      countdownText.textContent = formatSeconds(remainingSeconds);
    }

    if (countdownHintText) {
      countdownHintText.textContent = "投票倒數暫停中，請等待主持人指示";
    }

    return;
  }

  const endDate = getCountdownEndDate();

  if (!endDate) {
    if (countdownKicker) {
      countdownKicker.textContent = "Countdown";
    }

    if (countdownTitle) {
      countdownTitle.textContent = "投票倒數";
    }

    if (countdownText) {
      countdownText.textContent = "--:--";
    }

    if (countdownHintText) {
      countdownHintText.textContent = "請由後台開始投票倒數";
    }

    return;
  }

  const remainingMs = endDate.getTime() - Date.now();

  if (remainingMs <= 0) {
    if (countdownKicker) {
      countdownKicker.textContent = "Time Up";
    }

    if (countdownTitle) {
      countdownTitle.textContent = "投票時間結束";
    }

    if (countdownText) {
      countdownText.textContent = "00:00";
    }

    if (countdownHintText) {
      countdownHintText.textContent = "投票時間結束，請等待主持人公布結果";
    }

    return;
  }

  const totalSeconds = Math.ceil(remainingMs / 1000);

  if (countdownKicker) {
    countdownKicker.textContent = "Countdown";
  }

  if (countdownTitle) {
    countdownTitle.textContent = "投票倒數";
  }

  if (countdownText) {
    countdownText.textContent = formatSeconds(totalSeconds);
  }

  if (countdownHintText) {
    countdownHintText.textContent =
      resultControl.displayMessage || "請把握時間完成紅毯投票與決賽觀眾投票";
  }
}

function getCountdownEndDate() {
  const value = resultControl.countdownEndAt;

  if (!value) return null;

  if (typeof value.toDate === "function") {
    return value.toDate();
  }

  if (value.seconds) {
    return new Date(value.seconds * 1000);
  }

  return null;
}

function setupVoteUrl() {
  const voteUrl = new URL("final-vote.html", window.location.href).href;

  if (voteUrlText) {
    voteUrlText.textContent = voteUrl;
  }

  if (voteQrImage) {
    voteQrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=16&data=${encodeURIComponent(voteUrl)}`;
  }
}

function getVoteCountMap(votes) {
  const map = new Map();

  votes.forEach((vote) => {
    if (!vote.contestantId) return;

    const currentCount = map.get(vote.contestantId) || 0;
    map.set(vote.contestantId, currentCount + 1);
  });

  return map;
}

function animateNumber(element, nextValue) {
  if (!element) return;

  const currentValue = Number(element.dataset.currentValue || element.textContent || 0);
  const targetValue = Number(nextValue || 0);

  element.dataset.currentValue = String(targetValue);

  if (currentValue === targetValue) {
    element.textContent = String(targetValue);
    return;
  }

  element.classList.remove("number-pop");
  void element.offsetWidth;
  element.classList.add("number-pop");
  element.textContent = String(targetValue);
}

function formatSeconds(totalSeconds) {
  const safeSeconds = Math.max(0, Number(totalSeconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function setLoginMessage(message) {
  if (resultsLoginMessage) {
    resultsLoginMessage.textContent = message;
  }
}

console.log("Final results page loaded.");