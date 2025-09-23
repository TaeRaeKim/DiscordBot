# Google OAuth2 설정 가이드

## 사전 준비

1. Google Cloud Console 프로젝트
2. Discord 봇 토큰
3. ngrok 계정 (선택사항, 프로덕션 배포시)

## 설정 단계

### 1. Google Cloud Console 설정

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 프로젝트 선택 또는 새 프로젝트 생성
3. "APIs & Services" → "Credentials" 이동
4. "Create Credentials" → "OAuth client ID" 선택
5. Application type: **Web application** 선택
6. 설정 입력:
   - Name: `ForkTower OAuth`
   - Authorized redirect URIs:
     - 개발용: `http://localhost:5948/callback`
     - 프로덕션용: `https://your-domain.ngrok.io/callback`
7. 생성 후 Client ID와 Client Secret 저장

### 2. credentials_oauth2.json 파일 생성

```json
{
    "web": {
        "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
        "project_id": "your-project-id",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "client_secret": "YOUR_CLIENT_SECRET",
        "redirect_uris": [
            "http://localhost:5948/callback"
        ],
        "javascript_origins": [
            "http://localhost:5948"
        ]
    }
}
```

### 3. 환경 변수 설정

1. `.env.example`을 `.env`로 복사
2. 다음 값들 설정:

```env
# Discord Bot Token
DISCORD_TOKEN=your_discord_bot_token

# OAuth Server Configuration
OAUTH_API_KEY=your-secure-random-key
OAUTH_SERVER_URL=http://localhost:5948
```

### 4. 로컬 개발 실행

```bash
# 의존성 설치
npm install

# OAuth 서버와 봇 동시 실행
npm run dev

# 또는 개별 실행
npm run oauth-server  # 터미널 1
npm run start        # 터미널 2
```

### 5. 프로덕션 배포 (ngrok 사용)

1. ngrok 설치 및 실행:
```bash
ngrok http 5948
```

2. ngrok이 제공한 HTTPS URL 확인:
```
https://abc123.ngrok.io
```

3. Google Cloud Console에서 redirect URI 추가:
   - `https://abc123.ngrok.io/callback`

4. `.env` 파일 업데이트:
```env
OAUTH_SERVER_URL=https://abc123.ngrok.io
```

5. `oauth-server.js`의 authUrl 생성 부분 수정:
```javascript
const authUrl = `${process.env.OAUTH_SERVER_URL}/auth/google?state=${state}`;
```

## 사용 방법

1. Discord에서 `/소유계정등록` 명령어 실행
2. Google 계정 이메일 입력
3. 제공된 링크 클릭하여 Google 로그인
4. 권한 승인
5. "인증 확인" 버튼 클릭
6. 인증 완료

## 문제 해결

### 500 에러 발생
- Google Cloud Console에서 redirect URI가 정확히 설정되었는지 확인
- credentials_oauth2.json의 형식이 올바른지 확인 (web 타입)

### 인증 후 콜백 실패
- OAuth 서버가 실행 중인지 확인
- 방화벽/포트 설정 확인
- ngrok 사용시 URL이 최신인지 확인

### 토큰 저장 실패
- tokens.json 파일 권한 확인
- 디스크 공간 확인

## 보안 주의사항

- `.env` 파일은 절대 git에 커밋하지 마세요
- `OAUTH_API_KEY`는 강력한 랜덤 키 사용
- 프로덕션에서는 HTTPS 필수
- credentials 파일의 접근 권한 제한