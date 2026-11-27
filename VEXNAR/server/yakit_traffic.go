// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"log"
	"mime"
	"net/http"

	"github.com/zhongxinxuhk/vexnar/traffic"
)

func (s *Server) importYakitHAR(w http.ResponseWriter, r *http.Request) {
	tr := s.m.Traffic()
	if tr == nil {
		writeErr(w, 503, "Go 流量存储未启用")
		return
	}
	mediaType, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if mediaType != "application/json" {
		writeErr(w, 415, "HAR 导入需要 application/json")
		return
	}
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 16<<20))
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeErr(w, 413, "HAR 不可超过 16 MiB")
		} else {
			writeErr(w, 400, "无法读取 HAR")
		}
		return
	}
	result, err := tr.ImportYakitHAR(r.Context(), data)
	if errors.Is(err, traffic.ErrInvalidHAR) {
		writeErr(w, 400, err.Error())
		return
	}
	if err != nil {
		log.Printf("[traffic] 导入 HAR 中断: %v", err)
		writeJSON(w, 500, map[string]any{
			"error":  "HAR 导入中断，可重试同一文件",
			"result": result,
		})
		return
	}
	writeJSON(w, 200, result)
}

func (s *Server) promoteTrafficAssets(w http.ResponseWriter, r *http.Request) {
	tr := s.m.Traffic()
	as := s.assetStore()
	if tr == nil || as == nil {
		writeErr(w, 503, "Go 流量或资产存储未启用")
		return
	}
	var input struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&input); err != nil || input.ID == "" {
		writeErr(w, 400, "请选择一条流量记录")
		return
	}
	service, endpoint, method, err := tr.AssetURLs(input.ID)
	if errors.Is(err, sql.ErrNoRows) {
		writeErr(w, 404, "流量记录不存在")
		return
	}
	if err != nil {
		writeErr(w, 422, "此流量记录无法提取 HTTP 资产")
		return
	}
	serviceID, endpointID, err := as.UpsertObservedHTTPAssets(service, endpoint, method)
	if err != nil {
		log.Printf("[traffic] 登记流量资产失败: %v", err)
		writeErr(w, 500, "登记流量资产失败")
		return
	}
	writeJSON(w, 200, map[string]int64{"service_id": serviceID, "endpoint_id": endpointID})
}
