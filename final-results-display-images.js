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

ensureFullImageScreen();

onSnapshot(doc(db, "settings", "finalResultControl"), (snapshot) => {
  const data = snapshot.exists() ? snapshot.data() : {};
  renderFullImage(data);
}, (error) => {
  console.error("Full image display snapshot failed:", error);
});