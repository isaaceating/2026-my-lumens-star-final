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
  deleteDoc,
  writeBatch,
  serverTimestamp,
  Timestamp
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

let currentUser = null;
let isCurrentUserAdmin = false;
let contestantsCache = [];
let redCarpetVotesCache = [];
let finalAudienceLogsCache = [];
let finalAudienceSummaryCache = [];
let finalJudgesCache = [];
let judgeScoresCache = new Map();
let resetVoteCache = null;
let isRedCarpetToggleBusy = false;
let isFinalAudienceToggleBusy = false;
let redCarpetVoteSettingsCache = { exists: false, isOpen: false, message: "" };
let finalAudienceVoteSettingsCache = { exists: false, isOpen: false, message: "" };

const $ = (id) => document.getElementById(id);

const finalAdminLoginButton = $("finalAdminLoginButton");
const finalAdminLogoutButton = $("finalAdminLogoutButton");
const finalAdminUserStatus = $("finalAdminUserStatus");
const finalAdminAccessStatus = $("finalAdminAccessStatus");
const finalAdminContent = $("finalAdminContent");
const refreshFinalAdminDataButton = $("refreshFinalAdminDataButton");

const overviewRedCarpetTotalVotes = $("overviewRedCarpetTotalVotes");
const overviewFinalAudienceTotalVotes = $("overviewFinalAudienceTotalVotes");
const overviewFinalCompletedEmployees = $("overviewFinalCompletedEmployees");
const overviewFinalTopVotes = $("overviewFinalTopVotes");

const redCarpetVoteControlStatus = $("redCarpetVoteControlStatus");
const redCarpetVoteControlMessage = $("redCarpetVoteControlMessage");
const toggleRedCarpetVoteButton = $("toggleRedCarpetVoteButton");
const finalAudienceVoteControlStatus = $("finalAudienceVoteControlStatus");
const finalAudienceVoteControlMessage = $("finalAudienceVoteControlMessage");
const toggleFinalAudienceVoteButton = $("toggleFinalAudienceVoteButton");

const resultCountdownMinutesInput = $("resultCountdownMinutesInput");
const resultExpectedRedCarpetVotersInput = $("resultExpectedRedCarpetVotersInput");
const resultExpectedFinalAudienceVotersInput = $("resultExpectedFinalAudienceVotersInput");
const resultShowLiveStatsCheckbox = $("resultShowLiveStatsCheckbox");
const resultDisplayMessageInput = $("resultDisplayMessageInput");
const setPreVotingStandbyButton = $("setPreVotingStandbyButton");
const startLiveVotingDisplayButton = $("startLiveVotingDisplayButton");
const pauseVotingCountdownButton = $("pauseVotingCountdownButton");
const resumeVotingCountdownButton = $("resumeVotingCountdownButton");
const resetVotingCountdownButton = $("resetVotingCountdownButton");
const setBeforeRevealStandbyButton = $("setBeforeRevealStandbyButton");
const setIntermissionButton = $("setIntermissionButton");
const previewRedCarpetWinnerButton = $("previewRedCarpetWinnerButton");
const previewThirdPlaceButton = $("previewThirdPlaceButton");
const previewSecondPlaceButton = $("previewSecondPlaceButton");
const previewFirstPlaceButton = $("previewFirstPlaceButton");
const drawStarScoutButton = $("drawStarScoutButton");
const showAllWinnersButton = $("showAllWinnersButton");
const resultDisplayControlMessage = $("resultDisplayControlMessage");

const refreshRedCarpetRankingButton = $("refreshRedCarpetRankingButton");
const refreshFinalAudienceRankingButton = $("refreshFinalAudienceRankingButton");
const redCarpetRankingTable = $("redCarpetRankingTable");
const finalAudienceRankingTable = $("finalAudienceRankingTable");

const judgeListEditor = $("judgeListEditor");
const addJudgeButton = $("addJudgeButton");
const saveJudgesButton = $("saveJudgesButton");
const judgeSettingsMessage = $("judgeSettingsMessage");
const refreshJudgeScoresButton = $("refreshJudgeScoresButton");
const saveAllJudgeScoresButton = $("saveAllJudgeScoresButton");
const judgeScoreTableHead = $("judgeScoreTableHead");
const judgeScoreTableBody = $("judgeScoreTableBody");
const judgeScoreMessage = $("judgeScoreMessage");
const refreshFinalScoreboardButton = $("refreshFinalScoreboardButton");
const finalScoreRankingTable = $("finalScoreRankingTable");

const redCarpetDetailTable = $("redCarpetDetailTable");
const finalAudienceDetailTable = $("finalAudienceDetailTable");
const resetEmployeeIdInput = $("resetEmployeeIdInput");
const lookupFinalVoteButton = $("lookupFinalVoteButton");
const resetRedCarpetVoteButton = $("resetRedCarpetVoteButton");
const resetFinalAudienceVoteButton = $("resetFinalAudienceVoteButton");
const resetVoteMessage = $("resetVoteMessage");
const resetVoteResult = $("resetVoteResult");

bindStaticEvents();

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  isCurrentUserAdmin = false;
  finalAdminContent?.classList.remove("hidden");

  if (user && user.isAnonymous) {
    setText(finalAdminUserStatus, "偵測到匿名投票身份，正在切換為管理員登入模式...");
    setText(finalAdminAccessStatus, "請使用 Google Admin 帳號登入。");
    finalAdminLoginButton?.classList.remove("hidden");
    finalAdminLogoutButton?.classList.add("hidden");
    try { await signOut(auth); } catch (error) { console.warn("Anonymous sign out failed", error); }
    renderPermissionNotice();
    return;
  }

  if (!user) {
    setText(finalAdminUserStatus, "尚未登入");
    setText(finalAdminAccessStatus, "請使用 Google Admin 帳號登入後操作決賽控制台。");
    finalAdminLoginButton?.classList.remove("hidden");
    finalAdminLogoutButton?.classList.add("hidden");
    renderPermissionNotice();
    return;
  }

  setText(finalAdminUserStatus, `已登入：${user.email || "未知帳號"}`);
  finalAdminLoginButton?.classList.add("hidden");
  finalAdminLogoutButton?.classList.remove("hidden");

  const adminResult = await checkAdmin(user.uid);
  if (!adminResult) {
    setText(finalAdminAccessStatus, "此帳號沒有管理員權限，無法操作決賽控制台。");
    renderPermissionNotice();
    return;
  }

  isCurrentUserAdmin = true;
  setText(finalAdminAccessStatus, "管理員模式已啟用，可以操作決賽控制台。");
  await loadAllFinalAdminData();
});

