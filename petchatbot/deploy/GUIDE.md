# 펫 키우기 챗봇 — Oracle Cloud 배포 가이드

## 전체 흐름

```
1. Oracle Cloud 무료 VM 생성
2. VM 접속 & 프로젝트 업로드
3. 서버 설치 & 실행
4. 방화벽 열기
5. 카카오 오픈빌더 스킬 등록
6. 테스트 & 운영
```

---

## 1단계: Oracle Cloud 무료 VM 생성

### 1-1. 계정 생성
1. https://cloud.oracle.com 접속
2. "무료로 시작" 클릭 → 계정 생성
3. 신용카드 등록 (과금 안 됨, 인증용)

### 1-2. VM 인스턴스 생성
1. 콘솔 → Compute → Instances → "Create Instance"
2. 설정:
   - **이름**: petchatbot
   - **이미지**: Ubuntu 22.04 (Canonical)
   - **Shape**: VM.Standard.A1.Flex (무료)
     - OCPU: 1, 메모리: 6GB (무료 범위)
   - **네트워킹**: 새 VCN 자동 생성 선택
   - **SSH 키**: "Generate a key pair" → 비공개키(.pem) 다운로드
3. "Create" 클릭 → 2~3분 대기

### 1-3. 공인 IP 확인
인스턴스 상세 → **Public IP address** 기록 (예: `129.154.xxx.xxx`)

---

## 2단계: VM 접속 & 프로젝트 업로드

### Windows (PowerShell 또는 Git Bash)
```bash
# SSH 접속
ssh -i C:\Users\내이름\Downloads\ssh-key.pem ubuntu@129.154.xxx.xxx

# 처음 접속 시 "yes" 입력
```

> **Permission denied 에러 시**: 
> ```bash
> # Git Bash에서
> chmod 600 /c/Users/내이름/Downloads/ssh-key.pem
> ```

### 프로젝트 업로드 (방법 1: Git)
```bash
# VM에서 실행
sudo apt update && sudo apt install -y git
git clone https://github.com/YOUR_USERNAME/petchatbot.git /home/ubuntu/petchatbot
```

### 프로젝트 업로드 (방법 2: SCP 직접 전송)
```bash
# 로컬 PC에서 실행 (Git Bash)
scp -i ~/Downloads/ssh-key.pem -r /c/Users/ddd/Desktop/chatbot/petchatbot ubuntu@129.154.xxx.xxx:/home/ubuntu/
```

---

## 3단계: 서버 설치 & 실행

### 원클릭 설치 스크립트
```bash
# VM에서 실행
cd /home/ubuntu/petchatbot
chmod +x deploy/setup-oracle.sh
./deploy/setup-oracle.sh
```

### 또는 수동 설치
```bash
# 1. Node.js 20 설치
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential

# 2. PM2 설치
sudo npm install -g pm2

# 3. 의존성 설치
cd /home/ubuntu/petchatbot
npm install --production

# 4. 환경변수 설정
nano .env
```

### .env 파일 수정 (중요!)
```
PORT=3000
BASE_URL=http://129.154.xxx.xxx:3000
```
> `129.154.xxx.xxx`를 실제 공인 IP로 변경

### PM2로 서버 시작
```bash
pm2 start src/index.js --name petchatbot
pm2 save
pm2 startup    # 재부팅 시 자동 시작 설정
```

### 서버 확인
```bash
pm2 status                    # 상태 확인
curl http://localhost:3000    # 응답 확인
```
`{"status":"ok","message":"🐾 펫 키우기 챗봇 서버가 실행 중입니다!"}` 나오면 성공

---

## 4단계: 방화벽 열기 (2곳 모두!)

### 4-1. Oracle Cloud 콘솔 (VCN 보안 규칙)
1. Networking → Virtual Cloud Networks → VCN 클릭
2. Subnets → Public Subnet 클릭
3. Security Lists → Default Security List 클릭
4. "Add Ingress Rules" 클릭
5. 입력:
   - Source CIDR: `0.0.0.0/0`
   - Destination Port Range: `3000`
   - Description: `Chatbot API`
6. "Add Ingress Rules" 클릭

### 4-2. VM 내부 방화벽 (iptables)
```bash
# VM에서 실행
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT
sudo netfilter-persistent save
```

### 확인
로컬 PC 브라우저에서 `http://129.154.xxx.xxx:3000` 접속
→ JSON 응답 나오면 성공!

> **안 되면 체크리스트:**
> - VCN Ingress Rule 추가했는가?
> - iptables 룰 추가했는가?
> - PM2에서 서버가 online 상태인가? (`pm2 status`)
> - .env의 포트가 3000인가?

---

## 5단계: 카카오 오픈빌더 설정

### 5-1. 챗봇 생성
1. https://i.kakao.com 접속 (카카오 계정 로그인)
2. "봇 만들기" → 이름: 펫키우기
3. 좌측 메뉴 → "스킬" 클릭

