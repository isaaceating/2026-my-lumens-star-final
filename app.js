import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";

import {
  getFirestore,
  collection,
  doc,
  getDoc,
  query,
  where,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBlj362N4O6ERqgFziQ4Gg9W7SEyquKb0g",
  authDomain: "my-lumens-star-2026.firebaseapp.com",
  projectId: "my-lumens-star-2026",
  storageBucket: "my-lumens-star-2026.firebasestorage.app",
  messagingSenderId: "150108062917",
  appId: "1:150108062917:web:f7284392bed27438041cac",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const EXPECT_VOTE_PAGE = "expect-vote.html";
const DEFAULT_EXPECT_VOTE_START = "2026/7/6";
const DEFAULT_EXPECT_VOTE_END = "2026/7/10";

const contestantsGrid = document.getElementById("contestantsGrid");
const totalExpectVotes = document.getElementById("totalExpectVotes");

const mobileMenuButton = document.getElementById("mobileMenuButton");
const navLinks = document.getElementById("navLinks");

const announcementModal = document.getElementById("announcementModal");
const closeAnnouncementButton = document.getElementById(
  "closeAnnouncementButton",
);
const hideAnnouncementTodayButton = document.getElementById(
  "hideAnnouncementTodayButton",
);
const announcementTitle = document.getElementById("announcementTitle");
const announcementContent = document.getElementById("announcementContent");
const announcementActionButton = document.getElementById(
  "announcementActionButton",
);

let homeContestantsCache = [];
let homeContestantRevealSettings = {
  isRevealed: false,
};

const MYSTERY_AVATARS = [
  {
    key: "mystery-01",
    label: "神秘歌手 01",
    icon: "♪",
    className: "avatar-gold",
  },
  {
    key: "mystery-02",
    label: "神秘歌手 02",
    icon: "★",
    className: "avatar-blue",
  },
  {
    key: "mystery-03",
    label: "神秘歌手 03",
    icon: "♬",
    className: "avatar-purple",
  },
  {
    key: "mystery-04",
    label: "神秘歌手 04",
    icon: "◆",
    className: "avatar-pink",
  },
  {
    key: "mystery-05",
    label: "神秘歌手 05",
    icon: "✦",
    className: "avatar-green",
  },
  {
    key: "mystery-06",
    label: "神秘歌手 06",
    icon: "●",
    className: "avatar-orange",
  },
  {
    key: "mystery-07",
    label: "神秘歌手 07",
    icon: "♩",
    className: "avatar-cyan",
  },
  {
    key: "mystery-08",
    label: "神秘歌手 08",
    icon: "✧",
    className: "avatar-red",
  },
];

init();

function init() {
  setupMobileNav();
  setupSmoothNavClose();
  listenToHomeContestantRevealSettings();
  listenToPublishedContestants();
  listenToTotalExpectVotes();
  loadAnnouncement();
}

function setupMobileNav() {
  if (!mobileMenuButton || !navLinks) return;

  mobileMenuButton.addEventListener("click", () => {
    navLinks.classList.toggle("open");
  });
}

function setupSmoothNavClose() {
  if (!navLinks) return;

  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("open");
    });
  });
}

function listenToHomeContestantRevealSettings() {
  const settingsRef = doc(db, "settings", "homeContestantReveal");

  onSnapshot(
    settingsRef,
    (snapshot) => {
      const data = snapshot.exists() ? snapshot.data() : {};
      homeContestantRevealSettings = {
        isRevealed: data.isRevealed === true,
      };
      renderContestants(homeContestantsCache);
    },
    (error) => {
      console.warn("Load home contestant reveal settings failed:", error);
      homeContestantRevealSettings = { isRevealed: false };
      renderContestants(homeContestantsCache);
    },
  );
}

