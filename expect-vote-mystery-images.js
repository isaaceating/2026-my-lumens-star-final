import { getApps } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const app = getApps()[0];
const db = app ? getFirestore(app) : null;
const mysteryImageMap = new Map();
let renderQueued = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function queueApplyMysteryImages() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    applyMysteryImages();
  });
}

function applyMysteryImages() {
  document.querySelectorAll(".expect-vote-select-button[data-id]").forEach((button) => {
    const contestantId = button.dataset.id || "";
    const contestant = mysteryImageMap.get(contestantId);
    const imageUrl = contestant?.mysteryPhotoUrl || "";
    if (!imageUrl) return;

    const currentImage = button.querySelector(".mystery-photo-image");
    if (currentImage?.getAttribute("src") === imageUrl) return;

    const avatar = button.querySelector(".mystery-avatar");
    if (!avatar) return;

    avatar.classList.add("has-mystery-photo");
    avatar.innerHTML = `
      <img class="mystery-photo-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(contestant?.stageName || "神秘歌手")}" />
    `;
  });
}

if (db) {
  onSnapshot(collection(db, "contestants"), (snapshot) => {
    mysteryImageMap.clear();
    snapshot.forEach((docSnap) => {
      mysteryImageMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
    });
    queueApplyMysteryImages();
  }, (error) => {
    console.error("Load mystery images for expect vote failed:", error);
  });
}

const observer = new MutationObserver(queueApplyMysteryImages);
observer.observe(document.body, { childList: true, subtree: true });
queueApplyMysteryImages();
