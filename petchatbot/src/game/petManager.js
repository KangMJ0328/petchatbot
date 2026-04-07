const { getDb } = require('../db/schema');
const {
  EVOLUTION_STAGES, EVOLUTION_TYPES, expForLevel,
  FULLNESS_DECAY_PER_HOUR, HAPPINESS_DECAY_PER_HOUR,
  getImageUrl, getMoodEmoji, getStageEmoji,
} = require('./constants');

// ── 방/유저/펫 초기화 ────────────────────────────────

async function ensureRoom(roomId) {
  const db = getDb();
  await db.run('INSERT OR IGNORE INTO rooms (room_id) VALUES (?)', [roomId]);
  return await db.get('SELECT * FROM rooms WHERE room_id = ?', [roomId]);
}

async function ensureUser(userId, roomId) {
  const db = getDb();
  await db.run(
    'INSERT OR IGNORE INTO users (user_id, room_id) VALUES (?, ?)',
    [userId, roomId]
  );
  return await db.get(
    'SELECT * FROM users WHERE user_id = ? AND room_id = ?',
    [userId, roomId]
  );
}

async function ensurePet(roomId) {
  const db = getDb();
  await db.run(
    'INSERT OR IGNORE INTO pets (room_id) VALUES (?)',
    [roomId]
  );
  return await db.get('SELECT * FROM pets WHERE room_id = ?', [roomId]);
}

async function initRoom(roomId, userId) {
  await ensureRoom(roomId);
  await ensureUser(userId, roomId);
  return await ensurePet(roomId);
}

// ── 포만도/행복도 자연 감소 계산 ─────────────────────

async function applyDecay(pet) {
  const db = getDb();
  const now = new Date();
  const updated = new Date(pet.updated_at + 'Z');
  const hours = (now - updated) / (1000 * 60 * 60);

  if (hours < 0.1) return pet; // 6분 미만이면 패스

  const fullnessDecay = Math.floor(hours * FULLNESS_DECAY_PER_HOUR);
  const happinessDecay = Math.floor(hours * HAPPINESS_DECAY_PER_HOUR);

  const newFullness = Math.max(0, pet.fullness - fullnessDecay);
  const newHappiness = Math.max(0, pet.happiness - happinessDecay);

  await db.run(`
    UPDATE pets SET fullness = ?, happiness = ?, updated_at = datetime('now')
    WHERE pet_id = ?
  `, [newFullness, newHappiness, pet.pet_id]);

  return { ...pet, fullness: newFullness, happiness: newHappiness };
}

// ── 먹이 주기 ────────────────────────────────────────

