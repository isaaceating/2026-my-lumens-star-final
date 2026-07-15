import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBlj362N4O6ERqgFziQ4Gg9W7SEyquKb0g",
  authDomain: "my-lumens-star-2026.firebaseapp.com",
  projectId: "my-lumens-star-2026",
  storageBucket: "my-lumens-star-2026.firebasestorage.app",
  messagingSenderId: "150108062917",
  appId: "1:150108062917:web:f7284392bed27438041cac"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let resultControl = {
  mode: "preVotingStandby",
  countdownEndAt: null,
  countdownRemainingSeconds: 0,
  countdownStatus: "stopped",
  expectedRedCarpetVoters: 80,
  expectedFinalAudienceVoters: 80,
  showLiveStats: true,
  displayMessage: "請準備手機，等待主持人開放投票。",
  awardName: "",
  contestantId: ""
};

let contestantsCache = [];
let redCarpetVotesCache = [];
let finalAudienceLogsCache = [];
let finalAudienceSummaryCache = [];
let finalJudgesCache = [];
let judgeScoresCache = new Map();
let starScoutWinnersCache = null;
let countdownTimer = null;
let hasStartedSnapshots = false;

const $ = (id) => document.getElementById(id);
const resultsLoginScreen = $("resultsLoginScreen");
const resultsDisplayScreen = $("resultsDisplayScreen");
const resultsLoginButton = $("resultsLoginButton");
const resultsLoginMessage = $("resultsLoginMessage");
const resultsMainTitle = $("resultsMainTitle");
const resultsStatusBadge = $("resultsStatusBadge");
const preVotingStandbyScreen = $("preVotingStandbyScreen");
const liveVotingScreen = $("liveVotingScreen");
const beforeRevealStandbyScreen = $("beforeRevealStandbyScreen");
const intermissionScreen = $("intermissionScreen");
const awardRevealScreen = $("awardRevealScreen");
const preVotingMessageText = $("preVotingMessageText");
const beforeRevealMessageText = $("beforeRevealMessageText");
const intermissionMessageText = $("intermissionMessageText");
const voteQrImage = $("voteQrImage");
const voteUrlText = $("voteUrlText");
const countdownKicker = $("countdownKicker");
const countdownTitle = $("countdownTitle");
const countdownText = $("countdownText");
const countdownHintText = $("countdownHintText");
const liveStatsGrid = $("liveStatsGrid");
const liveProgressPanel = $("liveProgressPanel");
const liveRedCarpetTotalVotes = $("liveRedCarpetTotalVotes");
const liveFinalAudienceTotalVotes = $("liveFinalAudienceTotalVotes");
const liveFinalCompletedEmployees = $("liveFinalCompletedEmployees");
const liveFinalTopVotes = $("liveFinalTopVotes");
const liveUpdatedAtText = $("liveUpdatedAtText");
const redCarpetLiveBar = $("redCarpetLiveBar");
const finalAudienceLiveBar = $("finalAudienceLiveBar");
const awardRevealStage = $("awardRevealStage");
const awardRevealKicker = $("awardRevealKicker");
const awardRevealTitle = $("awardRevealTitle");
const awardRevealContent = $("awardRevealContent");

init();

function init() {
  setupVoteUrl();
  showDisplayScreen();

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      try {
        setLoginMessage("正在連線決賽即時資料...");
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Final display anonymous auth failed:", error);
        showLoginScreen(`即時資料連線失敗：${error.message}`);
      }
      return;
    }

    showDisplayScreen();

    if (!hasStartedSnapshots) {
      hasStartedSnapshots = true;
      startSnapshots();
    }
  });
}

function showLoginScreen(message) {
  resultsLoginScreen?.classList.remove("hidden");
  resultsDisplayScreen?.classList.add("hidden");
  setLoginMessage(message);
}

function showDisplayScreen() {
  resultsLoginScreen?.classList.add("hidden");
  resultsDisplayScreen?.classList.remove("hidden");
}

