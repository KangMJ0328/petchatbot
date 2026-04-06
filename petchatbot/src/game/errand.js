const { getDb } = require('../db/schema');
const crypto = require('crypto');

// ── 방 코드 생성/조회 ───────────────────────────────

function getRoomCode(roomId) {
  const db = getDb();
  const room = db.prepare('SELECT room_code FROM rooms WHERE room_id = ?').get(roomId);
  if (room?.room_code) return room.room_code;

  // 6자리 코드 생성
  const code = crypto.randomBytes(3).toString('hex').toUpperCase();
  db.prepare('UPDATE rooms SET room_code = ? WHERE room_id = ?').run(code, roomId);
  return code;
}

function findRoomByCode(code) {
  const db = getDb();
  return db.prepare('SELECT * FROM rooms WHERE room_code = ?').get(code.toUpperCase());
}

// ── 심부름 보내기 ────────────────────────────────────

function sendErrand(fromRoomId, toCode, petName) {
  const db = getDb();

  const targetRoom = findRoomByCode(toCode);
  if (!targetRoom) {
    return { success: false, message: `방 코드 "${toCode}"를 찾을 수 없어요! 😥` };
  }

  if (targetRoom.room_id === fromRoomId) {
    return { success: false, message: '자기 방에는 심부름을 보낼 수 없어요! 😅' };
  }

  // 진행 중인 심부름 체크
  const active = db.prepare(`
    SELECT * FROM errands WHERE from_room = ? AND completed = 0 AND expires_at > datetime('now')
  `).get(fromRoomId);
  if (active) {
    return { success: false, message: '이미 심부름 중이에요! 돌아올 때까지 기다려주세요.' };
  }

  const giftGold = Math.floor(Math.random() * 30) + 10;
  const messages = [
    `안녕하세요! ${petName}(이)에요~ 놀러왔어요! 🐾`,
    `${petName}(이)가 인사드려요! 간식 좀 주세요~ 😊`,
    `옆방에서 온 ${petName}입니다! 잘 부탁해요! ✨`,
  ];
  const msg = messages[Math.floor(Math.random() * messages.length)];

  db.prepare(`
    INSERT INTO errands (from_room, to_room, pet_name, gift_gold, message, expires_at)
    VALUES (?, ?, ?, ?, ?, datetime('now', '+30 minutes'))
  `).run(fromRoomId, targetRoom.room_id, petName, giftGold, msg);

  return {
    success: true,
    message: `🏃 심부름 출발!\n${petName}(이)가 ${targetRoom.room_name} 방으로 갔어요.\n30분 후에 돌아옵니다!`,
    targetRoom: targetRoom.room_name,
  };
}

// ── 심부름 온 펫 확인 (대상 방에서) ─────────────────

function checkIncomingErrand(roomId) {
  const db = getDb();
  const errand = db.prepare(`
    SELECT * FROM errands WHERE to_room = ? AND completed = 0 AND expires_at > datetime('now')
    ORDER BY created_at DESC LIMIT 1
  `).get(roomId);

  if (!errand) return null;

  return {
    petName: errand.pet_name,
    message: errand.message,
    giftGold: errand.gift_gold,
    errandId: errand.errand_id,
  };
}

// ── 간식 주기 (대상 방이 심부름 온 펫에게) ──────────

function giveErrandSnack(roomId, userId, errandId) {
  const db = getDb();
  const errand = db.prepare('SELECT * FROM errands WHERE errand_id = ? AND to_room = ? AND completed = 0').get(errandId, roomId);
  if (!errand) return { success: false, message: '심부름 온 펫이 없어요!' };

  const snackGold = Math.floor(Math.random() * 20) + 10;

  db.transaction(() => {
    db.prepare('UPDATE errands SET completed = 1 WHERE errand_id = ?').run(errandId);
    // 보낸 방에 보상
    const fromUsers = db.prepare('SELECT * FROM users WHERE room_id = ?').all(errand.from_room);
    const perUser = Math.floor((errand.gift_gold + snackGold) / Math.max(fromUsers.length, 1));
    for (const u of fromUsers) {
      db.prepare('UPDATE users SET gold = gold + ? WHERE user_id = ? AND room_id = ?').run(perUser, u.user_id, errand.from_room);
    }
    // 준 방에도 약간의 보상
    db.prepare('UPDATE users SET gold = gold + ? WHERE user_id = ? AND room_id = ?').run(10, userId, roomId);
  })();

  return {
    success: true,
    message: `🎁 ${errand.pet_name}에게 간식을 줬어요!\n${errand.pet_name}(이)가 기뻐하며 돌아갔답니다.\n\n+10G 보상 (보낸 방에도 선물을 가져다줘요!)`,
  };
}

module.exports = { getRoomCode, findRoomByCode, sendErrand, checkIncomingErrand, giveErrandSnack };
