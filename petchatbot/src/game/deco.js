const { getDb } = require('../db/schema');

// ── 데코 상점 ────────────────────────────────────────

async function getDecoShop() {
  const db = getDb();
  return await db.all('SELECT * FROM deco_items ORDER BY category, cost ASC', []);
}

// ── 데코 구매 ────────────────────────────────────────

async function buyDeco(userId, roomId, decoId) {
  const db = getDb();

  const deco = await db.get('SELECT * FROM deco_items WHERE deco_id = ?', [decoId]);
  if (!deco) return { success: false, message: '존재하지 않는 아이템이에요!' };

  const user = await db.get('SELECT * FROM users WHERE user_id = ? AND room_id = ?', [userId, roomId]);
  if (!user) return { success: false, message: '유저 정보를 찾을 수 없어요.' };

  // 이미 보유 체크
  const owned = await db.get('SELECT 1 FROM room_deco WHERE room_id = ? AND deco_id = ?', [roomId, decoId]);
  if (owned) return { success: false, message: '이미 보유한 아이템이에요!' };

  if (user.gold < deco.cost) {
    return { success: false, message: `골드가 부족해요! 💰\n필요: ${deco.cost}G / 보유: ${user.gold}G` };
  }

  await db.run('UPDATE users SET gold = gold - ? WHERE user_id = ? AND room_id = ?', [deco.cost, userId, roomId]);
  await db.run('INSERT INTO room_deco (room_id, deco_id) VALUES (?, ?)', [roomId, decoId]);
  await db.run(`INSERT INTO activity_log (room_id, user_id, action, detail, gold_change) VALUES (?, ?, 'deco_buy', ?, ?)`,
    [roomId, userId, `${deco.name} 구매`, -deco.cost]);

  return {
    success: true,
    message: `${deco.emoji} ${deco.name} 구매 완료!\n효과: ${deco.effect_desc}\n\n/장착 ${decoId} 로 장착할 수 있어요!`,
  };
}

// ── 데코 장착/해제 ───────────────────────────────────

async function equipDeco(roomId, decoId) {
  const db = getDb();

  const owned = await db.get('SELECT * FROM room_deco WHERE room_id = ? AND deco_id = ?', [roomId, decoId]);
  if (!owned) return { success: false, message: '보유하지 않은 아이템이에요!' };

  const deco = await db.get('SELECT * FROM deco_items WHERE deco_id = ?', [decoId]);

  // 같은 카테고리의 기존 장착 해제
  await db.run(`
    UPDATE room_deco SET equipped = 0
    WHERE room_id = ? AND deco_id IN (SELECT deco_id FROM deco_items WHERE category = ?)
  `, [roomId, deco.category]);
  await db.run('UPDATE room_deco SET equipped = 1 WHERE room_id = ? AND deco_id = ?', [roomId, decoId]);

  return {
    success: true,
    message: `${deco.emoji} ${deco.name} 장착 완료!\n효과: ${deco.effect_desc}`,
  };
}

// ── 내 방 데코 현황 ─────────────────────────────────

async function getRoomDecos(roomId) {
  const db = getDb();
  return await db.all(`
    SELECT d.*, rd.equipped
    FROM room_deco rd
    JOIN deco_items d ON rd.deco_id = d.deco_id
    WHERE rd.room_id = ?
    ORDER BY rd.equipped DESC, d.category
  `, [roomId]);
}

// ── 장착된 데코 효과 목록 ───────────────────────────

async function getEquippedEffects(roomId) {
  const db = getDb();
  return await db.all(`
    SELECT d.*
    FROM room_deco rd
    JOIN deco_items d ON rd.deco_id = d.deco_id
    WHERE rd.room_id = ? AND rd.equipped = 1
  `, [roomId]);
}

module.exports = { getDecoShop, buyDeco, equipDeco, getRoomDecos, getEquippedEffects };
