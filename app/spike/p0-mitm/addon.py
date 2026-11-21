# Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
# Repository: https://github.com/zhongxinxuhk/VEXNAR
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# mitmproxy addon: append one JSON line per response with body hashes.
import hashlib
import json
import os

OUT = os.environ.get("P0_MITM_FLOWS", "/tmp/p0-mitm/flows.jsonl")


def response(flow):
    body = flow.response.content or b""
    req = flow.request.content or b""
    record = {
        "url": flow.request.pretty_url,
        "method": flow.request.method,
        "status": flow.response.status_code,
        "resp_len": len(body),
        "resp_sha256": hashlib.sha256(body).hexdigest(),
        "req_sha256": hashlib.sha256(req).hexdigest(),
    }
    with open(OUT, "a") as handle:
        handle.write(json.dumps(record) + "\n")
