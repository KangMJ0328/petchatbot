const { getDb } = require('../db/schema');

// ── 성격 정의 ────────────────────────────────────────

const NATURES = {
  active:   { name: '활발함',  emoji: '🏃', desc: '경험치 +10%',                    effect: { exp_mult: 1.10 } },
  glutton:  { name: '먹보',    emoji: '🍔', desc: '포만도 감소 -20%',               effect: { fullness_decay_mult: 0.80 } },
  cool:     { name: '시크함',  emoji: '😎', desc: '대사가 짧지만 골드 잘 물어옴',    effect: { gold_bonus: 1.15 } },
  gentle:   { name: '온순함',  emoji: '🐑', desc: '행복도 감소 -20%',               effect: { happiness_decay_mult: 0.80 } },
  brave:    { name: '용감함',  emoji: '🦁', desc: '훈련 스탯 +1 보너스',            effect: { train_bonus: 1 } },
  shy:      { name: '수줍음',  emoji: '🙈', desc: '약탈 방어 시 보상 +50%',         effect: { defend_bonus: 1.50 } },
  curious:  { name: '호기심',  emoji: '🔍', desc: '탐험 보상 +15%',                 effect: { explore_bonus: 1.15 } },
  lazy:     { name: '게으름',  emoji: '😴', desc: '자동 회복 시 행복도 +3',          effect: { rest_bonus: 3 } },
};

// ── 성격 부여 (출생 시 랜덤) ─────────────────────────

async function assignNature(petId) {
  const db = getDb();
  const keys = Object.keys(NATURES);
  const nature = keys[Math.floor(Math.random() * keys.length)];
  await db.run('UPDATE pets SET nature = ? WHERE pet_id = ?', [nature, petId]);
  return NATURES[nature];
}

// ── 성격 조회 ────────────────────────────────────────

function getNature(pet) {
  if (!pet.nature) return null;
  return NATURES[pet.nature] || null;
}

function getNatureDisplay(pet) {
  const nature = getNature(pet);
  if (!nature) return '';
  return `${nature.emoji} ${nature.name}`;
}

// ── 성격에 따른 대사 ────────────────────────────────

const NATURE_DIALOGUES = {
  active:  ['오늘도 열심히 달려볼까요!', '쉬는 건 싫어요! 더 놀아요!', '에너지 넘쳐요! ⚡'],
  glutton: ['배고파요... 밥 줘요...', '또 먹어도 되나요? 🥺', '맛있는 거 없나요~'],
  cool:    ['...', '음.', '별거 아니에요.'],
  gentle:  ['오늘도 좋은 하루예요~', '다들 행복했으면 좋겠어요.', '같이 있어서 좋아요 💕'],
  brave:   ['도전이 필요해요!', '무서운 거 없어요!', '나한테 맡겨요! 💪'],
  shy:     ['아... 안녕하세요...', '많이 보지 말아주세요... 🙈', '...감사해요.'],
  curious: ['저건 뭐예요?!', '가보고 싶은 곳이 너무 많아요!', '신기한 거 발견! 🔍'],
  lazy:    ['자고 싶어요...', '5분만 더...', '움직이기 귀찮아요~ 😴'],
};

function getRandomDialogue(nature) {
  const dialogues = NATURE_DIALOGUES[nature];
  if (!dialogues) return '안녕하세요!';
  return dialogues[Math.floor(Math.random() * dialogues.length)];
}

module.exports = { NATURES, assignNature, getNature, getNatureDisplay, getRandomDialogue };