function bindStaticEvents() {
  finalAdminLoginButton?.addEventListener("click", async () => {
    try { await signInWithPopup(auth, provider); }
    catch (error) { alert(`登入失敗：${error.code}\n${error.message}`); }
  });

  finalAdminLogoutButton?.addEventListener("click", async () => {
    try { await signOut(auth); }
    catch (error) { alert(`登出失敗：${error.code}\n${error.message}`); }
  });

  refreshFinalAdminDataButton?.addEventListener("click", async () => { if (requireAdminPermission()) await loadAllFinalAdminData(); });
  toggleRedCarpetVoteButton?.addEventListener("click", async () => { await toggleVoteSetting("redCarpet"); });
  toggleFinalAudienceVoteButton?.addEventListener("click", async () => { await toggleVoteSetting("finalAudience"); });

  setPreVotingStandbyButton?.addEventListener("click", async () => {
    if (!requireAdminPermission()) return;
    await setResultDisplayMode({ mode: "preVotingStandby", awardName: "投票即將開始", contestantId: "", countdownStatus: "stopped" });
  });
  startLiveVotingDisplayButton?.addEventListener("click", async () => { if (requireAdminPermission()) await startLiveVotingDisplay(); });
  pauseVotingCountdownButton?.addEventListener("click", async () => { if (requireAdminPermission()) await pauseVotingCountdown(); });
  resumeVotingCountdownButton?.addEventListener("click", async () => { if (requireAdminPermission()) await resumeVotingCountdown(); });
  resetVotingCountdownButton?.addEventListener("click", async () => { if (requireAdminPermission()) await startLiveVotingDisplay({ skipConfirm: true }); });
  setBeforeRevealStandbyButton?.addEventListener("click", async () => {
    if (!requireAdminPermission()) return;
    await setResultDisplayMode({ mode: "beforeRevealStandby", awardName: "成績公布前待機畫面", contestantId: "", countdownStatus: "stopped" });
  });
  setIntermissionButton?.addEventListener("click", async () => {
    if (!requireAdminPermission()) return;
    await setResultDisplayMode({ mode: "intermission", awardName: "中場休息", contestantId: "", countdownStatus: "stopped" });
  });

  previewRedCarpetWinnerButton?.addEventListener("click", async () => { if (requireAdminPermission()) await revealRedCarpetWinner(); });
  previewThirdPlaceButton?.addEventListener("click", async () => { if (requireAdminPermission()) await revealFinalPlace("thirdPlace"); });
  previewSecondPlaceButton?.addEventListener("click", async () => { if (requireAdminPermission()) await revealFinalPlace("secondPlace"); });
  previewFirstPlaceButton?.addEventListener("click", async () => { if (requireAdminPermission()) await revealFinalPlace("firstPlace"); });
  drawStarScoutButton?.addEventListener("click", async () => { if (requireAdminPermission()) await drawStarScoutWinners(); });
  showAllWinnersButton?.addEventListener("click", async () => {
    if (!requireAdminPermission()) return;
    await setResultDisplayMode({ mode: "allWinners", awardName: "得獎名單總覽", contestantId: "", countdownStatus: "stopped" });
  });

  refreshRedCarpetRankingButton?.addEventListener("click", async () => { if (requireAdminPermission()) await loadAllFinalAdminData(); });
  refreshFinalAudienceRankingButton?.addEventListener("click", async () => { if (requireAdminPermission()) await loadAllFinalAdminData(); });
  addJudgeButton?.addEventListener("click", () => addJudgeInput());
  saveJudgesButton?.addEventListener("click", async () => { if (requireAdminPermission()) await saveFinalJudges(); });
  refreshJudgeScoresButton?.addEventListener("click", async () => { if (requireAdminPermission()) await loadAllFinalAdminData(); });
  saveAllJudgeScoresButton?.addEventListener("click", async () => { if (requireAdminPermission()) await saveAllJudgeScores(); });
  judgeScoreTableBody?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-save-judge-score]");
    if (!button || !requireAdminPermission()) return;
    await saveContestantJudgeScore(button.dataset.contestantId);
  });
  refreshFinalScoreboardButton?.addEventListener("click", async () => { if (requireAdminPermission()) await loadAllFinalAdminData(); });
  lookupFinalVoteButton?.addEventListener("click", async () => { if (requireAdminPermission()) await lookupEmployeeVoteRecord(); });
  resetEmployeeIdInput?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (requireAdminPermission()) await lookupEmployeeVoteRecord();
  });
  resetRedCarpetVoteButton?.addEventListener("click", async () => { if (requireAdminPermission()) await resetEmployeeRedCarpetVote(); });
  resetFinalAudienceVoteButton?.addEventListener("click", async () => { if (requireAdminPermission()) await resetEmployeeFinalAudienceVote(); });
}

async function checkAdmin(uid) {
  try {
    const adminSnap = await getDoc(doc(db, "admins", uid));
    return adminSnap.exists() && adminSnap.data().role === "admin";
  } catch (error) {
    console.error("Check final admin failed:", error);
    setText(finalAdminAccessStatus, "管理員驗證失敗：Firestore 目前無法連線。請確認網路、重新整理頁面，或稍後再試。");
    return false;
  }
}

function requireAdminPermission() {
  if (!currentUser) { alert("請先使用 Google 登入。"); return false; }
  if (currentUser.isAnonymous) { alert("目前是匿名投票身份，請先登出後使用 Google Admin 帳號登入。"); return false; }
  if (!isCurrentUserAdmin) { alert("此帳號沒有管理員權限。"); return false; }
  return true;
}

function renderPermissionNotice() {
  setText(overviewRedCarpetTotalVotes, "—");
  setText(overviewFinalAudienceTotalVotes, "—");
  setText(overviewFinalCompletedEmployees, "—");
  setText(overviewFinalTopVotes, "—");
  setText(redCarpetVoteControlStatus, "狀態未讀取");
  setText(redCarpetVoteControlMessage, "請使用 Admin 帳號登入，並確認 Firestore 連線正常。");
  setText(finalAudienceVoteControlStatus, "狀態未讀取");
  setText(finalAudienceVoteControlMessage, "請使用 Admin 帳號登入，並確認 Firestore 連線正常。");
  if (toggleRedCarpetVoteButton) { toggleRedCarpetVoteButton.textContent = "需 Admin 權限"; toggleRedCarpetVoteButton.disabled = true; }
  if (toggleFinalAudienceVoteButton) { toggleFinalAudienceVoteButton.textContent = "需 Admin 權限"; toggleFinalAudienceVoteButton.disabled = true; }
  fillTable(redCarpetRankingTable, 5, "請使用 Admin 帳號登入後查看紅毯票數。");
  fillTable(finalAudienceRankingTable, 6, "請使用 Admin 帳號登入後查看決賽票數。");
  fillTable(judgeScoreTableBody, 6, "請使用 Admin 帳號登入後輸入評審分數。");
  fillTable(finalScoreRankingTable, 8, "請使用 Admin 帳號登入後查看總分排名。");
  fillTable(redCarpetDetailTable, 3, "請使用 Admin 帳號登入後查看紅毯明細。");
  fillTable(finalAudienceDetailTable, 4, "請使用 Admin 帳號登入後查看決賽明細。");
}

