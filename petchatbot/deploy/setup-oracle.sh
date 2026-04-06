#!/bin/bash
# ============================================
# Oracle Cloud Ubuntu VM 배포 스크립트
# ============================================

set -e

echo "=== 1. 시스템 업데이트 ==="
sudo apt update && sudo apt upgrade -y

echo "=== 2. Node.js 20 LTS 설치 ==="
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential

echo "=== 3. PM2 설치 ==="
sudo npm install -g pm2

echo "=== 4. 방화벽 설정 (iptables) ==="
# Oracle Cloud Ubuntu는 기본적으로 iptables 규칙이 있음
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT
sudo netfilter-persistent save

echo "=== 5. 프로젝트 설정 ==="
cd /home/ubuntu/petchatbot
npm install --production

echo "=== 6. 환경변수 설정 ==="
if [ ! -f .env ]; then
  cat > .env << 'EOF'
PORT=3000
BASE_URL=http://YOUR_ORACLE_VM_PUBLIC_IP:3000
EOF
  echo "⚠️  .env 파일의 BASE_URL을 실제 서버 IP로 수정하세요!"
fi

echo "=== 7. 스왑 메모리 추가 (무료 티어용) ==="
if [ ! -f /swapfile ]; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile swap swap defaults 0 0' | sudo tee -a /etc/fstab
  echo "스왑 2GB 추가 완료"
fi

echo "=== 8. PM2 로그 로테이션 ==="
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 3

echo "=== 9. DB 백업 크론 설정 ==="
mkdir -p /home/ubuntu/backup
(crontab -l 2>/dev/null; echo "0 3 * * * cp /home/ubuntu/petchatbot/petgame.db /home/ubuntu/backup/petgame_\$(date +\%Y\%m\%d).db") | crontab -

echo "=== 10. PM2로 서버 시작 ==="
pm2 start src/index.js --name petchatbot
pm2 save
pm2 startup

# 공인 IP 자동 감지
PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_IP")

echo "
============================================
  🐾 펫 키우기 챗봇 — 배포 완료!
============================================
  서버: http://${PUBLIC_IP}:3000

  ✅ 완료된 설정:
    - Node.js 20 + PM2
    - 방화벽 포트 3000 개방
    - 스왑 메모리 2GB
    - 로그 로테이션 (10MB, 3개 유지)
    - DB 자동 백업 (매일 새벽 3시)

  ⚠️ 남은 작업:
  1. .env 파일에서 BASE_URL 수정:
     nano .env
     BASE_URL=http://${PUBLIC_IP}:3000
     pm2 restart petchatbot

  2. Oracle Cloud 콘솔 → VCN → Security List에서
     포트 3000 Ingress Rule 추가
     (Source CIDR: 0.0.0.0/0, Dest Port: 3000)

  3. 카카오 오픈빌더 스킬 등록
     → deploy/GUIDE.md 참고

  테스트: curl http://${PUBLIC_IP}:3000
============================================
"
