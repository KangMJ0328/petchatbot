const express = require('express');
const router = express.Router();
const petManager = require('../game/petManager');
const events = require('../game/events');
const achievements = require('../game/achievements');
const expedition = require('../game/expedition');
const diary = require('../game/diary');
const fortune = require('../game/fortune');
const errand = require('../game/errand');
const quiz = require('../game/quiz');
const deco = require('../game/deco');
const nature = require('../game/nature');
const rebirth = require('../game/rebirth');
const weather = require('../game/weather');
const kakao = require('../utils/kakaoResponse');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// ── 카카오 요청에서 유저/방 정보 추출 ────────────────

function extractContext(body) {
  const userRequest = body.userRequest || {};
  const user = userRequest.user || {};
  const params = body.action?.params || {};
  const utterance = (userRequest.utterance || '').trim();

  return {
    userId: user.id || 'unknown',
    roomId: userRequest.block?.id || user.id || 'default_room',
    utterance,
    params,
  };
}

// ── /시작 - 펫 생성 ─────────────────────────────────

router.post('/start', async (req, res) => {
  try {
    const { userId, roomId } = extractContext(req.body);
    const pet = await petManager.initRoom(roomId, userId);

    res.json(kakao.basicCardWithQuickReplies({
      title: '🥚 펫이 태어났어요!',
      description: [
        `방에 새로운 알이 나타났어요!`,
        `모두 함께 먹이를 주고 키워보세요!`,
        ``,
        `💰 시작 골드: 100G`,
        `🍖 /먹이 - 펫에게 먹이를 줘요`,
        `📊 /정보 - 펫 상태를 확인해요`,
      ].join('\n'),
      imageUrl: `${BASE_URL}/images/egg_default.png`,
      quickReplies: [
        { label: '🍖 먹이주기', messageText: '/먹이' },
        { label: '📊 펫 정보', messageText: '/정보' },
        { label: '🛒 먹이 목록', messageText: '/상점' },
      ],
    }));
  } catch (err) {
    console.error('[/start]', err);
    res.json(kakao.simpleText('오류가 발생했어요. 다시 시도해주세요.'));
  }
});

// ── /정보 - 펫 상태 조회 ─────────────────────────────

router.post('/info', async (req, res) => {
  try {
    const { userId, roomId } = extractContext(req.body);
    await petManager.initRoom(roomId, userId);

    const status = await petManager.getPetStatus(roomId, BASE_URL);
    if (!status) {
      return res.json(kakao.simpleText('펫이 아직 없어요! /시작 으로 펫을 만들어보세요.'));
    }

    // 칭호, 성격, 날씨, 세대 추가
    const pet = status.pet;
    const title = await achievements.getActivePetTitle(pet.pet_id, roomId);
    const natureStr = nature.getNatureDisplay(pet);
    const envStatus = weather.getEnvironmentStatus();
    const genStr = pet.generation > 1 ? ` (${pet.generation}세대)` : '';
    const dialogue = pet.nature ? nature.getRandomDialogue(pet.nature) : '';

    const desc = [
      status.display.description,
      natureStr ? `🎭 성격: ${natureStr}` : '',
      genStr ? `🔄 세대: ${pet.generation}세대` : '',
      `\n${envStatus}`,
      dialogue ? `\n💬 "${dialogue}"` : '',
    ].filter(Boolean).join('\n');

    // 업적 체크
    await achievements.checkAndGrant(roomId, pet, userId);

    res.json(kakao.basicCardWithQuickReplies({
      title: `${title}${status.display.title}${genStr}`,
      description: desc,
      imageUrl: status.display.imageUrl,
      buttons: [
        { label: '🍖 먹이주기', messageText: '/먹이' },
        { label: '⚔️ 훈련하기', messageText: '/훈련' },
      ],
      quickReplies: [
        { label: '🗺️ 탐험', messageText: '/탐험' },
        { label: '🔮 운세', messageText: '/운세' },
        { label: '📔 일기', messageText: '/일기' },
        { label: '🏅 칭호', messageText: '/칭호' },
        { label: '🏠 데코', messageText: '/데코' },
      ],
    }));
  } catch (err) {
    console.error('[/info]', err);
    res.json(kakao.simpleText('오류가 발생했어요. 다시 시도해주세요.'));
  }
});

// ── /먹이 - 먹이 선택 메뉴 ──────────────────────────

router.post('/feed', async (req, res) => {
  try {
    const { userId, roomId, params } = extractContext(req.body);
    await petManager.initRoom(roomId, userId);

    // 먹이 종류가 파라미터로 넘어오면 바로 먹이기
    const foodId = params.food_id;
    if (foodId) {
      return await doFeed(res, roomId, userId, foodId);
    }

    // 아니면 먹이 목록 보여주기
    const foods = await petManager.getFoodList();
    const user = await petManager.getUserInfo(userId, roomId);

    res.json(kakao.textWithQuickReplies(
      `🛒 먹이 목록 (보유 골드: ${user.gold}G)\n\n` +
      foods.map(f => `${f.emoji} ${f.name} — ${f.cost}G (포만도+${f.fullness_gain}, 경험치+${f.exp_gain})`).join('\n') +
      `\n\n아래에서 먹이를 선택하세요!`,
      foods.map(f => ({ label: `${f.emoji} ${f.name}`, messageText: `/먹이 ${f.food_id}` })),
    ));
  } catch (err) {
    console.error('[/feed]', err);
    res.json(kakao.simpleText('오류가 발생했어요. 다시 시도해주세요.'));
  }
});

