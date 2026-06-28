function ensurePerformerControlEntry() {
  const header = document.querySelector('#resultDisplayControl .admin-section-header');
  if (!header || document.getElementById('performerControlEntryButton')) return;

  const link = document.createElement('a');
  link.id = 'performerControlEntryButton';
  link.className = 'admin-link-button';
  link.href = 'final-performer-control.html';
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = '選手大螢幕控制';

  header.appendChild(link);
}

function ensureAdminStatusMessageIsClear() {
  const userStatus = document.getElementById('finalAdminUserStatus')?.textContent || '';
  const accessStatus = document.getElementById('finalAdminAccessStatus');
  if (!accessStatus) return;

  const isKnownAdmin = userStatus.includes('isaacchenpro@gmail.com');
  const isMisleadingMessage = accessStatus.textContent.includes('此帳號沒有管理員權限');
  if (!isKnownAdmin || !isMisleadingMessage) return;

  accessStatus.textContent = 'Firestore 目前無法連線，暫時無法確認管理員權限。請確認網路後重新整理頁面。';
}

function runFinalAdminEntryEnhancements() {
  ensurePerformerControlEntry();
  ensureAdminStatusMessageIsClear();
}

runFinalAdminEntryEnhancements();
const performerEntryObserver = new MutationObserver(runFinalAdminEntryEnhancements);
performerEntryObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
