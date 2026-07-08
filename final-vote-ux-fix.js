// Final vote UX helper
// Keeps the original Firebase voting logic untouched.
// This layer only improves mobile visibility for selected contestants and submit buttons.

const MOBILE_QUERY = "(max-width: 760px)";
const mobileMedia = window.matchMedia(MOBILE_QUERY);

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

let currentStickyMode = "redCarpet";

stickyButton?.addEventListener("click", () => {
  const targetButton = currentStickyMode === "finalAudience"
    ? submitFinalAudienceButton
    : submitRedCarpetButton;

  if (!targetButton || targetButton.disabled) return;

  targetButton.click();

  window.setTimeout(updateStickyBar, 250);
  window.setTimeout(updateStickyBar, 900);
});

function updateStickyBar() {
  if (!stickyBar || !stickyLabel || !stickySelection || !stickyButton) return;

  const isMobile = mobileMedia.matches;
  const hasEmployeeInput = Boolean((employeeIdInput?.value || "").trim());

  if (!isMobile || !hasEmployeeInput) {
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

function observeVotePage() {
  const observer = new MutationObserver(updateStickyBar);

  [
    document.getElementById("redCarpetVoteSection"),
    document.getElementById("finalAudienceVoteSection"),
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
  mobileMedia.addEventListener?.("change", updateStickyBar);
  window.addEventListener("resize", updateStickyBar);
  window.addEventListener("scroll", updateStickyBar, { passive: true });

  updateStickyBar();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", observeVotePage);
} else {
  observeVotePage();
}
