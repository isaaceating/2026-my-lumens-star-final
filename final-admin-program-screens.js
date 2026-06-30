import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBlj362N4O6ERqgFziQ4Gg9W7SEyquKb0g",
  authDomain: "my-lumens-star-2026.firebaseapp.com",
  projectId: "my-lumens-star-2026",
  storageBucket: "my-lumens-star-2026.firebasestorage.app",
  messagingSenderId: "150108062917",
  appId: "1:150108062917:web:f7284392bed27438041cac"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = (id) => document.getElementById(id);

const PROGRAM_SCREEN_BUTTONS = [
  {
    id: "setOpeningScreenButton",
    label: "正式開場畫面",
    mode: "opening",
    awardName: "決賽正式開始",
    displayMessage: "2026 My Lumens Star｜捷揚好聲音"
  },
  {
    id: "setJudgesIntroScreenButton",
    label: "評審介紹畫面",
    mode: "judgesIntro",
    awardName: "評審介紹",
    displayMessage: "今日評審"
  },
  {
    id: "setScoringRulesScreenButton",
    label: "評分規則畫面",
    mode: "scoringRules",
    awardName: "評分規則",
    displayMessage: "評審評分 40 分 + 觀眾投票 60 分 = 總成績 100 分"
  }
];

function ensureProgramScreenButtons() {
  const flowGroup = document.querySelector("#resultDisplayControl .result-control-group .result-control-actions");
  if (!flowGroup) return;

  PROGRAM_SCREEN_BUTTONS.slice().reverse().forEach((config) => {
    if ($(config.id)) return;

    const button = document.createElement("button");
    button.type = "button";
    button.id = config.id;
    button.className = "secondary-button";
    button.textContent = config.label;
    button.dataset.programScreenMode = config.mode;

    flowGroup.prepend(button);
  });
}

async function setProgramScreen(config) {
  const status = $("resultDisplayControlMessage");
  const user = auth.currentUser;

  if (!user) {
    if (status) status.textContent = "請先使用 Google Admin 帳號登入後再切換大螢幕畫面。";
    alert("請先使用 Google Admin 帳號登入。");
    return;
  }

  try {
    if (status) status.textContent = `正在切換到「${config.label}」...`;

    await setDoc(doc(db, "settings", "finalResultControl"), {
      mode: config.mode,
      awardName: config.awardName,
      contestantId: "",
      countdownStatus: "stopped",
      displayMessage: config.displayMessage,
      showLiveStats: false,
      updatedAt: serverTimestamp(),
      updatedBy: user.email || "",
      updatedByUid: user.uid
    }, { merge: true });

    if (status) status.textContent = `大螢幕已切換到「${config.label}」。`;
  } catch (error) {
    console.error("Set program screen failed:", error);
    if (status) status.textContent = `切換大螢幕畫面失敗：${error.message}`;
  }
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-program-screen-mode]");
  if (!button) return;

  event.preventDefault();
  const config = PROGRAM_SCREEN_BUTTONS.find((item) => item.mode === button.dataset.programScreenMode);
  if (!config) return;

  setProgramScreen(config);
});

ensureProgramScreenButtons();
const observer = new MutationObserver(ensureProgramScreenButtons);
observer.observe(document.body, { childList: true, subtree: true });