// ── /먹이 [food_id] - 먹이 주기 실행 ────────────────

router.post('/feed/:foodId', async (req, res) => {
  try {
    const { userId, roomId } = extractContext(req.body);
    await petManager.initRoom(roomId, userId);
    await doFeed(res, roomId, userId, req.params.foodId);
  } catch (err) {
    console.error('[/feed/:foodId]', err);
    res.json(kakao.simpleText('오류가 발생했어요. 다시 시도해주세요.'));
  }
});

async function doFeed(res, roomId, userId, foodId) {
  const result = await petManager.feedPet(roomId, userId, foodId);

  if (!result.success) {
    return res.json(kakao.simpleText(result.message));
  }

  let message = result.message;

  // 레벨업 메시지
  if (result.levelUp?.leveled) {
    message += `\n\n🎉 레벨 업! Lv.${result.levelUp.newLevel} 달성!`;
  }

  // 진화 메시지
  if (result.evolution?.evolved) {
    const evo = result.evolution;
    const typeStr = evo.typeInfo ? `${evo.typeInfo.emoji} ${evo.typeInfo.name}` : '';
    message += `\n\n🌟 진화! ${evo.from} → ${evo.to} ${typeStr}\n${evo.typeInfo?.description || ''}`;
  }

  // 황금 알 이벤트 체크
  const goldenEgg = await events.tryGoldenEgg(roomId, userId);
  if (goldenEgg) {
    message += `\n\n${goldenEgg.message}`;
  }

  const status = await petManager.getPetStatus(roomId, BASE_URL);

  res.json(kakao.basicCardWithQuickReplies({
    title: status.display.title,
    description: message + `\n\n${status.display.description}`,
    imageUrl: status.display.imageUrl,
    buttons: [
      { label: '🍖 또 먹이기', messageText: '/먹이' },
      { label: '📊 펫 정보', messageText: '/정보' },
    ],
    quickReplies: [
      { label: '⚔️ 훈련', messageText: '/훈련' },
      { label: '🏆 랭킹', messageText: '/랭킹' },
    ],
  }));
}

// ── /훈련 - 스탯 훈련 ───────────────────────────────

router.post('/train', async (req, res) => {
  try {
    const { userId, roomId, params } = extractContext(req.body);
    await petManager.initRoom(roomId, userId);

    const statType = params.stat_type;
    if (statType) {
      return await doTrain(res, roomId, userId, statType);
    }

    res.json(kakao.textWithQuickReplies(
      '⚔️ 어떤 훈련을 할까요? (비용: 15G)\n\n💪 근력 - 공격력 상승\n🧠 지능 - 마법력 상승\n✨ 매력 - 친화력 상승',
      [
        { label: '💪 근력', messageText: '/훈련 strength' },
        { label: '🧠 지능', messageText: '/훈련 intelligence' },
        { label: '✨ 매력', messageText: '/훈련 charm' },
      ],
    ));
  } catch (err) {
    console.error('[/train]', err);
    res.json(kakao.simpleText('오류가 발생했어요. 다시 시도해주세요.'));
  }
});

router.post('/train/:statType', async (req, res) => {
  try {
    const { userId, roomId } = extractContext(req.body);
    await petManager.initRoom(roomId, userId);
    await doTrain(res, roomId, userId, req.params.statType);
  } catch (err) {
    console.error('[/train/:statType]', err);
    res.json(kakao.simpleText('오류가 발생했어요. 다시 시도해주세요.'));
  }
});

async function doTrain(res, roomId, userId, statType) {
  const result = await petManager.trainPet(roomId, userId, statType);

  if (!result.success) {
    return res.json(kakao.simpleText(result.message));
  }

  let message = result.message;
  if (result.evolution?.evolved) {
    const evo = result.evolution;
    message += `\n\n🌟 진화! ${evo.from} → ${evo.to}`;
  }

  const status = await petManager.getPetStatus(roomId, BASE_URL);

  res.json(kakao.basicCardWithQuickReplies({
    title: status.display.title,
    description: message + `\n\n${status.display.description}`,
    imageUrl: status.display.imageUrl,
    quickReplies: [
      { label: '🍖 먹이주기', messageText: '/먹이' },
      { label: '⚔️ 또 훈련', messageText: '/훈련' },
      { label: '📊 펫 정보', messageText: '/정보' },
    ],
  }));
}

// ── /이름 [새이름] - 펫 이름 변경 ────────────────────

router.post('/rename', async (req, res) => {
  try {
    const { userId, roomId, params } = extractContext(req.body);
    await petManager.initRoom(roomId, userId);

    const newName = params.pet_name;
    if (!newName) {
      return res.json(kakao.simpleText('사용법: /이름 [새이름]\n예: /이름 토리'));
    }

    const result = await petManager.renamePet(roomId, newName);
    res.json(kakao.simpleText(result.message));
  } catch (err) {
    console.error('[/rename]', err);
    res.json(kakao.simpleText('오류가 발생했어요. 다시 시도해주세요.'));
  }
});

