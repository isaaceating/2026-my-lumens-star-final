import { getApps } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, setDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const app = getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const $ = (id) => document.getElementById(id);

function normalizeText(value) {
  return String(value || "").trim();
}

function ensureCustomMessageTitleInput(messageInput) {
  if (!messageInput || $("resultDisplayMessageTitleInput")) return;

  const messageLabel = messageInput.closest("label");
  if (!messageLabel) return;

  const titleLabel = document.createElement("label");
  titleLabel.className = "result-message-label";
  titleLabel.textContent = "臨時公告主標題\n";

  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.id = "resultDisplayMessageTitleInput";
  titleInput.value = "臨時公告";
  titleInput.placeholder = "請輸入臨時公告主標題";

  titleLabel.appendChild(titleInput);
  messageLabel.parentNode.insertBefore(titleLabel, messageLabel);
}

function ensureCustomMessageControls() {
  const input = $("resultDisplayMessageInput");
  if (input) {
    ensureCustomMessageTitleInput(input);
    input.placeholder = "請輸入臨時公告內容";
    input.value = input.value || "請稍候，現場流程調整中。";
    const label = input.closest("label");
    if (label && !label.dataset.customMessageRelabeled) {
      label.dataset.customMessageRelabeled = "true";
      const textNode = Array.from(label.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.includes("臨時公告文字"));
      if (textNode) textNode.textContent = "臨時公告內容\n";
    }
  }

  if ($("setCustomMessageButton")) return;

  const flowGroup = document.querySelector("#resultDisplayControl .result-control-group .result-control-actions");
  if (!flowGroup) return;

  const button = document.createElement("button");
  button.type = "button";
  button.id = "setCustomMessageButton";
  button.className = "secondary-button";
  button.textContent = "顯示臨時公告";

  flowGroup.appendChild(button);
}

async function setCustomMessageDisplay() {
  const status = $("resultDisplayControlMessage");

  if (status) status.textContent = "臨時公告按鈕已觸發，正在檢查登入狀態...";

  const user = auth.currentUser;
  if (!user) {
    if (status) status.textContent = "請先使用 Google Admin 帳號登入後再顯示臨時公告。";
    alert("請先使用 Google Admin 帳號登入。");
    return;
  }

  const customMessageTitle = normalizeText($("resultDisplayMessageTitleInput")?.value || "臨時公告") || "臨時公告";
  const message = normalizeText($("resultDisplayMessageInput")?.value || "");
  if (!message) {
    if (status) status.textContent = "請先輸入臨時公告內容。";
    alert("請先輸入臨時公告內容。");
    return;
  }

  try {
    if (status) status.textContent = "臨時公告寫入中...";
    await setDoc(doc(db, "settings", "finalResultControl"), {
      mode: "customMessage",
      awardName: customMessageTitle,
      customMessageTitle,
      contestantId: "",
      countdownStatus: "stopped",
      displayMessage: message,
      updatedAt: serverTimestamp(),
      updatedBy: user.email || "",
      updatedByUid: user.uid
    }, { merge: true });
    if (status) status.textContent = "臨時公告已顯示在大螢幕。";
  } catch (error) {
    console.error("Set custom message failed:", error);
    if (status) status.textContent = `臨時公告顯示失敗：${error.message}`;
  }
}

async function isCurrentUserAdmin(user) {
  if (!user || user.isAnonymous) return false;
  const adminSnap = await getDoc(doc(db, "admins", user.uid));
  return adminSnap.exists() && adminSnap.data().role === "admin";
}

function getContestantLabel(input) {
  const row = input.closest("tr");
  const name = normalizeText(row?.querySelector("td strong")?.textContent || "未知選手");
  const aka = normalizeText(row?.querySelector("td:nth-child(2)")?.textContent || "").replace(/^A\.K\.A\.\s*/i, "");
  return aka ? `${name} / A.K.A. ${aka}` : name;
}

