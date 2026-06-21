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

function bindCustomMessageButton(button) {
  if (!button || button.dataset.customMessageBound === "true") return;
  button.dataset.customMessageBound = "true";
  button.addEventListener("click", setCustomMessageDisplay);
}

function ensureCustomMessageControls() {
  const input = $("resultDisplayMessageInput");
  if (input) {
    input.placeholder = "請輸入臨時公告文字";
    input.value = input.value || "請稍候，現場流程調整中。";
    const label = input.closest("label");
    if (label && !label.dataset.customMessageRelabeled) {
      label.dataset.customMessageRelabeled = "true";
      const textNode = Array.from(label.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.includes("大螢幕提示文字"));
      if (textNode) textNode.textContent = "臨時公告文字\n";
    }
  }

  const existingButton = $("setCustomMessageButton");
  if (existingButton) {
    bindCustomMessageButton(existingButton);
    return;
  }

  const flowGroup = document.querySelector("#resultDisplayControl .result-control-group .result-control-actions");
  if (!flowGroup) return;

  const button = document.createElement("button");
  button.type = "button";
  button.id = "setCustomMessageButton";
  button.className = "secondary-button";
  button.textContent = "顯示臨時公告";
  bindCustomMessageButton(button);

  flowGroup.appendChild(button);
}

async function setCustomMessageDisplay() {
  const user = auth.currentUser;
  if (!user) {
    alert("請先使用 Google Admin 帳號登入。");
    return;
  }

  const message = normalizeText($("resultDisplayMessageInput")?.value || "");
  if (!message) {
    alert("請先輸入臨時公告文字。");
    return;
  }

  const status = $("resultDisplayControlMessage");
  try {
    if (status) status.textContent = "臨時公告寫入中...";
    await setDoc(doc(db, "settings", "finalResultControl"), {
      mode: "customMessage",
      awardName: "臨時公告",
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

ensureCustomMessageControls();
const observer = new MutationObserver(ensureCustomMessageControls);
observer.observe(document.body, { childList: true, subtree: true });