// ── /상점 - 먹이 목록 ───────────────────────────────

router.post('/shop', async (req, res) => {
  try {
    const { userId, roomId } = extractContext(req.body);
    await petManager.initRoom(roomId, userId);
    const foods = await petManager.getFoodList();
    const user = await petManager.getUserInfo(userId, roomId);

    res.json(kakao.textWithQuickReplies(
      `🛒 상점 (보유: ${user.gold}G)\n\n` +
      foods.map(f => {
        const stat = f.stat_bonus_type ? ` [${f.stat_bonus_type}+${f.stat_bonus_value}]` : '';
        return `${f.emoji} ${f.name} — ${f.cost}G\n   포만도+${f.fullness_gain} 경험치+${f.exp_gain}${stat}`;
      }).join('\n\n'),
      foods.map(f => ({ label: `${f.emoji} ${f.name}`, messageText: `/먹이 ${f.food_id}` })),
    ));
  } catch (err) {
    console.error('[/shop]', err);
    res.json(kakao.simpleText('오류가 발생했어요. 다시 시도해주세요.'));
  }
});

// ── /내정보 - 유저 정보 ──────────────────────────────

router.post('/myinfo', async (req, res) => {
  try {
    const { userId, roomId } = extractContext(req.body);
    await petManager.initRoom(roomId, userId);
    const user = await petManager.getUserInfo(userId, roomId);

    res.json(kakao.simpleText(
      `👤 내 정보\n\n` +
      `💰 골드: ${user.gold}G\n` +
      `⭐ 기여도: ${user.contribution}\n` +
      `🕐 마지막 활동: ${user.last_active_at}`,
    ));
  } catch (err) {
    console.error('[/myinfo]', err);
    res.json(kakao.simpleText('오류가 발생했어요. 다시 시도해주세요.'));
  }
});

// ── /약탈 - 약탈 이벤트 시작 ─────────────────────────

router.post('/raid', async (req, res) => {
  try {
    const { userId, roomId } = extractContext(req.body);
    await petManager.initRoom(roomId, userId);
    const result = await events.startRaid(roomId, userId);
    res.json(kakao.simpleText(result.message));
  } catch (err) {
    console.error('[/raid]', err);
    res.json(kakao.simpleText('오류가 발생했어요. 다시 시도해주세요.'));
  }
});

// ── /방어 - 약탈 방어 ───────────────────────────────

router.post('/defend', async (req, res) => {
  try {
    const { userId, roomId } = extractContext(req.body);
    await petManager.initRoom(roomId, userId);
    const result = await events.defendRaid(roomId, userId);
    res.json(kakao.simpleText(result.message));
  } catch (err) {
    console.error('[/defend]', err);
    res.json(kakao.simpleText('오류가 발생했어요. 다시 시도해주세요.'));
  }
});

// ── /랭킹 - 전체 서버 랭킹 ──────────────────────────

router.post('/ranking', async (req, res) => {
  try {
    const { userId, roomId } = extractContext(req.body);
    await petManager.initRoom(roomId, userId);

    const rankings = await events.getRanking(10);
    if (rankings.length === 0) {
      return res.json(kakao.simpleText('아직 랭킹 데이터가 없어요!'));
    }

    const medals = ['🥇', '🥈', '🥉'];
    const text = '🏆 펫 랭킹 TOP 10\n\n' +
      rankings.map((r, i) => {
        const medal = medals[i] || `${i + 1}.`;
        const typeEmoji = r.evolution_type ? ` (${r.evolution_type})` : '';
        return `${medal} Lv.${r.level} ${r.name}${typeEmoji} — ${r.room_name}`;
      }).join('\n');

    // 현재 방 순위 찾기
    const myRank = rankings.findIndex(r => r.room_id === roomId);
    const rankText = myRank >= 0 ? `\n\n📍 우리 방 순위: ${myRank + 1}위` : '';

    res.json(kakao.textWithQuickReplies(
      text + rankText,
      [
        { label: '👥 방 기여도', messageText: '/기여도' },
        { label: '📊 펫 정보', messageText: '/정보' },
      ],
    ));
  } catch (err) {
    console.error('[/ranking]', err);
    res.json(kakao.simpleText('오류가 발생했어요. 다시 시도해주세요.'));
  }
});

// ── /기여도 - 방 내 기여도 랭킹 ──────────────────────

router.post('/contribution', async (req, res) => {
  try {
    const { userId, roomId } = extractContext(req.body);
    await petManager.initRoom(roomId, userId);

    const rankings = await events.getRoomRanking(roomId);
    if (rankings.length === 0) {
      return res.json(kakao.simpleText('아직 기여도 데이터가 없어요!'));
    }

    const medals = ['🥇', '🥈', '🥉'];
    const text = '👥 우리 방 기여도 랭킹\n\n' +
      rankings.map((r, i) => {
        const medal = medals[i] || `${i + 1}.`;
        return `${medal} ${r.nickname} — 기여도: ${r.contribution} / 골드: ${r.gold}G`;
      }).join('\n');

    res.json(kakao.simpleText(text));
  } catch (err) {
    console.error('[/contribution]', err);
    res.json(kakao.simpleText('오류가 발생했어요. 다시 시도해주세요.'));
  }
});

