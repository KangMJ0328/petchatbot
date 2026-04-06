const { getDb } = require('../db/schema');

// ── 운세 목록 ────────────────────────────────────────

const FORTUNES = [
  { text: '🌟 대길! 오늘은 모든 일이 잘 풀릴 거예요!',        buff: 'exp_bonus',      value: 0.15 },
  { text: '☀️ 길! 먹이를 주면 평소보다 더 맛있어할 거예요.',    buff: 'feed_bonus',     value: 0.10 },
  { text: '🌈 소길! 평범하지만 평화로운 하루가 될 거예요.',     buff: null,             value: 0 },
  { text: '⭐ 중길! 훈련하면 좋은 결과가 있을 거예요.',         buff: 'train_bonus',    value: 0.15 },
  { text: '🍀 행운! 황금알을 발견할 확률이 올라갈 거예요.',      buff: 'golden_bonus',   value: 0.05 },
  { text: '🌙 평길. 무난한 하루, 쉬어가는 것도 좋아요.',       buff: null,             value: 0 },
  { text: '💫 특길! 탐험을 가면 좋은 일이 생길 거예요!',        buff: 'explore_bonus',  value: 0.20 },
  { text: '🔮 신비! 오늘 진화 확률이 높아졌어요!',              buff: 'evo_bonus',      value: 0.10 },
  { text: '😅 소흉... 조심하세요. 약탈이 올 수도 있어요.',       buff: null,             value: 0 },
  { text: '❤️ 애정운! 펫의 행복도가 잘 오를 거예요.',           buff: 'happy_bonus',    value: 0.20 },
];

// ── 운세 뽑기 (일일 1회) ─────────────────────────────

function drawFortune(userId, roomId) {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  // 오늘 이미 뽑았는지 체크
  const existing = db.prepare(
    'SELECT * FROM fortune_log WHERE user_id = ? AND room_id = ? AND fortune_date = ?'
  ).get(userId, roomId, today);

  if (existing) {
    return {
      success: false,
      already: true,
      message: `오늘의 운세는 이미 뽑았어요!\n\n${existing.fortune_text}`,
      buff: existing.buff_type,
      buffValue: existing.buff_value,
    };
  }

  // 랜덤 운세
  const fortune = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];

  db.prepare(`
    INSERT INTO fortune_log (user_id, room_id, fortune_date, fortune_text, buff_type, buff_value)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, roomId, today, fortune.text, fortune.buff, fortune.value);

  const buffMsg = fortune.buff ? `\n\n🎯 버프: ${getBuffDescription(fortune.buff, fortune.value)}` : '';

  return {
    success: true,
    message: `🔮 오늘의 운세\n\n${fortune.text}${buffMsg}`,
    buff: fortune.buff,
    buffValue: fortune.value,
  };
}

// ── 오늘 버프 확인 ───────────────────────────────────

function getTodayBuff(userId, roomId) {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  const row = db.prepare(
    'SELECT buff_type, buff_value FROM fortune_log WHERE user_id = ? AND room_id = ? AND fortune_date = ?'
  ).get(userId, roomId, today);

  return row ? { buff: row.buff_type, value: row.buff_value } : null;
}

function getBuffDescription(buff, value) {
  const pct = Math.round(value * 100);
  const map = {
    exp_bonus:     `경험치 +${pct}%`,
    feed_bonus:    `먹이 효율 +${pct}%`,
    train_bonus:   `훈련 경험치 +${pct}%`,
    golden_bonus:  `황금알 확률 +${pct}%`,
    explore_bonus: `탐험 보상 +${pct}%`,
    evo_bonus:     `진화 보너스 +${pct}%`,
    happy_bonus:   `행복도 상승 +${pct}%`,
  };
  return map[buff] || '없음';
}

// ── 가위바위보 (간식 내기) ───────────────────────────

function rockPaperScissors(userId, roomId, userChoice, betGold) {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE user_id = ? AND room_id = ?').get(userId, roomId);
  if (!user) return { success: false, message: '유저 정보를 찾을 수 없어요.' };

  if (user.gold < betGold) {
    return { success: false, message: `골드가 부족해요! 보유: ${user.gold}G` };
  }

  const choices = ['가위', '바위', '보'];
  if (!choices.includes(userChoice)) {
    return { success: false, message: '가위, 바위, 보 중 하나를 선택하세요!' };
  }

  const petChoice = choices[Math.floor(Math.random() * 3)];
  const userIdx = choices.indexOf(userChoice);
  const petIdx = choices.indexOf(petChoice);

  let result;
  if (userIdx === petIdx) {
    result = 'draw';
  } else if ((userIdx + 1) % 3 === petIdx) {
    result = 'win';
  } else {
    result = 'lose';
  }

  let message = `✊✌️✋ 가위바위보!\n\n당신: ${userChoice} vs 펫: ${petChoice}\n\n`;

  db.transaction(() => {
    if (result === 'win') {
      db.prepare('UPDATE users SET gold = gold + ? WHERE user_id = ? AND room_id = ?').run(betGold, userId, roomId);
      message += `🎉 승리! +${betGold}G 획득!`;
    } else if (result === 'lose') {
      db.prepare('UPDATE users SET gold = gold - ? WHERE user_id = ? AND room_id = ?').run(betGold, userId, roomId);
      // 진 골드는 펫 행복도로
      db.prepare('UPDATE pets SET happiness = MIN(100, happiness + 5) WHERE room_id = ?').run(roomId);
      message += `😢 패배... -${betGold}G (펫이 좋아해요! 행복도+5)`;
    } else {
      message += `🤝 무승부! 골드 변동 없음.`;
    }
  })();

  return { success: true, message, result };
}

module.exports = { drawFortune, getTodayBuff, rockPaperScissors };
