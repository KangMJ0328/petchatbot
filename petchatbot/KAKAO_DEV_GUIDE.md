# 그룹 챗봇 Beta 개발 가이드 요약

**출처**: 그룹 챗봇 beta 개발 가이드 문서.pdf (카카오 제공)
**버전**: 1.11.0 (2026-03-11)
**정리일**: 2026-04-09

---

## 1. 스킬 (Skill) 시스템

### 개요
- 스킬 = 외부 API 연동
- URL 등록 → 카카오가 POST로 `SkillRequest` 전송 → 서버가 `SkillResponse`로 응답
- 챗봇 관리자센터 > 스킬 > 스킬 목록에서 생성
- 스킬을 블록에 연결해야 동작

### 설정 방법
1. 챗봇 관리자센터 > 스킬 > [생성]
2. 스킬 이름 + URL 입력 후 저장
3. 블록에서 "스킬 검색/선택" → 스킬 선택 → "스킬데이터 사용" 선택

---

## 2. SkillRequest (카카오 → 서버)

### 전체 구조
```json
{
  "bot": {
    "id": "봇ID",
    "name": "봇이름"
  },
  "intent": {
    "id": "블록ID",
    "name": "블록이름"
  },
  "userRequest": {
    "utterance": "사용자 발화 텍스트",
    "user": {
      "id": "botUserKey",
      "type": "botUserKey",
      "properties": {
        "botUserKey": "챗봇 기준 유저 식별키",
        "plusfriendUserKey": "채널 기준 유저 식별키",
        "appUserId": "카카오 앱 기준 유저 ID"
      }
    },
    "chat": {
      "id": "botGroupKey",
      "type": "botGroupKey",
      "properties": {
        "botGroupKey": "팀채팅방 식별키"
      }
    }
  },
  "action": {
    "params": {},
    "detailParams": {}
  }
}
```

### 주요 필드

| 필드 | 설명 |
|------|------|
| `bot.id` | 봇 ID (개발 채널이면 끝에 `!` 붙음) |
| `intent.id` | 블록 ID |
| `intent.name` | 블록 이름 |
| `userRequest.utterance` | 사용자 발화 텍스트 |
| `userRequest.user.properties.botUserKey` | **유저 식별키** (봇 기준, 봇이 다르면 다른 ID) |
| `userRequest.user.properties.plusfriendUserKey` | 채널 기준 유저 식별키 |
| `userRequest.user.properties.appUserId` | 카카오 로그인 유저만 전달 |
| `userRequest.chat.properties.botGroupKey` | **팀채팅방 식별키** |
| `action.params` | 파라미터 추출 값 |
| `action.detailParams` | 상세 파라미터 (origin, value 등) |

### ⚠️ 유의사항
- SkillRequest는 하위 호환성 유지하면서 파라미터 추가 가능
- **알 수 없는 필드(Unknown Field)가 있어도 예외 발생시키지 않도록 처리**

---

## 3. SkillResponse (서버 → 카카오)

### 기본 구조
```json
{
  "version": "2.0",
  "template": {
    "outputs": [
      { "simpleText": { "text": "응답 텍스트" } }
    ]
  }
}
```

### 사용 가능한 컴포넌트

| 컴포넌트 | 설명 | 사용 가능 |
|---------|------|----------|
| SimpleText | 간단 텍스트 | ✅ |
| SimpleImage | 간단 이미지 | ✅ |
| TextCard | 텍스트 카드 | ✅ |
| BasicCard | 기본 카드 (이미지 + 텍스트) | ✅ |
| ListCard | 리스트 카드 | ✅ (ranking 레이아웃 지원) |
| ItemCard | 아이템 카드 | ✅ |
| **QuickReplies** | 바로가기 그룹 | **❌ 미지원** |
| **CommerceCard** | 커머스 카드 | **❌ 미지원** |
| **Carousel** | 카드 캐러셀 | **❌ 미지원** |

### 버튼 레이아웃

모든 카드(TextCard, BasicCard, ListCard, ItemCard)에서 `buttonLayout` 설정 가능:
- `"horizontal"` → 가로 정렬, **최대 2개**
- `"vertical"` → 세로 정렬, **최대 5개**

### ListCard ranking 레이아웃
```json
{
  "listCard": {
    "listLayout": "ranking",
    "header": { "title": "제목" },
    "items": [...]
  }
}
```

---

## 4. 버튼 플러그인

### 특수 action 타입