// ═══════════════════════════════════════════════════
//  신규 시스템 라우트
// ═══════════════════════════════════════════════════

// ── /탐험 ────────────────────────────────────────────

router.post('/expedition', async (req, res) => {
  try {
    const { userId, roomId } = extractContext(req.body);
    await petManager.initRoom(roomId, userId);
    const result = await expedition.startExpedition(roomId, userId);
    res.json(kakao.simpleText(result.message));
  } catch (err) {
    console.error('[/expedition]', err);
    res.json(kakao.simpleText('오류가 발생했어요. 다시 시도해주세요.'));
  }
});

// ── /귀환 ────────────────────────────────────────────

router.post('/return', async (req, res) => {
  try {
    const { userId, roomId } = extractContext(req.body);
    await petManager.initRoom(roomId, userId);
    const result = await expedition.collectExpedition(roomId, userId);
    res.json(kakao.simpleText(result.message));
  } catch (err) {
    console.error('[/return]', err);
    res.json(kakao.simpleText('오류가 발생했어요. 다시 시도해주세요.'));
  }
});

// ── /일기 ────────────────────────────────────────────

router.post('/diary', async (req, res) => {
  try {
    const { userId, roomId } = extractContext(req.body);
    await petManager.initRoom(roomId, userId);
    const text = await diary.generateDiary(roomId);
    res.json(kakao.simpleText(text));
  } catch (err) {
    console.error('[/diary]', err);
    res.json(kakao.simpleText('오류가 발생했어요. 다시 시도해주세요.'));
  }
});

// ── /운세 ────────────────────────────────────────────

router.post('/fortune', async (req, res) => {
  try {
    const { userId, roomId } = extractContext(req.body);
    await petManager.initRoom(roomId, userId);
    const result = await fortune.drawFortune(userId, roomId);
    res.json(kakao.simpleText(result.message));
  } catch (err) {
    console.error('[/fortune]', err);
    res.json(kakao.simpleText('오류가 발생했어요. 다시 시도해주세요.'));
  }
});

// ── /가위바위보 [가위/바위/보] [골드] ────────────────

router.post('/rps', async (req, res) => {
  try {
    const { userId, roomId, params } = extractContext(req.body);
    await petManager.initRoom(roomId, userId);

    const choice = params.choice;
    const bet = parseInt(params.bet_gold) || 20;
    if (!choice) {
      return res.json(kakao.textWithQuickReplies(
        `✊✌️✋ 가위바위보! (배팅: ${bet}G)\n선택하세요!`,
        [
          { label: '✌️ 가위', messageText: `/가위바위보 가위 ${bet}` },
          { label: '✊ 바위', messageText: `/가위바위보 바위 ${bet}` },
          { label: '✋ 보', messageText: `/가위바위보 보 ${bet}` },
        ],
      ));
    }

    const result = await fortune.rockPaperScissors(userId, roomId, choice, bet);
    res.json(kakao.simpleText(result.message));
  } catch (err) {
    console.error('[/rps]', err);
    res.json(kakao.simpleText('오류가 발생했어요. 다시 시도해주세요.'));
  }
});

// ── /칭호 ────────────────────────────────────────────

router.post('/titles', async (req, res) => {
  try {
    const { userId, roomId } = extractContext(req.body);
    await petManager.initRoom(roomId, userId);
    const status = await petManager.getPetStatus(roomId, BASE_URL);
    const pet = status?.pet;
    if (!pet) return res.json(kakao.simpleText('펫이 없어요!'));

    const text = await achievements.getAllAchievements(pet.pet_id, roomId, userId);
    res.json(kakao.simpleText(text));
  } catch (err) {
    console.error('[/titles]', err);
    res.json(kakao.simpleText('오류가 발생했어요. 다시 시도해주세요.'));
  }
});

// ── /심부름 [방코드] ─────────────────────────────────

router.post('/errand', async (req, res) => {
  try {
    const { userId, roomId, params } = extractContext(req.body);
    await petManager.initRoom(roomId, userId);

    const targetCode = params.room_code;
    if (!targetCode) {
      const myCode = await errand.getRoomCode(roomId);
      return res.json(kakao.simpleText(
        `🏃 심부름 시스템\n\n우리 방 코드: ${myCode}\n\n사용법: /심부름 [상대방 코드]\n상대방에게 우리 방 코드를 알려주세요!`,
      ));
    }

    const status = await petManager.getPetStatus(roomId, BASE_URL);
    const pet = status?.pet;
    const result = await errand.sendErrand(roomId, targetCode, pet?.name || '펫');
    res.json(kakao.simpleText(result.message));
  } catch (err) {
    console.error('[/errand]', err);
    res.json(kakao.simpleText('오류가 발생했어요. 다시 시도해주세요.'));
  }
});

// ── /방코드 ──────────────────────────────────────────

