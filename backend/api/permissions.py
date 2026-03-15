# -*- coding: utf-8 -*-
"""权限管理 API - RBAC 模型"""

import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from database import _get_connection as get_db_connection

logger = logging.getLogger(__name__)
router = APIRouter()


class RoleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    permissions: List[str] = []


class RoleResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    permissions: List[str]
    created_at: str


class UserRoleAssign(BaseModel):
    user_id: int
    role_id: int


def init_permissions_tables():
    """初始化权限相关表"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            permissions TEXT DEFAULT '[]',
            created_at TEXT NOT NULL
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_roles (
            user_id INTEGER NOT NULL,
            role_id INTEGER NOT NULL,
            assigned_at TEXT NOT NULL,
            PRIMARY KEY (user_id, role_id)
        )
    ''')

    # 创建默认角色
    now = datetime.now().isoformat()
    default_roles = [
        ('admin', '系统管理员', '["*"]'),
        ('editor', '编辑者', '["read", "write", "upload"]'),
        ('viewer', '只读用户', '["read"]'),
    ]
    for name, desc, perms in default_roles:
        cursor.execute(
            'INSERT OR IGNORE INTO roles (name, description, permissions, created_at) VALUES (?, ?, ?, ?)',
            (name, desc, perms, now)
        )

    conn.commit()
    conn.close()
    logger.info("权限表初始化完成")


@router.get('/roles', response_model=List[RoleResponse])
async def list_roles():
    """获取所有角色"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('SELECT id, name, description, permissions, created_at FROM roles ORDER BY id')
        rows = cursor.fetchall()
        import json
        return [
            RoleResponse(
                id=r[0], name=r[1], description=r[2],
                permissions=json.loads(r[3] or '[]'), created_at=r[4]
            )
            for r in rows
        ]
    finally:
        conn.close()


@router.post('/roles', response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
async def create_role(role: RoleCreate):
    """创建角色"""
    import json
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('SELECT id FROM roles WHERE name = ?', (role.name,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail='角色名已存在')

        now = datetime.now().isoformat()
        cursor.execute(
            'INSERT INTO roles (name, description, permissions, created_at) VALUES (?, ?, ?, ?)',
            (role.name, role.description, json.dumps(role.permissions, ensure_ascii=False), now)
        )
        role_id = cursor.lastrowid
        conn.commit()

        cursor.execute('SELECT id, name, description, permissions, created_at FROM roles WHERE id = ?', (role_id,))
        r = cursor.fetchone()
        return RoleResponse(
            id=r[0], name=r[1], description=r[2],
            permissions=json.loads(r[3] or '[]'), created_at=r[4]
        )
    finally:
        conn.close()


@router.delete('/roles/{role_id}')
async def delete_role(role_id: int):
    """删除角色"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('SELECT id FROM roles WHERE id = ?', (role_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail='角色不存在')
        cursor.execute('DELETE FROM roles WHERE id = ?', (role_id,))
        cursor.execute('DELETE FROM user_roles WHERE role_id = ?', (role_id,))
        conn.commit()
        return {'message': '角色已删除'}
    finally:
        conn.close()


@router.post('/assign')
async def assign_role(data: UserRoleAssign):
    """为用户分配角色"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('SELECT id FROM roles WHERE id = ?', (data.role_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail='角色不存在')

        now = datetime.now().isoformat()
        cursor.execute(
            'INSERT OR REPLACE INTO user_roles (user_id, role_id, assigned_at) VALUES (?, ?, ?)',
            (data.user_id, data.role_id, now)
        )
        conn.commit()
        return {'message': '角色分配成功'}
    finally:
        conn.close()


@router.delete('/assign')
async def revoke_role(data: UserRoleAssign):
    """撤销用户角色"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            'DELETE FROM user_roles WHERE user_id = ? AND role_id = ?',
            (data.user_id, data.role_id)
        )
        conn.commit()
        return {'message': '角色已撤销'}
    finally:
        conn.close()


@router.get('/user/{user_id}/roles')
async def get_user_roles(user_id: int):
    """获取用户的角色列表"""
    import json
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            SELECT r.id, r.name, r.description, r.permissions
            FROM roles r
            JOIN user_roles ur ON r.id = ur.role_id
            WHERE ur.user_id = ?
        ''', (user_id,))
        rows = cursor.fetchall()
        return [
            {'id': r[0], 'name': r[1], 'description': r[2],
             'permissions': json.loads(r[3] or '[]')}
            for r in rows
        ]
    finally:
        conn.close()
