const { getDb } = require('../db/schema');

// ── 펫 다이어리: 최근 24시간 활동 요약 ──────────────

const DIARY_TEMPLATES = {
  feed:       (d) => `오늘 ${d.user || '누군가'}님이 주신 ${d.detail || '먹이'}는 정말 꿀맛이었어요! 🍖`,
  train:      (d) => `${d.detail || '훈련'}을 열심히 했더니 몸이 튼튼해진 기분이에요! 💪`,
  levelup:    (d) => `드디어 레벨이 올랐어요! 몸에서 빛이 나기 시작했어요! ✨`,
  evolution:  (d) => `엄청난 변화가 일어났어요... 진화했어요!! 🌟`,
  golden_egg: (d) => `산책 중에 황금알을 발견했어요! 다 같이 나눠 가졌답니다! 🥚✨`,
  expedition: (d) => `모험을 다녀왔어요! ${d.detail || '재밌었어요!'} 🗺️`,
  defend:     (d) => `도둑이 나타났는데 ${d.user || '영웅'}님이 막아줬어요! 고마워요! 🛡️`,
  raid:       (d) => `누군가 간식을 노리고 있었어요... 무서웠어요 😰`,
  hungry:     ()  => '배가 고파서 조금 슬펐지만 참았답니다... 🥺',
  happy:      ()  => '오늘은 기분이 아주 좋았어요! 다들 잘 챙겨줘서 행복해요~ 😆',
  bonus:      (d) => `${d.user || '주인'}님이 놀러 왔어요! 반가웠어요! 🎉`,
};

function generateDiary(roomId) {
  const db = getDb();

  // 최근 24시간 활동 로그
  const logs = db.prepare(`
    SELECT * FROM activity_log
    WHERE room_id = ? AND created_at >= datetime('now', '-24 hours')
    ORDER BY created_at DESC
    LIMIT 50
  `).all(roomId);

  const pet = db.prepare('SELECT * FROM pets WHERE room_id = ?').get(roomId);
  if (!pet) return '아직 펫이 없어요!';

  const entries = [];

  // 활동 기반 일기
  const actionCounts = {};
  for (const log of logs) {
    actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;

    // 주요 이벤트만 일기에 추가
    if (['evolution', 'golden_egg', 'expedition', 'defend'].includes(log.action)) {
      const tmpl = DIARY_TEMPLATES[log.action];
      if (tmpl) entries.push(tmpl({ detail: log.detail, user: log.user_id }));
    }
  }

  // 먹이 요약
  if (actionCounts.feed) {
    const lastFeed = logs.find(l => l.action === 'feed');
    entries.push(DIARY_TEMPLATES.feed({ detail: lastFeed?.detail, user: lastFeed?.user_id }));
  }

  // 훈련 요약
  if (actionCounts.train) {
    const lastTrain = logs.find(l => l.action === 'train');
    entries.push(DIARY_TEMPLATES.train({ detail: lastTrain?.detail }));
  }

  // 상태 기반 일기
  if (pet.fullness <= 20) {
    entries.push(DIARY_TEMPLATES.hungry());
  } else if (pet.happiness >= 70) {
    entries.push(DIARY_TEMPLATES.happy());
  }

  // 활동이 전혀 없는 경우
  if (entries.length === 0) {
    entries.push('오늘은 조용한 하루였어요... 아무도 안 와서 좀 심심했답니다. 😢');
  }

  // 최대 5줄로 제한
  const diary = entries.slice(0, 5);

  const header = `📔 ${pet.name}의 일기 (최근 24시간)\n${'─'.repeat(20)}\n`;
  return header + diary.map((e, i) => `${i + 1}. ${e}`).join('\n');
}

module.exports = { generateDiary };
