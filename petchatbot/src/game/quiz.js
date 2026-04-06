const { getDb } = require('../db/schema');

// ── 퀴즈 문제 풀 ────────────────────────────────────

const QUIZ_POOL = [
  { q: '사과는 영어로?', a: 'apple' },
  { q: '1 + 1 = ?', a: '2' },
  { q: '대한민국의 수도는?', a: '서울' },
  { q: '물의 화학식은?', a: 'h2o' },
  { q: '지구에서 가장 큰 바다는?', a: '태평양' },
  { q: '고양이의 영어는?', a: 'cat' },
  { q: '무지개는 몇 가지 색?', a: '7' },
  { q: '한국의 국화는?', a: '무궁화' },
  { q: '개미의 다리는 몇 개?', a: '6' },
  { q: '바나나는 무슨 색?', a: '노란색' },
  { q: '해가 뜨는 방향은?', a: '동쪽' },
  { q: '가장 큰 행성은?', a: '목성' },
  { q: '삼각형의 내각의 합은?', a: '180' },
  { q: '강아지 소리는?', a: '멍멍' },
  { q: 'Thank you를 한국어로?', a: '감사합니다' },
  { q: '피자의 원산지 나라는?', a: '이탈리아' },
  { q: '1년은 몇 개월?', a: '12' },
  { q: '코끼리의 영어는?', a: 'elephant' },
  { q: '가장 가벼운 원소는?', a: '수소' },
  { q: '한국의 전통 명절, 음력 1월 1일은?', a: '설날' },
];

// ── 퀴즈 출제 (자동 or 수동) ────────────────────────

function createQuiz(roomId) {
  const db = getDb();

  // 진행 중인 퀴즈 체크
  const active = db.prepare(`
    SELECT * FROM quiz_events WHERE room_id = ? AND resolved = 0 AND expires_at > datetime('now')
  `).get(roomId);
  if (active) {
    return {
      success: false,
      active: true,
      message: `이미 퀴즈가 진행 중이에요!\n\n❓ ${active.question}\n\n/정답 [답] 으로 맞혀보세요!`,
    };
  }

  const quiz = QUIZ_POOL[Math.floor(Math.random() * QUIZ_POOL.length)];
  const reward = Math.floor(Math.random() * 30) + 30; // 30~60G

  db.prepare(`
    INSERT INTO quiz_events (room_id, question, answer, reward_gold, expires_at)
    VALUES (?, ?, ?, ?, datetime('now', '+60 seconds'))
  `).run(roomId, quiz.q, quiz.a.toLowerCase(), reward);

  return {
    success: true,
    message: `🎓 돌발 퀴즈!\n\n❓ ${quiz.q}\n\n⏰ 60초 안에 /정답 [답] 으로 맞히면 ${reward}G!`,
    reward,
  };
}

// ── 정답 확인 ────────────────────────────────────────

function answerQuiz(roomId, userId, answer) {
  const db = getDb();

  const quiz = db.prepare(`
    SELECT * FROM quiz_events WHERE room_id = ? AND resolved = 0 AND expires_at > datetime('now')
    ORDER BY created_at DESC LIMIT 1
  `).get(roomId);

  if (!quiz) {
    return { success: false, message: '진행 중인 퀴즈가 없어요!' };
  }

  const normalized = answer.trim().toLowerCase();
  if (normalized !== quiz.answer) {
    return { success: false, message: `❌ 틀렸어요! 다시 도전해보세요!` };
  }

  // 정답!
  db.transaction(() => {
    db.prepare('UPDATE quiz_events SET resolved = 1, answered_by = ? WHERE quiz_id = ?').run(userId, quiz.quiz_id);
    db.prepare('UPDATE users SET gold = gold + ? WHERE user_id = ? AND room_id = ?').run(quiz.reward_gold, userId, roomId);
    db.prepare(`INSERT INTO activity_log (room_id, user_id, action, detail, gold_change) VALUES (?, ?, 'quiz', '퀴즈 정답', ?)`)
      .run(roomId, userId, quiz.reward_gold);
  })();

  return {
    success: true,
    message: `✅ 정답! 🎉\n\n"${quiz.answer}" 맞았어요!\n+${quiz.reward_gold}G 획득!`,
  };
}

// ── 만료된 퀴즈 정리 ────────────────────────────────

function resolveExpiredQuizzes() {
  const db = getDb();
  return db.prepare(`UPDATE quiz_events SET resolved = 1 WHERE resolved = 0 AND expires_at <= datetime('now')`)
    .run().changes;
}

module.exports = { createQuiz, answerQuiz, resolveExpiredQuizzes };