| action | 기능 | 설명 |
|--------|------|------|
| `guide` | 도움말 | 챗봇 도움말 표시 |
| `share` | 공유하기 | 말풍선을 다른 채팅방에 공유 |
| `invite` | 초대하기 | 챗봇을 다른 채팅방에 초대 |
| `inviteMember` | 친구 초대 | 현재 채팅방에 친구 초대 |
| `mention` | 멘션 | 입력창에 챗봇 멘션 입력 |
| `settings` | 설정 | 챗봇 설정 페이지 이동 |

### 도움말 버튼 예시
```json
{
  "textCard": {
    "title": "도움말",
    "buttons": [
      { "label": "도움말", "action": "guide" }
    ]
  }
}
```

### 프로모션용 초대 링크
```
https://pf.kakao.com/{encoded_profile_id}/chatbot/invite?referer={referer}
```
- Webhook으로 초대자 정보 수신 가능

---

## 5. 멘션 기능

### 발화에서 멘션된 유저 식별
- `@sys.user.mention` 시스템 엔티티 활성화 필요
- 유저가 `@봇이름 MBTI 궁합 @이하나 @진지혜` 발화 시 멘션된 유저 식별자 전달

### 응답에서 유저 멘션하기

```json
{
  "version": "2.0",
  "template": {
    "outputs": [{
      "simpleText": {
        "text": "🏆 1위: {{#mentions.user1}}: 210점\n2위: {{#mentions.user2}}: 110점"
      }
    }]
  },
  "extra": {
    "mentions": {
      "user1": { "type": "botUserKey", "id": "유저키1" },
      "user2": { "type": "botUserKey", "id": "유저키2" }
    }
  }
}
```

### ⚠️ 유의사항
- **SimpleText에서만** 동작
- 한 응답에 **최대 15명** 멘션 가능
- `{{#mentions.{userKey}}}` 형식으로 텍스트에 삽입

---

## 6. 채팅방 이벤트 Webhook

### 지원 이벤트

| 이벤트 | type | 설명 |
|--------|------|------|
| 챗봇 입장 | `entrance` | 챗봇이 채팅방에 초대됨 |
| 챗봇 퇴장 | `leave` | 챗봇이 채팅방에서 나감 |
| 친구 초대 | `inviteMember` | 초대 버튼으로 친구를 초대함 |

### Webhook 설정
- **담당자에게 신청** 필요 (봇 ID, Webhook URL, Header 전달)
- Method: POST, Content-Type: application/json

### Payload 예시 (entrance)
```json
{
  "botId": "봇ID",
  "type": "entrance",
  "timestamp": 1771923948483,
  "group": {
    "botGroupKey": "채팅방키"
  },
  "payload": {
    "inviter": {
      "botUserKey": "초대한유저키"
    },
    "params": {
      "referer": "promotion"
    }
  }
}
```

---

## 7. 챗봇 알림 기능

### 개요
- 유저가 알림 설정에서 ON/OFF 가능
- 시스템적으로는 이벤트 API 호출과 동일

### 알림 설정 진입 경로
- 챗봇 응답 버튼 내 Settings 플러그인
- 채팅방 우측 사이드 메뉴

### 알림 항목 등록 (담당자에게 전달)
- 챗봇 ID
- 대상채널 (예: 운영채널)
- 제목 (예: 점심 알림)
- 설명 (예: 매일 점심 알림을 드릴게요)
- 시간 고정 여부 (O: 일괄발송, X: 유저가 시간 설정)
- 시간 기본값 (예: 오전 10:00)
- 알림 주기: 매일
- 트리거될 블록의 이벤트 이름 (예: lunch_notification)

### 조건부 알림 (특정 조건에서만 발송)
- 스킬 서버에서 조건 판단
- 조건 불일치 시 빈 응답: `{"version":"2.0","template":{"outputs":[]}}`

### 전용 블록 분리 가이드라인
- 🚫 알림 전용 블록에는 파라미터 설정 금지
- 파라미터 없는 블록만 알림 용도로 사용 가능

---

## 8. AI 챗봇 콜백 가이드

### 그룹 챗봇 확장 정책
- 콜백 URL 유효 시간: **5분** (채널 챗봇은 1분)
- 콜백 호출 가능 횟수: **1회**

---

## 9. 이벤트 API (챗봇이 먼저 메시지 발송)

### 개요
- 유저 발화 없이 챗봇이 **먼저 메시지 전송** 가능
- 알림, 안내 목적으로 사용

