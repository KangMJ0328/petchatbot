const { getDb } = require('../db/schema');

// ── 데코 상점 ────────────────────────────────────────

function getDecoShop() {
  const db = getDb();
  return db.prepare('SELECT * FROM deco_items ORDER BY category, cost ASC').all();
}

// ── 데코 구매 ────────────────────────────────────────

function buyDeco(userId, roomId, decoId) {
  const db = getDb();

  const deco = db.prepare('SELECT * FROM deco_items WHERE deco_id = ?').get(decoId);
  if (!deco) return { success: false, message: '존재하지 않는 아이템이에요!' };

  const user = db.prepare('SELECT * FROM users WHERE user_id = ? AND room_id = ?').get(userId, roomId);
  if (!user) return { success: false, message: '유저 정보를 찾을 수 없어요.' };

  // 이미 보유 체크
  const owned = db.prepare('SELECT 1 FROM room_deco WHERE room_id = ? AND deco_id = ?').get(roomId, decoId);
  if (owned) return { success: false, message: '이미 보유한 아이템이에요!' };

  if (user.gold < deco.cost) {
    return { success: false, message: `골드가 부족해요! 💰\n필요: ${deco.cost}G / 보유: ${user.gold}G` };
  }

  db.transaction(() => {
    db.prepare('UPDATE users SET gold = gold - ? WHERE user_id = ? AND room_id = ?').run(deco.cost, userId, roomId);
    db.prepare('INSERT INTO room_deco (room_id, deco_id) VALUES (?, ?)').run(roomId, decoId);
    db.prepare(`INSERT INTO activity_log (room_id, user_id, action, detail, gold_change) VALUES (?, ?, 'deco_buy', ?, ?)`)
      .run(roomId, userId, `${deco.name} 구매`, -deco.cost);
  })();

  return {
    success: true,
    message: `${deco.emoji} ${deco.name} 구매 완료!\n효과: ${deco.effect_desc}\n\n/장착 ${decoId} 로 장착할 수 있어요!`,
  };
}

// ── 데코 장착/해제 ───────────────────────────────────

function equipDeco(roomId, decoId) {
  const db = getDb();

  const owned = db.prepare('SELECT * FROM room_deco WHERE room_id = ? AND deco_id = ?').get(roomId, decoId);
  if (!owned) return { success: false, message: '보유하지 않은 아이템이에요!' };

  const deco = db.prepare('SELECT * FROM deco_items WHERE deco_id = ?').get(decoId);

  // 같은 카테고리의 기존 장착 해제
  db.transaction(() => {
    db.prepare(`
      UPDATE room_deco SET equipped = 0
      WHERE room_id = ? AND deco_id IN (SELECT deco_id FROM deco_items WHERE category = ?)
    `).run(roomId, deco.category);
    db.prepare('UPDATE room_deco SET equipped = 1 WHERE room_id = ? AND deco_id = ?').run(roomId, decoId);
  })();

  return {
    success: true,
    message: `${deco.emoji} ${deco.name} 장착 완료!\n효과: ${deco.effect_desc}`,
  };
}

// ── 내 방 데코 현황 ─────────────────────────────────

function getRoomDecos(roomId) {
  const db = getDb();
  return db.prepare(`
    SELECT d.*, rd.equipped
    FROM room_deco rd
    JOIN deco_items d ON rd.deco_id = d.deco_id
    WHERE rd.room_id = ?
    ORDER BY rd.equipped DESC, d.category
  `).all(roomId);
}

// ── 장착된 데코 효과 목록 ───────────────────────────

function getEquippedEffects(roomId) {
  const db = getDb();
  return db.prepare(`
    SELECT d.*
    FROM room_deco rd
    JOIN deco_items d ON rd.deco_id = d.deco_id
    WHERE rd.room_id = ? AND rd.equipped = 1
  `).all(roomId);
}

module.exports = { getDecoShop, buyDeco, equipDeco, getRoomDecos, getEquippedEffects };
