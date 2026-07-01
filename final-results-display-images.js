import { getApps } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const app = getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
let unsubscribeFullImageSnapshot = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function ensureFullImageScreen() {
  let screen = document.getElementById("fullImageDisplayScreen");
  if (screen) return screen;

  screen = document.createElement("section");
  screen.id = "fullImageDisplayScreen";
  screen.className = "full-image-display-screen hidden";
  screen.innerHTML = `
    <img id="fullImageDisplayImage" src="" alt="滿版圖片" />
    <div id="fullImageDisplayLabel" class="full-image-display-label hidden"></div>
  `;
  document.body.appendChild(screen);
  return screen;
}

function renderFullImage(data = {}) {
  const screen = ensureFullImageScreen();
  const image = document.getElementById("fullImageDisplayImage");
  const label = document.getElementById("fullImageDisplayLabel");

  const shouldShow = data.mode === "fullImage" && Boolean(data.fullImageUrl);
  screen.classList.toggle("hidden", !shouldShow);
  document.body.classList.toggle("is-showing-full-image", shouldShow);

  if (!shouldShow) return;

  if (image) {
    image.src = data.fullImageUrl;
    image.alt = data.fullImageName || data.awardName || "滿版圖片";
  }

  const labelText = data.fullImageName || data.awardName || "";
  if (label) {
    label.classList.toggle("hidden", !labelText);
    label.innerHTML = labelText ? escapeHtml(labelText) : "";
  }
}

function startFullImageSnapshot() {
  if (unsubscribeFullImageSnapshot) return;
  unsubscribeFullImageSnapshot = onSnapshot(doc(db, "settings", "finalResultControl"), (snapshot) => {
    const data = snapshot.exists() ? snapshot.data() : {};
    renderFullImage(data);
  }, (error) => {
    console.error("Full image display snapshot failed:", error);
    unsubscribeFullImageSnapshot = null;
  });
}

ensureFullImageScreen();

onAuthStateChanged(auth, (user) => {
  if (!user || user.isAnonymous) {
    if (unsubscribeFullImageSnapshot) {
      unsubscribeFullImageSnapshot();
      unsubscribeFullImageSnapshot = null;
    }
    renderFullImage({});
    return;
  }
  startFullImageSnapshot();
});