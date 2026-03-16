# -*- coding: utf-8 -*-
"""测试用户管理 API"""

import pytest
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT_DIR))

from fastapi.testclient import TestClient


@pytest.fixture(scope='module')
def client():
    """创建测试客户端"""
    from backend.main import app
    return TestClient(app)


def test_health_check(client):
    """测试健康检查接口"""
    response = client.get('/api/health')
    assert response.status_code == 200
    data = response.json()
    assert data['status'] == 'ok'


def test_register_user(client):
    """测试用户注册"""
    response = client.post('/api/users/register', json={
        'username': 'testuser',
        'email': 'test@example.com',
        'password': 'test123456',
        'full_name': '测试用户'
    })
    assert response.status_code in (201, 400)  # 201 创建成功或 400 已存在


def test_register_duplicate_user(client):
    """测试重复注册"""
    payload = {
        'username': 'dupuser',
        'email': 'dup@example.com',
        'password': 'test123456'
    }
    client.post('/api/users/register', json=payload)
    response = client.post('/api/users/register', json=payload)
    assert response.status_code == 400


def test_list_users(client):
    """测试获取用户列表"""
    response = client.get('/api/users/list')
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