async function loadAllFinalAdminData() {
  if (!isCurrentUserAdmin) { renderPermissionNotice(); return; }
  await Promise.all([loadContestants(), loadVoteSettings(), loadVoteData(), loadJudgeData()]);
  renderVoteControls();
  renderOverview();
  renderRedCarpetRanking();
  renderFinalAudienceRanking();
  renderJudgeListEditor();
  renderJudgeScoreTable();
  renderFinalScoreRanking();
  renderVoteDetails();
}

async function loadContestants() {
  const snapshot = await getDocs(collection(db, "contestants"));
  contestantsCache = [];
  snapshot.forEach((docSnap) => contestantsCache.push({ id: docSnap.id, ...docSnap.data() }));
  contestantsCache.sort((a, b) => {
    const orderA = typeof a.manualOrder === "number" ? a.manualOrder : 999;
    const orderB = typeof b.manualOrder === "number" ? b.manualOrder : 999;
    if (orderA !== orderB) return orderA - orderB;
    return (a.registerTime?.seconds || 0) - (b.registerTime?.seconds || 0);
  });
}

async function loadVoteSettings() {
  const [redCarpet, finalAudience] = await Promise.all([getVoteSetting("redCarpetVote"), getVoteSetting("finalAudienceVote")]);
  redCarpetVoteSettingsCache = redCarpet;
  finalAudienceVoteSettingsCache = finalAudience;
}

async function getVoteSetting(settingId) {
  const snap = await getDoc(doc(db, "settings", settingId));
  if (!snap.exists()) return { exists: false, isOpen: false, message: "" };
  const data = snap.data();
  return { exists: true, isOpen: data.isOpen === true, message: data.message || "" };
}

async function loadVoteData() {
  const [redCarpetSnapshot, finalLogsSnapshot, finalSummarySnapshot] = await Promise.all([
    getDocs(collection(db, "redCarpetVotes")),
    getDocs(collection(db, "finalAudienceVoteLogs")),
    getDocs(collection(db, "finalAudienceVoteSummary"))
  ]);
  redCarpetVotesCache = [];
  finalAudienceLogsCache = [];
  finalAudienceSummaryCache = [];
  redCarpetSnapshot.forEach((docSnap) => redCarpetVotesCache.push({ id: docSnap.id, ...docSnap.data() }));
  finalLogsSnapshot.forEach((docSnap) => finalAudienceLogsCache.push({ id: docSnap.id, ...docSnap.data() }));
  finalSummarySnapshot.forEach((docSnap) => finalAudienceSummaryCache.push({ id: docSnap.id, ...docSnap.data() }));
}

async function loadJudgeData() {
  const judgesSnap = await getDoc(doc(db, "settings", "finalJudges"));
  finalJudgesCache = judgesSnap.exists() && Array.isArray(judgesSnap.data().judges)
    ? judgesSnap.data().judges.filter((judge) => judge && judge.id && judge.name)
    : [];

  const scoreSnapshot = await getDocs(collection(db, "judgeScores"));
  judgeScoresCache = new Map();
  scoreSnapshot.forEach((docSnap) => judgeScoresCache.set(docSnap.id, { id: docSnap.id, ...docSnap.data() }));
}

function getResultControlFormValues() {
  const minutes = Number(resultCountdownMinutesInput?.value || 10);
  const expectedRedCarpetVoters = Number(resultExpectedRedCarpetVotersInput?.value || 80);
  const expectedFinalAudienceVoters = Number(resultExpectedFinalAudienceVotersInput?.value || 80);
  const showLiveStats = resultShowLiveStatsCheckbox ? resultShowLiveStatsCheckbox.checked : true;
  const displayMessage = normalizeText(resultDisplayMessageInput?.value || "請掃描 QR Code 完成紅毯投票與決賽觀眾投票");
  return {
    minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 10,
    expectedRedCarpetVoters: Number.isFinite(expectedRedCarpetVoters) && expectedRedCarpetVoters > 0 ? Math.round(expectedRedCarpetVoters) : 80,
    expectedFinalAudienceVoters: Number.isFinite(expectedFinalAudienceVoters) && expectedFinalAudienceVoters > 0 ? Math.round(expectedFinalAudienceVoters) : 80,
    showLiveStats,
    displayMessage
  };
}

async function startLiveVotingDisplay(options = {}) {
  const { minutes, expectedRedCarpetVoters, expectedFinalAudienceVoters, showLiveStats, displayMessage } = getResultControlFormValues();
  if (!options.skipConfirm) {
    const confirmed = confirm(`確定要開始 ${minutes} 分鐘投票倒數看板嗎？\n\n預估紅毯投票票數：${expectedRedCarpetVoters} 票\n預估決賽觀眾投票票數：${expectedFinalAudienceVoters} 票`);
    if (!confirmed) return;
  }
  const totalSeconds = Math.round(minutes * 60);
  const countdownEndAt = Timestamp.fromDate(new Date(Date.now() + totalSeconds * 1000));
  await setResultDisplayMode({
    mode: "liveVoting",
    awardName: "決賽投票進行中",
    contestantId: "",
    countdownEndAt,
    countdownRemainingSeconds: totalSeconds,
    countdownStatus: "running",
    expectedRedCarpetVoters,
    expectedFinalAudienceVoters,
    showLiveStats,
    displayMessage
  });
}

async function pauseVotingCountdown() {
  try {
    setText(resultDisplayControlMessage, "正在暫停投票倒數...");
    const snap = await getDoc(doc(db, "settings", "finalResultControl"));
    const data = snap.exists() ? snap.data() : {};
    const endDate = getTimestampDate(data.countdownEndAt);
    let remainingSeconds = Number(data.countdownRemainingSeconds || 0);
    if (data.countdownStatus === "running" && endDate) {
      remainingSeconds = Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / 1000));
    }
    await setResultDisplayMode({
      mode: "votingPaused",
      awardName: "投票倒數暫停",
      contestantId: "",
      countdownRemainingSeconds: remainingSeconds,
      countdownStatus: "paused",
      expectedRedCarpetVoters: Number(data.expectedRedCarpetVoters || data.expectedVoters || resultExpectedRedCarpetVotersInput?.value || 80),
      expectedFinalAudienceVoters: Number(data.expectedFinalAudienceVoters || data.expectedVoters || resultExpectedFinalAudienceVotersInput?.value || 80),
      showLiveStats: data.showLiveStats !== false,
      displayMessage: data.displayMessage || normalizeText(resultDisplayMessageInput?.value || "投票暫停中，請等待主持人指示")
    });
  } catch (error) {
    console.error("Pause voting countdown failed:", error);
    setText(resultDisplayControlMessage, `暫停倒數失敗：${error.message}`);
  }
}