function startSnapshots() {
  onSnapshot(doc(db, "settings", "finalResultControl"), (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data();

      resultControl = {
        mode: data.mode || "preVotingStandby",
        countdownEndAt: data.countdownEndAt || null,
        countdownRemainingSeconds: Number(data.countdownRemainingSeconds || 0),
        countdownStatus: data.countdownStatus || "stopped",
        expectedRedCarpetVoters: Number(data.expectedRedCarpetVoters || data.expectedVoters || 80),
        expectedFinalAudienceVoters: Number(data.expectedFinalAudienceVoters || data.expectedVoters || 80),
        showLiveStats: data.showLiveStats !== false,
        displayMessage: data.displayMessage || "請掃描 QR Code 完成紅毯投票與決賽觀眾投票",
        awardName: data.awardName || "",
        contestantId: data.contestantId || ""
      };
    }

    renderMode();
    startCountdownTimer();
  });

  onSnapshot(collection(db, "contestants"), (snapshot) => {
    contestantsCache = [];
    snapshot.forEach((docSnap) => contestantsCache.push({ id: docSnap.id, ...docSnap.data() }));

    contestantsCache.sort((a, b) => {
      const orderA = typeof a.manualOrder === "number" ? a.manualOrder : 999;
      const orderB = typeof b.manualOrder === "number" ? b.manualOrder : 999;
      if (orderA !== orderB) return orderA - orderB;
      return (a.registerTime?.seconds || 0) - (b.registerTime?.seconds || 0);
    });

    renderLiveStats();
    renderMode();
  });

  onSnapshot(collection(db, "redCarpetVotes"), (snapshot) => {
    redCarpetVotesCache = [];
    snapshot.forEach((docSnap) => redCarpetVotesCache.push({ id: docSnap.id, ...docSnap.data() }));
    renderLiveStats();
    renderMode();
  });

  onSnapshot(collection(db, "finalAudienceVoteLogs"), (snapshot) => {
    finalAudienceLogsCache = [];
    snapshot.forEach((docSnap) => finalAudienceLogsCache.push({ id: docSnap.id, ...docSnap.data() }));
    renderLiveStats();
    renderMode();
  });

  onSnapshot(collection(db, "finalAudienceVoteSummary"), (snapshot) => {
    finalAudienceSummaryCache = [];
    snapshot.forEach((docSnap) => finalAudienceSummaryCache.push({ id: docSnap.id, ...docSnap.data() }));
    renderLiveStats();
  });

  onSnapshot(collection(db, "judgeScores"), (snapshot) => {
    judgeScoresCache = new Map();
    snapshot.forEach((docSnap) => judgeScoresCache.set(docSnap.id, { id: docSnap.id, ...docSnap.data() }));
    renderMode();
  });

  onSnapshot(doc(db, "settings", "finalJudges"), (snapshot) => {
    finalJudgesCache = snapshot.exists() && Array.isArray(snapshot.data().judges)
      ? snapshot.data().judges.filter((judge) => judge && judge.id && judge.name)
      : [];
    renderMode();
  });

  onSnapshot(doc(db, "settings", "starScoutWinners"), (snapshot) => {
    starScoutWinnersCache = snapshot.exists() ? snapshot.data() : null;
    renderMode();
  });
}

function renderMode() {
  const mode = resultControl.mode || "preVotingStandby";

  hideAllModeScreens();
  updateStatusBadge(mode);

  awardRevealStage?.classList.remove(
    "first-place-stage",
    "second-place-stage",
    "third-place-stage",
    "red-carpet-stage",
    "star-scout-stage",
    "star-scout-standby-stage",
    "all-winners-stage"
  );

  awardRevealKicker?.classList.remove("hidden");
  awardRevealTitle?.classList.remove("hidden");

  if (mode === "preVotingStandby") {
    setText(resultsMainTitle, "決賽投票即將開始");
    setText(preVotingMessageText, resultControl.displayMessage || "請準備手機，等待主持人開放投票。");
    preVotingStandbyScreen?.classList.remove("hidden");
    return;
  }

  if (mode === "liveVoting" || mode === "votingPaused") {
    setText(resultsMainTitle, mode === "votingPaused" ? "投票倒數暫停" : "決賽投票進行中");
    liveVotingScreen?.classList.remove("hidden");
    renderLiveStats();
    updateCountdown();
    return;
  }

  if (mode === "beforeRevealStandby" || mode === "standby") {
    setText(resultsMainTitle, "成績公布即將開始");
    setText(beforeRevealMessageText, resultControl.displayMessage || "請稍候，頒獎結果即將揭曉。");
    beforeRevealStandbyScreen?.classList.remove("hidden");
    return;
  }

  if (mode === "intermission") {
    setText(resultsMainTitle, "中場休息");
    setText(intermissionMessageText, resultControl.displayMessage || "請稍候，精彩節目即將繼續。");
    intermissionScreen?.classList.remove("hidden");
    return;
  }

  setText(resultsMainTitle, "決賽獎項公布");
  awardRevealScreen?.classList.remove("hidden");
  renderAward(mode);
}

