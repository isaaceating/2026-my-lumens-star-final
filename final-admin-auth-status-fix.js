const ADMIN_EMAILS_WITH_KNOWN_ACCESS = ["isaacchenpro@gmail.com"];

function getText(id) {
  return document.getElementById(id)?.textContent || "";
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function getSignedInEmail() {
  const status = normalizeText(getText("finalAdminUserStatus"));
  const match = status.match(/已登入：(.+)$/);
  return match ? normalizeText(match[1]) : "";
}

function fixMisleadingAdminStatus() {
  const email = getSignedInEmail();
  if (!ADMIN_EMAILS_WITH_KNOWN_ACCESS.includes(email)) return;

  const accessStatus = normalizeText(getText("finalAdminAccessStatus"));
  if (!accessStatus.includes("此帳號沒有管理員權限")) return;

  setText(
    "finalAdminAccessStatus",
    "Firestore 目前無法連線，暫時無法確認管理員權限。請確認網路後重新整理頁面。"
  );
}

fixMisleadingAdminStatus();
const finalAdminAuthStatusObserver = new MutationObserver(fixMisleadingAdminStatus);
finalAdminAuthStatusObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
