import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

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
let currentDisplayMessage = "";
let applyQueued = false;

const flowCopy = {
  preVotingStandby: {
    topbarTitle: "投票準備中",
    html: `
      <span class="flow-standby-lead">請準備手機，等待主持人開放投票。</span>
      <span class="flow-vote-steps" aria-label="投票步驟">
        <span><b>01</b> 紅毯巨星造型獎</span>
        <span><b>02</b> 決賽觀眾投票</span>
      </span>
      <span class="flow-standby-note">投票開放後，請依現場指示完成兩種投票。</span>`
  },
  beforeRevealStandby: {
    topbarTitle: "成績公布即將開始",
    text: "請稍候，頒獎結果即將揭曉。"
  },
  intermission: {
    topbarTitle: "中場休息",
    text: "請稍候，精彩節目即將繼續。"
  },
  liveVoting: {
    countdownHint: "請把握時間完成紅毯投票與決賽觀眾投票"
  },
  votingPaused: {
    countdownHint: "投票倒數暫停中，請等待主持人指示"
  }
};

function setTextIfChanged(element, text) {
  if (element && element.textContent !== text) element.textContent = text;
}

function setHtmlIfChanged(element, html) {
  if (element && element.innerHTML.trim() !== html.trim()) element.innerHTML = html;
}

function ensureCustomMessageScreen() {
  if ($("customMessageScreen")) return $("customMessageScreen");

  const displayScreen = $("resultsDisplayScreen");
  if (!displayScreen) return null;

  const screen = document.createElement("section");
  screen.id = "customMessageScreen";
  screen.className = "results-mode-screen custom-message-screen hidden";
  screen.innerHTML = `
    <div class="results-standby-stage custom-message-stage">
      <h2>臨時公告</h2>
      <p id="customMessageText">請稍候，現場流程調整中。</p>
    </div>`;

  const awardRevealScreen = $("awardRevealScreen");
  displayScreen.insertBefore(screen, awardRevealScreen || null);
  return screen;
}

function hideStandardScreens() {
  [
    "preVotingStandbyScreen",
    "liveVotingScreen",
    "beforeRevealStandbyScreen",
    "intermissionScreen",
    "awardRevealScreen"
  ].forEach((id) => $(id)?.classList.add("hidden"));
}

function renderCustomMessage() {
  const screen = ensureCustomMessageScreen();
  if (!screen) return;

  hideStandardScreens();
  setTextIfChanged($("resultsMainTitle"), "臨時公告");

  const badge = $("resultsStatusBadge");
  if (badge) {
    badge.classList.add("standby");
    badge.classList.remove("paused");
    if (badge.innerHTML !== "<span></span>STANDBY") badge.innerHTML = "<span></span>STANDBY";
  }

  const text = currentDisplayMessage || "請稍候，現場流程調整中。";
  setTextIfChanged($("customMessageText"), text);
  screen.classList.remove("hidden");
}

function applyFixedFlowCopy() {
  applyQueued = false;
  ensureCustomMessageScreen();

  if (currentMode === "customMessage") {
    renderCustomMessage();
    return;
  }

  $("customMessageScreen")?.classList.add("hidden");

  if (currentMode === "preVotingStandby") {
    setTextIfChanged($("resultsMainTitle"), flowCopy.preVotingStandby.topbarTitle);

    const kicker = document.querySelector(".pre-voting-stage .section-kicker");
    if (kicker) kicker.classList.add("hidden");

    setHtmlIfChanged($("preVotingMessageText"), flowCopy.preVotingStandby.html);
  }

  if (currentMode === "beforeRevealStandby") {
    setTextIfChanged($("resultsMainTitle"), flowCopy.beforeRevealStandby.topbarTitle);
    setTextIfChanged($("beforeRevealMessageText"), flowCopy.beforeRevealStandby.text);
  }

  if (currentMode === "intermission") {
    setTextIfChanged($("resultsMainTitle"), flowCopy.intermission.topbarTitle);
    setTextIfChanged($("intermissionMessageText"), flowCopy.intermission.text);
  }

  if (currentMode === "liveVoting") {
    setTextIfChanged($("countdownHintText"), flowCopy.liveVoting.countdownHint);
  }

  if (currentMode === "votingPaused") {
    setTextIfChanged($("countdownHintText"), flowCopy.votingPaused.countdownHint);
  }
}

function queueApplyFixedFlowCopy() {
  if (applyQueued) return;
  applyQueued = true;
  requestAnimationFrame(applyFixedFlowCopy);
}

onSnapshot(doc(db, "settings", "finalResultControl"), (snapshot) => {
  const data = snapshot.exists() ? snapshot.data() : {};
  currentMode = data.mode || "preVotingStandby";
  currentDisplayMessage = data.displayMessage || "";
  queueApplyFixedFlowCopy();
  setTimeout(queueApplyFixedFlowCopy, 80);
});

const observer = new MutationObserver(queueApplyFixedFlowCopy);
observer.observe(document.body, { childList: true, subtree: true, characterData: true });

ensureCustomMessageScreen();
queueApplyFixedFlowCopy();
