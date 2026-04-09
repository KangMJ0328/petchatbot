# 프로젝트 현황 (2026-04-09 기준)

## 프로젝트 개요
카카오톡 그룹 채팅방에서 친구들과 함께 가상 펫을 키우는 소셜 육성 게임 챗봇

## 현재 상태: 1:1 채팅 운영 중 + 그룹봇 입점 진행 중

---

## 서비스 URL

| 항목 | URL |
|------|-----|
| **운영 서버 (Workers)** | https://petchatbot.rkdalswo0328.workers.dev |
| **스킬 URL** | https://petchatbot.rkdalswo0328.workers.dev/api/skill/fallback |
| **이미지** | https://petchatbot.rkdalswo0328.workers.dev/images/*.png |
| **이전 서버 (Render)** | https://petchatbot.onrender.com (비활성화 예정) |
| **카카오톡 채널** | @나만없어펫 (@petgamebot) |

---

## 기술 스택

| 항목 | 기술 |
|------|------|
| 서버 | Cloudflare Workers (Hono 프레임워크) |
| DB | Cloudflare D1 (SQLite 클라우드, APAC 리전) |
| 이미지 | Cloudflare 정적 에셋 (19장) |
| 이전 서버 | Render (Express + Turso) — 비활성화 예정 |
| 배포 | `wrangler deploy` (CLI) |
| 코드 형식 | ES Modules |

---

## GitHub 리포

| 리포 | 내용 |
|------|------|
| KMJ0328/petchatbot-workers | **현재 운영 코드 (Workers)** |
| KMJ0328/petchatbot | 이전 버전 (Render) + 문서 |
| KangMJ0328/petchatbot | Render 배포용 (Cloudflare로 연결) |

---

## Cloudflare 정보

| 항목 | 값 |
|------|-----|
| 계정 | rkdalswo0328@gmail.com |
| Account ID | a8927ef565a1e5c087e2033e4dfb739b |
| D1 Database | petchatbot |
| D1 Database ID | 32990e06-0b8d-4aba-98d8-6dba60f15a96 |
| D1 Region | APAC (ICN) |
| Worker URL | https://petchatbot.rkdalswo0328.workers.dev |

---

## 카카오 계정/채널

| 항목 | 값 |
|------|-----|
| 카카오 비즈니스 | rkdalswo88@naver.com |
| 챗봇 관리자센터 | 같은 계정 |
| 운영 채널 | 나만없어펫 (@petgamebot) |
| 개발 채널 | ❌ 아직 안 만듦 |
| 카카오 담당자 메일 | chatbot@kakaocorp.com |

---

## 프로젝트 구조 (petchatbot-workers/)

```
petchatbot-workers/
├── wrangler.toml          ← Cloudflare Workers 설정
├── package.json           ← 의존성 (hono, wrangler)
├── src/
│   ├── worker.js          ← 진입점 (Hono + Cron)
│   ├── db/
│   │   └── schema.js      ← D1 래퍼 + 테이블 16개
│   ├── game/
│   │   ├── petManager.js  ← 핵심 (먹이/훈련/진화/상태)
│   │   ├── events.js      ← 황금알/약탈/랭킹
│   │   ├── achievements.js ← 칭호 12종
│   │   ├── expedition.js  ← 탐험
│   │   ├── diary.js       ← 일기
│   │   ├── fortune.js     ← 운세 + 가위바위보
│   │   ├── errand.js      ← 심부름
│   │   ├── quiz.js        ← 퀴즈 (유사 정답 지원)
│   │   ├── deco.js        ← 데코 (비활성화)
│   │   ├── nature.js      ← 성격 8종
│   │   ├── rebirth.js     ← 환생
│   │   ├── weather.js     ← 날씨/시간대
│   │   └── constants.js   ← 진화/레벨/이미지 매핑
│   ├── routes/
│   │   └── skill.js       ← 카카오 스킬 라우트 (30개 명령어)
│   └── utils/
│       └── kakaoResponse.js ← 응답 포맷 (QuickReplies 제거됨)
├── public/images/          ← 펫 이미지 19장 (Gemini 생성)
└── 문서/
    ├── KAKAO_ONBOARDING.md ← 입점 가이드
    ├── KAKAO_DEV_GUIDE.md  ← 개발 가이드
    ├── REPORT.md           ← 기획 보고서
    ├── SCENARIO.md         ← 시나리오 문서
    └── PROJECT_STATUS.md   ← 이 파일
```

---

## 구현된 기능 (30개 명령어)

### 기본 (7개)
/시작, /정보, /먹이, /훈련, /이름, /상점, /내정보

### 콘텐츠 (9개)
/탐험, /귀환, /일기, /운세, /가위바위보, /가위, /바위, /보, /퀴즈, /정답

### 소셜 (6개)
/랭킹, /기여도, /약탈, /방어, /심부름, /방코드

### 커스텀 (6개)
/칭호, /날씨, /환생, /성격변경, /출석, /도움말

### 비활성화
/데코, /데코구매, /장착 → "준비 중" 메시지

---

## 코드 변경 시 배포 방법

```bash
cd petchatbot-workers
wrangler deploy
```

Cloudflare 로그인 필요: `wrangler login`

---

## 완료된 작업

- [x] DB 설계 (16개 테이블)
- [x] 핵심 게임 로직 30개 명령어
- [x] 이미지 19장 (Gemini 생성)
- [x] Oracle Cloud 배포 → Render 이전 → Cloudflare Workers 최종 이전
- [x] Turso → D1 데이터 마이그레이션
- [x] 카카오 오픈빌더 1:1 챗봇 연동
- [x] 카카오 그룹봇 가이드 대응 (QuickReplies 제거, botUserKey/botGroupKey)
- [x] 카카오 입점 메일 발송 (마스터 계정, 프로필 이미지)
- [x] 채널 홈 고객센터 이메일 설정
- [x] 시나리오 문서 작성
- [x] 도움말에 데이터 저장 안내 추가

## 진행 중인 작업

- [ ] 카카오 그룹봇 권한 부여 대기중
- [ ] 권한 받은 후 → 개발 채널 생성
- [ ] 그룹 챗봇 생성 + 운영/개발 채널 연결
- [ ] 봇 한줄 설명 작성 (14자: "친구들과 함께 펫을 키워요!")
- [ ] 도움말 블록 + 봇 입장 블록(웰컴) 설정
- [ ] 대표 명령어 설정 (자동완성)
- [ ] 개발 채널 팀채팅에서 테스트
- [ ] Webhook/이벤트 API/챗봇키 신청 (봇 ID 필요)
- [ ] 테스트 완료 후 카카오에 초대링크 전달
- [ ] 심사 통과 → 배포 → 채널 홈 챗봇 초대 카드

## 향후 계획

- 그룹방 PvP 약탈 (그룹봇 전용)
- 연속 출석 보너스
- 채팅 보상 (활성도 유지)
- 이벤트 API로 알림 (배고픔, 너구리)
- 데코 시스템 복원 (이미지 합성)
- 멘션 기능 활용 (랭킹 @멘션)

---

## 다른 세션에서 작업 재개 시

1. 이 문서(PROJECT_STATUS.md)를 먼저 읽히세요
2. 필요에 따라 KAKAO_ONBOARDING.md, KAKAO_DEV_GUIDE.md 읽히세요
3. 코드는 GitHub에서 clone: `git clone https://github.com/KMJ0328/petchatbot-workers.git`
4. 배포: `cd petchatbot-workers && npm install && wrangler login && wrangler deploy`
