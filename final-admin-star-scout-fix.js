import { getApps } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const app = getApps()[0];
const db = app ? getFirestore(app) : null;
const auth = app ? getAuth(app) : null;

function r1(v) { return Math.round(Number(v || 0) * 10) / 10; }
async function rows(name) { const s = await getDocs(collection(db, name)); const a = []; s.forEach((d) => a.push({ id: d.id, ...d.data() })); return a; }
function counts(list) { const m = new Map(); list.forEach((x) => { if (x.contestantId) m.set(x.contestantId, (m.get(x.contestantId) || 0) + 1); }); return m; }
function score(scores, judges) {
  const vals = judges.length ? judges.map((j) => Number(scores?.[j.id])) : Object.values(scores || {}).map(Number);
  const ok = vals.filter((n) => Number.isFinite(n) && n >= 1 && n <= 10);
  return ok.length ? (ok.reduce((s, n) => s + n, 0) / ok.length) * 4 : 0;
}
function named(scores, judges, keys) {
  const j = judges.find((x) => keys.some((k) => String(x.name || "").toLowerCase().includes(k.toLowerCase())));
  const n = Number(scores?.[j?.id]);
  return Number.isFinite(n) ? n : 0;
}
async function topAndPool() {
  const [contestants, logs, judgeRows, judgeDoc] = await Promise.all([rows("contestants"), rows("finalAudienceVoteLogs"), rows("judgeScores"), getDoc(doc(db, "settings", "finalJudges"))]);
  const judges = judgeDoc.exists() && Array.isArray(judgeDoc.data().judges) ? judgeDoc.data().judges.filter((j) => j && j.id && j.name) : [];
  const jm = new Map(judgeRows.map((x) => [x.id, x]));
  const vm = counts(logs);
  const topVotes = vm.size ? Math.max(...Array.from(vm.values())) : 0;
  const ranked = contestants.filter((c) => c.publishStatus === true).map((c) => {
    const v = vm.get(c.id) || 0;
    const a = topVotes > 0 ? (v / topVotes) * 60 : 0;
    const ss = jm.get(c.id)?.scores || {};
    const j = score(ss, judges);
    return { ...c, total: r1(j + a), judge: r1(j), audience: r1(a), wen: named(ss, judges, ["溫", "wen"]), joris: named(ss, judges, ["joris"]) };
  }).sort((a, b) => (b.total - a.total) || (b.judge - a.judge) || (b.audience - a.audience) || (b.wen - a.wen) || (b.joris - a.joris) || ((Number(a.manualOrder) || 999) - (Number(b.manualOrder) || 999)));
  const top = ranked[0] || null;
  const map = new Map();
  if (top) logs.forEach((x) => { if (x.contestantId !== top.id) return; const id = String(x.employeeId || "").trim(); if (!id || map.has(id)) return; map.set(id, { employeeId: id, employeeName: x.employeeName || "", employeeDepartment: x.employeeDepartment || "", employeeCompany: x.employeeCompany || "" }); });
  return { top, pool: Array.from(map.values()) };
}
function mixed(a) { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; }
async function run(mode) {
  const user = auth?.currentUser;
  if (!user || !db) return;
  const { top, pool } = await topAndPool();
  if (!top) return alert("No champion data.");
  const chosen = mode === "show" ? [] : mixed(pool).slice(0, Math.min(7, pool.length));
  await setDoc(doc(db, "settings", "starScoutWinners"), { championContestantId: top.id, championName: top.name || "", championStageName: top.stageName || "", eligibleCount: pool.length, drawCount: mode === "show" ? Math.min(7, pool.length) : chosen.length, winners: chosen, winnerCount: chosen.length, prize: "NT$500", updatedAt: serverTimestamp(), updatedBy: user.email || "", updatedByUid: user.uid }, { merge: true });
  await setDoc(doc(db, "settings", "finalResultControl"), { mode: mode === "show" ? "starScoutStandby" : "starScoutWinners", awardName: "最強星探獎", contestantId: top.id, countdownStatus: "stopped", updatedAt: serverTimestamp(), updatedBy: user.email || "", updatedByUid: user.uid }, { merge: true });
}
function bind() {
  const a = document.getElementById("prepareStarScoutButton");
  const b = document.getElementById("drawStarScoutButton");
  if (a && a.dataset.ssf !== "1") { a.dataset.ssf = "1"; a.addEventListener("click", (e) => { e.preventDefault(); e.stopImmediatePropagation(); run("show"); }, true); }
  if (b && b.dataset.ssf !== "1") { b.dataset.ssf = "1"; b.addEventListener("click", (e) => { e.preventDefault(); e.stopImmediatePropagation(); run("go"); }, true); }
}
bind();
new MutationObserver(bind).observe(document.body, { childList: true, subtree: true });
