"""采集器基类：定义统一接口与 HTTP 辅助方法。

各平台（京东/淘宝/拼多多）均有较强的反爬限制，
直接抓取可能失败。为此所有真实抓取器继承本类，
失败时由 AcquisitionManager 统一回退到 MockFetcher，
保证工具在任何环境都能运行。
"""
from __future__ import annotations

import re
from abc import ABC, abstractmethod

import requests

from .. import config
from ..models import Product, PlatformSource


class BaseFetcher(ABC):
    platform = "通用"

    def __init__(self, session: requests.Session | None = None):
        self.session = session or requests.Session()
        self.session.headers["User-Agent"] = config.USER_AGENT
        self.session.headers["Accept-Language"] = "zh-CN,zh;q=0.9"

    @abstractmethod
    def search(self, keyword: str, limit: int = config.DEFAULT_PER_PLATFORM) -> PlatformSource:
        """按关键词采集该平台商品。"""

    # ---------- 工具方法 ----------

    def _get_text(self, url: str, **kw) -> str:
        """带代理感知的 GET 请求，返回响应文本。失败抛异常由调用方处理。"""
        resp = self.session.get(url, timeout=config.HTTP_TIMEOUT, **kw)
        resp.raise_for_status()
        resp.encoding = resp.apparent_encoding or "utf-8"
        return resp.text

    @staticmethod
    def _to_float(v, default: float = 0.0) -> float:
        if isinstance(v, (int, float)):
            return float(v)
        if not v:
            return default
        m = re.search(r"\d+\.?\d*", str(v).replace(",", ""))
        try:
            return float(m.group(0)) if m else default
        except (ValueError, AttributeError):
            return default

    @staticmethod
    def _to_int(v, default: int = 0) -> int:
        if isinstance(v, bool):
            return int(v)
        if isinstance(v, int):
            return v
        if isinstance(v, float):
            return int(v)
        if not v:
            return default
        s = str(v).lower().replace(",", "").replace("+", "").replace(" ", "")
        mult = 1
        if "万" in s:
            mult = 10000
            s = s.replace("万", "")
        if "千" in s:
            mult = 1000 if mult == 1 else mult
            s = s.replace("千", "")
        m = re.search(r"\d+\.?\d*", s)
        try:
            return int(float(m.group(0)) * mult) if m else 0
        except (ValueError, AttributeError):
            return 0