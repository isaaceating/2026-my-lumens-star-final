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

document.addEventListener("click", (event) => {
  const button = event.target.closest("#setCustomMessageButton");
  if (!button) return;
  event.preventDefault();
  setCustomMessageDisplay();
});

ensureCustomMessageControls();
const observer = new MutationObserver(ensureCustomMessageControls);
observer.observe(document.body, { childList: true, subtree: true });

import("./final-admin-performer-entry.js");
import("./final-admin-tiebreaker-patch.js?v=tiebreak-20260630");
