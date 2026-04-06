const { getDb } = require('../db/schema');

function ensureUserLocal(userId, roomId) {
  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO users (user_id, room_id) VALUES (?, ?)').run(userId, roomId);
  return db.prepare('SELECT * FROM users WHERE user_id = ? AND room_id = ?').get(userId, roomId);
}

// ── 돌발 이벤트: 황금 알 (먹이 줄 때 10% 확률) ──────

function tryGoldenEgg(roomId, triggerUserId) {
  if (Math.random() > 0.10) return null; // 90% 확률로 아무 일 없음

  const db = getDb();
  const users = db.prepare('SELECT * FROM users WHERE room_id = ?').all(roomId);
  if (users.length === 0) return null;

  const goldPerUser = Math.floor(50 / users.length) + 10;
  const totalGold = goldPerUser * users.length;

  db.transaction(() => {
    for (const u of users) {
      db.prepare('UPDATE users SET gold = gold + ? WHERE user_id = ? AND room_id = ?')
        .run(goldPerUser, u.user_id, roomId);
    }
    db.prepare(`
      INSERT INTO activity_log (room_id, user_id, action, detail, gold_change)
      VALUES (?, ?, 'golden_egg', ?, ?)
    `).run(roomId, triggerUserId, `황금알 발견! ${users.length}명에게 ${goldPerUser}G씩 분배`, totalGold);
  })();

  return {
    triggered: true,
    goldPerUser,
    totalGold,
    userCount: users.length,
    message: `🥚✨ 황금 알 이벤트!\n${users.length}명에게 각 ${goldPerUser}G가 지급되었어요!`,
  };
}

// ── 약탈 시스템 ──────────────────────────────────────

function startRaid(roomId, attackerId) {
  const db = getDb();

  // 진행 중인 약탈이 있는지 체크
  const existing = db.prepare(`
    SELECT * FROM raid_events WHERE room_id = ? AND resolved = 0 AND expires_at > datetime('now')
  `).get(roomId);
  if (existing) return { success: false, message: '이미 진행 중인 약탈이 있어요!' };

  const goldAtStake = Math.floor(Math.random() * 30) + 10;
  // 60초 타임 어택
  db.prepare(`
    INSERT INTO raid_events (room_id, attacker_id, target_item, gold_at_stake, expires_at)
    VALUES (?, ?, '간식', ?, datetime('now', '+60 seconds'))
  `).run(roomId, attackerId, goldAtStake);

  return {
    success: true,
    goldAtStake,
    message: `⚠️ 약탈 경보! ⚠️\n누군가 펫의 간식 ${goldAtStake}G어치를 훔치려 해요!\n60초 안에 /방어 를 입력하세요!`,
  };
}

function defendRaid(roomId, defenderId) {
  const db = getDb();

  const raid = db.prepare(`
    SELECT * FROM raid_events
    WHERE room_id = ? AND resolved = 0 AND expires_at > datetime('now')
    ORDER BY created_at DESC LIMIT 1
  `).get(roomId);

  if (!raid) return { success: false, message: '현재 진행 중인 약탈이 없어요.' };

  // 자기 자신의 약탈은 방어 불가
  if (raid.attacker_id === defenderId) {
    return { success: false, message: '자신의 약탈은 방어할 수 없어요! 😅' };
  }

  db.transaction(() => {
    db.prepare('UPDATE raid_events SET defended = 1, defender_id = ?, resolved = 1 WHERE raid_id = ?')
      .run(defenderId, raid.raid_id);
    // 방어 보상
    db.prepare('UPDATE users SET gold = gold + ? WHERE user_id = ? AND room_id = ?')
      .run(Math.floor(raid.gold_at_stake / 2), defenderId, roomId);
    db.prepare(`INSERT INTO activity_log (room_id, user_id, action, detail, gold_change) VALUES (?, ?, 'defend', '약탈 방어 성공', ?)`)
      .run(roomId, defenderId, Math.floor(raid.gold_at_stake / 2));
  })();

  return {
    success: true,
    message: `🛡️ 방어 성공!\n${raid.gold_at_stake}G를 지켰어요! 보상으로 ${Math.floor(raid.gold_at_stake / 2)}G를 받았어요!`,
  };
}

// 만료된 약탈 처리 (서버에서 주기적으로 호출)
function resolveExpiredRaids() {
  const db = getDb();
  const expired = db.prepare(`
    SELECT * FROM raid_events WHERE resolved = 0 AND expires_at <= datetime('now')
  `).all();

  for (const raid of expired) {
    db.transaction(() => {
      db.prepare('UPDATE raid_events SET resolved = 1 WHERE raid_id = ?').run(raid.raid_id);
      // 약탈 성공 — 펫 행복도 감소
      db.prepare('UPDATE pets SET happiness = MAX(0, happiness - 10) WHERE room_id = ?').run(raid.room_id);
    })();
  }

  return expired.length;
}

// ── 랭킹 ────────────────────────────────────────────

function getRanking(limit = 10) {
  const db = getDb();
  return db.prepare(`
    SELECT p.*, r.room_name, r.total_exp
    FROM pets p
    JOIN rooms r ON p.room_id = r.room_id
    ORDER BY p.level DESC, p.exp DESC
    LIMIT ?
  `).all(limit);
}

function getRoomRanking(roomId) {
  const db = getDb();
  return db.prepare(`
    SELECT u.*, ROW_NUMBER() OVER (ORDER BY u.contribution DESC) as rank
    FROM users u
    WHERE u.room_id = ?
    ORDER BY u.contribution DESC
    LIMIT 10
  `).all(roomId);
}

// ── 골드 지급 (출석/보너스) ──────────────────────────

function giveGold(userId, roomId, amount, reason) {
  const db = getDb();
  ensureUserLocal(userId, roomId);
  db.prepare('UPDATE users SET gold = gold + ?, last_active_at = datetime(\'now\') WHERE user_id = ? AND room_id = ?')
    .run(amount, userId, roomId);
  db.prepare(`INSERT INTO activity_log (room_id, user_id, action, detail, gold_change) VALUES (?, ?, 'bonus', ?, ?)`)
    .run(roomId, userId, reason, amount);
  return { success: true, amount };
}

module.exports = {
  tryGoldenEgg,
  startRaid,
  defendRaid,
  resolveExpiredRaids,
  getRanking,
  getRoomRanking,
  giveGold,
};
