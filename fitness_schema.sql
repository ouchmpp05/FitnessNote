-- 운동 기록 서비스 / MySQL Server 8.0.16 이상
-- 빈 스키마에 처음 실행하는 DDL입니다. 기존 테이블을 삭제하지 않습니다.
-- CHECK 제약조건은 MySQL 8.0.16부터 실제 적용됩니다.
-- 로그인 계정 생성 시 password_hash에는 Python에서 생성한 해시를 넣습니다.
-- 확정 범위: 모바일 웹, 공용/개인 운동, 날짜별 일지, 세트 기록, 관리자 피드백.
-- 기존 버전의 테이블을 수정하는 마이그레이션이 아니라 새 DB 생성용입니다.

CREATE DATABASE IF NOT EXISTS fitness_log
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_0900_ai_ci;

USE fitness_log;

CREATE TABLE users (
    user_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    login_id VARCHAR(50) NOT NULL COMMENT '로그인 아이디',
    password_hash VARCHAR(255) NOT NULL COMMENT '비밀번호 해시',
    role ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    UNIQUE KEY uq_users_login_id (login_id)
) ENGINE=InnoDB COMMENT='일반 사용자와 관리자 계정';

CREATE TABLE exercises (
    exercise_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL COMMENT '운동 종목명',
    description TEXT NULL COMMENT '운동 설명 및 중량 입력 기준',
    visibility ENUM('PUBLIC', 'PRIVATE') NOT NULL,
    owner_user_id BIGINT UNSIGNED NULL COMMENT '공용은 NULL, 개인은 소유 회원 번호',
    is_active BOOLEAN NOT NULL DEFAULT TRUE COMMENT '신규 기록에서 선택 가능 여부',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (exercise_id),
    KEY idx_exercises_visibility_name (visibility, name),
    KEY idx_exercises_owner_name (owner_user_id, name),
    CONSTRAINT chk_exercises_scope CHECK (
        (visibility = 'PUBLIC' AND owner_user_id IS NULL)
        OR (visibility = 'PRIVATE' AND owner_user_id IS NOT NULL)
    ),
    CONSTRAINT chk_exercises_active CHECK (is_active IN (0, 1)),
    CONSTRAINT fk_exercises_owner FOREIGN KEY (owner_user_id)
        REFERENCES users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB COMMENT='관리자 공용 운동과 회원별 개인 운동';

CREATE TABLE workouts (
    workout_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    workout_date DATE NOT NULL COMMENT '실제 운동한 날짜',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (workout_id),
    UNIQUE KEY uq_workouts_user_date (user_id, workout_date),
    CONSTRAINT fk_workouts_user FOREIGN KEY (user_id)
        REFERENCES users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB COMMENT='회원별 하루 하나의 운동 일지; 기존 일지에 이어서 기록';

CREATE TABLE workout_exercises (
    workout_exercise_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    workout_id BIGINT UNSIGNED NOT NULL,
    exercise_id BIGINT UNSIGNED NOT NULL,
    exercise_order INT NOT NULL COMMENT '일지 내 운동 순서',
    PRIMARY KEY (workout_exercise_id),
    UNIQUE KEY uq_workout_exercises_order (workout_id, exercise_order),
    UNIQUE KEY uq_workout_exercises_exercise (workout_id, exercise_id),
    KEY idx_workout_exercises_exercise_workout (exercise_id, workout_id),
    CONSTRAINT chk_exercise_order CHECK (exercise_order >= 1),
    CONSTRAINT fk_workout_exercises_workout FOREIGN KEY (workout_id)
        REFERENCES workouts (workout_id) ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_workout_exercises_exercise FOREIGN KEY (exercise_id)
        REFERENCES exercises (exercise_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB COMMENT='일지별 종목당 한 항목; 재선택 시 기존 항목의 세트를 추가하거나 수정';

CREATE TABLE workout_sets (
    workout_set_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    workout_exercise_id BIGINT UNSIGNED NOT NULL,
    set_number INT NOT NULL,
    weight_kg DECIMAL(6,2) NOT NULL COMMENT '맨몸 운동은 추가 중량; 음수 보조 중량은 범위 제외',
    reps INT NOT NULL COMMENT '완료한 반복 수',
    PRIMARY KEY (workout_set_id),
    UNIQUE KEY uq_workout_sets_number (workout_exercise_id, set_number),
    CONSTRAINT chk_set_number CHECK (set_number >= 1),
    CONSTRAINT chk_set_weight CHECK (weight_kg >= 0),
    CONSTRAINT chk_set_reps CHECK (reps >= 1),
    CONSTRAINT fk_workout_sets_exercise FOREIGN KEY (workout_exercise_id)
        REFERENCES workout_exercises (workout_exercise_id)
        ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB COMMENT='종목별 세트 수행 기록';

-- 요청자는 workouts.user_id로 확인하므로 중복 저장하지 않습니다.
-- 대기 요청 취소는 해당 행을 삭제합니다. 완료 요청은 삭제하거나 재요청하지 않습니다.
-- 서버는 역할, 소유권, 일지 잠금을 검사해야 합니다. FK만으로 강제되지 않습니다.
CREATE TABLE feedback_requests (
    feedback_request_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    workout_id BIGINT UNSIGNED NOT NULL,
    request_message TEXT NULL COMMENT '사용자가 남긴 질문, 선택 입력',
    status ENUM('PENDING', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
    reviewer_user_id BIGINT UNSIGNED NULL COMMENT '답변을 작성한 ADMIN 계정',
    feedback_content TEXT NULL COMMENT '요청당 관리자 답변 하나',
    requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    answered_at DATETIME NULL COMMENT '최초 답변 시각',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (feedback_request_id),
    UNIQUE KEY uq_feedback_requests_workout (workout_id),
    KEY idx_feedback_requests_status_requested (status, requested_at),
    KEY idx_feedback_requests_reviewer (reviewer_user_id),
    CONSTRAINT chk_feedback_requests_state CHECK (
        (status = 'PENDING'
            AND reviewer_user_id IS NULL
            AND feedback_content IS NULL
            AND answered_at IS NULL)
        OR
        (status = 'COMPLETED'
            AND reviewer_user_id IS NOT NULL
            AND feedback_content IS NOT NULL
            AND CHAR_LENGTH(TRIM(feedback_content)) > 0
            AND answered_at IS NOT NULL
            AND answered_at >= requested_at)
    ),
    CONSTRAINT fk_feedback_requests_workout FOREIGN KEY (workout_id)
        REFERENCES workouts (workout_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_feedback_requests_reviewer FOREIGN KEY (reviewer_user_id)
        REFERENCES users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB COMMENT='하루 일지 단위 피드백 요청과 관리자 답변';
