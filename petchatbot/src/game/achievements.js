const { getDb } = require('../db/schema');

// ══════════════════════════════════════════
//  칭호/업적 정의
// ══════════════════════════════════════════

const ACHIEVEMENT_DEFS = {
  // 펫 칭호
  berserker:     { type: 'pet',  emoji: '🔥', name: '광전사',     desc: '고기만 연속 50번 먹임',        check: (pet) => pet.consecutive_meat >= 50 },
  saint:         { type: 'pet',  emoji: '😇', name: '성인군자',   desc: '7일 연속 굶기지 않음',          check: (pet) => pet.well_fed_streak >= 7 },
  glutton:       { type: 'pet',  emoji: '🍔', name: '대식가',     desc: '총 먹이 100회 이상',            check: (pet) => (pet.meat_fed + pet.veggie_fed) >= 100 },
  reborn:        { type: 'pet',  emoji: '🔄', name: '환생자',     desc: '환생 1회 이상',                 check: (pet) => pet.generation >= 2 },
  legend:        { type: 'pet',  emoji: '⭐', name: '전설',       desc: '레벨 30 이상 달성',             check: (pet) => pet.level >= 30 },
  explorer:      { type: 'pet',  emoji: '🗺️', name: '탐험가',    desc: '탐험 10회 완료',                check: null }, // 별도 카운트
  muscle:        { type: 'pet',  emoji: '💪', name: '근육왕',     desc: '근력 50 이상',                  check: (pet) => pet.strength >= 50 },
  genius:        { type: 'pet',  emoji: '🧠', name: '천재',       desc: '지능 50 이상',                  check: (pet) => pet.intelligence >= 50 },
  idol:          { type: 'pet',  emoji: '✨', name: '아이돌',     desc: '매력 50 이상',                  check: (pet) => pet.charm >= 50 },

  // 유저 칭호
  donor_king:    { type: 'user', emoji: '👑', name: '기부왕',     desc: '골드 누적 소모 1000G 이상',     check: null },
  defender:      { type: 'user', emoji: '🛡️', name: '수호자',    desc: '약탈 방어 5회 이상',            check: null },
  early_bird:    { type: 'user', emoji: '🐔', name: '얼리버드',   desc: '출석 7일 연속',                 check: null },
};

// ── 업적 확인 & 부여 ────────────────────────────────

function checkAndGrant(roomId, pet, userId) {
  const db = getDb();
  const granted = [];

  for (const [id, def] of Object.entries(ACHIEVEMENT_DEFS)) {
    if (def.type === 'pet' && def.check && def.check(pet)) {
      const existing = db.prepare(
        'SELECT 1 FROM achievements WHERE achieve_id = ? AND target_type = ? AND target_id = ? AND room_id = ?'
      ).get(id, 'pet', String(pet.pet_id), roomId);

      if (!existing) {
        db.prepare(
          'INSERT INTO achievements (achieve_id, target_type, target_id, room_id) VALUES (?, ?, ?, ?)'
        ).run(id, 'pet', String(pet.pet_id), roomId);
        granted.push(def);
      }
    }
  }

  return granted;
}

function grantUserAchievement(userId, roomId, achieveId) {
  const db = getDb();
  const def = ACHIEVEMENT_DEFS[achieveId];
  if (!def) return null;

  const existing = db.prepare(
    'SELECT 1 FROM achievements WHERE achieve_id = ? AND target_type = ? AND target_id = ? AND room_id = ?'
  ).get(achieveId, 'user', userId, roomId);

  if (!existing) {
    db.prepare(
      'INSERT INTO achievements (achieve_id, target_type, target_id, room_id) VALUES (?, ?, ?, ?)'
    ).run(achieveId, 'user', userId, roomId);
    return def;
  }
  return null;
}

// ── 칭호 조회 ────────────────────────────────────────

function getPetTitles(petId, roomId) {
  const db = getDb();
  const rows = db.prepare(
    'SELECT achieve_id FROM achievements WHERE target_type = ? AND target_id = ? AND room_id = ?'
  ).all('pet', String(petId), roomId);

  return rows.map(r => ACHIEVEMENT_DEFS[r.achieve_id]).filter(Boolean);
}

function getUserTitles(userId, roomId) {
  const db = getDb();
  const rows = db.prepare(
    'SELECT achieve_id FROM achievements WHERE target_type = ? AND target_id = ? AND room_id = ?'
  ).all('user', userId, roomId);

  return rows.map(r => ACHIEVEMENT_DEFS[r.achieve_id]).filter(Boolean);
}

function getActivePetTitle(petId, roomId) {
  const titles = getPetTitles(petId, roomId);
  if (titles.length === 0) return '';
  // 가장 최근(마지막) 칭호 표시
  const t = titles[titles.length - 1];
  return `${t.emoji}${t.name} `;
}

// ── 전체 업적 목록 ──────────────────────────────────

function getAllAchievements(petId, roomId, userId) {
  const petTitles = getPetTitles(petId, roomId);
  const userTitles = getUserTitles(userId, roomId);
  const petIds = new Set(petTitles.map(t => t.name));
  const userIds = new Set(userTitles.map(t => t.name));

  const lines = [];
  lines.push('🏅 펫 칭호');
  for (const [, def] of Object.entries(ACHIEVEMENT_DEFS)) {
    if (def.type !== 'pet') continue;
    const unlocked = petIds.has(def.name);
    lines.push(`${unlocked ? '✅' : '⬜'} ${def.emoji} ${def.name} — ${def.desc}`);
  }
  lines.push('');
  lines.push('🎖️ 유저 칭호');
  for (const [, def] of Object.entries(ACHIEVEMENT_DEFS)) {
    if (def.type !== 'user') continue;
    const unlocked = userIds.has(def.name);
    lines.push(`${unlocked ? '✅' : '⬜'} ${def.emoji} ${def.name} — ${def.desc}`);
  }

  return lines.join('\n');
}

module.exports = {
  ACHIEVEMENT_DEFS,
  checkAndGrant,
  grantUserAchievement,
  getPetTitles,
  getUserTitles,
  getActivePetTitle,
  getAllAchievements,
};
