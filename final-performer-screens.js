import { getApps } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, collection, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const app = getApps()[0];
const db = app ? getFirestore(app) : null;
const $ = (id) => document.getElementById(id);

let currentMode = "";
let currentContestantId = "";
let contestantsCache = [];
let renderQueued = false;

const STANDARD_SCREEN_IDS = [
  "preVotingStandbyScreen",
  "liveVotingScreen",
  "beforeRevealStandbyScreen",
  "intermissionScreen",
  "customMessageScreen",
  "awardRevealScreen"
];

function ensurePerformerScreens() {
  const displayScreen = $("resultsDisplayScreen");
  if (!displayScreen) return;

  if (!$("performerIntroScreen")) {
    const screen = document.createElement("section");
    screen.id = "performerIntroScreen";
    screen.className = "results-mode-screen performer-intro-screen hidden";
    screen.innerHTML = `<div id="performerIntroStage" class="performer-intro-stage"></div>`;
    const awardRevealScreen = $("awardRevealScreen");
    displayScreen.insertBefore(screen, awardRevealScreen || null);
  }

  if (!$("performerRecapScreen")) {
    const screen = document.createElement("section");
    screen.id = "performerRecapScreen";
    screen.className = "results-mode-screen performer-recap-screen hidden";
    screen.innerHTML = `
      <div class="performer-recap-stage">
        <div id="performerRecapGrid" class="performer-recap-grid"></div>
      </div>`;
    const awardRevealScreen = $("awardRevealScreen");
    displayScreen.insertBefore(screen, awardRevealScreen || null);
  }
}

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderPerformerMode();
  });
}

function renderPerformerMode() {
  ensurePerformerScreens();

  if (currentMode !== "performerIntro" && currentMode !== "performerRecap") {
    $("performerIntroScreen")?.classList.add("hidden");
    $("performerRecapScreen")?.classList.add("hidden");
    return;
  }

  hideStandardScreens();
  updateTopbar(currentMode);

  if (currentMode === "performerIntro") {
    renderPerformerIntro();
    $("performerIntroScreen")?.classList.remove("hidden");
    $("performerRecapScreen")?.classList.add("hidden");
    return;
  }

  renderPerformerRecap();
  $("performerIntroScreen")?.classList.add("hidden");
  $("performerRecapScreen")?.classList.remove("hidden");
}

function hideStandardScreens() {
  STANDARD_SCREEN_IDS.forEach((id) => $(id)?.classList.add("hidden"));
}

function updateTopbar(mode) {
  const title = mode === "performerIntro" ? "選手即將登場" : "投票前歌手回顧";
  const mainTitle = $("resultsMainTitle");
  if (mainTitle) mainTitle.textContent = title;

  const badge = $("resultsStatusBadge");
  if (badge) {
    badge.classList.add("standby");
    badge.classList.remove("paused");
    badge.innerHTML = "<span></span>STANDBY";
  }
}

function renderPerformerIntro() {
  const stage = $("performerIntroStage");
  if (!stage) return;

  if (!contestantsCache.length) {
    stage.innerHTML = `<div class="performer-empty-state">選手資料載入中...</div>`;
    return;
  }

  const contestant = getContestantById(currentContestantId) || contestantsCache[0];
  const index = Math.max(0, contestantsCache.findIndex((item) => item.id === contestant.id));
  const number = String(index + 1).padStart(2, "0");
  const photoUrl = getContestantPhoto(contestant);
  const songTitle = getContestantSong(contestant);

  stage.innerHTML = `
    <div class="performer-intro-copy">
      <div class="performer-number">No. ${number}</div>
      <h1>${escapeHtml(contestant.name || contestant.stageName || "神秘歌手")}</h1>
      <p class="performer-stage-name">A.K.A. ${escapeHtml(contestant.stageName || "—")}</p>
      <div class="performer-song-block">
        <span>演唱曲目</span>
        <strong>${escapeHtml(songTitle || "—")}</strong>
      </div>
    </div>

    <div class="performer-photo-panel">
      ${photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(contestant.name || contestant.stageName || "選手")}" />` : `<div class="performer-photo-placeholder">★</div>`}
    </div>`;
}

function renderPerformerRecap() {
  const grid = $("performerRecapGrid");
  if (!grid) return;

  const contestants = contestantsCache;
  if (!contestants.length) {
    grid.innerHTML = `<div class="performer-empty-state">選手資料載入中...</div>`;
    return;
  }

  grid.innerHTML = contestants.map((contestant, index) => {
    const number = String(index + 1).padStart(2, "0");
    const photoUrl = getContestantPhoto(contestant);
    const songTitle = getContestantSong(contestant);

    return `
      <article class="performer-recap-card">
        <div class="performer-recap-photo">
          ${photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(contestant.name || contestant.stageName || "選手")}" />` : `<div class="performer-photo-placeholder">★</div>`}
        </div>
        <div class="performer-recap-info">
          <span>No. ${number}</span>
          <strong>${escapeHtml(contestant.name || contestant.stageName || "神秘歌手")}</strong>
          <p>A.K.A. ${escapeHtml(contestant.stageName || "—")}</p>
          <small>${escapeHtml(songTitle || "演唱曲目待補")}</small>
        </div>
      </article>`;
  }).join("");
}

function getContestantById(id) {
  if (!id) return null;
  return contestantsCache.find((contestant) => contestant.id === id) || null;
}

function getContestantPhoto(contestant) {
  return contestant?.photoUrl
    || contestant?.photoURL
    || contestant?.imageUrl
    || contestant?.imageURL
    || contestant?.photo
    || "";
}

function getContestantSong(contestant) {
  return contestant?.performanceItem
    || contestant?.songTitle
    || contestant?.songName
    || contestant?.song
    || "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sortContestants(a, b) {
  const orderA = typeof a.manualOrder === "number" ? a.manualOrder : 999;
  const orderB = typeof b.manualOrder === "number" ? b.manualOrder : 999;
  if (orderA !== orderB) return orderA - orderB;
  return (a.registerTime?.seconds || 0) - (b.registerTime?.seconds || 0);
}

ensurePerformerScreens();

if (db) {
  onSnapshot(doc(db, "settings", "finalResultControl"), (snapshot) => {
    const data = snapshot.exists() ? snapshot.data() : {};
    currentMode = data.mode || "";
    currentContestantId = data.contestantId || "";
    queueRender();
    setTimeout(queueRender, 100);
  });

  onSnapshot(collection(db, "contestants"), (snapshot) => {
    contestantsCache = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      contestantsCache.push({ id: docSnap.id, ...data });
    });
    contestantsCache.sort(sortContestants);
    queueRender();
  });
}

const observer = new MutationObserver(() => {
  if (currentMode === "performerIntro" || currentMode === "performerRecap") {
    queueRender();
  }
});
observer.observe(document.body, { childList: true, subtree: true });