router.post('/roomcode', async (req, res) => {
  try {
    const { userId, roomId } = extractContext(req.body);
    await petManager.initRoom(roomId, userId);
    const code = await errand.getRoomCode(roomId);
    res.json(kakao.simpleText(`🔑 우리 방 코드: ${code}\n\n다른 방에 /심부름 ${code} 로 펫을 보낼 수 있어요!`));
  } catch (err) {
    console.error('[/roomcode]', err);
    res.json(kakao.simpleText('오류가 발생했어요. 다시 시도해주세요.'));
  }
});

// ── /퀴즈 ────────────────────────────────────────────

router.post('/quiz', async (req, res) => {
  try {
    const { userId, roomId } = extractContext(req.body);
    await petManager.initRoom(roomId, userId);
    const result = await quiz.createQuiz(roomId);
    res.json(kakao.simpleText(result.message));
  } catch (err) {
    console.error('[/quiz]', err);
    res.json(kakao.simpleText('오류가 발생했어요. 다시 시도해주세요.'));
  }
});

// ── /정답 [답] ───────────────────────────────────────

router.post('/answer', async (req, res) => {
  try {
    const { userId, roomId, params } = extractContext(req.body);
    await petManager.initRoom(roomId, userId);
    const answer = params.answer;
    if (!answer) return res.json(kakao.simpleText('사용법: /정답 [답]'));
    const result = await quiz.answerQuiz(roomId, userId, answer);
    res.json(kakao.simpleText(result.message));
  } catch (err) {
    console.error('[/answer]', err);
    res.json(kakao.simpleText('오류가 발생했어요. 다시 시도해주세요.'));
  }
});

// ── /데코 ────────────────────────────────────────────

router.post('/deco', async (req, res) => {
  try {
    const { userId, roomId } = extractContext(req.body);
    await petManager.initRoom(roomId, userId);
    const user = await petManager.getUserInfo(userId, roomId);

    // 보유 데코 표시
    const owned = await deco.getRoomDecos(roomId);
    const shop = await deco.getDecoShop();

    let text = `🏠 데코 시스템 (보유: ${user.gold}G)\n\n`;

    if (owned.length > 0) {
      text += '📦 보유 아이템:\n';
      text += owned.map(d => `${d.equipped ? '✅' : '⬜'} ${d.emoji} ${d.name} — ${d.effect_desc}`).join('\n');
      text += '\n\n';
    }

    text += '🛒 상점:\n';
    const ownedIds = new Set(owned.map(d => d.deco_id));
    text += shop.filter(d => !ownedIds.has(d.deco_id)).map(d =>
      `${d.emoji} ${d.name} — ${d.cost}G (${d.effect_desc})`
    ).join('\n');

    text += '\n\n/데코구매 [아이템ID] | /장착 [아이템ID]';

    res.json(kakao.simpleText(text));
  } catch (err) {
    console.error('[/deco]', err);
    res.json(kakao.simpleText('오류가 발생했어요. 다시 시도해주세요.'));
  }
});

// ── /데코구매 [deco_id] ──────────────────────────────

router.post('/deco/buy', async (req, res) => {
  try {
    const { userId, roomId, params } = extractContext(req.body);
    await petManager.initRoom(roomId, userId);
    const decoId = params.deco_id;
    if (!decoId) return res.json(kakao.simpleText('사용법: /데코구매 [아이템ID]\n예: /데코구매 red_sofa'));
    const result = await deco.buyDeco(userId, roomId, decoId);
    res.json(kakao.simpleText(result.message));
  } catch (err) {
    console.error('[/deco/buy]', err);
    res.json(kakao.simpleText('오류가 발생했어요. 다시 시도해주세요.'));
  }
});

// ── /장착 [deco_id] ──────────────────────────────────

router.post('/deco/equip', async (req, res) => {
  try {
    const { userId, roomId, params } = extractContext(req.body);
    await petManager.initRoom(roomId, userId);
    const decoId = params.deco_id;
    if (!decoId) return res.json(kakao.simpleText('사용법: /장착 [아이템ID]'));
    const result = await deco.equipDeco(roomId, decoId);
    res.json(kakao.simpleText(result.message));
  } catch (err) {
    console.error('[/deco/equip]', err);
    res.json(kakao.simpleText('오류가 발생했어요. 다시 시도해주세요.'));
  }
});

// ── /환생 ────────────────────────────────────────────

router.post('/rebirth', async (req, res) => {
  try {
    const { userId, roomId, params } = extractContext(req.body);
    await petManager.initRoom(roomId, userId);

    const confirm = params.confirm;
    if (confirm === '확인') {
      const result = await rebirth.doRebirth(roomId);
      return res.json(kakao.simpleText(result.message));
    }

    const check = await rebirth.canRebirth(roomId);
    if (!check.can) return res.json(kakao.simpleText(check.message));

    res.json(kakao.textWithQuickReplies(
      `🔄 환생 시스템\n\n현재 Lv.${check.pet.level} ${check.pet.name}\n\n환생하면:\n` +
      `• 펫이 알(Lv.1)로 돌아갑니다\n• 이전 스탯의 10%를 유산으로 물려받습니다\n• 전원 +200G 축하금\n\n정말 환생하시겠어요?`,
      [
        { label: '✅ 환생 확인', messageText: '/환생 확인' },
        { label: '❌ 취소', messageText: '/정보' },
      ],
    ));
  } catch (err) {
    console.error('[/rebirth]', err);
    res.json(kakao.simpleText('오류가 발생했어요. 다시 시도해주세요.'));
  }
});

