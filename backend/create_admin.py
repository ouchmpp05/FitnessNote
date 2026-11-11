"""로컬 터미널에서만 관리자 계정을 생성합니다. 기존 계정 권한은 변경하지 않습니다."""
from getpass import getpass

import pymysql
from pydantic import ValidationError

from app import config  # .env 로드
from app.database import database
from app.schemas import Signup
from app.security import password_hasher


def main():
    login_id = input("관리자 아이디: ").strip()
    password = getpass("관리자 비밀번호(8자 이상): ")
    if password != getpass("비밀번호 확인: "):
        raise SystemExit("비밀번호가 일치하지 않습니다.")
    try:
        account = Signup(login_id=login_id, password=password)
    except ValidationError:
        raise SystemExit("아이디는 영문·숫자·밑줄 3~50자, 비밀번호는 8~128자로 입력하세요.") from None
    try:
        with database() as cursor:
            cursor.execute("INSERT INTO users(login_id,password_hash,role) VALUES (%s,%s,'ADMIN')",
                           (account.login_id, password_hasher.hash(account.password)))
    except pymysql.IntegrityError:
        raise SystemExit("이미 존재하는 아이디이거나 계정 생성 제약을 위반했습니다.") from None
    except pymysql.MySQLError:
        raise SystemExit("DB에 연결할 수 없습니다. .env와 MySQL 실행 상태를 확인하세요.") from None
    print("관리자 계정을 생성했습니다.")


if __name__ == "__main__":
    main()