async function feedPet(roomId, userId, foodId) {
  const db = getDb();
  const user = await ensureUser(userId, roomId);
  let pet = await ensurePet(roomId);
  pet = await applyDecay(pet);

  // 먹이 아이템 조회
  const food = await db.get('SELECT * FROM food_items WHERE food_id = ?', [foodId]);
  if (!food) return { success: false, message: '존재하지 않는 먹이입니다.' };

  // 포만도 체크
  if (pet.fullness >= 100) {
    return { success: false, message: `${pet.name}(이)가 배가 너무 불러요! 🫃\n잠시 후에 다시 먹여주세요.` };
  }

  // 골드 체크
  if (user.gold < food.cost) {
    return {
      success: false,
      message: `골드가 부족해요! 💰\n필요: ${food.cost}G / 보유: ${user.gold}G`,
    };
  }

  // 트랜잭션 대신 순차 실행
  // 골드 차감
  await db.run('UPDATE users SET gold = gold - ?, last_active_at = datetime(\'now\') WHERE user_id = ? AND room_id = ?',
    [food.cost, userId, roomId]);

  // 펫 상태 업데이트
  const newFullness = Math.min(100, pet.fullness + food.fullness_gain);
  const newExp = pet.exp + food.exp_gain;
  const meatInc = food.type === 'meat' ? 1 : 0;
  const veggieInc = food.type === 'veggie' ? 1 : 0;

  let statUpdate = '';
  let statParams = [newFullness, newExp, meatInc, veggieInc];
  if (food.stat_bonus_type && food.stat_bonus_value > 0) {
    statUpdate = `, ${food.stat_bonus_type} = ${food.stat_bonus_type} + ${food.stat_bonus_value}`;
  }

  await db.run(`
    UPDATE pets SET
      fullness = ?,
      exp = ?,
      happiness = MIN(100, happiness + 5),
      meat_fed = meat_fed + ?,
      veggie_fed = veggie_fed + ?
      ${statUpdate},
      updated_at = datetime('now')
    WHERE pet_id = ?
  `, [...statParams, pet.pet_id]);

  // 기여도 증가
  await db.run('UPDATE users SET contribution = contribution + ? WHERE user_id = ? AND room_id = ?',
    [food.exp_gain, userId, roomId]);

  // 방 총 경험치 증가
  await db.run('UPDATE rooms SET total_exp = total_exp + ?, updated_at = datetime(\'now\') WHERE room_id = ?',
    [food.exp_gain, roomId]);

  // 활동 로그
  await db.run(`
    INSERT INTO activity_log (room_id, user_id, action, detail, gold_change, exp_change)
    VALUES (?, ?, 'feed', ?, ?, ?)
  `, [roomId, userId, `${food.name} 먹임`, -food.cost, food.exp_gain]);

  // 레벨업 & 진화 체크
  const updatedPet = await db.get('SELECT * FROM pets WHERE pet_id = ?', [pet.pet_id]);
  const levelUpResult = await checkLevelUp(updatedPet);
  const evolutionResult = await checkEvolution(updatedPet);

  return {
    success: true,
    message: `${food.emoji} ${food.name}을(를) 먹였어요!`,
    pet: await db.get('SELECT * FROM pets WHERE pet_id = ?', [pet.pet_id]),
    levelUp: levelUpResult,
    evolution: evolutionResult,
    goldSpent: food.cost,
  };
}

// ── 레벨업 체크 ──────────────────────────────────────

async function checkLevelUp(pet) {
  const db = getDb();
  let levelsGained = 0;
  let currentExp = pet.exp;
  let currentLevel = pet.level;

  while (currentExp >= expForLevel(currentLevel)) {
    currentExp -= expForLevel(currentLevel);
    currentLevel++;
    levelsGained++;
  }

  if (levelsGained > 0) {
    await db.run('UPDATE pets SET level = ?, exp = ? WHERE pet_id = ?',
      [currentLevel, currentExp, pet.pet_id]);
    return { leveled: true, newLevel: currentLevel, levelsGained };
  }
  return { leveled: false };
}

// ── 진화 체크 ────────────────────────────────────────

