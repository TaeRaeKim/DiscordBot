# 구글 시트 연동 설정 가이드

## 1. Google Cloud 서비스 계정 설정

1. [Google Cloud Console](https://console.cloud.google.com/)에 접속
2. 새 프로젝트를 생성하거나 기존 프로젝트 선택
3. **APIs & Services** → **Enable APIs and Services** 클릭
4. **Google Sheets API** 검색 후 활성화

## 2. 서비스 계정 생성

1. **APIs & Services** → **Credentials** 이동
2. **Create Credentials** → **Service Account** 선택
3. 서비스 계정 이름 입력 후 생성
4. 생성된 서비스 계정 클릭 → **Keys** 탭
5. **Add Key** → **Create new key** → **JSON** 선택
6. 다운로드된 JSON 파일을 프로젝트 루트에 `credentials.json`으로 저장

## 3. 구글 시트 권한 설정

1. 서비스 계정 이메일 복사 (예: `bot@project.iam.gserviceaccount.com`)
2. 연동할 구글 시트 열기
3. 우측 상단 **공유** 버튼 클릭
4. 서비스 계정 이메일 추가
   - `/멤버표검사`만 사용: **뷰어** 권한
   - `/시트정리`도 사용: **편집자** 권한
5. 링크 공유 설정을 **링크가 있는 모든 사용자** 로 설정 (선택사항)

## 4. config.json 설정

```json
{
    "googleSheetId": "스프레드시트_ID",
    "googleSheetGid": "0",
    "nicknameColumn": "C",
    "startRow": 4
}
```

### 설정 항목 설명:
- **googleSheetId**: 구글 시트 URL에서 `/d/` 와 `/edit` 사이의 ID
  - 예: `https://docs.google.com/spreadsheets/d/1ABC123.../edit` → `1ABC123...`

- **googleSheetGid**: 시트 고유 ID (URL의 `#gid=` 뒤의 숫자) **[필수]**
  - 예: `https://docs.google.com/spreadsheets/d/.../edit#gid=123456789` → `123456789`
  - 첫 번째 시트는 보통 `0`
  - 시트 이름이 변경되어도 GID는 유지되므로 안정적

- **nicknameColumn**: 닉네임이 있는 열 (기본값: `A`)
  - `A` - A열의 데이터 읽기
  - `C` - C열의 데이터 읽기
  - 단일 열 문자만 지정 (예: A, B, C, ... Z)

- **startRow**: 데이터 시작 행 번호 (기본값: 1)
  - 1 = 첫 번째 행부터
  - 4 = 네 번째 행부터 (1-3행은 무시)
  - 헤더나 제목이 여러 줄일 때 유용

## 5. 명령어 사용

### /멤버표검사
- 구글 시트의 닉네임 목록을 읽어옴
- Discord 서버 멤버와 비교
- 시트에는 있지만 서버에 없는 멤버 목록 표시

### /시트정리
- 구글 시트의 지정된 열에서 빈 행 제거
- 헤더 행은 보존 (startRow 설정 기준)
- 제거된 행 수와 남은 데이터 표시
- **주의**: 이 명령어는 시트를 직접 수정합니다

## 문제 해결

### "credentials.json 파일이 존재하지 않습니다"
- 서비스 계정 키 JSON 파일을 프로젝트 루트에 `credentials.json`으로 저장

### "권한이 없습니다"
- 구글 시트를 서비스 계정 이메일과 공유했는지 확인

### "시트를 찾을 수 없습니다"
- `googleSheetId`가 정확한지 확인
- `googleSheetRange`의 시트명이 실제 시트명과 일치하는지 확인