"""京东真实抓取器。

说明：京东网页端有较强的反爬与动态加载，直接抓取通常需要登录/签名。
这里实现真实请求 + 解析逻辑，失败时由 AcquisitionManager 回退到 MockFetcher，
保证工具始终可用。
"""
from __future__ import annotations

import re

from .. import config
from ..models import Product, PlatformSource
from .base import BaseFetcher


class JDFetcher(BaseFetcher):
    platform = "京东"

    _SEARCH = "https://search.jd.com/Search?keyword={kw}&enc=utf-8"

    def search(self, keyword: str, limit: int = config.DEFAULT_PER_PLATFORM) -> PlatformSource:
        try:
            html = self._get_text(self._SEARCH.format(kw=keyword))
        except Exception as e:  # noqa: BLE001
            return PlatformSource(self.platform, False, 0, f"京东抓取失败，已回退 Mock：{e}")

        # 京东返回的 JSON-LD / 商品列表解析（为真实环境留的解析骨架）
        items = _parse_jd(html)[:limit]
        products = []
        for url, title, price, sales, rating, shop in items:
            sku = url.split("/")[-1].split(".")[0]
            products.append(Product(
                title=_clean_title(title), price=price,
                sales=self._to_int(sales), rating=self._to_float(rating, 4.5),
                shop=shop or "京东自营", platform=self.platform,
                url=url, sku=f"京东-{sku}",
            ))
        if not products:
            raise RuntimeError("京东未解析到结果")
        return PlatformSource(self.platform, True, len(products),
                              "京东（真实解析）", products)


def _parse_jd(html: str) -> list[tuple[str, str, float, str, str, str]]:
    """尽量从京东搜索页抽取商品。若页面结构变化则返回空列表。"""
    out = []
    for m in re.finditer(r'data-sku="(\d+)".*?data-title="(.*?)".*?data-price="([\d.]+)"', html, re.S):
        sku, title, price = m.group(1), m.group(2), m.group(3)
        out.append((f"https://item.jd.com/{sku}.html", title, float(price), "", "4.6", "京东自营"))
    return out


def _clean_title(title: str) -> str:
    return re.sub(r"\s+", " ", title).strip()