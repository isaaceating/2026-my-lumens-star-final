import { getApps } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const app = getApps()[0];
const db = app ? getFirestore(app) : null;
const $ = (id) => document.getElementById(id);

let currentMode = "";
let judges = [];
let renderQueued = false;
let lastRenderKey = "";

const PROGRAM_MODES = new Set(["opening", "judgesIntro", "scoringRules"]);

function ensureProgramScreenStyles() {
  if ($("programScreenStyles")) return;

  const style = document.createElement("style");
  style.id = "programScreenStyles";
  style.textContent = `
    .program-screen-stage {
      position: relative;
      min-height: min(780px, calc(100vh - 150px));
      display: grid;
      place-items: center;
      overflow: hidden;
      padding: clamp(28px, 4vw, 64px);
      border-radius: 34px;
      text-align: center;
      background:
        radial-gradient(circle at 50% 92%, rgba(255, 209, 102, 0.38), transparent 28%),
        radial-gradient(circle at 18% 16%, rgba(255, 209, 102, 0.24), transparent 30%),
        radial-gradient(circle at 82% 18%, rgba(139, 92, 246, 0.34), transparent 34%),
        linear-gradient(135deg, rgba(12, 9, 28, 0.98), rgba(27, 17, 63, 0.92) 52%, rgba(5, 7, 18, 0.98));
      border: 1px solid rgba(255, 209, 102, 0.28);
      box-shadow: 0 28px 90px rgba(0, 0, 0, 0.38);
      isolation: isolate;
    }

    .program-screen-stage::before,
    .program-screen-stage::after {
      content: "";
      position: absolute;
      inset: -20%;
      pointer-events: none;
      z-index: -1;
    }

    .program-screen-stage::before {
      background:
        linear-gradient(112deg, transparent 0 30%, rgba(255, 209, 102, 0.28) 44%, transparent 57% 100%),
        linear-gradient(68deg, transparent 0 36%, rgba(101, 227, 244, 0.16) 48%, transparent 62% 100%),
        radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.08), transparent 36%);
      animation: programLightSweep 8s ease-in-out infinite alternate;
    }

    .program-screen-stage::after {
      background-image:
        radial-gradient(circle, rgba(255, 209, 102, 0.92) 0 1px, transparent 2px),
        radial-gradient(circle, rgba(255, 255, 255, 0.72) 0 1px, transparent 2px);
      background-size: 78px 78px, 118px 118px;
      opacity: 0.36;
      animation: programSparkleDrift 16s linear infinite;
    }

    .program-logo-lockup {
      display: grid;
      gap: 0.15em;
      justify-items: center;
      margin-bottom: clamp(22px, 3vh, 42px);
      color: var(--color-gold);
      text-shadow: 0 10px 34px rgba(0, 0, 0, 0.52), 0 0 34px rgba(255, 209, 102, 0.3);
    }

    .program-logo-year { font-size: clamp(30px, 3.2vw, 60px); line-height: 1; font-weight: 1000; letter-spacing: 0.04em; }
    .program-logo-title { font-size: clamp(44px, 6vw, 104px); line-height: 0.95; font-weight: 1000; letter-spacing: -0.05em; }
    .program-logo-subtitle { color: #fff; font-size: clamp(34px, 4.2vw, 80px); line-height: 1.02; font-weight: 1000; letter-spacing: 0.08em; }
    .program-screen-kicker { margin: 0 0 clamp(12px, 1.4vh, 22px); color: rgba(255, 255, 255, 0.74); font-size: clamp(18px, 1.5vw, 28px); font-weight: 900; letter-spacing: 0.18em; text-transform: uppercase; }
    .program-main-title { margin: 0; color: var(--color-gold); font-size: clamp(70px, 9vw, 160px); line-height: 0.96; font-weight: 1000; letter-spacing: 0.02em; text-shadow: 0 12px 40px rgba(0, 0, 0, 0.46), 0 0 46px rgba(255, 209, 102, 0.26); }
    .program-main-subtitle { margin: clamp(12px, 1.5vh, 24px) 0 0; color: rgba(255, 255, 255, 0.86); font-size: clamp(24px, 2.5vw, 46px); line-height: 1.26; font-weight: 900; }
    .program-opening-orbit { width: min(920px, 76vw); height: clamp(16px, 1.6vw, 28px); margin: clamp(34px, 4vh, 60px) auto 0; border-radius: 999px; background: radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.9), rgba(255, 209, 102, 0.56) 18%, transparent 62%); box-shadow: 0 0 54px rgba(255, 209, 102, 0.56); }

    .judges-grid { width: min(1260px, 100%); display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: clamp(18px, 2vw, 30px); margin-top: clamp(28px, 4vh, 48px); }
    .judge-card { min-height: clamp(260px, 27vw, 380px); display: grid; grid-template-rows: 1fr auto; gap: 18px; padding: clamp(18px, 2vw, 28px); border-radius: 28px; background: radial-gradient(circle at 50% 10%, rgba(255, 209, 102, 0.18), transparent 42%), rgba(255, 255, 255, 0.09); border: 1px solid rgba(255, 209, 102, 0.34); box-shadow: 0 22px 64px rgba(0, 0, 0, 0.32); }
    .judge-avatar { display: grid; place-items: center; border-radius: 24px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12); color: var(--color-gold); font-size: clamp(70px, 6vw, 120px); font-weight: 1000; text-shadow: 0 0 34px rgba(255, 209, 102, 0.28); }
    .judge-card strong { display: block; color: #fff; font-size: clamp(28px, 2.4vw, 44px); line-height: 1.1; font-weight: 1000; }
    .judge-card span { display: block; margin-top: 8px; color: rgba(255, 209, 102, 0.92); font-size: clamp(16px, 1.4vw, 24px); font-weight: 900; letter-spacing: 0.08em; }

    .scoring-equation { width: min(1320px, 100%); display: grid; grid-template-columns: 1fr auto 1fr auto 1fr; align-items: center; gap: clamp(14px, 2vw, 28px); margin-top: clamp(24px, 3vh, 42px); }
    .scoring-card, .scoring-breakdown, .scoring-formula-card { border-radius: 28px; background: radial-gradient(circle at 20% 0%, rgba(255, 209, 102, 0.16), transparent 36%), rgba(255, 255, 255, 0.09); border: 1px solid rgba(255, 209, 102, 0.28); box-shadow: 0 22px 64px rgba(0, 0, 0, 0.3); }
    .scoring-card { padding: clamp(20px, 2.2vw, 34px); }
    .scoring-card span { display: block; color: #fff; font-size: clamp(24px, 2.2vw, 40px); font-weight: 1000; }
    .scoring-card strong { display: block; margin-top: 8px; color: var(--color-gold); font-size: clamp(58px, 6.6vw, 122px); line-height: 0.95; font-weight: 1000; }
    .scoring-symbol { color: var(--color-gold); font-size: clamp(44px, 5vw, 92px); line-height: 1; font-weight: 1000; }
    .scoring-detail-grid { width: min(1320px, 100%); display: grid; grid-template-columns: 0.92fr 1.08fr; gap: clamp(18px, 2vw, 32px); margin-top: clamp(22px, 3vh, 38px); }
    .scoring-breakdown, .scoring-formula-card { padding: clamp(22px, 2.4vw, 34px); text-align: left; }
    .scoring-breakdown h3, .scoring-formula-card h3 { margin: 0 0 16px; color: var(--color-gold); font-size: clamp(24px, 2vw, 36px); font-weight: 1000; }
    .scoring-row { display: flex; justify-content: space-between; gap: 18px; align-items: center; padding: clamp(12px, 1.4vw, 18px) 0; border-top: 1px solid rgba(255, 255, 255, 0.13); color: #fff; font-size: clamp(22px, 1.9vw, 34px); font-weight: 1000; }
    .scoring-row strong { color: var(--color-gold); font-size: clamp(30px, 2.8vw, 50px); }
    .scoring-formula-card p { margin: 0; color: #fff; font-size: clamp(24px, 2.2vw, 42px); line-height: 1.35; font-weight: 1000; }
    .scoring-formula-card small { display: block; margin-top: 18px; color: rgba(255, 255, 255, 0.72); font-size: clamp(16px, 1.3vw, 24px); line-height: 1.5; font-weight: 800; }

    @keyframes programLightSweep { from { transform: translateX(-4%) rotate(-1deg); opacity: 0.7; } to { transform: translateX(4%) rotate(1deg); opacity: 1; } }
    @keyframes programSparkleDrift { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(70px, 90px, 0); } }
    @media (max-width: 980px) { .scoring-equation, .scoring-detail-grid { grid-template-columns: 1fr; } .scoring-symbol { display: none; } }
  `;

  document.head.appendChild(style);
}