### 5-2. 스킬 등록

> 모든 URL은 `http://129.154.xxx.xxx:3000/api/skill/` 뒤에 붙입니다.

#### 기본 스킬

| 스킬 이름 | Method | URL |
|-----------|--------|-----|
| 시작 | POST | `http://IP:3000/api/skill/start` |
| 정보 | POST | `http://IP:3000/api/skill/info` |
| 먹이 | POST | `http://IP:3000/api/skill/feed` |
| 훈련 | POST | `http://IP:3000/api/skill/train` |
| 상점 | POST | `http://IP:3000/api/skill/shop` |
| 내정보 | POST | `http://IP:3000/api/skill/myinfo` |
| 이름변경 | POST | `http://IP:3000/api/skill/rename` |

#### 콘텐츠 스킬

| 스킬 이름 | Method | URL |
|-----------|--------|-----|
| 탐험 | POST | `http://IP:3000/api/skill/expedition` |
| 귀환 | POST | `http://IP:3000/api/skill/return` |
| 일기 | POST | `http://IP:3000/api/skill/diary` |
| 운세 | POST | `http://IP:3000/api/skill/fortune` |
| 가위바위보 | POST | `http://IP:3000/api/skill/rps` |
| 퀴즈 | POST | `http://IP:3000/api/skill/quiz` |
| 정답 | POST | `http://IP:3000/api/skill/answer` |

#### 소셜 스킬

| 스킬 이름 | Method | URL |
|-----------|--------|-----|
| 랭킹 | POST | `http://IP:3000/api/skill/ranking` |
| 기여도 | POST | `http://IP:3000/api/skill/contribution` |
| 약탈 | POST | `http://IP:3000/api/skill/raid` |
| 방어 | POST | `http://IP:3000/api/skill/defend` |
| 심부름 | POST | `http://IP:3000/api/skill/errand` |
| 방코드 | POST | `http://IP:3000/api/skill/roomcode` |

#### 커스텀 스킬

| 스킬 이름 | Method | URL |
|-----------|--------|-----|
| 칭호 | POST | `http://IP:3000/api/skill/titles` |
| 데코 | POST | `http://IP:3000/api/skill/deco` |
| 데코구매 | POST | `http://IP:3000/api/skill/deco/buy` |
| 장착 | POST | `http://IP:3000/api/skill/deco/equip` |
| 환생 | POST | `http://IP:3000/api/skill/rebirth` |
| 날씨 | POST | `http://IP:3000/api/skill/weather` |
| 도움말 | POST | `http://IP:3000/api/skill/help` |
| 폴백 | POST | `http://IP:3000/api/skill/fallback` |

### 5-3. 블록 생성 & 연결

좌측 메뉴 → "시나리오" → "블록 추가"

각 명령어마다 블록을 만들고 스킬을 연결합니다.

#### 예시: "/먹이" 블록 생성

1. 블록 이름: `먹이주기`
2. **사용자 발화 패턴** 추가:
   - `/먹이`
   - `먹이`
   - `먹이주기`
   - `밥줘`
3. **파라미터 설정**:
   - 파라미터명: `food_id`
   - 엔티티: `sys.any`
   - 필수 여부: 선택 (아니오)
4. **스킬 연결**: 위에서 만든 "먹이" 스킬 선택
5. 저장

#### 주요 블록 파라미터 설정

| 블록 | 파라미터명 | 엔티티 | 필수 |
|------|-----------|--------|------|
| 먹이 | `food_id` | sys.any | 아니오 |
| 훈련 | `stat_type` | sys.any | 아니오 |
| 이름변경 | `pet_name` | sys.any | 예 |
| 가위바위보 | `choice`, `bet_gold` | sys.any | 아니오 |
| 정답 | `answer` | sys.any | 예 |
| 심부름 | `room_code` | sys.any | 아니오 |
| 데코구매 | `deco_id` | sys.any | 예 |
| 장착 | `deco_id` | sys.any | 예 |
| 환생 | `confirm` | sys.any | 아니오 |

#### 폴백 블록 (중요!)

1. 시나리오 → "폴백 블록" 클릭 (기본 제공)
2. 스킬 연결: "폴백" 스킬 선택
3. 이렇게 하면 `/먹이 steak`, `/훈련 strength` 같은 인자 포함 명령어도 처리됨

### 5-4. 배포
1. 우측 상단 "배포" 클릭
2. "배포" 버튼 클릭 → 실제 카카오톡에 반영

---

## 6단계: 테스트 & 운영

### 카카오톡에서 테스트
1. 카카오톡 → 챗봇 검색 → "펫키우기" 검색
2. `/시작` 입력 → 펫 생성 확인
3. `/먹이` → 먹이 목록 표시 확인
4. `/정보` → BasicCard + 이미지 표시 확인

