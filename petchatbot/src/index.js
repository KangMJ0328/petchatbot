require('dotenv').config();
const express = require('express');
const path = require('path');
const cron = require('node-cron');
const { initializeDb } = require('./db/schema');
const skillRouter = require('./routes/skill');
const { resolveExpiredRaids } = require('./game/events');
const { resolveExpiredQuizzes } = require('./game/quiz');

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 정적 파일 (펫 이미지)
app.use('/images', express.static(path.join(__dirname, '..', 'public', 'images')));

// 헬스체크
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: '🐾 펫 키우기 챗봇 서버가 실행 중입니다!' });
});

// 카카오 스킬 라우트
app.use('/api/skill', skillRouter);

// DB 초기화 (async)
(async () => {
  await initializeDb();

  // 슬립 방지 — 4분마다 자기 자신에게 ping
  const BASE_URL = process.env.BASE_URL;
  if (BASE_URL && BASE_URL.includes('onrender.com')) {
    cron.schedule('*/4 * * * *', () => {
      fetch(BASE_URL).catch(() => {});
    });
    console.log('[PING] 슬립 방지 활성화 (4분 간격)');
  }

  // 만료된 이벤트 정리 (매분)
  cron.schedule('* * * * *', async () => {
    try {
      const raids = await resolveExpiredRaids();
      const quizzes = await resolveExpiredQuizzes();
      if (raids > 0) console.log(`[CRON] 만료된 약탈 ${raids}건 처리`);
      if (quizzes > 0) console.log(`[CRON] 만료된 퀴즈 ${quizzes}건 처리`);
    } catch (err) {
      console.error('[CRON] 오류:', err);
    }
  });

  // 서버 시작
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════╗
║  🐾 펫 키우기 챗봇 서버                  ║
║  포트: ${PORT}                              ║
║  URL: http://0.0.0.0:${PORT}               ║
║                                          ║
║  카카오 오픈빌더 스킬 URL:                ║
║  POST http://[서버IP]:${PORT}/api/skill/*  ║
╚══════════════════════════════════════════╝
    `);
  });
})();