async function checkEvolution(pet) {
  const db = getDb();
  const refreshed = await db.get('SELECT * FROM pets WHERE pet_id = ?', [pet.pet_id]);
  const stages = Object.entries(EVOLUTION_STAGES);

  let nextStage = null;
  for (let i = 0; i < stages.length - 1; i++) {
    if (stages[i][0] === refreshed.evolution_stage) {
      const next = stages[i + 1];
      if (refreshed.level >= next[1].minLevel) {
        nextStage = next[0];
      }
      break;
    }
  }

  if (!nextStage) return { evolved: false };

  // 진화 타입 결정 (child 단계부터 분기)
  let evolveType = refreshed.evolution_type;
  if (!evolveType && nextStage !== 'baby') {
    const total = refreshed.meat_fed + refreshed.veggie_fed;
    if (total === 0) {
      evolveType = 'balanced';
    } else {
      const meatRatio = refreshed.meat_fed / total;
      if (meatRatio >= 0.6) evolveType = 'warrior';
      else if (meatRatio <= 0.4) evolveType = 'scholar';
      else evolveType = 'balanced';
    }
  }

  // 진화 실행
  const fromStage = refreshed.evolution_stage;
  const typeInfo = evolveType ? EVOLUTION_TYPES[evolveType] : null;
  let imageKey = `${nextStage}_${evolveType || 'happy'}`;

  if (evolveType && typeInfo) {
    await db.run(`
      UPDATE pets SET
        strength = strength + ?,
        intelligence = intelligence + ?,
        charm = charm + ?
      WHERE pet_id = ?
    `, [typeInfo.statBonus.strength, typeInfo.statBonus.intelligence, typeInfo.statBonus.charm, refreshed.pet_id]);
  }

  await db.run(`
    UPDATE pets SET evolution_stage = ?, evolution_type = COALESCE(?, evolution_type), current_image_key = ?, updated_at = datetime('now')
    WHERE pet_id = ?
  `, [nextStage, evolveType, imageKey, refreshed.pet_id]);

  // 진화 로그
  await db.run(`
    INSERT INTO evolution_log (pet_id, from_stage, to_stage, evolution_type, condition_met)
    VALUES (?, ?, ?, ?, ?)
  `, [
    refreshed.pet_id, fromStage, nextStage, evolveType,
    `Lv.${refreshed.level} meat:${refreshed.meat_fed} veggie:${refreshed.veggie_fed}`
  ]);

  const finalPet = await db.get('SELECT * FROM pets WHERE pet_id = ?', [refreshed.pet_id]);
  return {
    evolved: true,
    from: fromStage,
    to: nextStage,
    type: evolveType,
    typeInfo,
    pet: finalPet,
  };
}

// ── 훈련 ─────────────────────────────────────────────

async function trainPet(roomId, userId, statType) {
  const db = getDb();
  const user = await ensureUser(userId, roomId);
  let pet = await ensurePet(roomId);
  pet = await applyDecay(pet);

  const cost = 15;
  if (user.gold < cost) {
    return { success: false, message: `골드가 부족해요! 💰\n필요: ${cost}G / 보유: ${user.gold}G` };
  }

  if (pet.fullness < 20) {
    return { success: false, message: `${pet.name}(이)가 배가 고파서 훈련할 수 없어요! 🍽️\n먼저 먹이를 주세요.` };
  }

  const validStats = ['strength', 'intelligence', 'charm'];
  if (!validStats.includes(statType)) {
    return { success: false, message: '훈련 종류: 근력(strength), 지능(intelligence), 매력(charm)' };
  }

  const statNames = { strength: '💪 근력', intelligence: '🧠 지능', charm: '✨ 매력' };
  const expGain = 10;
  const statGain = Math.floor(Math.random() * 3) + 1;

  await db.run('UPDATE users SET gold = gold - ?, last_active_at = datetime(\'now\') WHERE user_id = ? AND room_id = ?',
    [cost, userId, roomId]);
  await db.run(`UPDATE pets SET ${statType} = ${statType} + ?, exp = exp + ?, fullness = MAX(0, fullness - 10), updated_at = datetime('now') WHERE pet_id = ?`,
    [statGain, expGain, pet.pet_id]);
  await db.run('UPDATE users SET contribution = contribution + ? WHERE user_id = ? AND room_id = ?',
    [expGain, userId, roomId]);
  await db.run('UPDATE rooms SET total_exp = total_exp + ? WHERE room_id = ?',
    [expGain, roomId]);
  await db.run(`INSERT INTO activity_log (room_id, user_id, action, detail, gold_change, exp_change) VALUES (?, ?, 'train', ?, ?, ?)`,
    [roomId, userId, `${statNames[statType]} 훈련`, -cost, expGain]);

  const updatedPet = await db.get('SELECT * FROM pets WHERE pet_id = ?', [pet.pet_id]);
  await checkLevelUp(updatedPet);
  const evolutionResult = await checkEvolution(updatedPet);

  return {
    success: true,
    message: `${statNames[statType]} 훈련 완료! +${statGain}`,
    pet: await db.get('SELECT * FROM pets WHERE pet_id = ?', [pet.pet_id]),
    evolution: evolutionResult,
  };
}