### PM2 운영 명령어
```bash
pm2 status              # 상태 확인
pm2 logs petchatbot     # 실시간 로그
pm2 restart petchatbot  # 재시작
pm2 stop petchatbot     # 중지
pm2 monit               # CPU/메모리 모니터링
```

### 로그 로테이션 (디스크 절약)
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 3
```

### DB 백업 (주기적으로)
```bash
# 수동 백업
cp petgame.db petgame_backup_$(date +%Y%m%d).db

# 자동 백업 (crontab)
crontab -e
# 아래 한 줄 추가 (매일 새벽 3시 백업)
0 3 * * * cp /home/ubuntu/petchatbot/petgame.db /home/ubuntu/backup/petgame_$(date +\%Y\%m\%d).db
```

### 서버 업데이트
```bash
cd /home/ubuntu/petchatbot
git pull                    # 코드 업데이트
npm install --production    # 의존성 업데이트
pm2 restart petchatbot      # 재시작
```

---

## HTTPS 설정 (선택사항, 운영 시 권장)

카카오 오픈빌더는 HTTP도 허용하지만 HTTPS가 권장됩니다.

### 무료 도메인 없이 하는 법 (Caddy 사용)
```bash
# Caddy 설치
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

### 무료 도메인 사용 시 (Let's Encrypt + Nginx)
```bash
# 1. 무료 도메인: https://www.duckdns.org 에서 서브도메인 등록
# 예: mypetbot.duckdns.org → 129.154.xxx.xxx

# 2. Nginx 설치
sudo apt install -y nginx certbot python3-certbot-nginx

# 3. Nginx 설정
sudo nano /etc/nginx/sites-available/petchatbot
```

```nginx
server {
    server_name mypetbot.duckdns.org;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/petchatbot /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 4. SSL 인증서 발급
sudo certbot --nginx -d mypetbot.duckdns.org

# 5. .env 수정
nano .env
# BASE_URL=https://mypetbot.duckdns.org

pm2 restart petchatbot
```

> HTTPS 사용 시 VCN에서 443 포트도 열어야 합니다.

---

## 트러블슈팅

### "서버 연결 실패" (카카오 오픈빌더)
1. `curl http://IP:3000` 이 되는지 확인
2. VCN Ingress Rule 확인 (포트 3000)
3. iptables 확인: `sudo iptables -L INPUT -n | grep 3000`
4. PM2 상태: `pm2 status`

### "이미지가 안 보여요"
1. `http://IP:3000/images/egg_default.png` 브라우저에서 직접 열어보기
2. public/images/ 폴더에 파일 있는지: `ls public/images/`
3. .env의 BASE_URL이 정확한지 확인

### "메모리 부족"
```bash
# 스왑 메모리 추가 (무료 티어 서버용)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile swap swap defaults 0 0' | sudo tee -a /etc/fstab
```

### "DB 에러"
```bash
# DB 파일 권한 확인
ls -la petgame.db
# 재생성
rm petgame.db
pm2 restart petchatbot  # 자동으로 새 DB 생성
```

---

## 전체 명령어 목록 (30개)

| 카테고리 | 명령어 | 기능 |
|---------|--------|------|
| 기본 | /시작 | 펫 생성 |
| 기본 | /정보 | 펫 상태 (칭호+성격+날씨 포함) |
| 기본 | /먹이 [종류] | 먹이 주기 |
| 기본 | /훈련 [스탯] | 스탯 훈련 |
| 기본 | /이름 [이름] | 펫 이름 변경 |
| 기본 | /상점 | 먹이 목록 |
| 기본 | /내정보 | 골드/기여도 |
| 콘텐츠 | /탐험 | 1~4시간 탐험 |
| 콘텐츠 | /귀환 | 탐험 보상 수령 |
| 콘텐츠 | /일기 | 24시간 활동 일기 |
| 콘텐츠 | /운세 | 일일 운세 (버프) |
| 콘텐츠 | /가위바위보 | 골드 배팅 게임 |
| 콘텐츠 | /퀴즈 | 60초 돌발 퀴즈 |
| 콘텐츠 | /정답 [답] | 퀴즈 정답 |
| 소셜 | /랭킹 | 전체 서버 랭킹 |
| 소셜 | /기여도 | 방 내 랭킹 |
| 소셜 | /약탈 | 약탈 이벤트 |
| 소셜 | /방어 | 약탈 방어 |
| 소셜 | /심부름 [코드] | 다른 방에 펫 보내기 |
| 소셜 | /방코드 | 우리 방 코드 |
| 커스텀 | /칭호 | 업적/칭호 (12종) |
| 커스텀 | /데코 | 방 꾸미기 (10종) |
| 커스텀 | /데코구매 [ID] | 데코 구매 |
| 커스텀 | /장착 [ID] | 데코 장착 |
| 커스텀 | /환생 | 환생 (Lv.30+) |
| 커스텀 | /날씨 | 오늘의 환경 |
| 시스템 | /도움말 | 전체 명령어 |
