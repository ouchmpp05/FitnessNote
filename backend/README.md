# 운동 기록 FastAPI 백엔드 — 첫 구현

Python 3.10 이상에서 실행합니다. 현재 구현은 DB 연결, 회원가입·로그인, 공용/개인 운동 등록·조회, 종목별 세트 저장·조회·삭제, 주간 기록 유무 조회, 관리자 사용자 검색·전체 일지·종목별 통계 조회, 피드백 신청·취소·답변 작성·수정입니다. React 화면은 frontend 폴더에서 실행합니다. 종목 정보 수정·비활성화, 개별 세트 삭제·일지 날짜 변경은 후속 범위입니다. 피드백 상태에 따른 기록 잠금 검사는 현재 저장·삭제 API에도 적용됩니다.

## 1. VS Code로 프로젝트 폴더 열기

현재 프로젝트 폴더를 열고 `Terminal → New Terminal`을 선택합니다. 아래 명령은 프로젝트 폴더에서 시작합니다.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

이번 작업에서 `.venv`와 `.env`를 이미 준비했으면 가상환경 생성과 `.env` 복사를 반복할 필요가 없습니다. VS Code의 `Python: Select Interpreter`에서 `backend/.venv/bin/python`을 선택하세요.

## 2. DB 접속 정보 입력

`backend/.env`가 없다면 아래 명령으로 예시를 복사합니다.

```bash
cp .env.example .env
python -c 'import secrets; print(secrets.token_hex(32))'
```

출력된 임의 문자열을 `.env`의 `JWT_SECRET`에 넣습니다. 이번 작업에서 만들어 둔 `.env`에는 임의 키가 이미 들어 있습니다. 키를 변경하면 이전 토큰으로 로그인할 수 없습니다.

`.env`의 `DB_PASSWORD`에 Workbench에서 사용한 MySQL 비밀번호를 입력합니다. 다른 포트나 계정을 사용했다면 해당 값도 변경합니다. 비밀번호에 `#`나 공백이 있으면 예시처럼 큰따옴표 안에 입력하세요. `.env`는 Git에 올리지 않습니다.

DB는 Workbench에서 생성한 `fitness_log`를 그대로 사용합니다. 이 서버는 테이블 생성·삭제를 자동 실행하지 않습니다. 기존 SQL 전체를 다시 실행할 필요가 없습니다.

## 3. 서버 실행

`backend` 폴더에서 가상환경을 활성화한 상태로 실행합니다.