function listenToPublishedContestants() {
  if (!contestantsGrid) return;

  contestantsGrid.innerHTML = `
    <p class="message">神秘歌手載入中...</p>
  `;

  const contestantsRef = collection(db, "contestants");
  const q = query(contestantsRef, where("publishStatus", "==", true));

  onSnapshot(
    q,
    (snapshot) => {
      const contestants = [];

      snapshot.forEach((docSnap) => {
        contestants.push({
          id: docSnap.id,
          ...docSnap.data(),
        });
      });

      contestants.sort((a, b) => {
        const orderA = typeof a.manualOrder === "number" ? a.manualOrder : 999;
        const orderB = typeof b.manualOrder === "number" ? b.manualOrder : 999;

        if (orderA !== orderB) return orderA - orderB;

        const timeA = a.registerTime?.seconds || 0;
        const timeB = b.registerTime?.seconds || 0;

        return timeA - timeB;
      });

      homeContestantsCache = contestants;
      renderContestants(contestants);
    },
    (error) => {
      console.error("Load contestants failed:", error);
      contestantsGrid.innerHTML = `
        <p class="message">選手資料讀取失敗，請稍後再試。</p>
      `;
    },
  );
}

function renderContestants(contestants) {
  if (!contestantsGrid) return;

  if (!contestants.length) {
    contestantsGrid.innerHTML = `
      <p class="message">目前尚無已公開的神秘歌手。</p>
    `;
    return;
  }

  const isRevealed = homeContestantRevealSettings.isRevealed === true;

  contestantsGrid.innerHTML = contestants
    .map((contestant, index) => {
      return isRevealed
        ? renderRevealedContestantCard(contestant, index)
        : renderMysteryContestantCard(contestant, index);
    })
    .join("");
}

function renderMysteryContestantCard(contestant, index) {
  const number = String(index + 1).padStart(2, "0");
  const stageName = contestant.stageName
    ? `A.K.A. ${escapeHtml(contestant.stageName)}`
    : "A.K.A. 神秘登場";

  const voteLink = `${EXPECT_VOTE_PAGE}?contestantId=${encodeURIComponent(contestant.id)}`;

  return `
    <article class="contestant-card mystery-contestant-card">
      ${renderMysteryMedia(contestant, index)}

      <div class="contestant-body">
        <div class="contestant-meta-row">
          <span class="contestant-number">No. ${number}</span>
          <span class="contestant-status">匿名登場</span>
        </div>

        <h3 class="contestant-name">???</h3>
        <h3 class="contestant-stage">${stageName}</h3>

        <p class="contestant-teaser">
          真實身份即將揭曉!
        </p>

        <a class="vote-link-button" href="${voteLink}">
          投給他 / 她
        </a>
      </div>
    </article>
  `;
}

function renderRevealedContestantCard(contestant, index) {
  const number = String(index + 1).padStart(2, "0");
  const name = contestant.name || contestant.stageName || "神秘歌手";
  const stageName = contestant.stageName || "—";
  const department = contestant.department || "—";
  const performanceItem = contestant.performanceItem || "—";

  return `
    <article class="contestant-card mystery-contestant-card is-revealed-contestant">
      ${renderRevealedMedia(contestant, index)}

      <div class="contestant-body">
        <div class="contestant-meta-row">
          <span class="contestant-number">No. ${number}</span>
          <span class="contestant-status">完整公布</span>
        </div>

        <h3 class="contestant-name">${escapeHtml(name)}</h3>
        <h3 class="contestant-stage">A.K.A. ${escapeHtml(stageName)}</h3>

        <div class="contestant-detail-list">
          <div>
            <span>部門</span>
            <strong>${escapeHtml(department)}</strong>
          </div>
          <div>
            <span>曲目</span>
            <strong>${escapeHtml(performanceItem)}</strong>
          </div>
        </div>

        <a class="vote-link-button" href="#timeline">
          決賽資訊
        </a>
      </div>
    </article>
  `;
}

function renderMysteryMedia(contestant, index) {
  const imageUrl = contestant.mysteryPhotoUrl || "";
  if (imageUrl) {
    return `
      <div class="mystery-avatar has-mystery-photo">
        <img class="mystery-photo-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(contestant.stageName || "神秘歌手")}" />
      </div>
    `;
  }

  const avatar = getMysteryAvatar(contestant, index);
  return `
    <div class="mystery-avatar ${avatar.className}" aria-label="${escapeHtml(avatar.label)}">
      <div class="mystery-avatar-glow"></div>
      <div class="mystery-avatar-head"></div>
      <div class="mystery-avatar-body"></div>
      <div class="mystery-avatar-badge">${escapeHtml(avatar.icon)}</div>
    </div>
  `;
}

