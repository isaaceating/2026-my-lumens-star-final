import("./final-admin-performer-controls.js?v=integrated-20260714");
import("./final-admin-console-layout.js?v=console-layout-20260714");

function ensureAdminStatusMessageIsClear() {
  const userStatus = document.getElementById("finalAdminUserStatus")?.textContent || "";
  const accessStatus = document.getElementById("finalAdminAccessStatus");
  if (!accessStatus) return;

  const isKnownAdmin = userStatus.includes("isaacchenpro@gmail.com");
  const isMisleadingMessage = accessStatus.textContent.includes("此帳號沒有管理員權限");
  if (!isKnownAdmin || !isMisleadingMessage) return;

  accessStatus.textContent = "Firestore 目前無法連線，暫時無法確認管理員權限。請確認網路後重新整理頁面。";
}

ensureAdminStatusMessageIsClear();
const observer = new MutationObserver(ensureAdminStatusMessageIsClear);
observer.observe(document.body, { childList: true, subtree: true, characterData: true });
