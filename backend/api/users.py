# -*- coding: utf-8 -*-
"""用户管理 API"""

import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr

from backend.core.database import _get_connection as get_db_connection

logger = logging.getLogger(__name__)
router = APIRouter()

# 密码加密
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/users/login")


class UserCreate(BaseModel):
    """用户创建模型"""
    username: str
    email: EmailStr
    password: str
    full_name: Optional[str] = None


class UserResponse(BaseModel):
    """用户响应模型"""
    id: int
    username: str
    email: str
    full_name: Optional[str]
    is_active: bool
    is_admin: bool
    created_at: str


class UserUpdate(BaseModel):
    """用户更新模型"""
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    is_active: Optional[bool] = None


def hash_password(password: str) -> str:
    """加密密码"""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    return pwd_context.verify(plain_password, hashed_password)


def init_users_table():
    """初始化用户表"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT,
            is_active INTEGER DEFAULT 1,
            is_admin INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    ''')

    # 创建默认管理员账号
    cursor.execute('SELECT COUNT(*) FROM users WHERE username = ?', ('admin',))
    if cursor.fetchone()[0] == 0:
        now = datetime.now().isoformat()
        cursor.execute('''
            INSERT INTO users (username, email, password_hash, full_name, is_admin, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', ('admin', 'admin@example.com', hash_password('admin123'), '系统管理员', 1, now, now))
        logger.info("创建默认管理员账号: admin / admin123")

    conn.commit()
    conn.close()


@router.post('/register', response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_user(user: UserCreate):
    """注册新用户"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # 检查用户名是否已存在
        cursor.execute('SELECT id FROM users WHERE username = ?', (user.username,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail='用户名已存在')

        # 检查邮箱是否已存在
        cursor.execute('SELECT id FROM users WHERE email = ?', (user.email,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail='邮箱已被注册')

        # 创建用户
        now = datetime.now().isoformat()
        cursor.execute('''
            INSERT INTO users (username, email, password_hash, full_name, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (user.username, user.email, hash_password(user.password), user.full_name, now, now))

        user_id = cursor.lastrowid
        conn.commit()

        # 返回用户信息
        cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))
        row = cursor.fetchone()

        return UserResponse(
            id=row[0],
            username=row[1],
            email=row[2],
            full_name=row[4],
            is_active=bool(row[5]),
            is_admin=bool(row[6]),
            created_at=row[7]
        )
    finally:
        conn.close()


@router.post('/login')
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """用户登录"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute('SELECT * FROM users WHERE username = ?', (form_data.username,))
        row = cursor.fetchone()

        if not row or not verify_password(form_data.password, row[3]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail='用户名或密码错误',
                headers={'WWW-Authenticate': 'Bearer'},
            )

        if not row[5]:  # is_active
            raise HTTPException(status_code=400, detail='账号已被禁用')

        # 生成真实 JWT token
        from backend.core.auth import create_access_token
        token = create_access_token(user_id=row[0], username=row[1], is_admin=bool(row[6]))

        return {
            'access_token': token,
            'token_type': 'bearer',
            'user': {
                'id': row[0],
                'username': row[1],
                'email': row[2],
                'full_name': row[4],
                'is_admin': bool(row[6])
            }
        }
    finally:
        conn.close()


@router.get('/list', response_model=list[UserResponse])
async def list_users(skip: int = 0, limit: int = 100):
    """获取用户列表"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute('SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?', (limit, skip))
        rows = cursor.fetchall()

        return [
            UserResponse(
                id=row[0],
                username=row[1],
                email=row[2],
                full_name=row[4],
                is_active=bool(row[5]),
                is_admin=bool(row[6]),
                created_at=row[7]
            )
            for row in rows
        ]
    finally:
        conn.close()


@router.get('/{user_id}', response_model=UserResponse)
async def get_user(user_id: int):
    """获取用户详情"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))
        row = cursor.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail='用户不存在')

        return UserResponse(
            id=row[0],
            username=row[1],
            email=row[2],
            full_name=row[4],
            is_active=bool(row[5]),
            is_admin=bool(row[6]),
            created_at=row[7]
        )
    finally:
        conn.close()


@router.put('/{user_id}', response_model=UserResponse)
async def update_user(user_id: int, user_update: UserUpdate):
    """更新用户信息"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail='用户不存在')

        # 构建更新语句
        updates = []
        params = []

        if user_update.email is not None:
            updates.append('email = ?')
            params.append(user_update.email)

        if user_update.full_name is not None:
            updates.append('full_name = ?')
            params.append(user_update.full_name)

        if user_update.is_active is not None:
            updates.append('is_active = ?')
            params.append(int(user_update.is_active))

        if updates:
            updates.append('updated_at = ?')
            params.append(datetime.now().isoformat())
            params.append(user_id)

            cursor.execute(
                f'UPDATE users SET {", ".join(updates)} WHERE id = ?',
                params
            )
            conn.commit()

        # 返回更新后的用户信息
        cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))
        row = cursor.fetchone()

        return UserResponse(
            id=row[0],
            username=row[1],
            email=row[2],
            full_name=row[4],
            is_active=bool(row[5]),
            is_admin=bool(row[6]),
            created_at=row[7]
        )
    finally:
        conn.close()


@router.delete('/{user_id}')
async def delete_user(user_id: int):
    """删除用户"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail='用户不存在')

        cursor.execute('DELETE FROM users WHERE id = ?', (user_id,))
        conn.commit()

        return {'message': '用户已删除'}
    finally:
        conn.close()