async function resumeVotingCountdown() {
  try {
    setText(resultDisplayControlMessage, "正在繼續投票倒數...");
    const snap = await getDoc(doc(db, "settings", "finalResultControl"));
    const data = snap.exists() ? snap.data() : {};
    const remainingSeconds = Math.max(0, Number(data.countdownRemainingSeconds || 0));
    if (!remainingSeconds) {
      setText(resultDisplayControlMessage, "目前沒有可繼續的倒數秒數，請重新開始投票倒數。");
      return;
    }
    const countdownEndAt = Timestamp.fromDate(new Date(Date.now() + remainingSeconds * 1000));
    await setResultDisplayMode({
      mode: "liveVoting",
      awardName: "決賽投票進行中",
      contestantId: "",
      countdownEndAt,
      countdownRemainingSeconds: remainingSeconds,
      countdownStatus: "running",
      expectedRedCarpetVoters: Number(data.expectedRedCarpetVoters || data.expectedVoters || resultExpectedRedCarpetVotersInput?.value || 80),
      expectedFinalAudienceVoters: Number(data.expectedFinalAudienceVoters || data.expectedVoters || resultExpectedFinalAudienceVotersInput?.value || 80),
      showLiveStats: data.showLiveStats !== false,
      displayMessage: data.displayMessage || normalizeText(resultDisplayMessageInput?.value || "請掃描 QR Code 完成紅毯投票與決賽觀眾投票")
    });
  } catch (error) {
    console.error("Resume voting countdown failed:", error);
    setText(resultDisplayControlMessage, `繼續倒數失敗：${error.message}`);
  }
}

async function setResultDisplayMode({
  mode,
  awardName = "",
  contestantId = "",
  countdownEndAt = null,
  countdownRemainingSeconds = null,
  countdownStatus = null,
  expectedRedCarpetVoters = null,
  expectedFinalAudienceVoters = null,
  showLiveStats = null,
  displayMessage = null
}) {
  try {
    setText(resultDisplayControlMessage, "大螢幕狀態更新中...");
    const fallback = getResultControlFormValues();
    const payload = {
      mode,
      awardName,
      contestantId,
      expectedRedCarpetVoters: Number(expectedRedCarpetVoters || fallback.expectedRedCarpetVoters),
      expectedFinalAudienceVoters: Number(expectedFinalAudienceVoters || fallback.expectedFinalAudienceVoters),
      showLiveStats: typeof showLiveStats === "boolean" ? showLiveStats : fallback.showLiveStats,
      displayMessage: displayMessage || fallback.displayMessage,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser.email || "",
      updatedByUid: currentUser.uid
    };
    if (countdownEndAt) payload.countdownEndAt = countdownEndAt;
    if (countdownRemainingSeconds !== null) payload.countdownRemainingSeconds = Number(countdownRemainingSeconds || 0);
    if (countdownStatus) payload.countdownStatus = countdownStatus;
    await setDoc(doc(db, "settings", "finalResultControl"), payload, { merge: true });
    setText(resultDisplayControlMessage, "大螢幕狀態已更新。");
  } catch (error) {
    console.error("Set result display mode failed:", error);
    setText(resultDisplayControlMessage, `大螢幕狀態更新失敗：${error.message}`);
  }
}

function getTimestampDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value.seconds) return new Date(value.seconds * 1000);
  return null;
}

async function revealRedCarpetWinner() {
  await loadAllFinalAdminData();
  const winner = getRedCarpetWinner();
  if (!winner) { alert("目前沒有紅毯投票資料，無法公布紅毯巨星造型獎。"); return; }
  const confirmed = confirm(`確定要公布紅毯巨星造型獎嗎？\n\n得獎者：${winner.name || "未知選手"} / A.K.A. ${winner.stageName || "—"}\n票數：${winner.voteCount} 票`);
  if (!confirmed) return;
  await setResultDisplayMode({ mode: "redCarpetWinner", awardName: "紅毯巨星造型獎", contestantId: winner.id, countdownStatus: "stopped" });
}

async function revealFinalPlace(mode) {
  await loadAllFinalAdminData();
  const placeConfig = getPlaceConfig(mode);
  const rows = getFinalScoreRows();
  const winner = rows[placeConfig.index];
  if (!winner) { alert(`目前沒有足夠資料公布${placeConfig.awardName}。`); return; }
  const confirmed = confirm(`確定要公布${placeConfig.awardName}嗎？\n\n得獎者：${winner.name || "未知選手"} / A.K.A. ${winner.stageName || "—"}\n總分：${winner.totalScore.toFixed(1)}`);
  if (!confirmed) return;
  await setResultDisplayMode({ mode, awardName: placeConfig.awardName, contestantId: winner.id, countdownStatus: "stopped" });
}

async function drawStarScoutWinners() {
  await loadAllFinalAdminData();
  const champion = getFinalScoreRows()[0];
  if (!champion) { alert("目前沒有第一名資料，無法抽出最強星探獎。"); return; }

  const candidateMap = new Map();
  finalAudienceLogsCache.forEach((log) => {
    if (log.contestantId !== champion.id) return;
    const employeeId = normalizeEmployeeId(log.employeeId || "");
    if (!employeeId || candidateMap.has(employeeId)) return;
    candidateMap.set(employeeId, {
      employeeId,
      employeeName: log.employeeName || "",
      employeeDepartment: log.employeeDepartment || "",
      employeeCompany: log.employeeCompany || ""
    });
  });

  const candidates = Array.from(candidateMap.values());
  if (!candidates.length) {
    alert(`目前沒有任何決賽觀眾投給第一名「${champion.name || "未知選手"}」，無法抽獎。`);
    return;
  }

  const winnerCount = Math.min(7, candidates.length);
  const confirmed = confirm(`最強星探獎將從「決賽觀眾投票有投給第一名」的人中抽出。\n\n第一名：${champion.name || "未知選手"} / A.K.A. ${champion.stageName || "—"}\n符合資格人數：${candidates.length}\n將抽出：${winnerCount} 名\n\n確定要抽獎嗎？`);
  if (!confirmed) return;

  const winners = shuffleArray(candidates).slice(0, winnerCount);
  try {
    setText(resultDisplayControlMessage, "最強星探獎抽獎結果寫入中...");
    await setDoc(doc(db, "settings", "starScoutWinners"), {
      championContestantId: champion.id,
      championName: champion.name || "",
      championStageName: champion.stageName || "",
      winners,
      winnerCount: winners.length,
      prize: "NT$500",
      updatedAt: serverTimestamp(),
      updatedBy: currentUser.email || "",
      updatedByUid: currentUser.uid
    }, { merge: true });
    await setResultDisplayMode({ mode: "starScoutWinners", awardName: "最強星探獎", contestantId: champion.id, countdownStatus: "stopped" });
    setText(resultDisplayControlMessage, "最強星探獎已抽出並顯示在大螢幕。");
  } catch (error) {
    console.error("Draw star scout winners failed:", error);
    setText(resultDisplayControlMessage, `最強星探抽獎失敗：${error.message}`);
  }
}

