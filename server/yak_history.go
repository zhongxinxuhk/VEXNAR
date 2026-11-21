// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"time"

	"github.com/zhongxinxuhk/vexnar/yakhistory"
)

func (s *Server) readYakHistory(w http.ResponseWriter, r *http.Request) {
	if !s.desktopAuthorized(r) {
		writeErr(w, 403, "Yak 流量接口仅供本机 VEXNAR 客户端")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	var input yakhistory.Request
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		writeErr(w, 400, "无效的流量查询")
		return
	}
	switch input.Action {
	case "sources", "list", "detail":
	default:
		writeErr(w, 400, "无效的流量操作")
		return
	}
	sources, err := yakhistory.Sources(os.Getenv("VEXNAR_YAK_HISTORY_CONFIG"))
	if err != nil {
		writeErr(w, 503, "Yak 流量来源配置不可用")
		return
	}
	if input.Action == "sources" {
		names := make([]string, 0, len(sources))
		for _, source := range sources {
			names = append(names, source.Name)
		}
		writeJSON(w, 200, map[string]any{"sources": names})
		return
	}
	source, err := yakhistory.Resolve(sources, input)
	if err != nil {
		writeErr(w, 409, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
	defer cancel()
	result, err := yakhistory.Read(ctx, source, input)
	if err != nil {
		if errors.Is(err, yakhistory.ErrProjectChanged) {
			writeErr(w, 409, err.Error())
		} else {
			writeErr(w, 502, err.Error())
		}
		return
	}
	writeJSON(w, 200, result)
}
