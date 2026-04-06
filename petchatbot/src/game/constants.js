// 진화 단계 정의
const EVOLUTION_STAGES = {
  egg:    { name: '알',         minLevel: 1,  expToNext: 30  },
  baby:   { name: '아기',       minLevel: 2,  expToNext: 80  },
  child:  { name: '어린이',     minLevel: 5,  expToNext: 200 },
  teen:   { name: '청소년',     minLevel: 10, expToNext: 500 },
  adult:  { name: '성체',       minLevel: 20, expToNext: null },
};

// 진화 분기 타입
const EVOLUTION_TYPES = {
  warrior: {
    name: '전사형',
    emoji: '⚔️',
    description: '고기를 많이 먹어 강인한 전사로 성장!',
    statBonus: { strength: 5, intelligence: 0, charm: 1 },
  },
  scholar: {
    name: '학자형',
    emoji: '📚',
    description: '채소를 많이 먹어 지혜로운 학자로 성장!',
    statBonus: { strength: 0, intelligence: 5, charm: 1 },
  },
  balanced: {
    name: '균형형',
    emoji: '⚖️',
    description: '균형 잡힌 식단으로 조화로운 성장!',
    statBonus: { strength: 2, intelligence: 2, charm: 3 },
  },
};

// 레벨업에 필요한 경험치 (레벨 -> 필요 경험치)
function expForLevel(level) {
  return Math.floor(20 * Math.pow(level, 1.5));
}

// 포만도 자연 감소량 (시간당)
const FULLNESS_DECAY_PER_HOUR = 5;
const HAPPINESS_DECAY_PER_HOUR = 3;

// 이미지 키 매핑
const IMAGE_MAP = {
  // 알
  egg_default:         'egg_default.png',
  egg_happy:           'egg_happy.png',
  egg_sad:             'egg_sad.png',
  // 아기
  baby_happy:          'baby_happy.png',
  baby_hungry:         'baby_hungry.png',
  baby_sleeping:       'baby_sleeping.png',
  // 어린이 ~ 청소년 (전사형)
  child_warrior:       'child_warrior.png',
  teen_warrior:        'teen_warrior.png',
  adult_warrior:       'adult_warrior.png',
  // 어린이 ~ 청소년 (학자형)
  child_scholar:       'child_scholar.png',
  teen_scholar:        'teen_scholar.png',
  adult_scholar:       'adult_scholar.png',
  // 균형형
  child_balanced:      'child_balanced.png',
  teen_balanced:       'teen_balanced.png',
  adult_balanced:      'adult_balanced.png',
  // 특수
  golden_event:        'golden_event.png',
  raid_alert:          'raid_alert.png',
};

function getImageUrl(baseUrl, imageKey) {
  const filename = IMAGE_MAP[imageKey] || IMAGE_MAP['egg_default'];
  return `${baseUrl}/images/${filename}`;
}

// 펫 상태 이모지
function getMoodEmoji(fullness, happiness) {
  if (fullness <= 10) return '😫';
  if (fullness <= 30) return '😢';
  if (happiness >= 80 && fullness >= 60) return '😆';
  if (happiness >= 50) return '😊';
  return '😐';
}

function getStageEmoji(stage) {
  const map = { egg: '🥚', baby: '🐣', child: '🐥', teen: '🐾', adult: '🦁' };
  return map[stage] || '🐾';
}

module.exports = {
  EVOLUTION_STAGES,
  EVOLUTION_TYPES,
  expForLevel,
  FULLNESS_DECAY_PER_HOUR,
  HAPPINESS_DECAY_PER_HOUR,
  IMAGE_MAP,
  getImageUrl,
  getMoodEmoji,
  getStageEmoji,
};