function getPlaceConfig(mode) {
  const config = {
    firstPlace: { index: 0, awardName: "第一名", prize: "NT$6,000" },
    secondPlace: { index: 1, awardName: "第二名", prize: "NT$5,000" },
    thirdPlace: { index: 2, awardName: "第三名", prize: "NT$3,600" }
  };
  return config[mode] || config.firstPlace;
}

function renderVoteControls() {
  renderSingleVoteControl({ settings: redCarpetVoteSettingsCache, statusElement: redCarpetVoteControlStatus, messageElement: redCarpetVoteControlMessage, buttonElement: toggleRedCarpetVoteButton, isBusy: isRedCarpetToggleBusy, openText: "目前狀態：紅毯投票開放中", closedText: "目前狀態：紅毯投票已關閉", openButtonText: "關閉紅毯投票", closedButtonText: "開啟紅毯投票" });
  renderSingleVoteControl({ settings: finalAudienceVoteSettingsCache, statusElement: finalAudienceVoteControlStatus, messageElement: finalAudienceVoteControlMessage, buttonElement: toggleFinalAudienceVoteButton, isBusy: isFinalAudienceToggleBusy, openText: "目前狀態：決賽觀眾投票開放中", closedText: "目前狀態：決賽觀眾投票已關閉", openButtonText: "關閉決賽投票", closedButtonText: "開啟決賽投票" });
}

function renderSingleVoteControl({ settings, statusElement, messageElement, buttonElement, isBusy, openText, closedText, openButtonText, closedButtonText }) {
  const isOpen = settings.isOpen === true;
  setText(statusElement, isOpen ? openText : closedText);
  if (buttonElement) {
    buttonElement.disabled = isBusy;
    buttonElement.textContent = isBusy ? "更新中..." : isOpen ? openButtonText : closedButtonText;
  }
  setText(messageElement, isOpen ? "目前前台可以送出此項投票。" : "目前前台不可送出此項投票。");
}

async function toggleVoteSetting(type) {
  if (!requireAdminPermission()) return;
  const isRedCarpet = type === "redCarpet";
  if ((isRedCarpet && isRedCarpetToggleBusy) || (!isRedCarpet && isFinalAudienceToggleBusy)) return;
  const currentSettings = isRedCarpet ? redCarpetVoteSettingsCache : finalAudienceVoteSettingsCache;
  const nextStatus = !(currentSettings.isOpen === true);
  const label = isRedCarpet ? "紅毯巨星造型獎投票" : "決賽觀眾投票";
  if (!confirm(`確定要${nextStatus ? "開啟" : "關閉"}${label}嗎？`)) return;
  try {
    if (isRedCarpet) isRedCarpetToggleBusy = true; else isFinalAudienceToggleBusy = true;
    renderVoteControls();
    const settingId = isRedCarpet ? "redCarpetVote" : "finalAudienceVote";
    await setDoc(doc(db, "settings", settingId), {
      isOpen: nextStatus,
      message: nextStatus ? `${label}開放中` : `${label}目前尚未開放`,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser.email || "",
      updatedByUid: currentUser.uid
    }, { merge: true });
    await loadVoteSettings();
    renderVoteControls();
    alert(`${label}已${nextStatus ? "開啟" : "關閉"}。`);
  } catch (error) {
    alert(`更新投票狀態失敗：${error.message}`);
  } finally {
    isRedCarpetToggleBusy = false;
    isFinalAudienceToggleBusy = false;
    await loadVoteSettings();
    renderVoteControls();
  }
}

function renderOverview() {
  const finalVoteCountMap = getVoteCountMap(finalAudienceLogsCache);
  const topFinalVotes = finalVoteCountMap.size ? Math.max(...Array.from(finalVoteCountMap.values())) : 0;
  const completedEmployees = finalAudienceSummaryCache.filter((item) => Number(item.usedVotes || 0) >= 3).length;
  setText(overviewRedCarpetTotalVotes, redCarpetVotesCache.length);
  setText(overviewFinalAudienceTotalVotes, finalAudienceLogsCache.length);
  setText(overviewFinalCompletedEmployees, completedEmployees);
  setText(overviewFinalTopVotes, topFinalVotes);
}

function renderRedCarpetRanking() {
  if (!redCarpetRankingTable) return;
  const totalVotes = redCarpetVotesCache.length;
  const ranked = getRankedContestants(getVoteCountMap(redCarpetVotesCache));
  redCarpetRankingTable.innerHTML = ranked.map((contestant, index) => {
    const percent = totalVotes > 0 ? (contestant.voteCount / totalVotes) * 100 : 0;
    return `
      <tr>
        <td><span class="vote-rank-badge">${index + 1}</span></td>
        <td><strong>${escapeHtml(contestant.name || "—")}</strong><div class="admin-small-text">No. ${escapeHtml(String(contestant.manualOrder ?? "—"))}</div></td>
        <td>A.K.A. ${escapeHtml(contestant.stageName || "—")}</td>
        <td><strong class="admin-number-highlight">${contestant.voteCount}</strong></td>
        <td><div class="vote-percent-bar"><span style="width:${Math.min(percent, 100)}%;"></span></div><span class="vote-percent-text">${percent.toFixed(1)}%</span></td>
      </tr>`;
  }).join("");
}

function renderFinalAudienceRanking() {
  if (!finalAudienceRankingTable) return;
  const totalVotes = finalAudienceLogsCache.length;
  const voteCountMap = getVoteCountMap(finalAudienceLogsCache);
  const ranked = getRankedContestants(voteCountMap);
  const topVotes = voteCountMap.size ? Math.max(...Array.from(voteCountMap.values())) : 0;
  finalAudienceRankingTable.innerHTML = ranked.map((contestant, index) => {
    const percent = totalVotes > 0 ? (contestant.voteCount / totalVotes) * 100 : 0;
    const audienceScore = topVotes > 0 ? (contestant.voteCount / topVotes) * 60 : 0;
    return `
      <tr>
        <td><span class="vote-rank-badge">${index + 1}</span></td>
        <td><strong>${escapeHtml(contestant.name || "—")}</strong><div class="admin-small-text">No. ${escapeHtml(String(contestant.manualOrder ?? "—"))}</div></td>
        <td>A.K.A. ${escapeHtml(contestant.stageName || "—")}</td>
        <td><strong class="admin-number-highlight">${contestant.voteCount}</strong></td>
        <td><div class="vote-percent-bar final-percent-bar"><span style="width:${Math.min(percent, 100)}%;"></span></div><span class="vote-percent-text">${percent.toFixed(1)}%</span></td>
        <td><strong class="admin-number-highlight">${audienceScore.toFixed(1)}</strong></td>
      </tr>`;
  }).join("");
}

