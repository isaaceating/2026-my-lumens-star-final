import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, collection, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBlj362N4O6ERqgFziQ4Gg9W7SEyquKb0g",
  authDomain: "my-lumens-star-2026.firebaseapp.com",
  projectId: "my-lumens-star-2026",
  storageBucket: "my-lumens-star-2026.firebasestorage.app",
  messagingSenderId: "150108062917",
  appId: "1:150108062917:web:f7284392bed27438041cac"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const $ = (id) => document.getElementById(id);

let currentMode = "";
let contestants = [];
let finalAudienceLogs = [];
let redCarpetVotes = [];
let finalJudges = [];
let judgeScoresMap = new Map();
let queued = false;

const tieBreakerJudges = [
  { key: "wen", labels: ["溫", "wen"] },
  { key: "joris", labels: ["joris"] }
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getPhoto(row) {
  return row?.photoUrl || row?.photoURL || row?.imageUrl || row?.imageURL || row?.photo || "";
}

function getSong(row) {
  return row?.performanceItem || row?.songTitle || row?.songName || row?.song || "";
}

function getVoteCountMap(votes) {
  const map = new Map();
  votes.forEach((vote) => {
    if (!vote.contestantId) return;
    map.set(vote.contestantId, (map.get(vote.contestantId) || 0) + 1);
  });
  return map;
}

function calculateJudgeScore(scores = {}) {
  const validScores = finalJudges.length
    ? finalJudges.map((judge) => Number(scores?.[judge.id])).filter((score) => Number.isFinite(score) && score >= 1 && score <= 10)
    : Object.values(scores || {}).map((value) => Number(value)).filter((score) => Number.isFinite(score) && score >= 1 && score <= 10);

  if (!validScores.length) return { average: 0, judgeScore: 0, averageText: "—", judgeScoreText: "—" };
  const average = validScores.reduce((sum, score) => sum + score, 0) / validScores.length;
  const judgeScore = average * 4;
  return { average, judgeScore, averageText: average.toFixed(2), judgeScoreText: judgeScore.toFixed(1) };
}

function getTieBreakerJudgeScore(scores = {}, judgeKey) {
  const config = tieBreakerJudges.find((item) => item.key === judgeKey);
  if (!config) return 0;
  const judge = finalJudges.find((item) => {
    const name = String(item?.name || "").trim().toLowerCase();
    return config.labels.some((label) => name.includes(label.toLowerCase()));
  });
  if (!judge) return 0;
  const score = Number(scores?.[judge.id]);
  return Number.isFinite(score) ? score : 0;
}

function getFinalRows() {
  const finalVoteCountMap = getVoteCountMap(finalAudienceLogs);
  const topVotes = finalVoteCountMap.size ? Math.max(...Array.from(finalVoteCountMap.values())) : 0;

  return contestants
    .filter((contestant) => contestant.publishStatus === true)
    .map((contestant) => {
      const voteCount = finalVoteCountMap.get(contestant.id) || 0;
      const audienceScore = topVotes > 0 ? (voteCount / topVotes) * 60 : 0;
      const scoreDoc = judgeScoresMap.get(contestant.id);
      const scores = scoreDoc?.scores || {};
      const judgeCalculated = calculateJudgeScore(scores);
      const wenScore = getTieBreakerJudgeScore(scores, "wen");
      const jorisScore = getTieBreakerJudgeScore(scores, "joris");
      const totalScore = judgeCalculated.judgeScore + audienceScore;
      return { ...contestant, voteCount, audienceScore, judgeScore: judgeCalculated.judgeScore, judgeScoreText: judgeCalculated.judgeScoreText, wenScore, jorisScore, totalScore };
    })
    .sort((a, b) => {
      const totalDiff = Number(b.totalScore || 0) - Number(a.totalScore || 0);
      if (totalDiff !== 0) return totalDiff;
      const judgeDiff = Number(b.judgeScore || 0) - Number(a.judgeScore || 0);
      if (judgeDiff !== 0) return judgeDiff;
      const audienceDiff = Number(b.audienceScore || 0) - Number(a.audienceScore || 0);
      if (audienceDiff !== 0) return audienceDiff;
      const wenDiff = Number(b.wenScore || 0) - Number(a.wenScore || 0);
      if (wenDiff !== 0) return wenDiff;
      const jorisDiff = Number(b.jorisScore || 0) - Number(a.jorisScore || 0);
      if (jorisDiff !== 0) return jorisDiff;
      const orderA = typeof a.manualOrder === "number" ? a.manualOrder : 999;
      const orderB = typeof b.manualOrder === "number" ? b.manualOrder : 999;
      return orderA - orderB;
    });
}

function getRedCarpetWinner() {
  const voteMap = getVoteCountMap(redCarpetVotes);
  return [...contestants]
    .map((contestant) => ({ ...contestant, voteCount: voteMap.get(contestant.id) || 0 }))
    .sort((a, b) => {
      const voteDiff = Number(b.voteCount || 0) - Number(a.voteCount || 0);
      if (voteDiff !== 0) return voteDiff;
      const orderA = typeof a.manualOrder === "number" ? a.manualOrder : 999;
      const orderB = typeof b.manualOrder === "number" ? b.manualOrder : 999;
      return orderA - orderB;
    })
    .find((contestant) => contestant.voteCount > 0) || null;
}

function showAllWinnersScreen() {
  ["preVotingStandbyScreen", "liveVotingScreen", "beforeRevealStandbyScreen", "intermissionScreen", "customMessageScreen"].forEach((id) => $(id)?.classList.add("hidden"));
  $("awardRevealScreen")?.classList.remove("hidden");
  $("awardRevealStage")?.classList.add("all-winners-stage");
  $("awardRevealKicker")?.classList.add("hidden");
  $("awardRevealTitle")?.classList.add("hidden");
  if ($("resultsMainTitle")) $("resultsMainTitle").textContent = "得獎名單";
}

function renderCard(item, index) {
  const photoUrl = getPhoto(item.contestant);
  const songTitle = getSong(item.contestant);
  const metric = item.label === "紅毯巨星造型獎"
    ? `${Number(item.contestant?.voteCount || 0)} 票`
    : `${Number(item.contestant?.totalScore || 0).toFixed(1)} 分`;

  return `
    <div class="all-winner-showcase-card ${item.className}" style="--delay:${index};">
      <div class="all-winner-photo">
        ${photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(item.contestant?.name || item.label)}" />` : `<div class="award-photo-placeholder">★</div>`}
      </div>
      <div class="all-winner-info">
        <span>${escapeHtml(item.label)}</span>
        <strong>${escapeHtml(item.contestant?.name || "—")}</strong>
        <p>A.K.A. ${escapeHtml(item.contestant?.stageName || "—")}</p>
        <div class="all-winner-song"><small>演唱曲目</small><b>${escapeHtml(songTitle || "—")}</b></div>
        <em>${escapeHtml(item.prize)}｜${escapeHtml(metric)}</em>
      </div>
    </div>`;
}

function patchAllWinners() {
  if (currentMode !== "allWinners") return;
  const target = $("awardRevealContent");
  if (!target) return;

  showAllWinnersScreen();

  const rows = getFinalRows();
  const redCarpetWinner = getRedCarpetWinner();
  if (!rows.length) {
    target.innerHTML = `<div class="award-suspense-text">得獎資料載入中...</div>`;
    return;
  }

  const cards = [
    { label: "第一名", prize: "NT$6,000", contestant: rows[0], className: "winner-first" },
    { label: "第二名", prize: "NT$5,000", contestant: rows[1], className: "winner-second" },
    { label: "第三名", prize: "NT$3,600", contestant: rows[2], className: "winner-third" },
    { label: "紅毯巨星造型獎", prize: "NT$1,500", contestant: redCarpetWinner, className: "winner-red-carpet" }
  ].filter((item) => item.contestant);

  const html = `<div class="all-winners-showcase">${cards.map(renderCard).join("")}</div>`;
  if (target.dataset.tieBreakerHtml !== html) {
    target.dataset.tieBreakerHtml = html;
    target.innerHTML = html;
  }
}

function queuePatch() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    patchAllWinners();
  });
}

onSnapshot(doc(db, "settings", "finalResultControl"), (snap) => {
  currentMode = snap.exists() ? snap.data().mode || "" : "";
  queuePatch();
  setTimeout(queuePatch, 120);
});

onSnapshot(collection(db, "contestants"), (snap) => {
  contestants = [];
  snap.forEach((row) => contestants.push({ id: row.id, ...row.data() }));
  contestants.sort((a, b) => {
    const orderA = typeof a.manualOrder === "number" ? a.manualOrder : 999;
    const orderB = typeof b.manualOrder === "number" ? b.manualOrder : 999;
    if (orderA !== orderB) return orderA - orderB;
    return (a.registerTime?.seconds || 0) - (b.registerTime?.seconds || 0);
  });
  queuePatch();
});

onSnapshot(collection(db, "finalAudienceVoteLogs"), (snap) => {
  finalAudienceLogs = [];
  snap.forEach((row) => finalAudienceLogs.push({ id: row.id, ...row.data() }));
  queuePatch();
});

onSnapshot(collection(db, "redCarpetVotes"), (snap) => {
  redCarpetVotes = [];
  snap.forEach((row) => redCarpetVotes.push({ id: row.id, ...row.data() }));
  queuePatch();
});

onSnapshot(collection(db, "judgeScores"), (snap) => {
  judgeScoresMap = new Map();
  snap.forEach((row) => judgeScoresMap.set(row.id, { id: row.id, ...row.data() }));
  queuePatch();
});

onSnapshot(doc(db, "settings", "finalJudges"), (snap) => {
  finalJudges = snap.exists() && Array.isArray(snap.data().judges)
    ? snap.data().judges.filter((judge) => judge && judge.id && judge.name)
    : [];
  queuePatch();
});

new MutationObserver(queuePatch).observe(document.body, { childList: true, subtree: true });