function collectJudgeScoreRowsFromInputs() {
  const inputs = Array.from(document.querySelectorAll("#judgeScoreTableBody .judge-score-input"));
  const rowsByContestant = new Map();

  for (const input of inputs) {
    const contestantId = input.dataset.contestantId;
    const judgeId = input.dataset.judgeId;
    if (!contestantId || !judgeId) continue;

    if (!rowsByContestant.has(contestantId)) {
      rowsByContestant.set(contestantId, {
        contestantId,
        contestantLabel: getContestantLabel(input),
        scores: {}
      });
    }

    const rawValue = normalizeText(input.value);
    if (!rawValue) continue;

    const score = Number(rawValue);
    if (!Number.isFinite(score) || score < 1 || score > 10) {
      return {
        error: `「${getContestantLabel(input)}」的評審分數必須是 1 到 10 之間的數字，可輸入小數。`,
        input
      };
    }

    rowsByContestant.get(contestantId).scores[judgeId] = score;
  }

  return { rows: Array.from(rowsByContestant.values()) };
}

async function saveAllJudgeScoresBatch() {
  const message = $("judgeScoreMessage");
  const button = $("saveAllJudgeScoresButton");
  const user = auth.currentUser;

  if (!user) {
    alert("請先使用 Google Admin 帳號登入。");
    return;
  }

  try {
    if (!(await isCurrentUserAdmin(user))) {
      alert("此帳號沒有管理員權限。");
      return;
    }
  } catch (error) {
    if (message) message.textContent = `管理員驗證失敗：${error.message}`;
    return;
  }

  const { rows, error, input } = collectJudgeScoreRowsFromInputs();
  if (error) {
    if (message) message.textContent = error;
    input?.focus();
    return;
  }

  if (!rows?.length) {
    if (message) message.textContent = "目前沒有可儲存的評審分數欄位。";
    return;
  }

  try {
    if (button) {
      button.disabled = true;
      button.dataset.originalText = button.dataset.originalText || button.textContent || "儲存全部分數";
      button.textContent = "全部分數儲存中...";
    }
    if (message) message.textContent = "全部評審分數驗證完成，正在一次儲存...";

    const batch = writeBatch(db);
    rows.forEach((row) => {
      batch.set(doc(collection(db, "judgeScores"), row.contestantId), {
        contestantId: row.contestantId,
        scores: row.scores,
        updatedAt: serverTimestamp(),
        updatedBy: user.email || "",
        updatedByUid: user.uid
      });
    });
    await batch.commit();

    if (message) message.textContent = `全部評審分數已儲存，共更新 ${rows.length} 位選手。`;
    $("refreshFinalAdminDataButton")?.click();
    setTimeout(() => {
      if (message) message.textContent = `全部評審分數已儲存，共更新 ${rows.length} 位選手。`;
    }, 500);
  } catch (error) {
    console.error("Save all judge scores failed:", error);
    if (message) message.textContent = `全部評審分數儲存失敗：${error.message}`;
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = button.dataset.originalText || "儲存全部分數";
    }
  }
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("#saveAllJudgeScoresButton");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  saveAllJudgeScoresBatch();
}, true);

document.addEventListener("click", (event) => {
  const button = event.target.closest("#setCustomMessageButton");
  if (!button) return;
  event.preventDefault();
  setCustomMessageDisplay();
});

ensureCustomMessageControls();
const observer = new MutationObserver(ensureCustomMessageControls);
observer.observe(document.body, { childList: true, subtree: true });

import("./final-admin-display-images.js?v=display-images-20260701");
import("./final-admin-program-screens.js?v=program-screens-20260630");
import("./final-admin-performer-entry.js");
import("./final-admin-tiebreaker-patch.js?v=tiebreak-20260630");
import("./final-admin-star-scout-fix.js?v=star-scout-fix-20260630");
import("./final-admin-smart-countdown.js?v=smart-countdown-20260630");