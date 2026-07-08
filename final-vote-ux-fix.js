// Final vote UX helper
// Keeps the original Firebase voting logic untouched.
// This layer improves sticky visibility for selected contestants and submit buttons.

const stickyBar = document.createElement("div");
stickyBar.className = "final-vote-sticky-submit";
stickyBar.setAttribute("aria-live", "polite");
stickyBar.innerHTML = `
  <div class="final-vote-sticky-info">
    <span id="finalVoteStickyLabel">目前選擇</span>
    <strong id="finalVoteStickySelection">尚未選擇</strong>
  </div>
  <button type="button" id="finalVoteStickyButton" disabled>送出投票</button>
`;

document.body.appendChild(stickyBar);

const stickyLabel = document.getElementById("finalVoteStickyLabel");
const stickySelection = document.getElementById("finalVoteStickySelection");
const stickyButton = document.getElementById("finalVoteStickyButton");

const redCarpetStatusText = document.getElementById("redCarpetVoteStatusText");
const finalAudienceStatusText = document.getElementById("finalAudienceVoteStatusText");
const selectedRedCarpetText = document.getElementById("selectedRedCarpetContestantText");
const selectedFinalAudienceText = document.getElementById("selectedFinalAudienceContestantText");
const submitRedCarpetButton = document.getElementById("submitRedCarpetVoteButton");
const submitFinalAudienceButton = document.getElementById("submitFinalAudienceVoteButton");
const employeeIdInput = document.getElementById("employeeIdInput");
const finalAudienceVoteSection = document.getElementById("finalAudienceVoteSection");

let currentStickyMode = "redCarpet";
let isWaitingForRedCarpetScroll = false;

stickyButton?.addEventListener("click", () => {
  const targetButton = currentStickyMode === "finalAudience"
    ? submitFinalAudienceButton
    : submitRedCarpetButton;

  if (!targetButton || targetButton.disabled) return;

  const shouldScrollToFinalAudience = currentStickyMode === "redCarpet";

  targetButton.click();

  if (shouldScrollToFinalAudience) {
    waitForRedCarpetVoteThenScroll();
  }

  window.setTimeout(updateStickyBar, 250);
  window.setTimeout(updateStickyBar, 900);
});

submitRedCarpetButton?.addEventListener("click", () => {
  waitForRedCarpetVoteThenScroll();
});

function updateStickyBar() {
  if (!stickyBar || !stickyLabel || !stickySelection || !stickyButton) return;

  const hasEmployeeInput = Boolean((employeeIdInput?.value || "").trim());

  if (!hasEmployeeInput) {
    stickyBar.classList.remove("is-visible");
    return;
  }

  const redStatus = redCarpetStatusText?.textContent || "";
  const finalStatus = finalAudienceStatusText?.textContent || "";
  const redDone = redStatus.includes("已投票");
  const finalDone = finalStatus.includes("已投滿");

  if (!redDone) {
    currentStickyMode = "redCarpet";
    const selectedText = selectedRedCarpetText?.textContent?.trim() || "尚未選擇";

    stickyLabel.textContent = "紅毯巨星造型獎";
    stickySelection.textContent = selectedText;
    stickyButton.textContent = "送出紅毯";
    stickyButton.disabled = Boolean(submitRedCarpetButton?.disabled);
    stickyBar.classList.add("is-visible");
    return;
  }

  if (!finalDone) {
    currentStickyMode = "finalAudience";
    const selectedText = selectedFinalAudienceText?.textContent?.trim() || "尚未選擇，請選滿 3 位";

    stickyLabel.textContent = "決賽觀眾投票";
    stickySelection.textContent = selectedText;
    stickyButton.textContent = "送出決賽";
    stickyButton.disabled = Boolean(submitFinalAudienceButton?.disabled);
    stickyBar.classList.add("is-visible");
    return;
  }

  stickyBar.classList.remove("is-visible");
}

function waitForRedCarpetVoteThenScroll() {
  if (isWaitingForRedCarpetScroll || !finalAudienceVoteSection) return;

  isWaitingForRedCarpetScroll = true;

  let attempts = 0;
  const maxAttempts = 24;

  const timer = window.setInterval(() => {
    attempts += 1;
    updateStickyBar();

    const redStatus = redCarpetStatusText?.textContent || "";
    const redDone = redStatus.includes("已投票");

    if (redDone) {
      window.clearInterval(timer);
      isWaitingForRedCarpetScroll = false;
      scrollToFinalAudienceVote();
      return;
    }

    if (attempts >= maxAttempts) {
      window.clearInterval(timer);
      isWaitingForRedCarpetScroll = false;
    }
  }, 250);
}

function scrollToFinalAudienceVote() {
  if (!finalAudienceVoteSection) return;

  const navOffset = 88;
  const targetY = finalAudienceVoteSection.getBoundingClientRect().top + window.scrollY - navOffset;

  window.scrollTo({
    top: Math.max(targetY, 0),
    behavior: "smooth"
  });

  if (history.replaceState) {
    history.replaceState(null, "", "#finalAudienceVoteSection");
  }
}

function observeVotePage() {
  const observer = new MutationObserver(updateStickyBar);

  [
    document.getElementById("redCarpetVoteSection"),
    finalAudienceVoteSection,
    selectedRedCarpetText,
    selectedFinalAudienceText,
    redCarpetStatusText,
    finalAudienceStatusText,
    submitRedCarpetButton,
    submitFinalAudienceButton
  ]
    .filter(Boolean)
    .forEach((target) => {
      observer.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["disabled", "class"]
      });
    });

  employeeIdInput?.addEventListener("input", updateStickyBar);
  window.addEventListener("resize", updateStickyBar);
  window.addEventListener("scroll", updateStickyBar, { passive: true });

  updateStickyBar();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", observeVotePage);
} else {
  observeVotePage();
}
