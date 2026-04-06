// ── 날씨/시간대 시스템 (실제 시간 기반) ──────────────

const WEATHER_POOL = [
  { id: 'sunny',  emoji: '☀️', name: '맑음',   effect: '훈련 효율 +10%',      train_mult: 1.10, feed_mult: 1.0 },
  { id: 'cloudy', emoji: '☁️', name: '흐림',   effect: '특별한 효과 없음',      train_mult: 1.0,  feed_mult: 1.0 },
  { id: 'rainy',  emoji: '🌧️', name: '비',    effect: '훈련 효율 -10%, 먹이 +10%', train_mult: 0.90, feed_mult: 1.10 },
  { id: 'snowy',  emoji: '❄️', name: '눈',    effect: '행복도 감소 -30%',      train_mult: 0.95, feed_mult: 1.0, happiness_decay_mult: 0.70 },
  { id: 'stormy', emoji: '⛈️', name: '폭풍',  effect: '탐험 불가, 먹이 +20%',  train_mult: 0.80, feed_mult: 1.20, no_explore: true },
  { id: 'hot',    emoji: '🔥', name: '폭염',  effect: '포만도 감소 +20%',      train_mult: 1.0,  feed_mult: 1.0, fullness_decay_mult: 1.20 },
];

// 날짜 기반 시드로 하루 동안 동일한 날씨 유지
function getTodayWeather() {
  const today = new Date().toISOString().split('T')[0];
  const seed = hashCode(today);
  const idx = Math.abs(seed) % WEATHER_POOL.length;
  return WEATHER_POOL[idx];
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return hash;
}

// ── 시간대 효과 ──────────────────────────────────────

function getTimeOfDay() {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12)  return { id: 'morning',  emoji: '🌅', name: '아침', desc: '경험치 +5%',    exp_mult: 1.05 };
  if (hour >= 12 && hour < 18) return { id: 'afternoon', emoji: '☀️', name: '오후', desc: '기본',          exp_mult: 1.0 };
  if (hour >= 18 && hour < 22) return { id: 'evening',  emoji: '🌇', name: '저녁', desc: '먹이 효율 +5%', feed_mult: 1.05 };
  return                              { id: 'night',    emoji: '🌙', name: '밤',   desc: '수면 효율 +20% (행복도 회복)', rest_bonus: true };
}

// ── 현재 환경 상태 텍스트 ───────────────────────────

function getEnvironmentStatus() {
  const weather = getTodayWeather();
  const time = getTimeOfDay();
  return `${weather.emoji} ${weather.name} | ${time.emoji} ${time.name}\n효과: ${weather.effect} / ${time.desc}`;
}

module.exports = { getTodayWeather, getTimeOfDay, getEnvironmentStatus, WEATHER_POOL };
