const CONTESTANT_GRID_SELECTOR = "#contestantsGrid";
const ENHANCED_ATTR = "data-card-layout-enhanced";

initHomeCardLayoutEnhancer();

function initHomeCardLayoutEnhancer() {
  const grid = document.querySelector(CONTESTANT_GRID_SELECTOR);
  if (!grid) return;

  enhanceHomeContestantCards(grid);

  const observer = new MutationObserver(() => {
    enhanceHomeContestantCards(grid);
  });

  observer.observe(grid, {
    childList: true,
    subtree: true,
  });
}

function enhanceHomeContestantCards(grid) {
  grid.querySelectorAll(".contestant-card").forEach((card) => {
    if (card.getAttribute(ENHANCED_ATTR) === "true") return;

    if (card.classList.contains("is-revealed-contestant")) {
      enhanceRevealedCard(card);
    } else {
      enhanceMysteryCard(card);
    }

    card.setAttribute(ENHANCED_ATTR, "true");
  });
}

function enhanceMysteryCard(card) {
  const body = card.querySelector(".contestant-body");
  const status = card.querySelector(".contestant-status");
  const teaser = card.querySelector(".contestant-teaser");

  body?.classList.add("mystery-card-body");
  status && (status.textContent = "我是誰?");
  teaser?.remove();
}

function enhanceRevealedCard(card) {
  const body = card.querySelector(".contestant-body");
  const metaRow = card.querySelector(".contestant-meta-row");
  const status = card.querySelector(".contestant-status");
  const detailList = card.querySelector(".contestant-detail-list");
  const voteButton = card.querySelector(".vote-link-button");

  const department = getDetailValue(detailList, "部門");
  const performanceItem = getDetailValue(detailList, "曲目");

  body?.classList.add("revealed-card-body");
  status && (status.textContent = department || "部門");
  voteButton?.remove();

  if (!body || !detailList) return;

  const songCard = document.createElement("div");
  songCard.className = "revealed-song-card";
  songCard.innerHTML = `
    <span>演唱歌曲</span>
    <strong>${escapeHtml(performanceItem || "—")}</strong>
  `;

  detailList.replaceWith(songCard);
  metaRow?.classList.add("revealed-meta-row");
}

function getDetailValue(detailList, labelText) {
  if (!detailList) return "";

  const rows = Array.from(detailList.querySelectorAll("div"));
  const matchedRow = rows.find((row) => {
    const label = row.querySelector("span")?.textContent?.trim();
    return label === labelText;
  });

  return matchedRow?.querySelector("strong")?.textContent?.trim() || "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