function ensureProgramScreens() {
  ensureProgramScreenStyles();
  const displayScreen = $("resultsDisplayScreen");
  if (!displayScreen) return;

  [
    ["openingScreen", "openingStage", "opening-program-stage"],
    ["judgesIntroScreen", "judgesIntroStage", "judges-program-stage"],
    ["scoringRulesScreen", "scoringRulesStage", "scoring-program-stage"]
  ].forEach(([screenId, stageId, stageClass]) => {
    if ($(screenId)) return;
    const screen = document.createElement("section");
    screen.id = screenId;
    screen.className = "results-mode-screen program-mode-screen hidden";
    screen.innerHTML = `<div id="${stageId}" class="program-screen-stage ${stageClass}"></div>`;
    displayScreen.appendChild(screen);
  });
}

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderProgramMode();
  });
}

function hideAllResultScreens() {
  document.querySelectorAll(".results-mode-screen").forEach((screen) => screen.classList.add("hidden"));
}

function setTopbar(title) {
  const mainTitle = $("resultsMainTitle");
  if (mainTitle) mainTitle.textContent = title;
  const badge = $("resultsStatusBadge");
  if (badge) {
    badge.classList.add("standby");
    badge.classList.remove("paused");
    badge.innerHTML = "<span></span>STANDBY";
  }
}

