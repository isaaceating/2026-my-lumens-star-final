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

ensurePerformerControlEntry();
const performerEntryObserver = new MutationObserver(ensurePerformerControlEntry);
performerEntryObserver.observe(document.body, { childList: true, subtree: true });
