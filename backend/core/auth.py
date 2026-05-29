# -*- coding: utf-8 -*-
"""JWT 认证模块"""

import os
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer

logger = logging.getLogger(__name__)

# JWT 配置
JWT_SECRET = os.getenv('JWT_SECRET', 'multimodal-data-lake-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRE_HOURS = int(os.getenv('JWT_EXPIRE_HOURS', '24'))

# 不需要认证的路径前缀
PUBLIC_PATHS = (
    '/api/health',
    '/api/users/login',
    '/api/users/register',
    '/docs',
    '/openapi.json',
    '/redoc',
    '/cluster-ui/',  # 前端静态资源
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl='/api/users/login', auto_error=False)


def create_access_token(user_id: int, username: str, is_admin: bool = False) -> str:
    """创建 JWT token"""
    try:
        import jwt
        payload = {
            'sub': str(user_id),
            'username': username,
            'is_admin': is_admin,
            'exp': datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS),
            'iat': datetime.utcnow(),
        }
        return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    except ImportError:
        # 回退：无 PyJWT 时使用简易 token
        import base64, json
        payload = {
            'sub': str(user_id),
            'username': username,
            'is_admin': is_admin,
            'exp': (datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS)).isoformat(),
        }
        return 'simple_' + base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()


def decode_token(token: str) -> dict:
    """解码 JWT token"""
    try:
        import jwt
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except ImportError:
        # 回退解码
        import base64, json
        if token.startswith('simple_'):
            payload = json.loads(base64.urlsafe_b64decode(token[7:]))
            exp = datetime.fromisoformat(payload['exp'])
            if datetime.utcnow() > exp:
                raise ValueError('Token expired')
            return payload
        raise ValueError('Invalid token format')
    except Exception as e:
        raise ValueError(f'Invalid token: {e}')


def is_public_path(path: str) -> bool:
    """判断是否为公开路径"""
    for public in PUBLIC_PATHS:
        if path.startswith(public) or path == public:
            return True
    # 静态资源文件
    if any(path.endswith(ext) for ext in ('.js', '.css', '.png', '.jpg', '.svg', '.ico', '.html', '.json', '.map')):
        return True
    return False


async def get_current_user(request: Request, token: Optional[str] = Depends(oauth2_scheme)) -> dict:
    """获取当前用户（全局依赖项）

    - 公开路径直接放行
    - 有 token 时验证并返回用户信息
    - 无 token 时返回匿名用户（向后兼容）
    """
    path = request.url.path

    # 公开路径直接放行
    if is_public_path(path):
        return {'id': 0, 'username': 'anonymous', 'is_admin': False, 'authenticated': False}

    # 前端页面路由（非 API）放行
    if not path.startswith('/api/'):
        return {'id': 0, 'username': 'anonymous', 'is_admin': False, 'authenticated': False}

    # 有 token 时验证
    if token:
        try:
            payload = decode_token(token)
            return {
                'id': int(payload.get('sub', 0)),
                'username': payload.get('username', ''),
                'is_admin': payload.get('is_admin', False),
                'authenticated': True,
            }
        except Exception as e:
            logger.warning('Token 验证失败: %s', e)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail='Token 无效或已过期',
                headers={'WWW-Authenticate': 'Bearer'},
            )

    # 无 token：向后兼容模式（记录日志但不拦截）
    # 生产环境应改为 raise HTTPException(status_code=401)
    logger.debug('API 请求无认证: %s %s', request.method, path)
    return {'id': 0, 'username': 'anonymous', 'is_admin': False, 'authenticated': False}


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """要求管理员权限"""
    if not user.get('is_admin'):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='需要管理员权限',
        )
    return user


async def require_auth(user: dict = Depends(get_current_user)) -> dict:
    """要求已认证"""
    if not user.get('authenticated'):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='需要登录',
            headers={'WWW-Authenticate': 'Bearer'},
        )
    return user