// ── /날씨 ────────────────────────────────────────────

router.post('/weather', (req, res) => {
  const envStatus = weather.getEnvironmentStatus();
  res.json(kakao.simpleText(`🌤️ 오늘의 환경\n\n${envStatus}`));
});

// ── /도움말 ──────────────────────────────────────────

router.post('/help', (req, res) => {
  res.json(kakao.textWithQuickReplies(
    `📖 펫 키우기 도움말\n\n` +
    `── 기본 ──\n` +
    `🥚 /시작 — 펫 생성\n` +
    `📊 /정보 — 펫 상태\n` +
    `🍖 /먹이 — 먹이 주기\n` +
    `⚔️ /훈련 — 스탯 훈련\n` +
    `✏️ /이름 — 이름 변경\n` +
    `🛒 /상점 — 먹이 목록\n` +
    `💰 /내정보 — 골드/기여도\n\n` +
    `── 콘텐츠 ──\n` +
    `🗺️ /탐험 — 탐험 보내기\n` +
    `🎁 /귀환 — 탐험 보상 수령\n` +
    `📔 /일기 — 펫 다이어리\n` +
    `🔮 /운세 — 오늘의 운세\n` +
    `✊ /가위바위보 — 미니 게임\n` +
    `🎓 /퀴즈 — 돌발 퀴즈\n` +
    `✅ /정답 — 퀴즈 정답\n\n` +
    `── 소셜 ──\n` +
    `🏆 /랭킹 — 전체 랭킹\n` +
    `👥 /기여도 — 방 기여도\n` +
    `⚠️ /약탈 — 약탈 이벤트\n` +
    `🛡️ /방어 — 약탈 방어\n` +
    `🏃 /심부름 — 방간 펫 이동\n` +
    `🔑 /방코드 — 우리 방 코드\n\n` +
    `── 커스텀 ──\n` +
    `🏅 /칭호 — 업적/칭호\n` +
    `🏠 /데코 — 방 꾸미기\n` +
    `🌤️ /날씨 — 오늘의 환경\n` +
    `🔄 /환생 — 환생 (Lv.30+)`,
    [
      { label: '📊 정보', messageText: '/정보' },
      { label: '🗺️ 탐험', messageText: '/탐험' },
      { label: '🔮 운세', messageText: '/운세' },
    ],
  ));
});

// ── 범용 utterance 라우터 (카카오 폴백 스킬용) ───────

