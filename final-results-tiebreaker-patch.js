import { getApps } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, collection, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getFinalScoreRowsWithTieBreakers } from "./final-tiebreaker-utils.js";

const app = getApps()[0];
const db = app ? getFirestore(app) : null;

let mode = "";
let contestants = [];
let finalAudienceLogs = [];
let finalJudges = [];
let judgeScoresMap = new Map();
let queued = false;

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

function getRows() {
  return getFinalScoreRowsWithTieBreakers({
    contestants,
    finalAudienceLogs,
    judgeScoresMap,
    finalJudges
  });
}

function renderCard(item, index) {
  const photoUrl = getPhoto(item.row);
  const songTitle = getSong(item.row);
  return `
    <div class="all-winner-showcase-card ${item.className}" style="--delay:${index};">
      <div class="all-winner-photo">
        ${photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(item.row?.name || item.label)}" />` : `<div class="award-photo-placeholder">★</div>`}
      </div>
      <div class="all-winner-info">
        <span>${escapeHtml(item.label)}</span>
        <strong>${escapeHtml(item.row?.name || "—")}</strong>
        <p>A.K.A. ${escapeHtml(item.row?.stageName || "—")}</p>
        <div class="all-winner-song"><small>演唱曲目</small><b>${escapeHtml(songTitle || "—")}</b></div>
        <em>${escapeHtml(item.prize)}｜${Number(item.row?.totalScore || 0).toFixed(1)} 分</em>
      </div>
    </div>`;
}

function patchAllWinners() {
  if (mode !== "allWinners") return;
  const target = document.getElementById("awardRevealContent");
  if (!target) return;
  const rows = getRows();
  if (!rows.length) return;

  const cards = [
    { label: "第一名", prize: "NT$6,000", row: rows[0], className: "winner-first" },
    { label: "第二名", prize: "NT$5,000", row: rows[1], className: "winner-second" },
    { label: "第三名", prize: "NT$3,600", row: rows[2], className: "winner-third" }
  ].filter((item) => item.row);

  target.innerHTML = `<div class="all-winners-showcase">${cards.map(renderCard).join("")}</div>`;
}

function queuePatch() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    patchAllWinners();
  });
}

if (db) {
  onSnapshot(doc(db, "settings", "finalResultControl"), (snap) => {
    mode = snap.exists() ? snap.data().mode || "" : "";
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
}

new MutationObserver(queuePatch).observe(document.body, { childList: true, subtree: true });
