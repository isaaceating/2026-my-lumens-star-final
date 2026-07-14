import { getApps } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore, collection, doc, getDocs, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const app = getApps()[0];
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const $ = (id) => document.getElementById(id);

let performerContestants = [];
let controlsReady = false;

function ensurePerformerControls() {
  if (controlsReady || $("performerDisplayControlGroup")) {
    controlsReady = true;
    return;
  }

  const resultControlCard = document.querySelector("#resultDisplayControl .result-control-card");
  if (!resultControlCard) return;

  const group = document.createElement("div");
  group.id = "performerDisplayControlGroup";
  group.className = "result-control-group performer-display-control-group";
  group.innerHTML = `
    <h3>選手演出畫面</h3>
    <p class="section-desc">
      每位歌手上場前顯示單人出場畫面；所有歌手演唱結束後，可顯示全選手回顧畫面。
    </p>
    <div class="performer-control-grid">
      <label>
        選擇出場選手
        <select id="performerIntroContestantSelect">
          <option value="">選手資料載入中...</option>
        </select>
      </label>
      <button type="button" id="previousPerformerButton" class="secondary-button">上一位</button>
      <button type="button" id="showPerformerIntroButton">顯示選手出場</button>
      <button type="button" id="nextPerformerButton" class="secondary-button">下一位</button>
      <button type="button" id="showPerformerRecapButton" class="secondary-button">顯示全選手回顧</button>
    </div>
    <p id="performerDisplayControlMessage" class="message"></p>`;

  resultControlCard.prepend(group);
  controlsReady = true;
  bindPerformerControlEvents();
  loadPerformerContestants();
}

function bindPerformerControlEvents() {
  $("showPerformerIntroButton")?.addEventListener("click", showPerformerIntro);
  $("showPerformerRecapButton")?.addEventListener("click", showPerformerRecap);
  $("previousPerformerButton")?.addEventListener("click", () => stepPerformer(-1));
  $("nextPerformerButton")?.addEventListener("click", () => stepPerformer(1));
  $("performerIntroContestantSelect")?.addEventListener("change", updatePerformerButtonLabel);
}

async function loadPerformerContestants() {
  const message = $("performerDisplayControlMessage");
  const select = $("performerIntroContestantSelect");

  if (!db) {
    if (message) message.textContent = "Firebase 尚未初始化，請重新整理頁面。";
    return;
  }

  try {
    if (message) message.textContent = "選手資料載入中...";
    const snapshot = await getDocs(collection(db, "contestants"));
    performerContestants = [];
    snapshot.forEach((docSnap) => performerContestants.push({ id: docSnap.id, ...docSnap.data() }));
    performerContestants.sort(sortContestants);

    if (select) {
      if (!performerContestants.length) {
        select.innerHTML = `<option value="">目前沒有選手資料</option>`;
      } else {
        select.innerHTML = performerContestants.map((contestant, index) => {
          const number = String(index + 1).padStart(2, "0");
          const name = contestant.name || contestant.stageName || "未命名選手";
          const stageName = contestant.stageName ? ` / A.K.A. ${contestant.stageName}` : "";
          return `<option value="${escapeHtml(contestant.id)}">No. ${number}｜${escapeHtml(name)}${escapeHtml(stageName)}</option>`;
        }).join("");
      }
    }

    updatePerformerButtonLabel();
    if (message) message.textContent = `已載入 ${performerContestants.length} 位選手。`;
  } catch (error) {
    console.error("Load performer contestants failed:", error);
    if (message) message.textContent = `選手資料載入失敗：${error.message}`;
  }
}

function getSelectedContestantIndex() {
  const selectedId = $("performerIntroContestantSelect")?.value || "";
  return performerContestants.findIndex((item) => item.id === selectedId);
}

function stepPerformer(direction) {
  const select = $("performerIntroContestantSelect");
  if (!select || !performerContestants.length) return;

  const currentIndex = getSelectedContestantIndex();
  const safeCurrentIndex = currentIndex < 0 ? 0 : currentIndex;
  const nextIndex = Math.min(
    performerContestants.length - 1,
    Math.max(0, safeCurrentIndex + direction),
  );
  select.value = performerContestants[nextIndex].id;
  updatePerformerButtonLabel();
}

function updatePerformerButtonLabel() {
  const button = $("showPerformerIntroButton");
  const previousButton = $("previousPerformerButton");
  const nextButton = $("nextPerformerButton");
  const selectedIndex = getSelectedContestantIndex();
  const contestant = performerContestants[selectedIndex];

  if (button) {
    button.textContent = contestant
      ? `顯示 No. ${String(selectedIndex + 1).padStart(2, "0")} ${contestant.stageName || contestant.name || "選手"}`
      : "顯示選手出場";
  }
  if (previousButton) previousButton.disabled = selectedIndex <= 0;
  if (nextButton) nextButton.disabled = selectedIndex < 0 || selectedIndex >= performerContestants.length - 1;
}

async function showPerformerIntro() {
  const message = $("performerDisplayControlMessage");
  const user = auth?.currentUser;
  const contestantId = $("performerIntroContestantSelect")?.value || performerContestants[0]?.id || "";

  if (!user) {
    alert("請先使用 Google Admin 帳號登入。");
    if (message) message.textContent = "請先登入後再控制大螢幕。";
    return;
  }

  if (!contestantId) {
    alert("請先選擇要顯示的選手。");
    if (message) message.textContent = "請先選擇要顯示的選手。";
    return;
  }

  await setDisplayMode({
    mode: "performerIntro",
    awardName: "選手即將登場",
    contestantId,
    displayMessage: "請掌聲歡迎下一位歌手登場。"
  });
}

async function showPerformerRecap() {
  const message = $("performerDisplayControlMessage");
  const user = auth?.currentUser;

  if (!user) {
    alert("請先使用 Google Admin 帳號登入。");
    if (message) message.textContent = "請先登入後再控制大螢幕。";
    return;
  }

  await setDisplayMode({
    mode: "performerRecap",
    awardName: "投票前歌手回顧",
    contestantId: "",
    displayMessage: "所有歌手演唱結束後，將依主持人指示開放投票。"
  });
}

async function setDisplayMode({ mode, awardName, contestantId, displayMessage }) {
  const message = $("performerDisplayControlMessage");
  const user = auth?.currentUser;

  if (!db || !user) return;

  try {
    if (message) message.textContent = "大螢幕狀態更新中...";
    await setDoc(doc(db, "settings", "finalResultControl"), {
      mode,
      awardName,
      contestantId,
      countdownStatus: "stopped",
      displayMessage,
      updatedAt: serverTimestamp(),
      updatedBy: user.email || "",
      updatedByUid: user.uid
    }, { merge: true });
    if (message) message.textContent = "大螢幕狀態已更新。";
  } catch (error) {
    console.error("Set performer display mode failed:", error);
    if (message) message.textContent = `大螢幕狀態更新失敗：${error.message}`;
  }
}

function sortContestants(a, b) {
  const orderA = typeof a.manualOrder === "number" ? a.manualOrder : 999;
  const orderB = typeof b.manualOrder === "number" ? b.manualOrder : 999;
  if (orderA !== orderB) return orderA - orderB;
  return (a.registerTime?.seconds || 0) - (b.registerTime?.seconds || 0);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

ensurePerformerControls();
const observer = new MutationObserver(ensurePerformerControls);
observer.observe(document.body, { childList: true, subtree: true });