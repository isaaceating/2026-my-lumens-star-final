import { getApps } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const app = getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
let unsubscribeFullImageSnapshot = null;
let isAudioEnabled = false;
let lastVideoUrl = "";

function getFullMediaType(data = {}) {
  const explicitType = String(data.fullMediaType || data.mediaType || "").toLowerCase();
  if (explicitType === "video" || explicitType === "image") return explicitType;

  const contentType = String(data.fullImageContentType || data.contentType || "").toLowerCase();
  if (contentType.startsWith("video/")) return "video";
  return "image";
}

function ensureAudioButton() {
  let button = document.getElementById("fullMediaEnableAudioButton");
  if (button) return button;

  button = document.createElement("button");
  button.id = "fullMediaEnableAudioButton";
  button.type = "button";
  button.className = "full-media-audio-button";
  button.textContent = "啟用音訊";
  button.addEventListener("click", () => {
    isAudioEnabled = true;
    button.classList.add("hidden");
    const video = document.getElementById("fullMediaDisplayVideo");
    if (video && video.src) playVideo(video);
  });
  document.body.appendChild(button);
  return button;
}

function ensureFullImageScreen() {
  ensureAudioButton();

  let screen = document.getElementById("fullImageDisplayScreen");
  if (screen) return screen;

  screen = document.createElement("section");
  screen.id = "fullImageDisplayScreen";
  screen.className = "full-image-display-screen hidden";
  screen.innerHTML = `
    <img id="fullImageDisplayImage" src="" alt="滿版圖片" />
    <video id="fullMediaDisplayVideo" playsinline preload="auto"></video>
    <button type="button" id="fullMediaPlayOverlay" class="full-media-play-overlay hidden">
      <span>點擊播放影片聲音</span>
      <small>若剛重新整理大螢幕，請點此重新啟用音訊</small>
    </button>
  `;
  document.body.appendChild(screen);

  const overlay = document.getElementById("fullMediaPlayOverlay");
  overlay?.addEventListener("click", () => {
    isAudioEnabled = true;
    ensureAudioButton().classList.add("hidden");
    const video = document.getElementById("fullMediaDisplayVideo");
    if (video) playVideo(video);
  });

  return screen;
}

async function playVideo(video) {
  const overlay = document.getElementById("fullMediaPlayOverlay");
  if (!video) return;

  try {
    video.muted = false;
    video.volume = 1;
    await video.play();
    overlay?.classList.add("hidden");
  } catch (error) {
    console.error("Full media video play failed:", error);
    overlay?.classList.remove("hidden");
    ensureAudioButton().classList.remove("hidden");
  }
}

function stopVideo(video) {
  if (!video) return;
  video.pause();
  video.removeAttribute("src");
  video.load();
  lastVideoUrl = "";
}

function renderFullImage(data = {}) {
  const screen = ensureFullImageScreen();
  const image = document.getElementById("fullImageDisplayImage");
  const video = document.getElementById("fullMediaDisplayVideo");
  const overlay = document.getElementById("fullMediaPlayOverlay");
  const audioButton = ensureAudioButton();

  const mediaUrl = data.fullImageUrl || data.fullMediaUrl || "";
  const shouldShow = data.mode === "fullImage" && Boolean(mediaUrl);
  const mediaType = getFullMediaType(data);

  screen.classList.toggle("hidden", !shouldShow);
  document.body.classList.toggle("is-showing-full-image", shouldShow);
  audioButton.classList.toggle("hidden", isAudioEnabled);

  if (!shouldShow) {
    if (image) image.src = "";
    stopVideo(video);
    overlay?.classList.add("hidden");
    return;
  }

  if (mediaType === "video") {
    if (image) {
      image.src = "";
      image.classList.add("hidden");
    }
    if (video) {
      video.classList.remove("hidden");
      video.loop = Boolean(data.fullMediaLoop ?? data.videoLoop ?? false);
      video.controls = false;
      video.setAttribute("playsinline", "");

      if (lastVideoUrl !== mediaUrl) {
        lastVideoUrl = mediaUrl;
        video.src = mediaUrl;
        video.currentTime = 0;
        video.load();
      }

      if (isAudioEnabled) {
        playVideo(video);
      } else {
        overlay?.classList.remove("hidden");
      }
    }
    return;
  }

  stopVideo(video);
  overlay?.classList.add("hidden");
  if (video) video.classList.add("hidden");
  if (image) {
    image.classList.remove("hidden");
    image.src = mediaUrl;
    image.alt = data.fullImageName || data.awardName || "滿版圖片";
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
