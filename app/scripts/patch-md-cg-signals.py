#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
# Repository: https://github.com/zhongxinxuhk/VEXNAR
# SPDX-License-Identifier: AGPL-3.0-or-later
"""给灵枢（@furongjun1999/dsh-memory）的 python MCP server 补终止信号处理。

背景
----
`md_cg/mcp_server.py` 的 stdio 主循环是裸的 `for line in sys.stdin:`。终端
Ctrl-C（或宿主给 SIGINT/SIGTERM）时阻塞读被打断，KeyboardInterrupt 直接逃出
`main()`，于是：

  · stderr 打一屏 Traceback（看着像崩溃，实际是正常关停）；
  · `sustain.stop_all()` / `cg.close()` 整段被跳过（心跳戳停在 running）；
  · 退出码 130，`dsh-craft-anything` 的 mcp-bridge 与 `lingshu-bridge` 只能按
    「异常退出」处理，触发无意义的重拉判定与告警。

本脚本把主循环包进信号处理：首个信号走优雅下线（跑完清理、退出码 0），第二个
信号交还 SIG_DFL（要强杀时不再被拦），请求处理中只置旗不打断在途写入事务。

为什么是脚本而不是改包内文件
----------------------------
该文件位于 profile 的 `node_modules`，`pnpm install` / 插件更新会整目录替换，
手改必丢。上游发布修复版后可整体退役本脚本。

用法
----
    python3 scripts/patch-md-cg-signals.py [mcp_server.py 路径]
    python3 scripts/patch-md-cg-signals.py --check      # 只报告状态

退出码：0 = 已就绪/已跳过（幂等），1 = 目标存在但结构不符（未写入任何内容）。
"""

from __future__ import annotations

import glob
import io
import os
import sys

MARK = "_GracefulStop"
"""补丁指纹：命中即视为已打过。"""

DEFAULT_GLOBS = (
    ".vexnar-home/profiles/*/node_modules/@furongjun1999/dsh-memory/md_cg/mcp_server.py",
    ".dsh-home/profiles/*/node_modules/@furongjun1999/dsh-memory/md_cg/mcp_server.py",
)

HEAD = '''    # ── 终止信号的优雅下线（VEXNAR 补丁 scripts/patch-md-cg-signals.py）─────────
    # 症状：终端 Ctrl-C（或宿主进程给 SIGINT/SIGTERM/SIGHUP）时，`for line in
    # sys.stdin` 的阻塞读被信号打断 → KeyboardInterrupt 直接逃出 main()，于是
    #   · stderr 打出一屏 Traceback——看着像崩溃，实际是正常关停；
    #   · 下方 sustain.stop_all() / cg.close() **整段被跳过**（心跳戳停在 running、
    #     索引缓冲不冲刷、fd 不释放）；
    #   · 退出码 130，父进程（dsh-craft-anything 的 mcp-bridge / lingshu-bridge）
    #     只能按「异常退出」处理，触发无意义的重拉判定与告警。
    # 修法：装 SIGINT/SIGTERM/SIGHUP 处理器。阻塞在 read() 时用**控制流异常**
    # 打断（PEP 475：处理器正常返回则 read 被自动重试，只有抛异常才真跳出）；
    # 请求处理中**只置旗不抛**——不打断进行中的两段式写入事务（中断写有启动期
    # reconcile_writes 兜底，但没必要自己制造），到本轮边界再停。第二个信号交还
    # SIG_DFL：宿主/用户要强杀时不再被本服务拦。signal 走函数内局部导入，
    # 不改变模块顶层导入面（代校验 / AST 守卫不受影响）。
    import signal as _signal

    _stop = {"sig": 0, "busy": False, "flag": False, "last": ""}

    class _GracefulStop(Exception):
        """内部信号：打断阻塞读的控制流异常（仅 main 内使用，不对外暴露）。"""

    def _on_stop(signum, _frame):
        _stop["sig"] += 1
        try:
            _stop["last"] = _signal.Signals(signum).name
        except (ValueError, AttributeError):   # 非标准信号号：留空不影响下线
            pass
        if _stop["sig"] > 1:            # 第二个信号：交还默认处置，不再拦
            try:
                _signal.signal(signum, _signal.SIG_DFL)
                os.kill(os.getpid(), signum)
            except (OSError, ValueError, AttributeError):
                pass
            return
        if _stop["busy"]:               # 请求处理中：置旗，本轮边界后再停
            _stop["flag"] = True
            return
        raise _GracefulStop(signum)      # 阻塞在 read()：抛异常才真跳出

    for _name in ("SIGINT", "SIGTERM", "SIGHUP"):
        _signo = getattr(_signal, _name, None)
        if _signo is None:              # Windows 无 SIGHUP
            continue
        try:
            _signal.signal(_signo, _on_stop)
        except (OSError, ValueError):   # 非主线程 / 平台不支持：保持默认处置
            pass

'''

