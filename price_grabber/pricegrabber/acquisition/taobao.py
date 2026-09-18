"""淘宝真实抓取器（骨架实现，失败回退 Mock）。"""
from __future__ import annotations

from .. import config
from ..models import PlatformSource
from .base import BaseFetcher


class TaobaoFetcher(BaseFetcher):
    platform = "淘宝"

    _SEARCH = "https://s.taobao.com/search?q={kw}"

    def search(self, keyword: str, limit: int = config.DEFAULT_PER_PLATFORM) -> PlatformSource:
        try:
            html = self._get_text(self._SEARCH.format(kw=keyword))
        except Exception as e:  # noqa: BLE001
            return PlatformSource(self.platform, False, 0, f"淘宝抓取失败，已回退 Mock：{e}")

        # 淘宝需登录且页面为 JS 渲染，爬虫几乎无法直接解析。
        # 真实环境建议接入开放能力/授权；此处不做过度工程。
        raise RuntimeError("淘宝为 JS 渲染 + 强反爬，需授权接口，已回退 Mock")