// ── 펫 이름 변경 ─────────────────────────────────────

async function renamePet(roomId, newName) {
  const db = getDb();
  if (!newName || newName.length > 10) {
    return { success: false, message: '이름은 1~10자로 지어주세요.' };
  }
  await db.run('UPDATE pets SET name = ? WHERE room_id = ?', [newName, roomId]);
  return { success: true, message: `펫 이름이 '${newName}'(으)로 변경되었어요! 🎉` };
}

// ── 상태 기반 동적 이미지 키 ─────────────────────────

function getDynamicImageKey(pet) {
  const stage = pet.evolution_stage;
  const type = pet.evolution_type;

  // 알 단계: 포만도/행복도에 따라 감정 변화
  if (stage === 'egg') {
    if (pet.happiness >= 50 && pet.fullness >= 30) return 'egg_happy';
    if (pet.fullness <= 25 || pet.happiness <= 25) return 'egg_sad';
    return 'egg_default';
  }

  // 아기 단계: 포만도/행복도에 따라 감정 변화
  if (stage === 'baby') {
    if (pet.fullness <= 20) return 'baby_hungry';
    if (pet.happiness <= 20) return 'baby_sleeping';
    return 'baby_happy';
  }

  // 어린이 이상: 진화 타입 기반
  if (type) return `${stage}_${type}`;

  // 폴백
  return pet.current_image_key || 'egg_default';
}

// ── 펫 상태 조회 ─────────────────────────────────────

async function getPetStatus(roomId, baseUrl) {
  const db = getDb();
  let pet = await db.get('SELECT * FROM pets WHERE room_id = ?', [roomId]);
  if (!pet) return null;
  pet = await applyDecay(pet);

  const refreshed = await db.get('SELECT * FROM pets WHERE pet_id = ?', [pet.pet_id]);
  const room = await db.get('SELECT * FROM rooms WHERE room_id = ?', [roomId]);
  const stageInfo = EVOLUTION_STAGES[refreshed.evolution_stage];
  const typeInfo = refreshed.evolution_type ? EVOLUTION_TYPES[refreshed.evolution_type] : null;

  const nextExp = expForLevel(refreshed.level);
  const moodEmoji = getMoodEmoji(refreshed.fullness, refreshed.happiness);
  const stageEmoji = getStageEmoji(refreshed.evolution_stage);
  const typeStr = typeInfo ? `${typeInfo.emoji} ${typeInfo.name}` : '';

  return {
    pet: refreshed,
    room,
    display: {
      title: `${stageEmoji} Lv.${refreshed.level} ${refreshed.name} ${typeStr}`,
      description: [
        `${moodEmoji} 기분: ${refreshed.happiness}%`,
        `🍖 포만도: ${refreshed.fullness}%`,
        `✨ 경험치: ${refreshed.exp}/${nextExp}`,
        `💪 근력: ${refreshed.strength} | 🧠 지능: ${refreshed.intelligence} | ✨ 매력: ${refreshed.charm}`,
        `📊 단계: ${stageInfo.name}${typeStr ? ' (' + typeStr + ')' : ''}`,
      ].join('\n'),
      imageUrl: getImageUrl(baseUrl, getDynamicImageKey(refreshed)),
    },
  };
}

// ── 유저 정보 ────────────────────────────────────────

async function getUserInfo(userId, roomId) {
  const db = getDb();
  const user = await db.get('SELECT * FROM users WHERE user_id = ? AND room_id = ?', [userId, roomId]);
  if (!user) return null;
  return user;
}

// ── 먹이 목록 ────────────────────────────────────────

async function getFoodList() {
  const db = getDb();
  return await db.all('SELECT * FROM food_items ORDER BY cost ASC', []);
}

module.exports = {
  initRoom,
  ensureRoom,
  ensureUser,
  ensurePet,
  feedPet,
  trainPet,
  renamePet,
  getPetStatus,
  getUserInfo,
  getFoodList,
  applyDecay,
  checkLevelUp,
  checkEvolution,
};
