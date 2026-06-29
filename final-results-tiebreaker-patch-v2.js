import { getApps } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, collection, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const app = getApps()[0];
const db = app ? getFirestore(app) : null;
const $ = (id) => document.getElementById(id);

let mode = "";
let contestants = [];
let finalLogs = [];
let redVotes = [];
let judges = [];
let scoreMap = new Map();
let queued = false;

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function countVotes(votes) {
  const map = new Map();
  votes.forEach((vote) => {
    if (!vote.contestantId) return;
    map.set(vote.contestantId, (map.get(vote.contestantId) || 0) + 1);
  });
  return map;
}

function judgeScore(scores) {
  const values = judges.length
    ? judges.map((judge) => Number(scores?.[judge.id])).filter((score) => Number.isFinite(score) && score >= 1 && score <= 10)
    : Object.values(scores || {}).map(Number).filter((score) => Number.isFinite(score) && score >= 1 && score <= 10);
  if (!values.length) return 0;
  return (values.reduce((sum, score) => sum + score, 0) / values.length) * 4;
}

function namedJudgeScore(scores, keywords) {
  const judge = judges.find((item) => {
    const name = String(item?.name || "").toLowerCase();
    return keywords.some((keyword) => name.includes(keyword.toLowerCase()));
  });
  if (!judge) return 0;
  const score = Number(scores?.[judge.id]);
  return Number.isFinite(score) ? score : 0;
}

function finalRows() {
  const voteMap = countVotes(finalLogs);
  const topVotes = voteMap.size ? Math.max(...Array.from(voteMap.values())) : 0;
  return contestants.filter((item) => item.publishStatus === true).map((item) => {
    const votes = voteMap.get(item.id) || 0;
    const audience = topVotes > 0 ? (votes / topVotes) * 60 : 0;
    const scores = scoreMap.get(item.id)?.scores || {};
    const judge = judgeScore(scores);
    const total = judge + audience;
    return {
      ...item,
      voteCount: votes,
      audienceScore: audience,
      judgeScore: judge,
      totalScore: total,
      displayTotalScore: round1(total),
      displayJudgeScore: round1(judge),
      displayAudienceScore: round1(audience),
      wenScore: namedJudgeScore(scores, ["溫", "wen"]),
      jorisScore: namedJudgeScore(scores, ["joris"])
    };
  }).sort((a, b) => {
    return (b.displayTotalScore - a.displayTotalScore)
      || (b.displayJudgeScore - a.displayJudgeScore)
      || (b.displayAudienceScore - a.displayAudienceScore)
      || (b.wenScore - a.wenScore)
      || (b.jorisScore - a.jorisScore)
      || ((Number(a.manualOrder) || 999) - (Number(b.manualOrder) || 999));
  });
}

function redCarpetWinner() {
  const voteMap = countVotes(redVotes);
  return contestants.map((item) => ({ ...item, voteCount: voteMap.get(item.id) || 0 }))
    .sort((a, b) => (b.voteCount - a.voteCount) || ((Number(a.manualOrder) || 999) - (Number(b.manualOrder) || 999)))
    .find((item) => item.voteCount > 0) || null;
}

function photo(item) {
  return item?.photoUrl || item?.photoURL || item?.imageUrl || item?.imageURL || item?.photo || "";
}

function song(item) {
  return item?.performanceItem || item?.songTitle || item?.songName || item?.song || "";
}

function card(item, index) {
  const img = photo(item.contestant);
  const music = song(item.contestant);
  const metric = item.label === "紅毯巨星造型獎"
    ? `${Number(item.contestant?.voteCount || 0)} 票`
    : `${Number(item.contestant?.displayTotalScore || 0).toFixed(1)} 分`;
  return `<div class="all-winner-showcase-card ${item.className}" style="--delay:${index};"><div class="all-winner-photo">${img ? `<img src="${esc(img)}" alt="${esc(item.contestant?.name || item.label)}" />` : `<div class="award-photo-placeholder">★</div>`}</div><div class="all-winner-info"><span>${esc(item.label)}</span><strong>${esc(item.contestant?.name || "—")}</strong><p>A.K.A. ${esc(item.contestant?.stageName || "—")}</p><div class="all-winner-song"><small>演唱曲目</small><b>${esc(music || "—")}</b></div><em>${esc(item.prize)}｜${esc(metric)}</em></div></div>`;
}

function render() {
  if (mode !== "allWinners") return;
  const target = $("awardRevealContent");
  if (!target) return;
  ["preVotingStandbyScreen", "liveVotingScreen", "beforeRevealStandbyScreen", "intermissionScreen", "customMessageScreen"].forEach((id) => $(id)?.classList.add("hidden"));
  $("awardRevealScreen")?.classList.remove("hidden");
  $("awardRevealStage")?.classList.add("all-winners-stage");
  $("awardRevealKicker")?.classList.add("hidden");
  $("awardRevealTitle")?.classList.add("hidden");
  if ($("resultsMainTitle")) $("resultsMainTitle").textContent = "得獎名單";
  const rows = finalRows();
  if (!rows.length) return;
  const cards = [
    { label: "第一名", prize: "NT$6,000", contestant: rows[0], className: "winner-first" },
    { label: "第二名", prize: "NT$5,000", contestant: rows[1], className: "winner-second" },
    { label: "第三名", prize: "NT$3,600", contestant: rows[2], className: "winner-third" },
    { label: "紅毯巨星造型獎", prize: "NT$1,500", contestant: redCarpetWinner(), className: "winner-red-carpet" }
  ].filter((item) => item.contestant);
  target.innerHTML = `<div class="all-winners-showcase">${cards.map(card).join("")}</div>`;
}

function queue() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    render();
  });
}

if (db) {
  onSnapshot(doc(db, "settings", "finalResultControl"), (snap) => { mode = snap.exists() ? snap.data().mode || "" : ""; queue(); setTimeout(queue, 200); });
  onSnapshot(collection(db, "contestants"), (snap) => { contestants = []; snap.forEach((row) => contestants.push({ id: row.id, ...row.data() })); queue(); });
  onSnapshot(collection(db, "finalAudienceVoteLogs"), (snap) => { finalLogs = []; snap.forEach((row) => finalLogs.push({ id: row.id, ...row.data() })); queue(); });
  onSnapshot(collection(db, "redCarpetVotes"), (snap) => { redVotes = []; snap.forEach((row) => redVotes.push({ id: row.id, ...row.data() })); queue(); });
  onSnapshot(collection(db, "judgeScores"), (snap) => { scoreMap = new Map(); snap.forEach((row) => scoreMap.set(row.id, { id: row.id, ...row.data() })); queue(); });
  onSnapshot(doc(db, "settings", "finalJudges"), (snap) => { judges = snap.exists() && Array.isArray(snap.data().judges) ? snap.data().judges.filter((judge) => judge && judge.id && judge.name) : []; queue(); });
}

new MutationObserver(queue).observe(document.body, { childList: true, subtree: true });
