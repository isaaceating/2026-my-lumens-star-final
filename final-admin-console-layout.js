function $(selector, root = document) {
  return root.querySelector(selector);
}

function buildConsoleNavigation() {
  const nav = $(".admin-anchor-nav");
  if (!nav || nav.dataset.consoleLayoutReady) return;

  nav.dataset.consoleLayoutReady = "true";
  nav.innerHTML = `
    <a href="#resultDisplayControl">現場大螢幕</a>
    <a href="#voteControls">投票控制</a>
    <a href="#judgeSettings">成績與評審</a>
    <a href="#voteDetails">投票資料</a>
    <a href="#voteReset">系統與重置</a>
  `;
}

function reorderConsoleSections() {
  const content = $("#finalAdminContent");
  const nav = $(".admin-anchor-nav", content || document);
  const display = $("#resultDisplayControl");
  const voteControls = $("#voteControls");
  const overview = $("#finalOverview");

  if (!content || !nav || !display || !voteControls || !overview) return;
  if (content.dataset.consoleSectionsReordered) return;

  nav.after(display);
  display.after(voteControls);
  voteControls.after(overview);
  content.dataset.consoleSectionsReordered = "true";
}

function relabelConsole() {
  const displayDescription = $("#resultDisplayControl .admin-section-header .section-desc");
  if (displayDescription) {
    displayDescription.textContent = "集中控制選手登場、投票與公告、流程圖片與影片、頒獎公布及抽獎畫面。";
  }

  const flowGroup = Array.from(document.querySelectorAll("#resultDisplayControl .result-control-group"))
    .find((group) => $("h3", group)?.textContent.trim() === "活動流程畫面");
  if (flowGroup) {
    $("h3", flowGroup).textContent = "投票與公告";
    flowGroup.classList.add("console-flow-control-group");
  }

  const mediaTitle = $("#displayImageControlPanel h3");
  if (mediaTitle) mediaTitle.textContent = "流程圖片與影片";

  const mediaDescription = $("#displayImageControlPanel .section-desc");
  if (mediaDescription) {
    mediaDescription.textContent = "管理決賽流程中需要滿版顯示的圖片或影片，選取後可一鍵切換到大螢幕。影片支援 MP4 / WebM。";
  }

  const voteTitle = $("#voteControls h2");
  if (voteTitle) voteTitle.textContent = "投票控制與即時狀態";

  const overviewTitle = $("#finalOverview h2");
  if (overviewTitle) overviewTitle.textContent = "即時投票總覽";

  const performerGroup = $("#performerDisplayControlGroup");
  const resultCard = $("#resultDisplayControl .result-control-card");
  const settings = $("#resultDisplayControl .result-control-settings-grid");
  if (performerGroup && resultCard && !performerGroup.dataset.consolePositioned) {
    resultCard.insertBefore(performerGroup, settings || resultCard.firstChild);
    performerGroup.dataset.consolePositioned = "true";
  }
}

function addConsoleStyles() {
  if ($("#finalAdminConsoleLayoutStyles")) return;
  const style = document.createElement("style");
  style.id = "finalAdminConsoleLayoutStyles";
  style.textContent = `
    #resultDisplayControl { scroll-margin-top: 96px; }
    .performer-display-control-group {
      border: 1px solid rgba(255, 205, 88, 0.35);
      background: linear-gradient(135deg, rgba(255, 205, 88, 0.10), rgba(255,255,255,0.025));
    }
    .performer-control-grid {
      display: grid;
      grid-template-columns: minmax(240px, 1fr) repeat(4, auto);
      gap: 10px;
      align-items: end;
    }
    .performer-control-grid label { min-width: 0; }
    .performer-control-grid select { width: 100%; }
    .console-flow-control-group { border-left: 3px solid rgba(255, 205, 88, 0.7); }
    #displayImageControlPanel { border-left: 3px solid rgba(105, 176, 255, 0.75); }
    .result-award-control-group { border-left: 3px solid rgba(255, 112, 112, 0.75); }
    @media (max-width: 980px) {
      .performer-control-grid { grid-template-columns: 1fr 1fr; }
      .performer-control-grid label { grid-column: 1 / -1; }
    }
    @media (max-width: 620px) {
      .performer-control-grid { grid-template-columns: 1fr; }
      .performer-control-grid label { grid-column: auto; }
    }
  `;
  document.head.appendChild(style);
}

function applyConsoleLayout() {
  buildConsoleNavigation();
  reorderConsoleSections();
  relabelConsole();
  addConsoleStyles();
}

applyConsoleLayout();
const observer = new MutationObserver(applyConsoleLayout);
observer.observe(document.body, { childList: true, subtree: true });
