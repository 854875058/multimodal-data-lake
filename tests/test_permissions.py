# -*- coding: utf-8 -*-
"""测试权限管理 API"""

import pytest
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT_DIR))

from fastapi.testclient import TestClient


@pytest.fixture(scope='module')
def client():
    from backend.main import app
    return TestClient(app)


def test_list_roles(client):
    """测试获取角色列表"""
    response = client.get('/api/permissions/roles')
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    # 应该有默认角色
    assert len(data) >= 3


def test_create_role(client):
    """测试创建角色"""
    response = client.post('/api/permissions/roles', json={
        'name': 'test_role',
        'description': '测试角色',
        'permissions': ['read', 'write']
    })
    assert response.status_code in (201, 400)


def test_create_duplicate_role(client):
    """测试重复创建角色"""
    payload = {'name': 'dup_role', 'description': '重复角色', 'permissions': ['read']}
    client.post('/api/permissions/roles', json=payload)
    response = client.post('/api/permissions/roles', json=payload)
    assert response.status_code == 400
