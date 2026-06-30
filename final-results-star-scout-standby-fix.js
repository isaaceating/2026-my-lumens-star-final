import { getApps } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const app = getApps()[0];
const db = app ? getFirestore(app) : null;

let mode = "";
let scout = null;
let queued = false;

function $(id) {
  return document.getElementById(id);
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderStandby() {
  if (mode !== "starScoutStandby") return;
  const target = $("awardRevealContent");
  if (!target || !scout) return;

  const name = scout.championName || "—";
  const aka = scout.championStageName || "—";
  const eligibleCount = Number(scout.eligibleCount || 0);
  const drawCount = Number(scout.drawCount || Math.min(7, eligibleCount));

  $("awardRevealScreen")?.classList.remove("hidden");
  $("awardRevealStage")?.classList.add("star-scout-standby-stage");
  if ($("resultsMainTitle")) $("resultsMainTitle").textContent = "決賽獎項公布";
  if ($("awardRevealTitle")) $("awardRevealTitle").textContent = "最強星探獎";

  target.innerHTML = `
    <div class="star-scout-standby-panel animate-reveal">
      <div class="star-scout-standby-title">最強星探獎</div>
      <div class="star-scout-standby-grid">
        <div class="star-scout-standby-item">
          <span>第一名</span>
          <strong>${esc(name)}</strong>
          <p>A.K.A. ${esc(aka)}</p>
        </div>
        <div class="star-scout-standby-item">
          <span>符合資格人數</span>
          <strong>${eligibleCount}</strong>
          <p>有投給第一名的觀眾</p>
        </div>
        <div class="star-scout-standby-item">
          <span>將抽出</span>
          <strong>${drawCount}</strong>
          <p>每位 NT$500</p>
        </div>
      </div>
    </div>`;
}

function queue() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    renderStandby();
  });
}

if (db) {
  onSnapshot(doc(db, "settings", "finalResultControl"), (snap) => {
    mode = snap.exists() ? snap.data().mode || "" : "";
    queue();
    setTimeout(queue, 180);
  });

  onSnapshot(doc(db, "settings", "starScoutWinners"), (snap) => {
    scout = snap.exists() ? snap.data() : null;
    queue();
    setTimeout(queue, 180);
  });
}

new MutationObserver(queue).observe(document.body, { childList: true, subtree: true });