TAIL = '''    except (_GracefulStop, KeyboardInterrupt):
        # 终止信号 / Ctrl-C：**正常关停**，不是崩溃。不重抛、不打 Traceback，
        # 落到下方统一清理（停自维持循环 + 关闭认知图），退出码 0。
        pass
    if _stop["sig"]:
        sys.stderr.write("[mdcg-mcp] 收到终止信号 %s，优雅下线"
                         "（已停自维持循环并关闭认知图）\\n"
                         % (_stop["last"] or "signal"))
'''

EVENT_MARK = 'internal error: {type(exc).__name__}'


class StructureError(Exception):
    """目标文件结构与预期不符（上游改版）：不写入任何内容，交由人工确认。"""


def _find_targets(argv: list[str]) -> list[str]:
    explicit = [a for a in argv[1:] if not a.startswith("-")]
    if explicit:
        return explicit
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    found: list[str] = []
    for pattern in DEFAULT_GLOBS:
        found.extend(sorted(glob.glob(os.path.join(here, pattern))))
    return found


def patched_source(src: str) -> str:
    """返回打过补丁的源码；结构不符时抛 StructureError。"""
    lines = src.splitlines(keepends=True)

    start = None
    for i, ln in enumerate(lines):
        if ln.rstrip("\n") == "    for line in sys.stdin:":
            if start is not None:
                raise StructureError("`for line in sys.stdin:` 出现多次")
            start = i
    if start is None:
        raise StructureError("未找到 stdio 主循环")

    end = None
    for i in range(start, len(lines) - 1):
        if lines[i].strip().startswith("if stop:") and lines[i + 1].strip() == "break":
            end = i + 1
            break
    if end is None:
        raise StructureError("未找到主循环的 shutdown 跳出点")

    body = lines[start:end + 1]
    for ln in body:
        if ln != "\n" and not ln.startswith("    "):
            raise StructureError("主循环内存在非 4 空格缩进行：%r" % ln)
    body = ["    " + ln if ln.strip() else ln for ln in body]

    idx_serve = None
    for i, ln in enumerate(body):
        if ln.strip() == "stop = _serve_line(cg, msg)":
            idx_serve = i
            break
    if idx_serve is None or body[idx_serve - 1].strip() != "try:":
        raise StructureError("未找到 _serve_line 调用点")
    body.insert(idx_serve - 1, '            _stop["busy"] = True       '
                               '# 请求处理中：信号只置旗，不打断在途写入事务\n')

    idx_msg = None
    for i, ln in enumerate(body):
        if EVENT_MARK in ln:
            idx_msg = i
            break
    if idx_msg is None or not body[idx_msg].rstrip().endswith('"})'):
        raise StructureError("未找到内部错误回写点")
    if (body[idx_msg + 1].strip().startswith("except Exception:") is False
            or body[idx_msg + 2].strip() != "pass"
            or body[idx_msg + 3].strip() != "continue"):
        raise StructureError("内部错误回写点的异常分支结构不符")
    body.insert(idx_msg + 4, "            finally:                   "
                             "# continue 也走这里：旗位必须复位\n"
                             '                _stop["busy"] = False\n')

    idx_stop = None
    for i, ln in enumerate(body):
        if ln.strip().startswith("if stop:") and "shutdown" in ln:
            idx_stop = i
            break
    if idx_stop is None:
        raise StructureError("未找到 shutdown 跳出点")
    body[idx_stop] = ('            if stop or _stop["flag"]:  '
                      '# shutdown / 信号置旗：跳出读循环，正常下线\n')

    new_block = HEAD + "    try:\n" + "".join(body) + TAIL + "\n"
    lines[start:end + 2] = [new_block]
    return "".join(lines)


def main(argv: list[str]) -> int:
    check_only = "--check" in argv
    targets = _find_targets(argv)
    if not targets:
        print("[patch-md-cg-signals] 未找到灵枢 md_cg/mcp_server.py，跳过（未安装即无需补）")
        return 0

    bad = 0
    for path in targets:
        if not os.path.isfile(path):
            print("[patch-md-cg-signals] 不存在，跳过：%s" % path)
            continue
        with io.open(path, encoding="utf-8") as f:
            src = f.read()
        if MARK in src:
            print("[patch-md-cg-signals] 已打过补丁：%s" % path)
            continue
        if check_only:
            print("[patch-md-cg-signals] 未打补丁：%s" % path)
            continue
        try:
            out = patched_source(src)
        except StructureError as exc:
            print("[patch-md-cg-signals] ⚠ 结构不符，未修改（上游可能已改版）：%s\n    %s"
                  % (path, exc), file=sys.stderr)
            bad = 1
            continue
        tmp = path + ".vexnar-tmp"
        with io.open(tmp, "w", encoding="utf-8", newline="") as f:
            f.write(out)
        os.replace(tmp, path)          # 原子替换：不会留下半个文件
        print("[patch-md-cg-signals] 已打补丁：%s" % path)
    return bad


if __name__ == "__main__":
    sys.exit(main(sys.argv))
