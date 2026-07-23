import { getApps } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const app = getApps()[0];
const db = app ? getFirestore(app) : null;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatTimestamp(timestamp) {
  if (!timestamp) return "尚無紀錄";
  const date = typeof timestamp.toDate === "function" ? timestamp.toDate() : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "尚無紀錄";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function ensureStarScoutRecordsSection() {
  if (document.getElementById("starScoutRecords")) return;

  const anchorNav = document.querySelector("#finalAdminContent .admin-anchor-nav");
  if (anchorNav && !anchorNav.querySelector('a[href="#starScoutRecords"]')) {
    const anchor = document.createElement("a");
    anchor.href = "#starScoutRecords";
    anchor.textContent = "星探抽籤紀錄";
    const scoreAnchor = anchorNav.querySelector('a[href="#finalScoreRanking"]');
    scoreAnchor?.insertAdjacentElement("afterend", anchor);
  }

  const target = document.getElementById("finalScoreRanking") || document.getElementById("voteDetails");
  if (!target) return;

  const section = document.createElement("section");
  section.id = "starScoutRecords";
  section.className = "admin-panel-section star-scout-records-section";
  section.innerHTML = `
    <div class="admin-toolbar">
      <div>
        <p class="section-kicker">Star Scout Draw Records</p>
        <strong>最強星探抽籤結果紀錄</strong>
        <p class="section-desc">抽出最強星探獎後，系統會自動保留本次抽籤結果與操作資訊。</p>
      </div>
    </div>
    <div id="starScoutRecordSummary" class="star-scout-record-summary">
      <p class="message">抽籤紀錄讀取中...</p>
    </div>
    <div class="admin-table-wrap star-scout-record-table-wrap">
      <table class="admin-table star-scout-record-table">
        <thead>
          <tr>
            <th>中獎順序</th>
            <th>工號</th>
            <th>姓名</th>
            <th>部門</th>
            <th>公司</th>
          </tr>
        </thead>
        <tbody id="starScoutRecordTableBody">
          <tr><td colspan="5">抽籤紀錄讀取中...</td></tr>
        </tbody>
      </table>
    </div>
  `;

  target.insertAdjacentElement("afterend", section);
}

function renderStarScoutRecord(data = {}) {
  const summary = document.getElementById("starScoutRecordSummary");
  const tbody = document.getElementById("starScoutRecordTableBody");
  if (!summary || !tbody) return;

  const winners = Array.isArray(data.winners) ? data.winners : [];
  const championLabel = [data.championName, data.championStageName]
    .filter(Boolean)
    .join(" / ") || "尚未產生冠軍資料";

  summary.innerHTML = `
    <div><span>冠軍選手</span><strong>${escapeHtml(championLabel)}</strong></div>
    <div><span>符合抽獎資格</span><strong>${Number(data.eligibleCount || 0)} 人</strong></div>
    <div><span>實際中獎人數</span><strong>${winners.length} 人</strong></div>
    <div><span>抽籤時間</span><strong>${escapeHtml(formatTimestamp(data.updatedAt))}</strong></div>
    <div><span>操作帳號</span><strong>${escapeHtml(data.updatedBy || "尚無紀錄")}</strong></div>
  `;

  if (!winners.length) {
    tbody.innerHTML = '<tr><td colspan="5">尚未完成最強星探抽籤。</td></tr>';
    return;
  }

  tbody.innerHTML = winners
    .map((winner, index) => `
      <tr>
        <td><span class="vote-rank-badge">${index + 1}</span></td>
        <td><strong>${escapeHtml(winner.employeeId || "-")}</strong></td>
        <td>${escapeHtml(winner.employeeName || "-")}</td>
        <td>${escapeHtml(winner.employeeDepartment || "-")}</td>
        <td>${escapeHtml(winner.employeeCompany || "-")}</td>
      </tr>
    `)
    .join("");
}

function initStarScoutRecords() {
  ensureStarScoutRecordsSection();
  if (!db) {
    renderStarScoutRecord();
    return;
  }

  onSnapshot(
    doc(db, "settings", "starScoutWinners"),
    (snapshot) => renderStarScoutRecord(snapshot.exists() ? snapshot.data() : {}),
    (error) => {
      console.error("Load star scout draw records failed:", error);
      const tbody = document.getElementById("starScoutRecordTableBody");
      if (tbody) tbody.innerHTML = `<tr><td colspan="5">抽籤紀錄讀取失敗：${escapeHtml(error.message)}</td></tr>`;
    },
  );
}

initStarScoutRecords();
new MutationObserver(ensureStarScoutRecordsSection).observe(document.body, {
  childList: true,
  subtree: true,
});