function renderRevealedMedia(contestant, index) {
  const imageUrl = getContestantPhoto(contestant);
  if (imageUrl) {
    return `
      <div class="revealed-photo-frame">
        <img class="revealed-contestant-photo" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(contestant.name || contestant.stageName || "選手")}" />
      </div>
    `;
  }

  return renderMysteryMedia(contestant, index);
}

function getContestantPhoto(contestant) {
  return (
    contestant?.photoUrl ||
    contestant?.photoURL ||
    contestant?.imageUrl ||
    contestant?.imageURL ||
    contestant?.photo ||
    ""
  );
}

function getMysteryAvatar(contestant, index) {
  const selectedKey = contestant.mysteryAvatar || contestant.avatarKey || "";

  const matchedAvatar = MYSTERY_AVATARS.find(
    (avatar) => avatar.key === selectedKey,
  );
  if (matchedAvatar) return matchedAvatar;

  return MYSTERY_AVATARS[index % MYSTERY_AVATARS.length];
}

function listenToTotalExpectVotes() {
  const totalExpectVotes = document.getElementById("totalExpectVotes");
  if (!totalExpectVotes) return;

  const contestantsRef = collection(db, "contestants");

  onSnapshot(
    contestantsRef,
    (snapshot) => {
      let totalVotes = 0;

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        totalVotes += Number(data.expectVoteCount || 0);
      });

      totalExpectVotes.textContent = totalVotes;
    },
    (error) => {
      console.error("Load total expect votes failed:", error);
      totalExpectVotes.textContent = "—";
    },
  );
}

async function loadAnnouncement() {
  if (!announcementModal) return;

  const todayKey = getTaiwanDateString(new Date());
  const hiddenTodayKey = `myLumensStarAnnouncementHidden_${todayKey}`;

  if (localStorage.getItem(hiddenTodayKey) === "true") {
    return;
  }

  try {
    const announcementRef = doc(db, "settings", "announcement");
    const announcementSnap = await getDoc(announcementRef);

    if (!announcementSnap.exists()) {
      showDefaultAnnouncement();
      return;
    }

    const data = announcementSnap.data();

    if (data.enabled !== true) {
      return;
    }

    renderAnnouncement({
      title: data.title || "最期待歌手票選即將開放",
      content:
        data.content ||
        `7/6–7/10 開放全體員工票選，每人 3 票，選出你最期待登場的歌手！`,
      buttonText: data.buttonText || "查看票選資訊",
      buttonUrl: data.buttonUrl || "#expectVote",
    });
  } catch (error) {
    console.warn("Load announcement failed:", error);
    showDefaultAnnouncement();
  }
}

function showDefaultAnnouncement() {
  renderAnnouncement({
    title: "最期待歌手票選即將開放",
    content: `${DEFAULT_EXPECT_VOTE_START}–${DEFAULT_EXPECT_VOTE_END} 開放全體員工票選，每人 3 票，選出你最期待登場的歌手！`,
    buttonText: "查看票選資訊",
    buttonUrl: "#expectVote",
  });
}

function renderAnnouncement(config) {
  if (!announcementModal) return;

  announcementTitle.textContent = config.title || "";
  announcementContent.innerHTML = escapeHtml(config.content || "").replace(
    /\n/g,
    "<br>",
  );

  announcementActionButton.textContent = config.buttonText || "查看詳情";
  announcementActionButton.setAttribute("href", config.buttonUrl || "#");

  announcementModal.classList.remove("hidden");

  closeAnnouncementButton?.addEventListener("click", closeAnnouncement);
  hideAnnouncementTodayButton?.addEventListener("click", hideAnnouncementToday);
  announcementActionButton?.addEventListener("click", closeAnnouncement);

  announcementModal.addEventListener("click", (event) => {
    if (event.target === announcementModal) {
      closeAnnouncement();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAnnouncement();
    }
  });
}

function closeAnnouncement() {
  announcementModal?.classList.add("hidden");
}

function hideAnnouncementToday() {
  const todayKey = getTaiwanDateString(new Date());
  const hiddenTodayKey = `myLumensStarAnnouncementHidden_${todayKey}`;

  localStorage.setItem(hiddenTodayKey, "true");
  closeAnnouncement();
}

function getTaiwanDateString(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