```bash
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- API 테스트 화면: http://127.0.0.1:8000/docs
- 서버 상태: http://127.0.0.1:8000/health
- DB 연결 및 필수 6개 테이블 확인: http://127.0.0.1:8000/health/db
- 종료: 터미널에서 `Control+C`

`/health`는 DB가 꺼져 있어도 응답할 수 있습니다. 실제 연결은 `/health/db`에서 확인합니다. 503이면 MySQL 실행 상태, `.env`의 호스트·포트·계정·비밀번호·DB 이름을 확인하세요. 실제 오류에 비밀번호나 SQL이 섞이지 않도록 API 응답은 일반적인 안내만 반환합니다.

## 4. `/docs`에서 운동 하나 저장하기

각 항목을 펼친 뒤 `Try it out → Execute`로 요청합니다.

1. `POST /auth/register`에서 일반 계정을 생성합니다.

```json
{"login_id": "student1", "password": "exercise1234"}
```

2. 오른쪽 위 `Authorize`를 누르고 `username`에 `student1`, `password`에 `exercise1234`를 입력해 로그인합니다. `client_id`와 `client_secret`은 비워 둡니다. `POST /auth/login`은 JSON이 아닌 폼 입력입니다. 토큰은 기본 60분 유효하며 서버는 요청마다 DB의 계정 역할을 다시 확인합니다.

3. `GET /auth/me`로 로그인 정보를 확인합니다.
4. `POST /exercises`에서 개인 운동을 등록합니다.

```json
{"name": "벤치프레스", "description": "봉을 포함한 총중량을 kg으로 입력"}
```

5. 반환된 `exercise_id`를 사용하여 `PUT /workouts/{day}/exercises/{exercise_id}`를 호출합니다. 날짜 예시는 `2026-11-11`입니다.

```json
{
  "sets": [
    {"weight_kg": 50, "reps": 10},
    {"weight_kg": 45, "reps": 12}
  ]
}
```

6. `GET /workouts/2026-11-11`에서 저장된 일지를 확인합니다.
7. `GET /workouts/calendar?start=2026-11-09&end=2026-11-15`로 그 주에 기록이 있는 날짜를 확인합니다.

**PUT은 해당 종목의 전체 세트 목록을 교체합니다.** 세트를 추가할 때도 기존 세트와 새 세트를 합쳐 보냅니다. 동일 요청을 반복해도 운동 항목이나 세트가 중복 추가되지 않습니다. 현재 구현은 수정 시 세트 행을 재생성하므로 `workout_set_id`는 바뀔 수 있습니다. 잘못된 운동이나 저장 실패는 전체 트랜잭션을 롤백하여 빈 일지를 남기지 않습니다.

종목 전체 삭제는 `DELETE /workouts/{day}/exercises/{exercise_id}`입니다. 마지막 종목을 삭제하면 빈 일지도 삭제합니다. 세트 0개를 PUT하는 것은 허용하지 않습니다. 비활성 운동도 이미 기록된 항목에서는 세트 편집이 가능하지만 새 항목으로 추가할 수 없습니다.

## 5. 관리자 계정

별도 터미널에서 `backend` 폴더로 이동하고 가상환경을 활성화한 뒤 실행합니다.

```bash
python create_admin.py
```

아이디와 비밀번호를 입력합니다. 비밀번호는 화면에 표시되지 않습니다. 기존 계정을 관리자로 승격하지 않고 새 ADMIN 계정만 만듭니다. 관리자 로그인으로 `POST /exercises`를 호출하면 공용 운동이 생성됩니다. 일반 회원가입에서는 ADMIN 역할을 지정할 수 없습니다. 관리자는 사용자 기록 저장·삭제 API를 호출할 수 없습니다.

## 6. 초기 구현 정책과 다음 단계

- 가입 규칙은 임시 기본값: 아이디는 영문·숫자·밑줄 3~50자, 비밀번호는 8~128자. 아이디 대소문자 중복은 기존 DB collation에 따라 구분하지 않습니다.
- 중량은 0~9999.99kg, 소수 둘째 자리까지이며 반복 수는 양의 정수입니다. 종목당 요청 세트 수는 최대 100개입니다.
- 미래 날짜 금지 정책은 아직 확정되지 않았으므로 현재 API는 미래 날짜를 차단하지 않습니다.
- 하루 일지·종목 중복 방지는 DB UNIQUE와 일지 행 잠금으로 처리합니다. 현재 저장 방식은 마지막 성공 저장이 전체 세트 목록을 반영하므로 여러 탭에서 같은 종목을 편집하면 오래된 화면의 저장이 최신 내용을 덮어쓸 수 있습니다.
- 피드백 요청이 있는 일지는 저장·삭제를 차단합니다. 요청 취소·답변 생성 API도 같은 일지 잠금 순서를 적용합니다.
- 로컬 실습용이며 외부 배포·로그인 시도 제한·토큰 강제 폐기 기능은 포함하지 않습니다. 클라이언트에서 토큰을 지우면 로그아웃되지만 발급된 토큰 자체는 만료까지 유효합니다.
- 휴대폰 테스트 시 나중에 `--host 0.0.0.0`으로 실행하고 같은 Wi-Fi에서 PC의 LAN 주소를 사용합니다. React도 PC에서 접근 가능하게 실행하고 해당 프론트 주소를 `CORS_ORIGINS`에 추가합니다.

## 7. 개발 테스트

```bash
python -m pip install -r requirements-dev.txt
python -m pytest -q
```

테스트는 토큰·비밀번호·입력 검증·권한·피드백 잠금의 코드 동작을 확인합니다. 실제 MySQL 데이터는 사용하거나 변경하지 않습니다. SQL 문법·트랜잭션·DB 통합 검증은 `.env` 설정 후 실제 연결로 별도 확인해야 합니다.

실행에 사용한 정확한 패키지 버전은 `requirements-lock.txt`를 참고하세요. 재현하려면 `python -m pip install -r requirements-lock.txt`로 설치할 수 있습니다.

공식 참고: [FastAPI 비밀번호 해시·JWT](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/), [PyMySQL 연결 옵션](https://pymysql.readthedocs.io/en/latest/modules/connections.html).

## 8. 관리자와 피드백 API — Postman

모든 요청에 `Authorization → Bearer Token`으로 로그인 토큰을 설정합니다. 기본 URL은 `http://127.0.0.1:8000`입니다. 일반 사용자 토큰으로 관리자 경로에 접근하면 403입니다.

