export const TIEBREAKER_JUDGES = [
  { key: "wen", labels: ["溫", "wen"] },
  { key: "joris", labels: ["joris"] }
];

export function calculateJudgeScore(scores = {}, finalJudges = []) {
  const validScores = finalJudges.length
    ? finalJudges
        .map((judge) => Number(scores?.[judge.id]))
        .filter((score) => Number.isFinite(score) && score >= 1 && score <= 10)
    : Object.values(scores || {})
        .map((value) => Number(value))
        .filter((score) => Number.isFinite(score) && score >= 1 && score <= 10);

  if (!validScores.length) {
    return { average: 0, judgeScore: 0, averageText: "—", judgeScoreText: "—" };
  }

  const average = validScores.reduce((sum, score) => sum + score, 0) / validScores.length;
  const judgeScore = average * 4;
  return {
    average,
    judgeScore,
    averageText: average.toFixed(2),
    judgeScoreText: judgeScore.toFixed(1)
  };
}

export function getVoteCountMap(votes = []) {
  const map = new Map();
  votes.forEach((vote) => {
    if (!vote.contestantId) return;
    map.set(vote.contestantId, (map.get(vote.contestantId) || 0) + 1);
  });
  return map;
}

export function getTieBreakerJudgeScore(scores = {}, finalJudges = [], judgeKey) {
  const config = TIEBREAKER_JUDGES.find((item) => item.key === judgeKey);
  if (!config) return 0;

  const judge = finalJudges.find((item) => {
    const name = String(item?.name || "").trim().toLowerCase();
    return config.labels.some((label) => name.includes(label.toLowerCase()));
  });

  if (!judge) return 0;
  const score = Number(scores?.[judge.id]);
  return Number.isFinite(score) ? score : 0;
}

export function getTieBreakerJudgeScoreText(score) {
  return Number(score || 0) > 0 ? Number(score).toFixed(1) : "—";
}

export function getFinalScoreRowsWithTieBreakers({
  contestants = [],
  finalAudienceLogs = [],
  judgeScoresMap = new Map(),
  finalJudges = []
} = {}) {
  const scoringContestants = contestants.filter((contestant) => contestant.publishStatus === true);
  const finalVoteCountMap = getVoteCountMap(finalAudienceLogs);
  const topVotes = finalVoteCountMap.size ? Math.max(...Array.from(finalVoteCountMap.values())) : 0;

  return scoringContestants
    .map((contestant) => {
      const voteCount = finalVoteCountMap.get(contestant.id) || 0;
      const audienceScore = topVotes > 0 ? (voteCount / topVotes) * 60 : 0;
      const scoreDoc = judgeScoresMap.get(contestant.id);
      const scores = scoreDoc?.scores || {};
      const judgeCalculated = calculateJudgeScore(scores, finalJudges);
      const wenScore = getTieBreakerJudgeScore(scores, finalJudges, "wen");
      const jorisScore = getTieBreakerJudgeScore(scores, finalJudges, "joris");
      const totalScore = judgeCalculated.judgeScore + audienceScore;

      return {
        ...contestant,
        voteCount,
        audienceScore,
        judgeAverage: judgeCalculated.average,
        judgeAverageText: judgeCalculated.averageText,
        judgeScore: judgeCalculated.judgeScore,
        judgeScoreText: judgeCalculated.judgeScoreText,
        wenScore,
        wenScoreText: getTieBreakerJudgeScoreText(wenScore),
        jorisScore,
        jorisScoreText: getTieBreakerJudgeScoreText(jorisScore),
        totalScore
      };
    })
    .sort(compareFinalScoreRows);
}

export function compareFinalScoreRows(a, b) {
  const totalDiff = Number(b.totalScore || 0) - Number(a.totalScore || 0);
  if (totalDiff !== 0) return totalDiff;

  const judgeDiff = Number(b.judgeScore || 0) - Number(a.judgeScore || 0);
  if (judgeDiff !== 0) return judgeDiff;

  const audienceDiff = Number(b.audienceScore || 0) - Number(a.audienceScore || 0);
  if (audienceDiff !== 0) return audienceDiff;

  const wenDiff = Number(b.wenScore || 0) - Number(a.wenScore || 0);
  if (wenDiff !== 0) return wenDiff;

  const jorisDiff = Number(b.jorisScore || 0) - Number(a.jorisScore || 0);
  if (jorisDiff !== 0) return jorisDiff;

  const orderA = typeof a.manualOrder === "number" ? a.manualOrder : 999;
  const orderB = typeof b.manualOrder === "number" ? b.manualOrder : 999;
  return orderA - orderB;
}
