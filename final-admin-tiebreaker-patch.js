import { getApps } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getFinalScoreRowsWithTieBreakers } from "./final-tiebreaker-utils.js";

const app = getApps()[0];
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

let patchBusy = false;
let latestRows = [];
let refreshQueued = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getPlaceConfig(mode) {
  const map = {
    firstPlace: { index: 0, awardName: "第一名" },
    secondPlace: { index: 1, awardName: "第二名" },
    thirdPlace: { index: 2, awardName: "第三名" }
  };
  return map[mode] || map.firstPlace;
}

async function fetchCollection(name) {
  const snapshot = await getDocs(collection(db, name));
  const rows = [];
  snapshot.forEach((docSnap) => rows.push({ id: docSnap.id, ...docSnap.data() }));
  return rows;
}

async function fetchTieBreakerRows() {
  if (!db) return [];

  const [contestants, finalAudienceLogs, judgeScores, finalJudgesSnap] = await Promise.all([
    fetchCollection("contestants"),
    fetchCollection("finalAudienceVoteLogs"),
    fetchCollection("judgeScores"),
    getDoc(doc(db, "settings", "finalJudges"))
  ]);

  contestants.sort((a, b) => {
    const orderA = typeof a.manualOrder === "number" ? a.manualOrder : 999;
    const orderB = typeof b.manualOrder === "number" ? b.manualOrder : 999;
    if (orderA !== orderB) return orderA - orderB;
    return (a.registerTime?.seconds || 0) - (b.registerTime?.seconds || 0);
  });

  const judgeScoresMap = new Map(judgeScores.map((row) => [row.id, row]));
  const finalJudges = finalJudgesSnap.exists() && Array.isArray(finalJudgesSnap.data().judges)
    ? finalJudgesSnap.data().judges.filter((judge) => judge && judge.id && judge.name)
    : [];

  latestRows = getFinalScoreRowsWithTieBreakers({
    contestants,
    finalAudienceLogs,
    judgeScoresMap,
    finalJudges
  });

  return latestRows;
}

function renderFinalScoreRanking(rows) {
  const table = document.getElementById("finalScoreRankingTable");
  if (!table || !rows.length) return;

  table.innerHTML = rows.map((contestant, index) => `
    <tr>
      <td><span class="vote-rank-badge">${index + 1}</span></td>
      <td><strong>${escapeHtml(contestant.name || "—")}</strong><div class="admin-small-text">No. ${escapeHtml(String(contestant.manualOrder ?? "—"))}</div></td>
      <td>A.K.A. ${escapeHtml(contestant.stageName || "—")}</td>
      <td>${contestant.judgeAverageText}</td>
      <td><strong class="admin-number-highlight">${contestant.judgeScoreText}</strong></td>
      <td><strong class="admin-number-highlight">${contestant.voteCount}</strong></td>
      <td><strong class="admin-number-highlight">${contestant.audienceScore.toFixed(1)}</strong></td>
      <td><strong class="admin-number-highlight">${contestant.totalScore.toFixed(1)}</strong><div class="admin-small-text">同分序：溫 ${contestant.wenScoreText} / Joris ${contestant.jorisScoreText}</div></td>
    </tr>`).join("");
}

async function refreshTieBreakerRanking() {
  if (patchBusy || !db) return;
  patchBusy = true;
  try {
    const rows = await fetchTieBreakerRows();
    renderFinalScoreRanking(rows);
  } catch (error) {
    console.error("Tie breaker ranking patch failed:", error);
  } finally {
    patchBusy = false;
  }
}

function queueRefreshTieBreakerRanking() {
  if (refreshQueued) return;
  refreshQueued = true;
  setTimeout(() => {
    refreshQueued = false;
    refreshTieBreakerRanking();
  }, 250);
}

async function setResultDisplayModeWithTieBreaker(mode) {
  const user = auth?.currentUser;
  if (!user || !db) {
    alert("請先使用 Google Admin 帳號登入。");
    return;
  }

  const rows = await fetchTieBreakerRows();
  const place = getPlaceConfig(mode);
  const winner = rows[place.index];
  if (!winner) {
    alert(`目前沒有足夠資料公布${place.awardName}。`);
    return;
  }

  const confirmed = confirm(
    `確定要公布${place.awardName}嗎？\n\n` +
    `得獎者：${winner.name || "未知選手"} / A.K.A. ${winner.stageName || "—"}\n` +
    `總分：${winner.totalScore.toFixed(1)}\n` +
    `同分比較：評審 ${winner.judgeScoreText} / 觀眾 ${winner.audienceScore.toFixed(1)} / 溫 ${winner.wenScoreText} / Joris ${winner.jorisScoreText}`
  );
  if (!confirmed) return;

  await setDoc(doc(db, "settings", "finalResultControl"), {
    mode,
    awardName: place.awardName,
    contestantId: winner.id,
    countdownStatus: "stopped",
    updatedAt: serverTimestamp(),
    updatedBy: user.email || "",
    updatedByUid: user.uid
  }, { merge: true });

  const message = document.getElementById("resultDisplayControlMessage");
  if (message) message.textContent = `${place.awardName}已依同分比較規則顯示在大螢幕。`;
}

function interceptPlaceButtons() {
  const buttonMap = {
    previewFirstPlaceButton: "firstPlace",
    previewSecondPlaceButton: "secondPlace",
    previewThirdPlaceButton: "thirdPlace"
  };

  Object.entries(buttonMap).forEach(([id, mode]) => {
    const button = document.getElementById(id);
    if (!button || button.dataset.tieBreakerPatched === "true") return;
    button.dataset.tieBreakerPatched = "true";
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      await setResultDisplayModeWithTieBreaker(mode);
    }, true);
  });
}

function startTieBreakerPatch() {
  interceptPlaceButtons();
  queueRefreshTieBreakerRanking();

  const refreshButton = document.getElementById("refreshFinalScoreboardButton");
  refreshButton?.addEventListener("click", () => setTimeout(queueRefreshTieBreakerRanking, 500));

  const observer = new MutationObserver(() => {
    interceptPlaceButtons();
    queueRefreshTieBreakerRanking();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

startTieBreakerPatch();