function renderVoteDetails() {
  renderRedCarpetDetails();
  renderFinalAudienceDetails();
}

function renderRedCarpetDetails() {
  if (!redCarpetDetailTable) return;
  if (!redCarpetVotesCache.length) { fillTable(redCarpetDetailTable, 3, "目前尚無紅毯投票資料。"); return; }
  const contestantMap = getContestantMap();
  redCarpetDetailTable.innerHTML = [...redCarpetVotesCache].sort(sortByCreatedAtDesc).map((vote) => {
    const contestant = contestantMap.get(vote.contestantId);
    return `
      <tr>
        <td>${escapeHtml(vote.employeeId || vote.id || "")}</td>
        <td>${escapeHtml(vote.employeeName || "")}</td>
        <td>${escapeHtml(contestant?.name || "未知選手")}<div class="admin-small-text">A.K.A. ${escapeHtml(contestant?.stageName || "—")}</div></td>
      </tr>`;
  }).join("");
}

function renderFinalAudienceDetails() {
  if (!finalAudienceDetailTable) return;
  if (!finalAudienceSummaryCache.length) { fillTable(finalAudienceDetailTable, 4, "目前尚無決賽觀眾投票資料。"); return; }
  const contestantMap = getContestantMap();
  finalAudienceDetailTable.innerHTML = [...finalAudienceSummaryCache].sort((a, b) => String(a.employeeId || "").localeCompare(String(b.employeeId || ""))).map((summary) => {
    const ids = Array.isArray(summary.votedContestantIds) ? summary.votedContestantIds : [];
    const names = ids.map((id) => {
      const contestant = contestantMap.get(id);
      return contestant ? `${contestant.name || "未知選手"} / A.K.A. ${contestant.stageName || "—"}` : `未知選手 (${id})`;
    }).join("<br>");
    return `
      <tr>
        <td>${escapeHtml(summary.employeeId || summary.id || "")}</td>
        <td>${escapeHtml(summary.employeeName || "")}</td>
        <td><strong class="admin-number-highlight">${Number(summary.usedVotes || 0)} / 3</strong></td>
        <td>${names || "—"}</td>
      </tr>`;
  }).join("");
}

function renderJudgeListEditor() {
  if (!judgeListEditor) return;
  if (!finalJudgesCache.length) {
    judgeListEditor.innerHTML = `<p class="message">目前尚未設定評審，請按「新增評審」。</p>`;
    return;
  }
  judgeListEditor.innerHTML = finalJudgesCache.map((judge, index) => `
    <div class="judge-editor-row" data-judge-row>
      <label>評審 ${index + 1}
        <input type="text" class="judge-name-input" data-judge-id="${escapeHtml(judge.id)}" value="${escapeHtml(judge.name)}" placeholder="請輸入評審姓名" />
      </label>
      <button type="button" class="danger-button judge-remove-button" data-remove-judge>移除</button>
    </div>`).join("");
  judgeListEditor.querySelectorAll("[data-remove-judge]").forEach((button) => button.addEventListener("click", () => button.closest("[data-judge-row]")?.remove()));
}