function hideAllModeScreens() {
  [preVotingStandbyScreen, liveVotingScreen, beforeRevealStandbyScreen, intermissionScreen, awardRevealScreen]
    .forEach((screen) => screen?.classList.add("hidden"));
}

function updateStatusBadge(mode) {
  if (!resultsStatusBadge) return;

  const isLive = mode === "liveVoting";
  const isPaused = mode === "votingPaused";

  resultsStatusBadge.classList.toggle("paused", isPaused);
  resultsStatusBadge.classList.toggle("standby", !isLive && !isPaused);

  resultsStatusBadge.innerHTML = `<span></span>${isLive ? "LIVE" : isPaused ? "PAUSED" : "STANDBY"}`;
}

function renderAward(mode) {
  const modeMap = {
    redCarpetWinner: { title: "紅毯巨星造型獎", prize: "NT$1,500", metricLabel: "票數", className: "red-carpet-stage" },
    thirdPlace: { title: "第三名", prize: "NT$3,600", metricLabel: "總分", className: "third-place-stage" },
    secondPlace: { title: "第二名", prize: "NT$5,000", metricLabel: "總分", className: "second-place-stage" },
    firstPlace: { title: "第一名", prize: "NT$6,000", metricLabel: "總分", className: "first-place-stage" },
    starScoutStandby: { title: "最強星探獎", prize: "NT$500 × 7", className: "star-scout-standby-stage" },
    starScoutWinners: { title: "最強星探獎", prize: "NT$500 × 7", className: "star-scout-stage" },
    allWinners: { title: "", prize: "", className: "all-winners-stage" }
  };

  const config = modeMap[mode] || { title: resultControl.awardName || "獎項公布", prize: "", className: "" };

  if (config.className) {
    awardRevealStage?.classList.add(config.className);
  }

  setText(resultsMainTitle, mode === "allWinners" ? "得獎名單" : "決賽獎項公布");
  setText(awardRevealKicker, mode === "allWinners" ? "" : "Award Reveal");
  setText(awardRevealTitle, mode === "allWinners" ? "" : (resultControl.awardName || config.title));

  if (mode === "allWinners") {
    awardRevealKicker?.classList.add("hidden");
    awardRevealTitle?.classList.add("hidden");
  }

  if (mode === "redCarpetWinner") {
    return renderContestantAward(getAwardContestant(mode), config);
  }

  if (["firstPlace", "secondPlace", "thirdPlace"].includes(mode)) {
    return renderContestantAward(getAwardContestant(mode), config);
  }

  if (mode === "starScoutStandby") {
    return renderStarScoutStandby();
  }

  if (mode === "starScoutWinners") {
    return renderStarScoutWinners();
  }

  if (mode === "allWinners") {
    return renderAllWinners();
  }

  awardRevealContent.innerHTML = `<div class="award-suspense-text">即將揭曉</div>`;
}

function getAwardContestant(mode) {
  if (mode === "redCarpetWinner") {
    const ranked = getRankedContestants(getVoteCountMap(redCarpetVotesCache));

    return ranked.find((contestant) => contestant.id === resultControl.contestantId)
      || ranked.find((contestant) => contestant.voteCount > 0)
      || null;
  }

  if (["firstPlace", "secondPlace", "thirdPlace"].includes(mode)) {
    const rows = getFinalScoreRows();

    return rows.find((contestant) => contestant.id === resultControl.contestantId)
      || rows[getPlaceIndex(mode)]
      || null;
  }

  return getContestantById(resultControl.contestantId);
}