| Method | 경로 | 역할 / 내용 |
|---|---|---|
| POST | `/workouts/2026-11-11/feedback` | USER, 본인 저장된 일지에 신청. JSON `{"request_message":"지난 기록과 비교해 주세요"}`. 질문은 선택이며 `{}`도 가능 |
| DELETE | `/workouts/2026-11-11/feedback` | USER, 본인 대기 요청만 취소 |
| GET | `/admin/users?q=student&offset=0` | ADMIN, 사용자 검색. items·total 반환, 기본 25개 |
| GET | `/admin/users/1/workouts?offset=0` | ADMIN, 해당 사용자 전체 일지 목록. 날짜 내림차순, 기본 25개 |
| GET | `/admin/users/1/workouts/2026-11-11` | ADMIN, 종목 설명·개인 운동·전체 세트 및 피드백 포함 조회 |
| GET | `/admin/users/1/statistics?start=2026-10-01&end=2026-11-11` | ADMIN, 종목·날짜별 최고 중량과 총 반복 수. 범위는 최대 366일 |
| GET | `/admin/feedback?status=PENDING&offset=0` | ADMIN, 대기 목록. 완료는 COMPLETED |
| GET | `/admin/feedback/1` | ADMIN, 요청 상세 |
| PUT | `/admin/feedback/1/answer` | ADMIN, JSON `{"feedback_content":"피드백 내용"}`. 첫 등록 또는 최초 작성자 수정 |

URL의 사용자 번호와 요청 번호는 실제 응답 값으로 바꿉니다. `/auth`는 위 경로 앞에 붙이지 않습니다. 상태 변경은 일지 → 요청 순서로 행을 잠근 트랜잭션에서 처리합니다. 취소와 답변이 경합하면 먼저 커밋된 상태에 따라 다른 작업이 거절됩니다.

신청은 질문 5,000자 이하, 답변은 공백을 제외한 1~10,000자입니다. 중복 신청·완료 후 재신청·완료 후 취소는 409입니다. 대기 요청을 취소하면 편집이 다시 허용되지만 답변 완료 후에는 해당 일지가 잠깁니다. 관리자도 기록 자체는 수정하지 못합니다. 최초 답변 시각과 답변 작성자는 수정 시 보존합니다.

실제 MySQL 통합 테스트는 `FITNESS_MYSQL_ENV_FILE`에 `.env`의 절대 경로를 지정하고 `python -m pytest -q tests/test_feedback_mysql.py`로 실행합니다. 테스트 데이터는 하나의 미커밋 트랜잭션에서 사용하고 마지막에 전체 롤백합니다. 기존 행을 수정하지 않으며 테이블 생성·삭제도 실행하지 않습니다. AUTO_INCREMENT 번호는 롤백 후에도 건너뛸 수 있습니다.