### 사전 준비
1. 블록에 이벤트 이름 설정: 챗봇 관리자센터 > 블록 > [...] > [이벤트 설정]
2. **무료 요금제 등록** 필요: chatbot@kakaocorp.com 메일 신청

### API 호출
```bash
POST https://bot-api.kakao.com/v2/bots/{botId}/group
Authorization: KakaoAK {REST API Key}
Content-Type: application/json

{
  "chat": [
    { "id": "botGroupKey값", "type": "botGroupKey" }
  ],
  "event": {
    "name": "이벤트이름",
    "data": {}
  }
}
```

### ⚠️ 유의사항
- 한 번에 **최대 100개** 채팅방에 발송 가능 (초과 시 분산 필요)
- 운영 채널: `botId` 그대로
- 개발 채널: `botId!` (끝에 `!` 붙이기)

### 결과 조회
```bash
GET https://bot-api.kakao.com/v1/tasks/{taskId}
```

---

## 10. URL 링크 버튼 유저 식별

- 유저가 URL 버튼 클릭 시 자동으로 쿼리 파라미터 추가
- **chatbot@kakaocorp.com 메일로 사용 요청 필요**

### 전달되는 파라미터
| 파라미터 | 설명 |
|---------|------|
| `botUserKey` | 챗봇 기준 사용자 ID |
| `appUserId` | 앱 기준 유저 ID |
| `botGroupKey` | 채팅방 ID |

### URL 예시
```
설정: http://my-test.com
호출: http://my-test.com?botUserKey=bu1&appUserId=1000&botGroupKey=gk1
```

---

## 11. API 인증

| 구분 | 헤더 | 비고 |
|------|------|------|
| 사업자 | `Authorization: KakaoAK {REST API Key}` | 카카오 디벨로퍼스 앱 키 |
| **개인** | `Authorization: KakaoBK {REST API Key}` | chatbot@kakaocorp.com 메일 신청 |

### 호스트
- 운영 환경: `https://bot-api.kakao.com`

---

## 12. 주요 API 목록

### 채팅방 정보 조회
```
GET /v3/bots/{botId}/group-chat-rooms
```
- 챗봇이 참여한 방 리스트 + 선톡 ON/OFF 여부 조회
- 페이지네이션: `pageSize` (10/20/50/100), `lastBotGroupKey`

### 채팅방 멤버 조회
```
GET /v2/bots/{botId}/group-chat-rooms/{botGroupKey}/members
```
- 채팅방에 참여한 유저의 botUserKey 목록

### 이벤트 메시지 발송
```
POST /v2/bots/{botId}/group
```

### 발송 결과 조회
```
GET /v1/tasks/{taskId}
```

---

## 13. 챗봇 테스트 및 문제해결

### 테스트 흐름
- 수정 → **개발 채널에 즉시 반영** → 테스트 → **배포 → 운영 채널 반영**
- 배포: 챗봇 관리자센터 > 배포 > [배포] 버튼

### 디버깅 (Footprint ID)
- 카카오톡 채팅방에서 `@{봇이름} .showmethebug` 입력
- `chp`로 시작하는 Footprint ID 확인
- 문의 시 이 ID를 함께 전달하면 원인 파악 빠름

---

## 우리 코드 수정사항 (반영 완료)

| 항목 | 변경 내용 | 상태 |
|------|----------|------|
| userId | `user.properties.botUserKey` 사용 | ✅ 완료 |
| roomId | `chat.properties.botGroupKey` 사용 | ✅ 완료 |
| QuickReplies | 전부 제거 → TextCard 버튼으로 대체 | ✅ 완료 |
| buttonLayout | `vertical` 설정 (최대 5개) | ✅ 완료 |
| 인코딩 | UTF-8 | ✅ 완료 |

## 향후 활용 가능 기능

| 기능 | 활용 시나리오 | 필요 사항 |
|------|-------------|----------|
| 멘션 | 랭킹에서 1위 유저 @멘션 | botUserKey 저장 |
| 이벤트 API | 배고픔 알림, 너구리 침입 알림 | API 키 신청 |
| Webhook | 챗봇 입장 시 환영 메시지 | Webhook URL 등록 신청 |
| 알림 기능 | 일일 출석 알림, 탐험 완료 알림 | 알림 항목 등록 신청 |
| URL 유저 식별 | 웹 결제 페이지 연동 | 사용 요청 메일 |