function getContestantPhoto(contestant) {
  return contestant?.photoUrl
    || contestant?.photoURL
    || contestant?.imageUrl
    || contestant?.imageURL
    || contestant?.photo
    || "";
}

function getContestantSong(contestant) {
  return contestant?.performanceItem
    || contestant?.songTitle
    || contestant?.songName
    || contestant?.song
    || "";
}

function renderFireworkLayer() {
  return `
    <div class="celebration-fireworks" aria-hidden="true">
      <i style="--x:10%;--y:20%;--s:1.15;--d:0s;"></i>
      <i style="--x:24%;--y:74%;--s:.86;--d:.5s;"></i>
      <i style="--x:42%;--y:16%;--s:1;--d:1s;"></i>
      <i style="--x:64%;--y:76%;--s:1.05;--d:.35s;"></i>
      <i style="--x:78%;--y:22%;--s:1.25;--d:1.45s;"></i>
      <i style="--x:90%;--y:62%;--s:.92;--d:.8s;"></i>
    </div>
    <div class="celebration-confetti" aria-hidden="true">
      ${Array.from({ length: 26 }).map((_, index) => `<span style="--i:${index};"></span>`).join("")}
    </div>
  `;
}

function renderContestantAward(contestant, config) {
  if (!contestant) {
    awardRevealContent.innerHTML = `<div class="award-suspense-text">資料準備中</div>`;
    return;
  }

  const photoUrl = getContestantPhoto(contestant);
  const songTitle = getContestantSong(contestant);

  const metricHtml = config.metricLabel === "票數"
    ? `<strong class="award-metric">${escapeHtml(config.metricLabel)} ${Number(contestant.voteCount || 0)} 票</strong>`
    : `<strong class="award-metric">${escapeHtml(config.metricLabel || "總分")} ${Number(contestant.totalScore || 0).toFixed(1)}</strong>`;

  awardRevealContent.innerHTML = `
    <div class="award-countdown-sequence" aria-hidden="true">
      <span>3</span>
      <span>2</span>
      <span>1</span>
    </div>

    <div class="award-reveal-card award-reveal-after-countdown">
      <div class="award-photo-wrap">
        ${photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(contestant.name || "得獎者")}" />` : `<div class="award-photo-placeholder">★</div>`}
      </div>

      <div class="award-info-wrap">
        <div class="award-place-label">${escapeHtml(config.title || resultControl.awardName || "得獎者")}</div>
        <div class="award-prize-label">${escapeHtml(config.prize || "")}</div>
        <h3>${escapeHtml(contestant.name || "未知選手")}</h3>
        <p>A.K.A. ${escapeHtml(contestant.stageName || "—")}</p>

        <div class="award-song-title">
          <span>演唱曲目</span>
          <strong>${escapeHtml(songTitle || "—")}</strong>
        </div>

        ${metricHtml}
      </div>
    </div>`;
}

function renderStarScoutStandby() {
  const champion = getFinalScoreRows()[0]
    || getContestantById(starScoutWinnersCache?.championContestantId)
    || getContestantById(resultControl.contestantId);

  const eligibleCount = Number(starScoutWinnersCache?.eligibleCount ?? getStarScoutCandidateCount(champion?.id));
  const drawCount = Math.min(7, eligibleCount);

  awardRevealContent.innerHTML = `
    <div class="star-scout-standby-panel animate-reveal">
      <div class="star-scout-standby-title">最強星探獎</div>
      <div class="star-scout-standby-grid">
        <div class="star-scout-standby-item">
          <span>第一名</span>
          <strong>${escapeHtml(champion?.name || starScoutWinnersCache?.championName || "—")}</strong>
          <p>A.K.A. ${escapeHtml(champion?.stageName || starScoutWinnersCache?.championStageName || "—")}</p>
        </div>
        <div class="star-scout-standby-item">
          <span>符合資格人數</span>
          <strong>${eligibleCount}</strong>
          <p>有投給第一名的觀眾</p>
        </div>
        <div class="star-scout-standby-item">
          <span>將抽出</span>
          <strong>${drawCount}</strong>
          <p>每位 NT$500</p>
        </div>
      </div>
    </div>`;
}

function getStarScoutCandidateCount(championContestantId) {
  if (!championContestantId) return 0;

  const employeeSet = new Set();

  finalAudienceLogsCache.forEach((log) => {
    if (log.contestantId !== championContestantId) return;
    if (log.employeeId) employeeSet.add(String(log.employeeId).trim());
  });

  return employeeSet.size;
}

function renderStarScoutWinners() {
  const winners = Array.isArray(starScoutWinnersCache?.winners)
    ? starScoutWinnersCache.winners
    : [];

  if (!winners.length) {
    return renderStarScoutStandby();
  }

  const championName =
    starScoutWinnersCache?.championName
    || getFinalScoreRows()[0]?.name
    || "第一名";

  const drawCount = Number(starScoutWinnersCache?.drawCount || winners.length || 7);

  awardRevealContent.innerHTML = `
    <div class="star-scout-wheel-reveal">
      <div class="star-scout-wheel-stage" aria-hidden="true">
        <div class="star-scout-wheel-orbit orbit-one">
          <i>★</i><i>♪</i><i>★</i><i>♪</i><i>★</i><i>♪</i><i>★</i><i>♪</i>
        </div>

        <div class="star-scout-wheel-orbit orbit-two">
          <i>01</i><i>08</i><i>15</i><i>23</i><i>31</i><i>42</i><i>55</i><i>68</i>
        </div>

        <div class="star-scout-wheel-core">
          <span>抽獎倒數</span>
          <strong class="star-scout-wheel-countdown">
            <b>3</b>
            <b>2</b>
            <b>1</b>
          </strong>
        </div>
      </div>

      <div class="star-scout-result-stage">
        <div class="star-scout-drawing-panel">
          <div class="star-scout-drawing-header">
            <strong>抽出${drawCount}位投給第一名「${escapeHtml(championName)}」｜每位 NT$500</strong>
          </div>

          <div class="star-scout-grid star-scout-grid-animated">
            ${winners.map((winner, index) => `
              <div class="star-scout-card" style="--delay:${index};">
                <span>Winner ${index + 1}</span>
                <strong>${escapeHtml(winner.employeeName || winner.employeeId || "—")}</strong>
                <p>${escapeHtml(winner.employeeDepartment || "—")}｜${escapeHtml(winner.employeeCompany || "—")}</p>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    </div>`;
}

function renderAllWinners() {
  const rows = getFinalScoreRows();
  const redCarpetWinner = getRedCarpetWinner();

  const winnerCards = [
    { label: "第一名", prize: "NT$6,000", contestant: rows[0], className: "winner-first" },
    { label: "第二名", prize: "NT$5,000", contestant: rows[1], className: "winner-second" },
    { label: "第三名", prize: "NT$3,600", contestant: rows[2], className: "winner-third" },
    { label: "紅毯巨星造型獎", prize: "NT$1,500", contestant: redCarpetWinner, className: "winner-red-carpet" }
  ];

  awardRevealContent.innerHTML = `
    <div class="all-winners-showcase">
      ${winnerCards.map((item, index) => {
        const photoUrl = getContestantPhoto(item.contestant);
        const songTitle = getContestantSong(item.contestant);

        const metric = item.label === "紅毯巨星造型獎"
          ? `${Number(item.contestant?.voteCount || 0)} 票`
          : `${Number(item.contestant?.totalScore || 0).toFixed(1)} 分`;

        return `
          <div class="all-winner-showcase-card ${item.className}" style="--delay:${index};">
            <div class="all-winner-photo">
              ${photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(item.contestant?.name || item.label)}" />` : `<div class="award-photo-placeholder">★</div>`}
            </div>

            <div class="all-winner-info">
              <span>${escapeHtml(item.label)}</span>
              <strong>${escapeHtml(item.contestant?.name || "—")}</strong>
              <p>A.K.A. ${escapeHtml(item.contestant?.stageName || "—")}</p>

              <div class="all-winner-song">
                <small>演唱曲目</small>
                <b>${escapeHtml(songTitle || "—")}</b>
              </div>

              <em>${escapeHtml(item.prize)}｜${escapeHtml(metric)}</em>
            </div>
          </div>`;
      }).join("")}
    </div>`;
}

function renderLiveStats() {
  const finalVoteCountMap = getVoteCountMap(finalAudienceLogsCache);
  const topFinalVotes = finalVoteCountMap.size ? Math.max(...Array.from(finalVoteCountMap.values())) : 0;
  const completedEmployees = finalAudienceSummaryCache.filter((item) => Number(item.usedVotes || 0) >= 3).length;
  const expectedRedCarpetVotes = Math.max(1, Number(resultControl.expectedRedCarpetVoters || resultControl.expectedVoters || 80));
  const expectedFinalAudienceVotes = Math.max(1, Number(resultControl.expectedFinalAudienceVoters || resultControl.expectedVoters || 80));
  const showLiveStats = resultControl.showLiveStats !== false;

  liveStatsGrid?.classList.toggle("hidden", !showLiveStats);
  liveProgressPanel?.classList.toggle("hidden", !showLiveStats);

  animateNumber(liveRedCarpetTotalVotes, redCarpetVotesCache.length);
  animateNumber(liveFinalAudienceTotalVotes, finalAudienceLogsCache.length);
  animateNumber(liveFinalCompletedEmployees, completedEmployees);
  animateNumber(liveFinalTopVotes, topFinalVotes);

  if (redCarpetLiveBar) {
    redCarpetLiveBar.style.width = `${Math.min((redCarpetVotesCache.length / expectedRedCarpetVotes) * 100, 100)}%`;
  }

  if (finalAudienceLiveBar) {
    finalAudienceLiveBar.style.width = `${Math.min((finalAudienceLogsCache.length / expectedFinalAudienceVotes) * 100, 100)}%`;
  }

  setText(
    liveUpdatedAtText,
    `即時更新：${new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
  );
}

function startCountdownTimer() {
  if (countdownTimer) clearInterval(countdownTimer);
  updateCountdown();
  countdownTimer = setInterval(updateCountdown, 1000);
}

function updateCountdown() {
  const mode = resultControl.mode || "preVotingStandby";
  const countdownStatus = resultControl.countdownStatus || "stopped";

  if (mode === "votingPaused" || countdownStatus === "paused") {
    const remainingSeconds = Math.max(0, Number(resultControl.countdownRemainingSeconds || 0));
    setText(countdownKicker, "Paused");
    setText(countdownTitle, "投票倒數暫停");
    setText(countdownText, formatSeconds(remainingSeconds));
    setText(countdownHintText, "投票倒數暫停中，請等待主持人指示");
    return;
  }

  const endDate = getCountdownEndDate();

  if (!endDate) {
    setText(countdownKicker, "Countdown");
    setText(countdownTitle, "投票倒數");
    setText(countdownText, "--:--");
    setText(countdownHintText, "請由後台開始投票倒數");
    return;
  }

  const remainingMs = endDate.getTime() - Date.now();

  if (remainingMs <= 0) {
    setText(countdownKicker, "Time Up");
    setText(countdownTitle, "投票時間結束");
    setText(countdownText, "00:00");
    setText(countdownHintText, "投票時間結束，請等待主持人公布結果");
    return;
  }

  const totalSeconds = Math.ceil(remainingMs / 1000);
  setText(countdownKicker, "Countdown");
  setText(countdownTitle, "投票倒數");
  setText(countdownText, formatSeconds(totalSeconds));
  setText(countdownHintText, resultControl.displayMessage || "請把握時間完成紅毯投票與決賽觀眾投票");
}

function getCountdownEndDate() {
  const value = resultControl.countdownEndAt;
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value.seconds) return new Date(value.seconds * 1000);
  return null;
}

function setupVoteUrl() {
  const voteUrl = new URL("final-vote.html", window.location.href).href;
  setText(voteUrlText, voteUrl);
  if (voteQrImage) {
    voteQrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=16&data=${encodeURIComponent(voteUrl)}`;
  }
}

function getVoteCountMap(votes) {
  const map = new Map();

  votes.forEach((vote) => {
    if (!vote.contestantId) return;
    map.set(vote.contestantId, (map.get(vote.contestantId) || 0) + 1);
  });

  return map;
}

function getRedCarpetWinner() {
  return getRankedContestants(getVoteCountMap(redCarpetVotesCache))
    .find((contestant) => contestant.voteCount > 0) || null;
}

function getFinalScoreRows() {
  const scoringContestants = contestantsCache.filter((contestant) => contestant.publishStatus === true);
  const finalVoteCountMap = getVoteCountMap(finalAudienceLogsCache);
  const topVotes = finalVoteCountMap.size ? Math.max(...Array.from(finalVoteCountMap.values())) : 0;

  return scoringContestants
    .map((contestant) => {
      const voteCount = finalVoteCountMap.get(contestant.id) || 0;
      const audienceScore = topVotes > 0 ? (voteCount / topVotes) * 60 : 0;
      const judgeCalculated = calculateJudgeScore(judgeScoresCache.get(contestant.id)?.scores || {});
      const totalScore = judgeCalculated.judgeScore + audienceScore;

      return {
        ...contestant,
        voteCount,
        audienceScore,
        judgeScore: judgeCalculated.judgeScore,
        totalScore
      };
    })
    .sort((a, b) => {
      const totalDiff = b.totalScore - a.totalScore;
      if (totalDiff !== 0) return totalDiff;

      const judgeDiff = b.judgeScore - a.judgeScore;
      if (judgeDiff !== 0) return judgeDiff;

      const voteDiff = b.voteCount - a.voteCount;
      if (voteDiff !== 0) return voteDiff;

      const orderA = typeof a.manualOrder === "number" ? a.manualOrder : 999;
      const orderB = typeof b.manualOrder === "number" ? b.manualOrder : 999;

      return orderA - orderB;
    });
}

function calculateJudgeScore(scores) {
  const validScores = finalJudgesCache.length
    ? finalJudgesCache.map((judge) => Number(scores?.[judge.id])).filter((score) => Number.isFinite(score) && score >= 1 && score <= 10)
    : Object.values(scores || {}).map((value) => Number(value)).filter((score) => Number.isFinite(score) && score >= 1 && score <= 10);

  if (!validScores.length) {
    return { judgeScore: 0 };
  }

  const average = validScores.reduce((sum, score) => sum + score, 0) / validScores.length;
  return { judgeScore: average * 4 };
}

function getRankedContestants(voteCountMap) {
  return [...contestantsCache]
    .map((contestant) => ({
      ...contestant,
      voteCount: voteCountMap.get(contestant.id) || 0
    }))
    .sort((a, b) => {
      const voteDiff = b.voteCount - a.voteCount;
      if (voteDiff !== 0) return voteDiff;

      const orderA = typeof a.manualOrder === "number" ? a.manualOrder : 999;
      const orderB = typeof b.manualOrder === "number" ? b.manualOrder : 999;

      return orderA - orderB;
    });
}

function getContestantById(id) {
  return contestantsCache.find((contestant) => contestant.id === id) || null;
}

function getPlaceIndex(mode) {
  if (mode === "firstPlace") return 0;
  if (mode === "secondPlace") return 1;
  if (mode === "thirdPlace") return 2;
  return 0;
}

function animateNumber(element, nextValue) {
  if (!element) return;

  const currentValue = Number(element.dataset.currentValue || element.textContent || 0);
  const targetValue = Number(nextValue || 0);

  element.dataset.currentValue = String(targetValue);

  if (currentValue === targetValue) {
    element.textContent = String(targetValue);
    return;
  }

  element.classList.remove("number-pop");
  void element.offsetWidth;
  element.classList.add("number-pop");
  element.textContent = String(targetValue);
}

function formatSeconds(totalSeconds) {
  const safeSeconds = Math.max(0, Number(totalSeconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function setLoginMessage(message) {
  setText(resultsLoginMessage, message);
}

function setText(element, value) {
  if (element) element.textContent = String(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

console.log("Final results page loaded.");