function getLogoLockup() {
  return `
    <div class="program-logo-lockup">
      <div class="program-logo-year">2026</div>
      <div class="program-logo-title">My Lumens Star</div>
      <div class="program-logo-subtitle">捷揚好聲音</div>
    </div>`;
}

function renderOpeningScreen() {
  const stage = $("openingStage");
  if (!stage) return;
  stage.innerHTML = `
    <div>
      ${getLogoLockup()}
      <p class="program-screen-kicker">Final Opening</p>
      <h2 class="program-main-title">決賽正式開始</h2>
      <p class="program-main-subtitle">唱出你的舞台，成為下一個 Lumens 之星</p>
      <div class="program-opening-orbit" aria-hidden="true"></div>
    </div>`;
}

function renderJudgesIntroScreen() {
  const stage = $("judgesIntroStage");
  if (!stage) return;
  const displayJudges = judges.length ? judges : [{ name: "評審 A" }, { name: "評審 B" }, { name: "評審 C" }, { name: "評審 D" }];
  stage.innerHTML = `
    <div>
      ${getLogoLockup()}
      <p class="program-screen-kicker">Judges</p>
      <h2 class="program-main-title">評審介紹</h2>
      <div class="judges-grid">
        ${displayJudges.map((judge, index) => `
          <article class="judge-card">
            <div class="judge-avatar">${index + 1}</div>
            <div><strong>${escapeHtml(judge.name || `評審 ${index + 1}`)}</strong><span>Judge</span></div>
          </article>`).join("")}
      </div>
    </div>`;
}

function renderScoringRulesScreen() {
  const stage = $("scoringRulesStage");
  if (!stage) return;
  stage.innerHTML = `
    <div>
      ${getLogoLockup()}
      <p class="program-screen-kicker">Scoring Rules</p>
      <h2 class="program-main-title">評分規則</h2>
      <div class="scoring-equation">
        <article class="scoring-card"><span>評審評分</span><strong>40 分</strong></article>
        <div class="scoring-symbol">+</div>
        <article class="scoring-card"><span>觀眾投票</span><strong>60 分</strong></article>
        <div class="scoring-symbol">=</div>
        <article class="scoring-card"><span>總成績</span><strong>100 分</strong></article>
      </div>
      <div class="scoring-detail-grid">
        <article class="scoring-breakdown">
          <h3>評審評分組成</h3>
          <div class="scoring-row"><span>聲音表現</span><strong>50%</strong></div>
          <div class="scoring-row"><span>舞台魅力</span><strong>30%</strong></div>
          <div class="scoring-row"><span>整體呈現</span><strong>20%</strong></div>
        </article>
        <article class="scoring-formula-card">
          <h3>觀眾投票計算方式</h3>
          <p>選手票數 ÷ 最高票選手票數 × 60</p>
          <small>每位員工限投 3 票，不可重複投給同一位參賽者。</small>
        </article>
      </div>
    </div>`;
}

function renderProgramMode() {
  ensureProgramScreens();
  if (!PROGRAM_MODES.has(currentMode)) {
    ["openingScreen", "judgesIntroScreen", "scoringRulesScreen"].forEach((id) => $(id)?.classList.add("hidden"));
    lastRenderKey = "";
    return;
  }

  const renderKey = `${currentMode}:${judges.map((judge) => judge.name).join("|")}`;
  if (renderKey === lastRenderKey) {
    hideAllResultScreens();
    getCurrentScreen()?.classList.remove("hidden");
    return;
  }
  lastRenderKey = renderKey;

  hideAllResultScreens();

  if (currentMode === "opening") {
    setTopbar("決賽正式開始");
    renderOpeningScreen();
    $("openingScreen")?.classList.remove("hidden");
    return;
  }
  if (currentMode === "judgesIntro") {
    setTopbar("評審介紹");
    renderJudgesIntroScreen();
    $("judgesIntroScreen")?.classList.remove("hidden");
    return;
  }
  if (currentMode === "scoringRules") {
    setTopbar("評分規則");
    renderScoringRulesScreen();
    $("scoringRulesScreen")?.classList.remove("hidden");
  }
}

function getCurrentScreen() {
  if (currentMode === "opening") return $("openingScreen");
  if (currentMode === "judgesIntro") return $("judgesIntroScreen");
  if (currentMode === "scoringRules") return $("scoringRulesScreen");
  return null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

ensureProgramScreens();

if (db) {
  onSnapshot(doc(db, "settings", "finalResultControl"), (snapshot) => {
    const data = snapshot.exists() ? snapshot.data() : {};
    currentMode = data.mode || "";
    queueRender();
    setTimeout(queueRender, 120);
  });

  onSnapshot(doc(db, "settings", "finalJudges"), (snapshot) => {
    const data = snapshot.exists() ? snapshot.data() : {};
    judges = Array.isArray(data.judges) ? data.judges.filter((judge) => judge && judge.name) : [];
    queueRender();
  });
}
