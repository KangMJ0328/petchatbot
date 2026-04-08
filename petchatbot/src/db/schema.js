const { createClient } = require('@libsql/client');

const client = createClient({
  url: process.env.TURSO_URL || 'file:petgame.db',
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});

// ── 동기식 API를 흉내내는 래퍼 ─────────────────────

const db = {
  client,
  async run(sql, params = []) {
    return client.execute({ sql, args: params });
  },
  async get(sql, params = []) {
    const result = await client.execute({ sql, args: params });
    return result.rows[0] || null;
  },
  async all(sql, params = []) {
    const result = await client.execute({ sql, args: params });
    return result.rows;
  },
  async exec(sql) {
    const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
    for (const stmt of statements) {
      await client.execute(stmt);
    }
  },
  async batch(stmts) {
    return client.batch(stmts, 'write');
  },
};

function getDb() {
  return db;
}

async function initializeDb() {
  // 테이블 생성 (각각 개별 실행 — Turso는 다중 statement 미지원)
  const tables = [
    `CREATE TABLE IF NOT EXISTS rooms (
      room_id TEXT PRIMARY KEY,
      room_name TEXT DEFAULT '우리방',
      room_code TEXT UNIQUE,
      total_exp INTEGER DEFAULT 0,
      weather_buff TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      user_id TEXT NOT NULL,
      room_id TEXT NOT NULL,
      nickname TEXT DEFAULT '익명',
      gold INTEGER DEFAULT 100,
      contribution INTEGER DEFAULT 0,
      last_active_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, room_id)
    )`,
    `CREATE TABLE IF NOT EXISTS pets (
      pet_id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT UNIQUE NOT NULL,
      name TEXT DEFAULT '알',
      level INTEGER DEFAULT 1,
      exp INTEGER DEFAULT 0,
      evolution_stage TEXT DEFAULT 'egg',
      evolution_type TEXT DEFAULT NULL,
      strength INTEGER DEFAULT 5,
      intelligence INTEGER DEFAULT 5,
      charm INTEGER DEFAULT 5,
      fullness INTEGER DEFAULT 50,
      happiness INTEGER DEFAULT 50,
      meat_fed INTEGER DEFAULT 0,
      veggie_fed INTEGER DEFAULT 0,
      nature TEXT DEFAULT NULL,
      generation INTEGER DEFAULT 1,
      legacy_bonus_str INTEGER DEFAULT 0,
      legacy_bonus_int INTEGER DEFAULT 0,
      legacy_bonus_chm INTEGER DEFAULT 0,
      well_fed_streak INTEGER DEFAULT 0,
      consecutive_meat INTEGER DEFAULT 0,
      current_image_key TEXT DEFAULT 'egg_default',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS evolution_log (
      log_id INTEGER PRIMARY KEY AUTOINCREMENT,
      pet_id INTEGER NOT NULL,
      from_stage TEXT NOT NULL,
      to_stage TEXT NOT NULL,
      evolution_type TEXT,
      condition_met TEXT,
      evolved_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS food_items (
      food_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL,
      cost INTEGER NOT NULL,
      fullness_gain INTEGER NOT NULL,
      exp_gain INTEGER NOT NULL,
      type TEXT NOT NULL,
      stat_bonus_type TEXT,
      stat_bonus_value INTEGER DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS activity_log (
      log_id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT,
      gold_change INTEGER DEFAULT 0,
      exp_change INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS raid_events (
      raid_id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      attacker_id TEXT,
      target_item TEXT,
      gold_at_stake INTEGER DEFAULT 0,
      defended INTEGER DEFAULT 0,
      defender_id TEXT,
      expires_at TEXT NOT NULL,
      resolved INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS achievements (
      achieve_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      room_id TEXT NOT NULL,
      unlocked_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (achieve_id, target_type, target_id, room_id)
    )`,
    `CREATE TABLE IF NOT EXISTS expeditions (
      exp_id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      started_by TEXT NOT NULL,
      duration_min INTEGER NOT NULL,
      reward_type TEXT,
      reward_value INTEGER DEFAULT 0,
      reward_detail TEXT,
      story TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      returns_at TEXT NOT NULL,
      collected INTEGER DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS deco_items (
      deco_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL,
      category TEXT NOT NULL,
      cost INTEGER NOT NULL,
      effect_desc TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS room_deco (
      room_id TEXT NOT NULL,
      deco_id TEXT NOT NULL,
      equipped INTEGER DEFAULT 0,
      purchased_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (room_id, deco_id)
    )`,
    `CREATE TABLE IF NOT EXISTS quiz_events (
      quiz_id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      reward_gold INTEGER DEFAULT 50,
      answered_by TEXT,
      expires_at TEXT NOT NULL,
      resolved INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS errands (
      errand_id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_room TEXT NOT NULL,
      to_room TEXT NOT NULL,
      pet_name TEXT NOT NULL,
      gift_gold INTEGER DEFAULT 0,
      message TEXT,
      completed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS fortune_log (
      user_id TEXT NOT NULL,
      room_id TEXT NOT NULL,
      fortune_date TEXT NOT NULL,
      fortune_text TEXT,
      buff_type TEXT,
      buff_value REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, room_id, fortune_date)
    )`,
    `CREATE TABLE IF NOT EXISTS rebirth_log (
      rebirth_id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      generation INTEGER DEFAULT 1,
      prev_level INTEGER,
      prev_type TEXT,
      legacy_bonus TEXT,
      reborn_at TEXT DEFAULT (datetime('now'))
    )`,
  ];

  for (const sql of tables) {
    await client.execute(sql);
  }

  // 기본 데이터 삽입 (밸런스 조정 — 비싼 먹이일수록 가성비 UP)
  const defaultFoods = [
    ['bread', '빵', '🍞', 10, 10, 8, 'veggie', null, 0],
    ['apple', '사과', '🍎', 15, 15, 12, 'veggie', 'intelligence', 1],
    ['salad', '샐러드', '🥗', 20, 20, 18, 'veggie', 'intelligence', 2],
    ['meat', '고기', '🍖', 20, 20, 18, 'meat', 'strength', 1],
    ['steak', '스테이크', '🥩', 35, 35, 35, 'meat', 'strength', 3],
    ['cake', '케이크', '🎂', 30, 15, 25, 'special', 'charm', 4],
    ['golden_apple', '황금사과', '✨', 80, 50, 80, 'special', null, 0],
  ];
  for (const f of defaultFoods) {
    await db.run(
      'INSERT OR IGNORE INTO food_items (food_id, name, emoji, cost, fullness_gain, exp_gain, type, stat_bonus_type, stat_bonus_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      f
    );
    // 기존 데이터도 업데이트
    await db.run(
      'UPDATE food_items SET fullness_gain = ?, exp_gain = ?, stat_bonus_value = ? WHERE food_id = ?',
      [f[4], f[5], f[8], f[0]]
    );
  }

  const defaultDecos = [
    ['red_sofa', '빨간 소파', '🛋️', 'furniture', 100, '행복도 감소 -20%'],
    ['bookshelf', '책장', '📚', 'furniture', 120, '훈련 경험치 +10%'],
    ['cat_tower', '캣타워', '🗼', 'furniture', 150, '매력 훈련 +1 보너스'],
    ['garden_bg', '정원 배경', '🌸', 'background', 200, '포만도 감소 -15%'],
    ['space_bg', '우주 배경', '🌌', 'background', 300, '탐험 보상 +20%'],
    ['castle_bg', '성 배경', '🏰', 'background', 500, '골드 수입 +10%'],
    ['ribbon', '리본', '🎀', 'accessory', 80, '매력 +2'],
    ['crown', '왕관', '👑', 'accessory', 400, '모든 스탯 +1'],
    ['scarf', '목도리', '🧣', 'accessory', 100, '행복도 감소 -10%'],
    ['xmas_tree', '크리스마스 트리', '🎄', 'furniture', 250, '황금알 확률 +5%'],
  ];
  for (const d of defaultDecos) {
    await db.run(
      'INSERT OR IGNORE INTO deco_items (deco_id, name, emoji, category, cost, effect_desc) VALUES (?, ?, ?, ?, ?, ?)',
      d
    );
  }

  console.log('[DB] Turso 초기화 완료');
}

module.exports = { getDb, initializeDb };
