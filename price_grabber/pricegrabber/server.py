"""FastAPI 服务：为演示网页提供采集接口，并挂载静态前端。"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from . import config
from .processing.pipeline import analyze
from .store import PriceStore

WEB_DIR = Path(__file__).resolve().parent.parent / "web"

app = FastAPI(title="电商比价工具", version="1.0.0")

_store: PriceStore | None = None


class SearchBody(BaseModel):
    keyword: str = Field(..., description="搜索关键词")
    per_platform: int = Field(config.DEFAULT_PER_PLATFORM, ge=1, le=20)
    real: bool = False
    platforms: list[str] | None = Field(None, description="启用平台子集")


@app.on_event("startup")
def _startup():
    global _store
    config.ensure_dirs()
    try:
        _store = PriceStore()
    except Exception:  # noqa: BLE001
        _store = PriceStore(":memory:")


@lru_cache(maxsize=1)
def _cached_example() -> dict:
    """启动后预跑一次示例（数据示例 + 结果示例），供首页初始化展示。"""
    result = analyze("无线耳机", per_platform=5, real=False, store=_store)
    result["_example_input"] = {
        "keyword": "无线耳机",
        "per_platform": 5,
        "real": False,
        "说明": "这就是“数据示例”：输入关键词无线耳机，5个平台各采5条",
    }
    return result


@app.post("/api/search")
def api_search(body: SearchBody):
    """按关键词现场运行完整流水线（POST JSON，避免 URL 编码问题）。"""
    try:
        result = analyze(body.keyword, per_platform=body.per_platform,
                         real=body.real, platforms=body.platforms, store=_store)
        return {"ok": True, "data": result}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}


@app.get("/api/example")
def api_example():
    """返回预生成的示例（输入 + 输出）。"""
    result = _cached_example()
    return {"ok": True, "data": result}


@app.get("/api/example/input")
def api_example_input():
    d = _cached_example()
    return {"ok": True, "data": d["_example_input"]}


@app.get("/")
def index():
    return FileResponse(str(WEB_DIR / "index.html"))


# 挂载静态资源
app.mount("/static", StaticFiles(directory=str(WEB_DIR)), name="static")


def run_server(host: str = "0.0.0.0", port: int = 8000) -> int:
    import uvicorn
    uvicorn.run(app, host=host, port=port, log_level="info")
    return 0