function addJudgeInput() {
  if (!judgeListEditor) return;
  if (judgeListEditor.querySelector(".message")) judgeListEditor.innerHTML = "";
  const judgeId = `judge_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const currentCount = judgeListEditor.querySelectorAll("[data-judge-row]").length;
  const wrapper = document.createElement("div");
  wrapper.className = "judge-editor-row";
  wrapper.setAttribute("data-judge-row", "");
  wrapper.innerHTML = `
    <label>評審 ${currentCount + 1}
      <input type="text" class="judge-name-input" data-judge-id="${judgeId}" value="" placeholder="請輸入評審姓名" />
    </label>
    <button type="button" class="danger-button judge-remove-button" data-remove-judge>移除</button>`;
  wrapper.querySelector("[data-remove-judge]").addEventListener("click", () => wrapper.remove());
  judgeListEditor.appendChild(wrapper);
}

async function saveFinalJudges() {
  const rows = Array.from(judgeListEditor?.querySelectorAll(".judge-name-input") || []);
  const judges = rows.map((input, index) => ({ id: input.dataset.judgeId || `judge_${index + 1}`, name: normalizeText(input.value) })).filter((judge) => judge.name);
  const duplicatedNames = judges.map((judge) => judge.name).filter((name, index, array) => array.indexOf(name) !== index);
  if (duplicatedNames.length) { setText(judgeSettingsMessage, "評審姓名不可重複。"); return; }
  try {
    setText(judgeSettingsMessage, "評審名單儲存中...");
    await setDoc(doc(db, "settings", "finalJudges"), { judges, updatedAt: serverTimestamp(), updatedBy: currentUser.email || "", updatedByUid: currentUser.uid }, { merge: true });
    finalJudgesCache = judges;
    setText(judgeSettingsMessage, "評審名單已儲存。");
    renderJudgeListEditor();
    renderJudgeScoreTable();
    renderFinalScoreRanking();
  } catch (error) {
    setText(judgeSettingsMessage, `評審名單儲存失敗：${error.message}`);
  }
}

function renderJudgeScoreTable() {
  if (!judgeScoreTableHead || !judgeScoreTableBody) return;
  const scoringContestants = getScoringContestants();
  if (!finalJudgesCache.length) {
    judgeScoreTableHead.innerHTML = `<tr><th>選手</th><th>A.K.A.</th><th>評審分數</th><th>平均</th><th>評審分數 / 40</th><th>操作</th></tr>`;
    fillTable(judgeScoreTableBody, 6, "請先設定評審名單。");
    return;
  }
  judgeScoreTableHead.innerHTML = `<tr><th>選手</th><th>A.K.A.</th>${finalJudgesCache.map((judge) => `<th>${escapeHtml(judge.name)}<br><span class="admin-small-text">1–10</span></th>`).join("")}<th>平均</th><th>評審分數 / 40</th><th>操作</th></tr>`;
  if (!scoringContestants.length) { fillTable(judgeScoreTableBody, finalJudgesCache.length + 5, "目前尚無公開選手。"); return; }
  judgeScoreTableBody.innerHTML = scoringContestants.map((contestant) => {
    const scoreDoc = judgeScoresCache.get(contestant.id);
    const scores = scoreDoc?.scores || {};
    const calculated = calculateJudgeScore(scores);
    const inputs = finalJudgesCache.map((judge) => `<td><input type="number" class="judge-score-input" data-contestant-id="${escapeHtml(contestant.id)}" data-judge-id="${escapeHtml(judge.id)}" min="1" max="10" step="0.1" value="${escapeHtml(scores[judge.id] ?? "")}" placeholder="-" /></td>`).join("");
    return `<tr><td><strong>${escapeHtml(contestant.name || "—")}</strong><div class="admin-small-text">No. ${escapeHtml(String(contestant.manualOrder ?? "—"))}</div></td><td>A.K.A. ${escapeHtml(contestant.stageName || "—")}</td>${inputs}<td><strong class="admin-number-highlight">${calculated.averageText}</strong></td><td><strong class="admin-number-highlight">${calculated.judgeScoreText}</strong></td><td><button type="button" class="secondary-button" data-save-judge-score data-contestant-id="${escapeHtml(contestant.id)}">儲存</button></td></tr>`;
  }).join("");
}

async function saveContestantJudgeScore(contestantId) {
  if (!contestantId) return;
  const inputs = Array.from(judgeScoreTableBody.querySelectorAll(`.judge-score-input[data-contestant-id="${CSS.escape(contestantId)}"]`));
  const scores = {};
  for (const input of inputs) {
    const rawValue = normalizeText(input.value);
    if (!rawValue) continue;
    const score = Number(rawValue);
    if (!Number.isFinite(score) || score < 1 || score > 10) {
      setText(judgeScoreMessage, "評審分數必須是 1 到 10 之間的數字，可輸入小數。");
      input.focus();
      return;
    }
    scores[input.dataset.judgeId] = score;
  }
  try {
    setText(judgeScoreMessage, "評審分數儲存中...");
    await setDoc(doc(db, "judgeScores", contestantId), { contestantId, scores, updatedAt: serverTimestamp(), updatedBy: currentUser.email || "", updatedByUid: currentUser.uid }, { merge: true });
    judgeScoresCache.set(contestantId, { id: contestantId, contestantId, scores });
    setText(judgeScoreMessage, "評審分數已儲存。");
    renderJudgeScoreTable();
    renderFinalScoreRanking();
  } catch (error) {
    setText(judgeScoreMessage, `評審分數儲存失敗：${error.message}`);
  }
}

async function saveAllJudgeScores() {
  const scoringContestants = getScoringContestants();
  for (const contestant of scoringContestants) await saveContestantJudgeScore(contestant.id);
  setText(judgeScoreMessage, "全部評審分數已儲存。");
}

function renderFinalScoreRanking() {
  if (!finalScoreRankingTable) return;
  const rows = getFinalScoreRows();
  if (!rows.length) { fillTable(finalScoreRankingTable, 8, "目前尚無公開選手。"); return; }
  finalScoreRankingTable.innerHTML = rows.map((contestant, index) => `
    <tr>
      <td><span class="vote-rank-badge">${index + 1}</span></td>
      <td><strong>${escapeHtml(contestant.name || "—")}</strong><div class="admin-small-text">No. ${escapeHtml(String(contestant.manualOrder ?? "—"))}</div></td>
      <td>A.K.A. ${escapeHtml(contestant.stageName || "—")}</td>
      <td>${contestant.judgeAverageText}</td>
      <td><strong class="admin-number-highlight">${contestant.judgeScoreText}</strong></td>
      <td><strong class="admin-number-highlight">${contestant.voteCount}</strong></td>
      <td><strong class="admin-number-highlight">${contestant.audienceScore.toFixed(1)}</strong></td>
      <td><strong class="admin-number-highlight">${contestant.totalScore.toFixed(1)}</strong></td>
    </tr>`).join("");
}

async function lookupEmployeeVoteRecord() {
  const employeeId = normalizeEmployeeId(resetEmployeeIdInput?.value || "");
  resetVoteCache = null;
  if (resetRedCarpetVoteButton) resetRedCarpetVoteButton.disabled = true;
  if (resetFinalAudienceVoteButton) resetFinalAudienceVoteButton.disabled = true;
  if (!employeeId) { setText(resetVoteMessage, "請先輸入工號。"); return; }
  try {
    setText(resetVoteMessage, "投票紀錄查詢中...");
    const [employeeSnap, redCarpetSnap, finalSummarySnap] = await Promise.all([
      getDoc(doc(db, "employees", employeeId)),
      getDoc(doc(db, "redCarpetVotes", employeeId)),
      getDoc(doc(db, "finalAudienceVoteSummary", employeeId))
    ]);
    const employeeData = employeeSnap.exists() ? { id: employeeSnap.id, ...employeeSnap.data() } : null;
    const redCarpetVote = redCarpetSnap.exists() ? { id: redCarpetSnap.id, ...redCarpetSnap.data() } : null;
    const finalSummary = finalSummarySnap.exists() ? { id: finalSummarySnap.id, ...finalSummarySnap.data() } : null;
    const finalLogs = finalAudienceLogsCache.filter((log) => log.employeeId === employeeId);
    resetVoteCache = { employeeId, employeeData, redCarpetVote, finalSummary, finalLogs };
    renderResetResult(resetVoteCache);
    if (resetRedCarpetVoteButton) resetRedCarpetVoteButton.disabled = !redCarpetVote;
    if (resetFinalAudienceVoteButton) resetFinalAudienceVoteButton.disabled = !finalSummary && !finalLogs.length;
    setText(resetVoteMessage, "查詢完成。");
  } catch (error) {
    setText(resetVoteMessage, `查詢失敗：${error.message}`);
  }
}

function renderResetResult(record) {
  if (!resetVoteResult) return;
  const contestantMap = getContestantMap();
  const employeeName = record.employeeData?.name || record.redCarpetVote?.employeeName || record.finalSummary?.employeeName || "—";
  const employeeDepartment = record.employeeData?.department || record.redCarpetVote?.employeeDepartment || record.finalSummary?.employeeDepartment || "—";
  const employeeCompany = record.employeeData?.company || record.redCarpetVote?.employeeCompany || record.finalSummary?.employeeCompany || "—";
  const redCarpetContestant = record.redCarpetVote ? contestantMap.get(record.redCarpetVote.contestantId) : null;
  const finalIds = Array.isArray(record.finalSummary?.votedContestantIds) ? record.finalSummary.votedContestantIds : record.finalLogs.map((log) => log.contestantId).filter(Boolean);
  const finalRows = finalIds.length ? finalIds.map((id) => {
    const contestant = contestantMap.get(id);
    return `<li><strong>${escapeHtml(contestant?.name || "未知選手")}</strong><span>A.K.A. ${escapeHtml(contestant?.stageName || "—")}</span><span class="admin-small-text">ID：${escapeHtml(id)}</span></li>`;
  }).join("") : `<li><span>目前沒有決賽觀眾投票紀錄。</span></li>`;
  resetVoteResult.classList.remove("hidden");
  resetVoteResult.innerHTML = `
    <div class="employee-vote-reset-profile">
      <div><span>工號</span><strong>${escapeHtml(record.employeeId)}</strong></div>
      <div><span>姓名</span><strong>${escapeHtml(employeeName)}</strong></div>
      <div><span>部門</span><strong>${escapeHtml(employeeDepartment)}</strong></div>
      <div><span>公司</span><strong>${escapeHtml(employeeCompany)}</strong></div>
      <div><span>紅毯狀態</span><strong>${record.redCarpetVote ? "已投票" : "未投票"}</strong></div>
      <div><span>決賽票數</span><strong>${Number(record.finalSummary?.usedVotes || record.finalLogs.length || 0)} / 3</strong></div>
    </div>
    <div class="employee-vote-reset-list"><h4>紅毯投票</h4><ul><li>${record.redCarpetVote ? `<strong>${escapeHtml(redCarpetContestant?.name || "未知選手")}</strong><span>A.K.A. ${escapeHtml(redCarpetContestant?.stageName || "—")}</span><span class="admin-small-text">ID：${escapeHtml(record.redCarpetVote.contestantId || "")}</span>` : `<span>目前沒有紅毯投票紀錄。</span>`}</li></ul></div>
    <div class="employee-vote-reset-list"><h4>決賽觀眾投票</h4><ul>${finalRows}</ul></div>`;
}

async function resetEmployeeRedCarpetVote() {
  if (!resetVoteCache?.redCarpetVote) { alert("此工號沒有紅毯投票可重置。"); return; }
  const employeeId = resetVoteCache.employeeId;
  if (!confirm(`確定要重置工號「${employeeId}」的紅毯投票嗎？`)) return;
  try {
    await deleteDoc(doc(db, "redCarpetVotes", employeeId));
    alert("紅毯投票已重置。");
    await loadAllFinalAdminData();
    await lookupEmployeeVoteRecord();
  } catch (error) { alert(`重置失敗：${error.message}`); }
}

async function resetEmployeeFinalAudienceVote() {
  if (!resetVoteCache) { alert("請先查詢工號投票紀錄。"); return; }
  const employeeId = resetVoteCache.employeeId;
  const hasSummary = Boolean(resetVoteCache.finalSummary);
  const hasLogs = resetVoteCache.finalLogs.length > 0;
  if (!hasSummary && !hasLogs) { alert("此工號沒有決賽投票可重置。"); return; }
  if (!confirm(`確定要重置工號「${employeeId}」的決賽觀眾投票嗎？\n\n此動作會刪除此工號的決賽投票 Summary 與 Logs。`)) return;
  if (!confirm(`再次確認：真的要重置工號「${employeeId}」的決賽觀眾投票嗎？\n\n此動作無法從前台復原。`)) return;
  try {
    const batch = writeBatch(db);
    if (hasSummary) batch.delete(doc(db, "finalAudienceVoteSummary", employeeId));
    resetVoteCache.finalLogs.forEach((log) => { if (log.id) batch.delete(doc(db, "finalAudienceVoteLogs", log.id)); });
    await batch.commit();
    alert("決賽觀眾投票已重置。");
    await loadAllFinalAdminData();
    await lookupEmployeeVoteRecord();
  } catch (error) { alert(`重置失敗：${error.message}`); }
}

function getRedCarpetWinner() {
  return getRankedContestants(getVoteCountMap(redCarpetVotesCache)).find((contestant) => contestant.voteCount > 0) || null;
}

function getFinalScoreRows() {
  const scoringContestants = getScoringContestants();
  const finalVoteCountMap = getVoteCountMap(finalAudienceLogsCache);
  const topVotes = finalVoteCountMap.size ? Math.max(...Array.from(finalVoteCountMap.values())) : 0;
  return scoringContestants.map((contestant) => {
    const voteCount = finalVoteCountMap.get(contestant.id) || 0;
    const audienceScore = topVotes > 0 ? (voteCount / topVotes) * 60 : 0;
    const scoreDoc = judgeScoresCache.get(contestant.id);
    const judgeCalculated = calculateJudgeScore(scoreDoc?.scores || {});
    const totalScore = judgeCalculated.judgeScore + audienceScore;
    return { ...contestant, voteCount, audienceScore, judgeAverage: judgeCalculated.average, judgeAverageText: judgeCalculated.averageText, judgeScore: judgeCalculated.judgeScore, judgeScoreText: judgeCalculated.judgeScoreText, totalScore };
  }).sort((a, b) => {
    const totalDiff = b.totalScore - a.totalScore;
    if (totalDiff !== 0) return totalDiff;
    const judgeDiff = b.judgeScore - a.judgeScore;
    if (judgeDiff !== 0) return judgeDiff;
    const voteDiff = b.voteCount - a.voteCount;
    if (voteDiff !== 0) return voteDiff;
    const orderA = typeof a.manualOrder === "number" ? a.manualOrder : 999;
    const orderB = typeof b.manualOrder === "number" ? b.manualOrder : 999;
    return orderA - orderB;
  });
}

function calculateJudgeScore(scores) {
  const validScores = finalJudgesCache.length
    ? finalJudgesCache.map((judge) => Number(scores?.[judge.id])).filter((score) => Number.isFinite(score) && score >= 1 && score <= 10)
    : Object.values(scores || {}).map((value) => Number(value)).filter((score) => Number.isFinite(score) && score >= 1 && score <= 10);
  if (!validScores.length) return { average: 0, judgeScore: 0, averageText: "—", judgeScoreText: "—" };
  const average = validScores.reduce((sum, score) => sum + score, 0) / validScores.length;
  const judgeScore = average * 4;
  return { average, judgeScore, averageText: average.toFixed(2), judgeScoreText: judgeScore.toFixed(1) };
}

function getVoteCountMap(votes) {
  const map = new Map();
  votes.forEach((vote) => {
    if (!vote.contestantId) return;
    map.set(vote.contestantId, (map.get(vote.contestantId) || 0) + 1);
  });
  return map;
}

function getRankedContestants(voteCountMap) {
  return [...contestantsCache].map((contestant) => ({ ...contestant, voteCount: voteCountMap.get(contestant.id) || 0 })).sort((a, b) => {
    const voteDiff = b.voteCount - a.voteCount;
    if (voteDiff !== 0) return voteDiff;
    const orderA = typeof a.manualOrder === "number" ? a.manualOrder : 999;
    const orderB = typeof b.manualOrder === "number" ? b.manualOrder : 999;
    return orderA - orderB;
  });
}

function getContestantMap() {
  return new Map(contestantsCache.map((contestant) => [contestant.id, contestant]));
}

function getScoringContestants() {
  return contestantsCache.filter((contestant) => contestant.publishStatus === true);
}

function sortByCreatedAtDesc(a, b) {
  return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
}

function shuffleArray(array) {
  const copied = [...array];
  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }
  return copied;
}

function normalizeEmployeeId(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return String(value || "").trim();
}

function setText(element, value) {
  if (element) element.textContent = String(value);
}

function fillTable(tbody, colspan, message) {
  if (tbody) tbody.innerHTML = `<tr><td colspan="${colspan}">${escapeHtml(message)}</td></tr>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

console.log("Final admin page loaded.");
