"""全局配置。"""
from __future__ import annotations

import os
from pathlib import Path

# 项目根目录
BASE_DIR = Path(__file__).resolve().parent.parent

# 数据存储目录（价格历史 / 快照）
DATA_DIR = Path(os.environ.get("PRICE_DATA_DIR", BASE_DIR / "data"))
DB_PATH = DATA_DIR / "price_history.db"

# 平台列表（保持顺序，用于展示）
PLATFORMS = ["京东", "淘宝", "拼多多"]

# 默认搜索数量
DEFAULT_PER_PLATFORM = 5
DEFAULT_MAX = 30

# HTTP 请求设置
HTTP_TIMEOUT = 8
USER_AGENT = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/122.0 Safari/537.36")

# 请求失败时是否回退到 Mock 生成器（演示 / 断网环境）
FALLBACK_TO_MOCK = True

# 曲率趋势：历史窗口天数（生成趋势序列用）
TREND_DAYS = 14


def ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)