"""拼多多真实抓取器（骨架实现，失败回退 Mock）。"""
from __future__ import annotations

from .. import config
from ..models import PlatformSource
from .base import BaseFetcher


class PDDFetcher(BaseFetcher):
    platform = "拼多多"

    _SEARCH = "https://mobile.yangkeduo.com/search_result.html?search_key={kw}"

    def search(self, keyword: str, limit: int = config.DEFAULT_PER_PLATFORM) -> PlatformSource:
        try:
            html = self._get_text(self._SEARCH.format(kw=keyword))
        except Exception as e:  # noqa: BLE001
            return PlatformSource(self.platform, False, 0, f"拼多多抓取失败，已回退 Mock：{e}")
        raise RuntimeError("拼多多为 JS 渲染 + 强反爬，需授权接口，已回退 Mock")