import { getApps } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const app = getApps()[0];
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const SMART_RESUME_BUTTON_TEXT = "回到 / 繼續投票倒數";
const DEFAULT_COUNTDOWN_MESSAGE = "請掃描 QR Code 完成紅毯投票與決賽觀眾投票";

function $(id) {
  return document.getElementById(id);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function setText(element, value) {
  if (element) element.textContent = String(value);
}

function getTimestampDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value.seconds) return new Date(value.seconds * 1000);
  return null;
}

function getNumberFromInput(id, fallback) {
  const value = Number($(id)?.value || fallback);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function getCountdownDisplayMessage(data) {
  const formMessage = normalizeText($("resultDisplayMessageInput")?.value || "");

  if (data.mode === "customMessage" || data.mode === "performerRecap" || data.mode === "performerIntro") {
    return formMessage || DEFAULT_COUNTDOWN_MESSAGE;
  }

  return data.displayMessage || formMessage || DEFAULT_COUNTDOWN_MESSAGE;
}

function updateResumeButtonText() {
  const button = $("resumeVotingCountdownButton");
  if (button) button.textContent = SMART_RESUME_BUTTON_TEXT;
}

async function smartResumeVotingCountdown(event) {
  const button = event.target.closest("#resumeVotingCountdownButton");
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const status = $("resultDisplayControlMessage");
  const user = auth?.currentUser;

  if (!db) {
    setText(status, "Firebase 尚未初始化，請重新整理頁面後再試。");
    return;
  }

  if (!user) {
    alert("請先使用 Google Admin 帳號登入。");
    setText(status, "請先登入後再回到投票倒數。");
    return;
  }

  try {
    button.disabled = true;
    setText(status, "正在回到投票倒數畫面...");

    const snap = await getDoc(doc(db, "settings", "finalResultControl"));
    const data = snap.exists() ? snap.data() : {};
    const endDate = getTimestampDate(data.countdownEndAt);
    const isPaused = data.countdownStatus === "paused" || data.mode === "votingPaused";

    let countdownEndAt = data.countdownEndAt || null;
    let remainingSeconds = 0;

    if (isPaused) {
      remainingSeconds = Math.max(0, Number(data.countdownRemainingSeconds || 0));

      if (!remainingSeconds) {
        setText(status, "目前沒有可繼續的倒數秒數，請重新開始投票倒數。");
        return;
      }

      countdownEndAt = Timestamp.fromDate(new Date(Date.now() + remainingSeconds * 1000));
    } else if (endDate) {
      remainingSeconds = Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / 1000));
    } else {
      setText(status, "目前沒有原本的倒數結束時間，請重新開始投票倒數。");
      return;
    }

    await setDoc(doc(db, "settings", "finalResultControl"), {
      mode: "liveVoting",
      awardName: "決賽投票進行中",
      contestantId: "",
      countdownEndAt,
      countdownRemainingSeconds: remainingSeconds,
      countdownStatus: "running",
      expectedRedCarpetVoters: Number(data.expectedRedCarpetVoters || data.expectedVoters || getNumberFromInput("resultExpectedRedCarpetVotersInput", 80)),
      expectedFinalAudienceVoters: Number(data.expectedFinalAudienceVoters || data.expectedVoters || getNumberFromInput("resultExpectedFinalAudienceVotersInput", 80)),
      showLiveStats: data.showLiveStats !== false,
      displayMessage: getCountdownDisplayMessage(data),
      updatedAt: serverTimestamp(),
      updatedBy: user.email || "",
      updatedByUid: user.uid
    }, { merge: true });

    setText(status, "已回到投票倒數畫面。");
  } catch (error) {
    console.error("Smart resume voting countdown failed:", error);
    setText(status, `回到倒數失敗：${error.message}`);
  } finally {
    button.disabled = false;
  }
}

updateResumeButtonText();
document.addEventListener("click", smartResumeVotingCountdown, true);
const observer = new MutationObserver(updateResumeButtonText);
observer.observe(document.body, { childList: true, subtree: true });
