const { getDb } = require('../db/schema');
const { assignNature } = require('./nature');

const REBIRTH_MIN_LEVEL = 30;

// ── 환생 가능 여부 체크 ─────────────────────────────

function canRebirth(roomId) {
  const db = getDb();
  const pet = db.prepare('SELECT * FROM pets WHERE room_id = ?').get(roomId);
  if (!pet) return { can: false, message: '펫이 없어요!' };
  if (pet.level < REBIRTH_MIN_LEVEL) {
    return {
      can: false,
      message: `환생하려면 Lv.${REBIRTH_MIN_LEVEL} 이상이어야 해요!\n현재: Lv.${pet.level}`,
    };
  }
  return { can: true, pet };
}

// ── 환생 실행 ────────────────────────────────────────

function doRebirth(roomId) {
  const db = getDb();
  const pet = db.prepare('SELECT * FROM pets WHERE room_id = ?').get(roomId);
  if (!pet || pet.level < REBIRTH_MIN_LEVEL) {
    return { success: false, message: `Lv.${REBIRTH_MIN_LEVEL} 이상이어야 환생할 수 있어요!` };
  }

  const newGen = pet.generation + 1;

  // 유산 보너스 계산 (이전 스탯의 10%)
  const legacyStr = Math.floor(pet.strength * 0.10);
  const legacyInt = Math.floor(pet.intelligence * 0.10);
  const legacyChm = Math.floor(pet.charm * 0.10);
  const legacyDesc = `근력+${legacyStr} 지능+${legacyInt} 매력+${legacyChm}`;

  db.transaction(() => {
    // 환생 로그
    db.prepare(`
      INSERT INTO rebirth_log (room_id, generation, prev_level, prev_type, legacy_bonus)
      VALUES (?, ?, ?, ?, ?)
    `).run(roomId, newGen, pet.level, pet.evolution_type, legacyDesc);

    // 펫 초기화 (유산 보너스 적용)
    db.prepare(`
      UPDATE pets SET
        name = ?,
        level = 1,
        exp = 0,
        evolution_stage = 'egg',
        evolution_type = NULL,
        strength = 5 + ?,
        intelligence = 5 + ?,
        charm = 5 + ?,
        fullness = 50,
        happiness = 50,
        meat_fed = 0,
        veggie_fed = 0,
        nature = NULL,
        generation = ?,
        legacy_bonus_str = ?,
        legacy_bonus_int = ?,
        legacy_bonus_chm = ?,
        well_fed_streak = 0,
        consecutive_meat = 0,
        current_image_key = 'egg_default',
        updated_at = datetime('now')
      WHERE pet_id = ?
    `).run(
      `${pet.name} ${newGen}세`,
      legacyStr, legacyInt, legacyChm,
      newGen, legacyStr, legacyInt, legacyChm,
      pet.pet_id
    );

    // 새 성격 부여
    assignNature(pet.pet_id);

    // 환생 보너스: 방 전원에게 골드
    const users = db.prepare('SELECT * FROM users WHERE room_id = ?').all(roomId);
    for (const u of users) {
      db.prepare('UPDATE users SET gold = gold + 200 WHERE user_id = ? AND room_id = ?').run(u.user_id, roomId);
    }
  })();

  const newPet = db.prepare('SELECT * FROM pets WHERE room_id = ?').get(roomId);

  return {
    success: true,
    message: [
      `🔄 환생 완료! (${newGen}세대)`,
      ``,
      `${pet.name}(이)가 새로운 알로 다시 태어났어요!`,
      ``,
      `📜 유산 보너스:`,
      `  💪 근력 +${legacyStr}`,
      `  🧠 지능 +${legacyInt}`,
      `  ✨ 매력 +${legacyChm}`,
      ``,
      `🎁 환생 축하금: 전원 +200G`,
      ``,
      `이전보다 더 강하게 키울 수 있어요!`,
    ].join('\n'),
    newPet,
    generation: newGen,
  };
}

// ── 환생 히스토리 ────────────────────────────────────

function getRebirthHistory(roomId) {
  const db = getDb();
  return db.prepare('SELECT * FROM rebirth_log WHERE room_id = ? ORDER BY reborn_at DESC').all(roomId);
}

module.exports = { REBIRTH_MIN_LEVEL, canRebirth, doRebirth, getRebirthHistory };
