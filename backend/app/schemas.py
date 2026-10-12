from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(ORM):
    id: str
    email: str
    name: str
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ProfileUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class DocumentOut(ORM):
    id: str
    filename: str
    content_type: str
    size_bytes: int
    status: str
    error: str | None
    page_count: int
    chunk_count: int
    created_at: datetime


class ConversationCreate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    document_ids: list[str] = []


class ConversationUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    document_ids: list[str] | None = None


class MessageOut(ORM):
    id: str
    role: str
    content: str
    sources: list
    model: str | None
    created_at: datetime


class ConversationOut(ORM):
    id: str
    title: str
    document_ids: list[str]
    created_at: datetime
    updated_at: datetime


class ConversationDetail(ConversationOut):
    messages: list[MessageOut]


class AskIn(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    model: str | None = None
    top_k: int | None = Field(default=None, ge=1, le=20)
    temperature: float | None = Field(default=None, ge=0, le=1.5)


class SearchHit(BaseModel):
    document_id: str
    filename: str
    page: int
    score: float
    content: str
