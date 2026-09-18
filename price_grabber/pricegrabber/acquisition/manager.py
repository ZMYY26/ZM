"""采集编排：并行调用各平台抓取器，失败自动回退 Mock。"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed

from .. import config
from ..models import Product, PlatformSource
from .jd import JDFetcher
from .taobao import TaobaoFetcher
from .pdd import PDDFetcher
from .mock import MockFetcher


class AcquisitionManager:
    """统一入口。

    Args:
        keyword: 搜索关键词
        per_platform: 每平台条数
        real: True 时优先真实抓取，失败回退 Mock；False 时仅用 Mock（演示/离线）
        platforms: 启用的平台子集
    """

    def __init__(self, keyword: str, per_platform: int = config.DEFAULT_PER_PLATFORM,
                 real: bool = False, platforms=None, fallback_to_mock: bool = config.FALLBACK_TO_MOCK):
        self.keyword = keyword.strip() or "默认商品"
        self.per_platform = per_platform
        self.real = real
        self.platforms = platforms or config.PLATFORMS
        self.fallback_to_mock = fallback_to_mock

    def fetch(self) -> tuple[list[PlatformSource], list[Product], str]:
        """返回 (sources, products, mode)。"""
        mock = MockFetcher()
        mock_src = mock.search(self.keyword, self.per_platform)

        if not self.real:
            return [mock_src], list(mock_src.products), "mock"

        # 真实模式：逐平台尝试，失败或空结果则回退该平台的 Mock
        fetchers = [f for f in (JDFetcher, TaobaoFetcher, PDDFetcher)
                    if f.platform in self.platforms]
        sources: list[PlatformSource] = []
        products: list[Product] = []
        real_ok = 0

        with ThreadPoolExecutor(max_workers=len(fetchers)) as ex:
            futures = {ex.submit(f().search, self.keyword, self.per_platform): f for f in fetchers}
            for fut in as_completed(futures):
                f = futures[fut]
                try:
                    src = fut.result()
                    if src.succeeded and src.products:
                        real_ok += 1
                        sources.append(src)
                        products.extend(src.products)
                        continue
                    raise RuntimeError(src.message or "空结果")
                except Exception as e:  # noqa: BLE001
                    if self.fallback_to_mock:
                        plat_mock = _subset(mock_src, f.platform, self.per_platform)
                        sources.append(PlatformSource(f.platform, True, len(plat_mock.products),
                                                      f"回退 Mock（{type(e).__name__}）", plat_mock.products))
                        products.extend(plat_mock.products)
                    else:
                        sources.append(PlatformSource(f.platform, False, 0, str(e)))

        mode = "real" if real_ok == len(fetchers) else ("mixed" if real_ok else "mock")
        return sources, products, mode


def _subset(mock_src: PlatformSource, platform: str, limit: int) -> PlatformSource:
    prods = [p for p in mock_src.products if p.platform == platform][:limit]
    return PlatformSource(platform, True, len(prods), "回退 Mock", prods)