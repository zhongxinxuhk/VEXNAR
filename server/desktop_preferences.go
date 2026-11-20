// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"net/http"
)

const desktopAccessKey = "desktop_access_mode"
const desktopApprovalHeader = "X-VEXNAR-User-Approved"

func validDesktopAccess(mode string) bool {
	return mode == "request" || mode == "balanced" || mode == "full"
}

func (s *Server) desktopAccessMode() string {
	if s.m != nil && s.m.pg != nil {
		mode, _, err := s.m.pg.GetSetting(desktopAccessKey)
		if err != nil {
			return "request"
		}
		if validDesktopAccess(mode) {
			return mode
		}
	}
	return "full"
}

func (s *Server) desktopGetPreferences(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]string{"access_mode": s.desktopAccessMode()})
}

func (s *Server) desktopPutPreferences(w http.ResponseWriter, r *http.Request) {
	var input struct {
		AccessMode string `json:"access_mode"`
	}
	if err := decode(r, &input); err != nil || !validDesktopAccess(input.AccessMode) {
		writeErr(w, 400, "access_mode 必须是 request、balanced 或 full")
		return
	}
	if s.m == nil || s.m.pg == nil {
		writeErr(w, 503, "配置存储尚未就绪")
		return
	}
	if err := s.m.pg.SetSetting(desktopAccessKey, input.AccessMode); err != nil {
		writeErr(w, 500, "保存访问模式失败")
		return
	}
	s.desktopGetPreferences(w, r)
}
