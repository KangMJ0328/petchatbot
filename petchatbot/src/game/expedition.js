const { getDb } = require('../db/schema');

// ── 탐험 스토리 & 보상 풀 ────────────────────────────

const STORIES = [
  { story: '숲에서 반짝이는 돌멩이를 발견했어요!', reward: 'gold', min: 20, max: 60 },
  { story: '강가에서 물고기를 잡아왔어요! 맛있겠다~', reward: 'gold', min: 30, max: 80 },
  { story: '동굴에서 보물 상자를 찾았어요!', reward: 'gold', min: 50, max: 150 },
  { story: '옆 마을 펫이랑 친구가 됐어요! 선물을 받아왔답니다.', reward: 'gold', min: 40, max: 100 },
  { story: '산꼭대기에 올라가서 하늘을 봤어요. 기분이 좋아졌답니다!', reward: 'happiness', min: 15, max: 30 },
  { story: '꽃밭에서 뒹굴며 놀다 왔어요. 너무 행복해요!', reward: 'happiness', min: 20, max: 40 },
  { story: '비밀 훈련장을 발견! 특훈을 하고 왔어요.', reward: 'exp', min: 20, max: 50 },
  { story: '전설의 현자를 만나 지혜를 배웠어요!', reward: 'exp', min: 30, max: 60 },
];

const LATE_STORIES = [
  '길을 잃어서 늦게 왔어요... 미안해요! 😅',
  '옆방 펫을 만나서 놀다 왔어요~ 🐾',
  '너무 재미있어서 시간 가는 줄 몰랐어요! ⏰',
  '멋진 경치를 보다가 깜빡 잠들었어요... 😴',
];

// ── 탐험 보내기 ──────────────────────────────────────

function startExpedition(roomId, userId) {
  const db = getDb();

  // 진행 중인 탐험 체크
  const active = db.prepare(`
    SELECT * FROM expeditions WHERE room_id = ? AND collected = 0 AND returns_at > datetime('now')
  `).get(roomId);
  if (active) {
    const returnsAt = new Date(active.returns_at + 'Z');
    const now = new Date();
    const remaining = Math.ceil((returnsAt - now) / 60000);
    return {
      success: false,
      message: `이미 탐험 중이에요! 🗺️\n약 ${remaining}분 후에 돌아옵니다.`,
    };
  }

  // 수집 안 한 탐험 체크
  const uncollected = db.prepare(`
    SELECT * FROM expeditions WHERE room_id = ? AND collected = 0 AND returns_at <= datetime('now')
  `).get(roomId);
  if (uncollected) {
    return {
      success: false,
      message: '탐험에서 돌아왔는데 아직 보상을 안 받으셨어요!\n/귀환 으로 보상을 받으세요! 🎁',
    };
  }

  // 1~4시간 랜덤 탐험
  const durationMin = Math.floor(Math.random() * 180) + 60; // 60~240분
  const storyData = STORIES[Math.floor(Math.random() * STORIES.length)];

  // 10% 확률로 늦게 귀가
  const isLate = Math.random() < 0.1;
  const actualDuration = isLate ? durationMin + 30 : durationMin;

  const rewardValue = Math.floor(Math.random() * (storyData.max - storyData.min + 1)) + storyData.min;
  const lateStory = isLate ? LATE_STORIES[Math.floor(Math.random() * LATE_STORIES.length)] : null;
  const finalStory = lateStory ? `${storyData.story}\n\n${lateStory}` : storyData.story;

  db.prepare(`
    INSERT INTO expeditions (room_id, started_by, duration_min, reward_type, reward_value, reward_detail, story, returns_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+${actualDuration} minutes'))
  `).run(roomId, userId, actualDuration, storyData.reward, rewardValue, storyData.story, finalStory);

  const hours = Math.floor(durationMin / 60);
  const mins = durationMin % 60;
  const timeStr = hours > 0 ? `${hours}시간 ${mins}분` : `${mins}분`;

  return {
    success: true,
    message: `🗺️ 탐험 출발!\n펫이 모험을 떠났어요. 약 ${timeStr} 후에 돌아옵니다.\n\n⚠️ 탐험 중에는 먹이 주기가 불가능해요.\n/귀환 으로 보상을 받을 수 있어요!`,
  };
}

// ── 귀환 & 보상 수령 ────────────────────────────────

function collectExpedition(roomId, userId) {
  const db = getDb();

  const expedition = db.prepare(`
    SELECT * FROM expeditions WHERE room_id = ? AND collected = 0 AND returns_at <= datetime('now')
    ORDER BY started_at DESC LIMIT 1
  `).get(roomId);

  if (!expedition) {
    const active = db.prepare(`
      SELECT * FROM expeditions WHERE room_id = ? AND collected = 0 AND returns_at > datetime('now')
    `).get(roomId);
    if (active) {
      const returnsAt = new Date(active.returns_at + 'Z');
      const remaining = Math.ceil((returnsAt - new Date()) / 60000);
      return { success: false, message: `아직 탐험 중이에요! 약 ${remaining}분 후에 돌아옵니다. 🗺️` };
    }
    return { success: false, message: '진행 중인 탐험이 없어요. /탐험 으로 보내보세요!' };
  }

  // 보상 지급
  const reward = expedition.reward_type;
  const value = expedition.reward_value;
  let rewardMsg = '';

  db.transaction(() => {
    db.prepare('UPDATE expeditions SET collected = 1 WHERE exp_id = ?').run(expedition.exp_id);

    if (reward === 'gold') {
      // 방 전원에게 분배
      const users = db.prepare('SELECT * FROM users WHERE room_id = ?').all(roomId);
      const perUser = Math.floor(value / Math.max(users.length, 1));
      for (const u of users) {
        db.prepare('UPDATE users SET gold = gold + ? WHERE user_id = ? AND room_id = ?').run(perUser, u.user_id, roomId);
      }
      rewardMsg = `💰 ${value}G 획득! (${users.length}명에게 ${perUser}G씩 분배)`;
    } else if (reward === 'happiness') {
      db.prepare('UPDATE pets SET happiness = MIN(100, happiness + ?) WHERE room_id = ?').run(value, roomId);
      rewardMsg = `💕 행복도 +${value}!`;
    } else if (reward === 'exp') {
      db.prepare('UPDATE pets SET exp = exp + ? WHERE room_id = ?').run(value, roomId);
      db.prepare('UPDATE rooms SET total_exp = total_exp + ? WHERE room_id = ?').run(value, roomId);
      rewardMsg = `✨ 경험치 +${value}!`;
    }

    db.prepare(`INSERT INTO activity_log (room_id, user_id, action, detail, gold_change, exp_change) VALUES (?, ?, 'expedition', ?, ?, ?)`)
      .run(roomId, userId, expedition.story, reward === 'gold' ? value : 0, reward === 'exp' ? value : 0);
  })();

  return {
    success: true,
    message: `🎉 탐험 귀환!\n\n📖 ${expedition.story}\n\n${rewardMsg}`,
  };
}

// ── 탐험 중인지 확인 (먹이 주기 방어용) ─────────────

function isOnExpedition(roomId) {
  const db = getDb();
  return !!db.prepare(`
    SELECT 1 FROM expeditions WHERE room_id = ? AND collected = 0 AND returns_at > datetime('now')
  `).get(roomId);
}

module.exports = { startExpedition, collectExpedition, isOnExpedition };