router.post('/fallback', async (req, res) => {
  try {
    const { userId, roomId, utterance } = extractContext(req.body);

    // 명령어 파싱
    const parts = utterance.split(/\s+/);
    const cmd = parts[0];
    const arg = parts.slice(1).join(' ');

    await petManager.initRoom(roomId, userId);

    // 출석 보상 (일일 1회)
    const user = await petManager.getUserInfo(userId, roomId);
    const now = new Date().toISOString().split('T')[0];
    const lastActive = user.last_active_at ? String(user.last_active_at).split('T')[0].split(' ')[0] : '';
    if (lastActive !== now) {
      await events.giveGold(userId, roomId, 20, '일일 출석 보상');
      // last_active_at 업데이트
      const db = require('../db/schema').getDb();
      await db.run("UPDATE users SET last_active_at = datetime('now') WHERE user_id = ? AND room_id = ?", [userId, roomId]);
    }

    console.log('[FALLBACK] utterance hex:', Buffer.from(utterance).toString('hex'), 'cmd:', Buffer.from(cmd).toString('hex'), 'raw:', utterance);

    switch (cmd) {
      case '/시작': {
        // 이미 펫이 있으면 정보 표시
        const existingStatus = await petManager.getPetStatus(roomId, BASE_URL);
        if (existingStatus && existingStatus.pet.level > 1) {
          return res.json(kakao.basicCardWithQuickReplies({
            title: `이미 ${existingStatus.pet.name}(이)가 있어요!`,
            description: `Lv.${existingStatus.pet.level} ${existingStatus.pet.name}\n\n이미 펫이 있어서 새로 만들 수 없어요.\n/정보 로 펫 상태를 확인하세요!`,
            imageUrl: existingStatus.display.imageUrl,
            quickReplies: [
              { label: '📊 펫 정보', messageText: '/정보' },
              { label: '🍖 먹이주기', messageText: '/먹이' },
              { label: '📖 도움말', messageText: '/도움말' },
            ],
          }));
        }
        await petManager.initRoom(roomId, userId);
        return res.json(kakao.basicCardWithQuickReplies({
          title: '🥚 펫이 태어났어요!',
          description: `방에 새로운 알이 나타났어요!\n모두 함께 먹이를 주고 키워보세요!\n\n💰 시작 골드: 100G\n🍖 /먹이 - 먹이 주기\n📊 /정보 - 펫 상태`,
          imageUrl: `${BASE_URL}/images/egg_default.png`,
          quickReplies: [
            { label: '🍖 먹이주기', messageText: '/먹이' },
            { label: '📊 펫 정보', messageText: '/정보' },
            { label: '🛒 상점', messageText: '/상점' },
          ],
        }));
      }
      case '/정보': {
        const status = await petManager.getPetStatus(roomId, BASE_URL);
        if (!status) return res.json(kakao.simpleText('펫이 없어요! /시작 으로 만드세요.'));
        const pet = status.pet;
        const title = await achievements.getActivePetTitle(pet.pet_id, roomId);
        const natureStr = nature.getNatureDisplay(pet);
        const envStatus = weather.getEnvironmentStatus();
        const dialogue = pet.nature ? nature.getRandomDialogue(pet.nature) : '';
        const desc = [status.display.description, natureStr ? `🎭 성격: ${natureStr}` : '', `\n${envStatus}`, dialogue ? `\n💬 "${dialogue}"` : ''].filter(Boolean).join('\n');
        await achievements.checkAndGrant(roomId, pet, userId);
        return res.json(kakao.basicCardWithQuickReplies({
          title: `${title}${status.display.title}`,
          description: desc,
          imageUrl: status.display.imageUrl,
          buttons: [{ label: '🍖 먹이주기', messageText: '/먹이' }, { label: '⚔️ 훈련하기', messageText: '/훈련' }],
          quickReplies: [{ label: '🗺️ 탐험', messageText: '/탐험' }, { label: '🔮 운세', messageText: '/운세' }, { label: '📔 일기', messageText: '/일기' }],
        }));
      }
      case '/상점': {
        const foods2 = await petManager.getFoodList();
        const user2 = await petManager.getUserInfo(userId, roomId);
        return res.json(kakao.textWithQuickReplies(
          `🛒 상점 (보유: ${user2.gold}G)\n\n` + foods2.map(f => `${f.emoji} ${f.name} — ${f.cost}G (포만도+${f.fullness_gain} 경험치+${f.exp_gain})`).join('\n'),
          foods2.slice(0, 5).map(f => ({ label: `${f.emoji} ${f.name}`, messageText: `/먹이 ${f.food_id}` })),
        ));
      }
      case '/내정보': {
        const u = await petManager.getUserInfo(userId, roomId);
        return res.json(kakao.simpleText(`👤 내 정보\n\n💰 골드: ${u.gold}G\n⭐ 기여도: ${u.contribution}\n🕐 마지막 활동: ${u.last_active_at}`));
      }
      case '/약탈':
        return res.json(kakao.simpleText((await events.startRaid(roomId, userId)).message));
      case '/방어':
        return res.json(kakao.simpleText((await events.defendRaid(roomId, userId)).message));
      case '/랭킹': {
        const rankings = await events.getRanking(10);
        if (rankings.length === 0) return res.json(kakao.simpleText('아직 랭킹이 없어요!'));
        const medals = ['🥇', '🥈', '🥉'];
        return res.json(kakao.simpleText('🏆 펫 랭킹 TOP 10\n\n' + rankings.map((r, i) => `${medals[i] || (i+1)+'.'} Lv.${r.level} ${r.name} — ${r.room_name}`).join('\n')));
      }
      case '/기여도': {
        const cr = await events.getRoomRanking(roomId);
        if (cr.length === 0) return res.json(kakao.simpleText('아직 기여도가 없어요!'));
        return res.json(kakao.simpleText('👥 방 기여도\n\n' + cr.map((r, i) => `${i+1}. ${r.nickname} — ${r.contribution}`).join('\n')));
      }
      case '/먹이':
        if (arg) return await doFeed(res, roomId, userId, arg);
        // 먹이 목록 표시는 /feed 라우트와 동일하게
        const foods = await petManager.getFoodList();
        return res.json(kakao.textWithQuickReplies(
          `🛒 먹이를 선택하세요! (보유: ${user.gold}G)\n\n` +
          foods.map(f => `${f.emoji} ${f.name} — ${f.cost}G`).join('\n'),
          foods.map(f => ({ label: `${f.emoji} ${f.name}`, messageText: `/먹이 ${f.food_id}` })),
        ));

      case '/훈련':
        if (arg) return await doTrain(res, roomId, userId, arg);
        return res.json(kakao.textWithQuickReplies(
          '⚔️ 어떤 훈련을 할까요? (비용: 15G)',
          [
            { label: '💪 근력', messageText: '/훈련 strength' },
            { label: '🧠 지능', messageText: '/훈련 intelligence' },
            { label: '✨ 매력', messageText: '/훈련 charm' },
          ],
        ));

      case '/이름':
        if (!arg) return res.json(kakao.simpleText('사용법: /이름 [새이름]'));
        const renameResult = await petManager.renamePet(roomId, arg);
        return res.json(kakao.simpleText(renameResult.message));

      case '/탐험':
        return res.json(kakao.simpleText((await expedition.startExpedition(roomId, userId)).message));
      case '/귀환':
        return res.json(kakao.simpleText((await expedition.collectExpedition(roomId, userId)).message));
      case '/일기':
        return res.json(kakao.simpleText(await diary.generateDiary(roomId)));
      case '/운세':
        return res.json(kakao.simpleText((await fortune.drawFortune(userId, roomId)).message));
      case '/가위바위보': {
        const [choice, betStr] = arg.split(/\s+/);
        const bet = parseInt(betStr) || 20;
        if (!choice) return res.json(kakao.simpleText('사용법: /가위바위보 [가위/바위/보] [골드]'));
        return res.json(kakao.simpleText((await fortune.rockPaperScissors(userId, roomId, choice, bet)).message));
      }
      case '/퀴즈':
        return res.json(kakao.simpleText((await quiz.createQuiz(roomId)).message));
      case '/정답':
        if (!arg) return res.json(kakao.simpleText('사용법: /정답 [답]'));
        return res.json(kakao.simpleText((await quiz.answerQuiz(roomId, userId, arg)).message));
      case '/심부름':
        if (!arg) {
          const myCode = await errand.getRoomCode(roomId);
          return res.json(kakao.simpleText(`🏃 심부름\n우리 방 코드: ${myCode}\n사용법: /심부름 [상대방 코드]`));
        }
        return res.json(kakao.simpleText((await errand.sendErrand(roomId, arg, (await petManager.getPetStatus(roomId, BASE_URL))?.pet?.name || '펫')).message));
      case '/방코드':
        return res.json(kakao.simpleText(`🔑 우리 방 코드: ${await errand.getRoomCode(roomId)}`));
      case '/데코': {
        const user3 = await petManager.getUserInfo(userId, roomId);
        const owned = await deco.getRoomDecos(roomId);
        const shop = await deco.getDecoShop();
        let decoText = `🏠 데코 (보유: ${user3.gold}G)\n\n`;
        if (owned.length > 0) decoText += '📦 보유:\n' + owned.map(d => `${d.equipped ? '✅' : '⬜'} ${d.emoji} ${d.name}`).join('\n') + '\n\n';
        const ownedIds = new Set(owned.map(d => d.deco_id));
        decoText += '🛒 상점:\n' + shop.filter(d => !ownedIds.has(d.deco_id)).map(d => `${d.emoji} ${d.name} — ${d.cost}G`).join('\n');
        decoText += '\n\n/데코구매 [ID] | /장착 [ID]';
        return res.json(kakao.simpleText(decoText));
      }
      case '/데코구매':
        if (!arg) return res.json(kakao.simpleText('사용법: /데코구매 [아이템ID]\n예: /데코구매 red_sofa'));
        return res.json(kakao.simpleText((await deco.buyDeco(userId, roomId, arg)).message));
      case '/장착':
        if (!arg) return res.json(kakao.simpleText('사용법: /장착 [아이템ID]'));
        return res.json(kakao.simpleText((await deco.equipDeco(roomId, arg)).message));
      case '/환생':
        if (arg === '확인') return res.json(kakao.simpleText((await rebirth.doRebirth(roomId)).message));
        const check = await rebirth.canRebirth(roomId);
        return res.json(kakao.simpleText(check.can ? `🔄 Lv.${check.pet.level} 환생 가능!\n/환생 확인 으로 실행` : check.message));
      case '/날씨':
        return res.json(kakao.simpleText(`🌤️ 오늘의 환경\n\n${weather.getEnvironmentStatus()}`));
      case '/칭호': {
        const pet = (await petManager.getPetStatus(roomId, BASE_URL))?.pet;
        if (!pet) return res.json(kakao.simpleText('펫이 없어요!'));
        return res.json(kakao.simpleText(await achievements.getAllAchievements(pet.pet_id, roomId, userId)));
      }

      case '/':
      case '/도움말':
        return res.json(kakao.textWithQuickReplies(
          `📖 펫 키우기 도움말\n\n── 기본 ──\n/시작 /정보 /먹이 /훈련\n/이름 /상점 /내정보\n\n── 콘텐츠 ──\n/탐험 /귀환 /일기 /운세\n/가위바위보 /퀴즈 /정답\n\n── 소셜 ──\n/랭킹 /기여도 /약탈 /방어\n/심부름 /방코드\n\n── 커스텀 ──\n/칭호 /데코 /날씨 /환생`,
          [{ label: '📊 정보', messageText: '/정보' }, { label: '🍖 먹이', messageText: '/먹이' }, { label: '🗺️ 탐험', messageText: '/탐험' }],
        ));

      default:
        return res.json(kakao.textWithQuickReplies(
          `안녕하세요! 펫 키우기 챗봇이에요! 🐾\n아래 명령어로 시작해보세요.\n\n/ 를 입력하면 전체 명령어를 볼 수 있어요!`,
          [
            { label: '🥚 시작', messageText: '/시작' },
            { label: '📖 도움말', messageText: '/' },
            { label: '📊 펫 정보', messageText: '/정보' },
          ],
        ));
    }
  } catch (err) {
    console.error('[/fallback] ERROR:', err.message, err.stack?.split('\n')[1]);
    res.json(kakao.simpleText(`오류: ${err.message}`));
  }
});

module.exports = router;
