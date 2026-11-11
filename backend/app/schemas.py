from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class Signup(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # 초기 구현용 규칙. 이후 정책을 바꾸려면 이 모델과 README를 함께 수정합니다.
    login_id: str = Field(min_length=3, max_length=50, pattern=r"^[A-Za-z0-9_]+$")
    password: str = Field(min_length=8, max_length=128)


class UserOut(BaseModel):
    user_id: int
    login_id: str
    role: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ExerciseInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=10000)


class SetInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    weight_kg: Decimal = Field(ge=0, le=Decimal("9999.99"), max_digits=6, decimal_places=2)
    reps: int = Field(ge=1, le=2147483647, strict=True)


class SaveExercise(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sets: list[SetInput] = Field(min_length=1, max_length=100)
