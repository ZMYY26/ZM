"""命令行工具：python -m pricegrabber fetch "无线耳机"
或  python -m pricegrabber server --port 8000
"""
from __future__ import annotations

import json
import sys
import argparse
from pathlib import Path

from . import config
from .processing.pipeline import analyze
from .store import PriceStore


def _render_table(rows: list[dict], max_width: int = 46) -> str:
    """用纯文本/Unicode 框线输出结果表。"""
    if not rows:
        return "  (无数据)"
    heads = ["排名", "平台", "价格", "折扣", "销量", "评分", "性价比", "商品名称", "店铺"]
    t = "┌────┬──────┬────────┬──────┬──────────┬──────┬──────────┬" + "─" * max_width + "┬────────────────┐\n"
    t += "│排名│ 平台 │  价格  │ 折扣 │   销量   │ 评分 │  性价比  │" + " " * max_width + "│      店铺       │\n"
    t += "├────┼──────┼────────┼──────┼──────────┼──────┼──────────┼" + "─" * max_width + "┼────────────────┤\n"
    for r in rows:
        title = r["title"]
        title = title if len(title) <= max_width else title[: max_width - 1] + "…"
        shop = r["shop"]
        shop = shop if len(shop) <= 12 else shop[:11] + "…"
        t += ("│{rank:>3} │{plat}│ ¥{price:>6.2f} │ {disc} │ {sales:>9,} │ {rating} │ {score:>4} {label:<3}│"
              "{title:<" + str(max_width) + "}│ {shop:>12} │\n").format(
            rank=r["rank"], plat=r["platform"], price=r["price"],
            disc=f"{r['discount']:.2f}", sales=int(r["sales"]), rating=f"{r['rating']:.1f}",
            score=f"{r['score']:.0f}", label=r["score_label"], title=title, shop=shop)
    t += "└────┴──────┴────────┴──────┴──────────┴──────┴──────────┴" + "─" * max_width + "┴────────────────┘\n"
    return t


def _render_compare(comparison: dict) -> str:
    agg = comparison.get("aggregate", [])
    if not agg:
        return ""
    lines = ["\n平台横向对比（价格 ∈ 采集样本）"]
    lines.append("┌──────┬──────┬────────┬────────┬────────┬────────────┬────────────┐")
    lines.append("│ 平台 │ 数量 │ 最低价 │ 均价   │ 最高价 │ 平均销量    │ 平均评分   │")
    lines.append("├──────┼──────┼────────┼────────┼────────┼────────────┼────────────┤")
    for a in agg:
        if not a.get("count"):
            lines.append(f"│ {a['platform']}  │  -   │   -    │   -    │   -    │     -      │      -    │")
            continue
        lines.append("│ {} │ {:>3}  │ ¥{:>6.2f} │ ¥{:>6.2f} │ ¥{:>6.2f} │ {:>9,}    │   {:>5.1f}   │".format(
            a["platform"], a["count"], a["min_price"], a["avg_price"], a["max_price"],
            a["avg_sales"], a["avg_rating"]))
    lines.append("└──────┴──────┴────────┴────────┴────────┴────────────┴────────────┘")
    return "\n".join(lines)


def cmd_fetch(args) -> int:
    config.ensure_dirs()
    store = None
    try:
        store = PriceStore()
    except Exception:  # noqa: BLE001
        store = PriceStore(":memory:")

    print(f"🔎 正在采集关键词「{args.keyword}」…（模式：{'真实抓取' if args.real else '演示 Mock'}）\n")
    result = analyze(args.keyword, per_platform=args.per, real=args.real,
                     platforms=args.platform, store=store, keep=args.max)
    store.close()

    if not result["products"]:
        print("未获取到有效商品数据。")
        return 1

    print(f"共采集 {result['summary']['total']} 条，来源：{', '.join(result['summary']['platforms'])} "
          f"（模式：{result['mode']}）\n")
    print(_render_table(result["products"]))
    print(_render_compare(result["comparison"]))

    best = result["summary"].get("best")
    if best:
        print(f"\n⭐ 性价比之选：¥{best['price']:.2f}  {best['title']}（{best['platform']}，评分 {best['score']}）")

    if args.out:
        Path(args.out).write_text(json.dumps(result, ensure_ascii=False, indent=2),
                                  encoding="utf-8")
        print(f"\nJSON 已写入：{args.out}")
    return 0


def cmd_server(args) -> int:
    from .server import run_server
    return run_server(host=args.host, port=args.port)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        prog="pricegrabber",
        description="电商商品价格自动化采集与对比工具",
    )
    sub = parser.add_subparsers(dest="command")

    f = sub.add_parser("fetch", help="按关键词采集并对比商品价格")
    f.add_argument("keyword", help="搜索关键词，如：无线耳机")
    f.add_argument("-p", "--per", type=int, default=config.DEFAULT_PER_PLATFORM,
                   help=f"每个平台采集条数（默认 {config.DEFAULT_PER_PLATFORM}）")
    f.add_argument("--max", type=int, default=config.DEFAULT_MAX,
                   help="排序后保留的展示条数上限")
    f.add_argument("--real", action="store_true",
                   help="尝试真实抓取（失败自动回退 Mock）")
    f.add_argument("--platform", nargs="*", default=None, help="仅采集指定平台，如 京东 淘宝")
    f.add_argument("-o", "--out", default=None, help="结果写入 JSON 文件")
    f.set_defaults(func=cmd_fetch)

    s = sub.add_parser("server", help="启动演示网页服务")
    s.add_argument("--host", default="0.0.0.0")
    s.add_argument("--port", type=int, default=8000)
    s.set_defaults(func=cmd_server)

    if len(sys.argv) == 1:
        parser.print_help()
        return 0

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())