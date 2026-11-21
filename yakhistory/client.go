// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

// Package yakhistory reads existing HTTP observations from a local Yak engine.
package yakhistory

import (
	"context"
	"errors"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/zhongxinxuhk/vexnar/yakhistory/wire"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
)

func open(socket, tokenFile string) (*grpc.ClientConn, string, error) {
	if !filepath.IsAbs(socket) || !filepath.IsAbs(tokenFile) {
		return nil, "", errors.New("Yakit 连接需要绝对路径的 Unix socket 和认证文件")
	}
	parent, err := os.Stat(filepath.Dir(socket))
	if err != nil || !parent.IsDir() || parent.Mode().Perm()&0077 != 0 {
		return nil, "", errors.New("Yakit socket 需要位于私有目录")
	}
	info, err := os.Lstat(socket)
	if err != nil || info.Mode()&os.ModeSocket == 0 || info.Mode().Perm()&0077 != 0 {
		return nil, "", errors.New("Yakit 内核尚未就绪，或 socket 权限无效")
	}
	info, err = os.Lstat(tokenFile)
	if err != nil || !info.Mode().IsRegular() || info.Mode().Perm()&0077 != 0 || info.Size() > 512 {
		return nil, "", errors.New("Yakit 认证文件不可用")
	}
	data, err := os.ReadFile(tokenFile)
	if err != nil {
		return nil, "", errors.New("无法读取 Yakit 认证文件")
	}
	token := strings.TrimSpace(string(data))
	if token == "" {
		return nil, "", errors.New("Yakit 认证文件为空")
	}
	conn, err := grpc.NewClient("passthrough:///yakit",
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(ctx, "unix", socket)
		}),
		grpc.WithDefaultCallOptions(grpc.MaxCallRecvMsgSize(16<<20)),
	)
	return conn, token, err
}

var ErrProjectChanged = errors.New("Yak 内核当前项目与流量来源配置不一致")

func Read(ctx context.Context, source Source, input Request) (any, error) {
	conn, token, err := open(source.Socket, source.TokenFile)
	if err != nil {
		return nil, err
	}
	defer conn.Close()
	ctx = metadata.AppendToOutgoingContext(ctx, "authorization", "Bearer "+token)
	invoke := func(method string, req, resp any) error {
		if err := conn.Invoke(ctx, "/ypb.Yak/"+method, req, resp); err != nil {
			return errors.New("Yak 流量读取失败，请检查内核版本、连接与项目")
		}
		return nil
	}
	checkProject := func() error {
		var current wire.ProjectDescription
		if err := invoke("GetCurrentProjectEx", &wire.GetCurrentProjectExRequest{Type: "project"}, &current); err != nil {
			return err
		}
		if current.Id != source.ProjectID {
			return ErrProjectChanged
		}
		return nil
	}

	if err := checkProject(); err != nil {
		return nil, err
	}
	var result any
	switch input.Action {
	case "list":
		limit := 50
		if input.Agent {
			limit = 20
		}
		orderBy := input.OrderBy
		switch orderBy {
		case "id", "status_code", "body_length", "created_at":
		default:
			orderBy = "id"
		}
		order := "desc"
		if input.Ascending {
			order = "asc"
		}
		req := &wire.QueryHTTPFlowRequest{
			Pagination: &wire.Paging{Page: int64(max(1, min(input.Page, 1_000_000))), Limit: int64(limit), OrderBy: orderBy, Order: order},
			SourceType: input.CaptureSource, Methods: input.Method, SearchUrl: input.URL,
			StatusCode: input.Status, SearchContentType: input.ContentType, Keyword: input.Keyword, OnlyWebsocket: input.Websocket,
		}
		if input.Tag != "" {
			req.Tags = []string{input.Tag}
		}
		var out wire.QueryHTTPFlowResponse
		if err := invoke("QueryHTTPFlows", req, &out); err != nil {
			return nil, err
		}
		rows := make([]Summary, 0, len(out.Data))
		for _, row := range out.Data {
			rows = append(rows, summary(row, input.Agent))
		}
		result = Page{Rows: rows, Total: out.Total, Size: limit}
	case "detail":
		id, err := strconv.ParseInt(input.ID, 10, 64)
		if err != nil || id <= 0 {
			return nil, errors.New("无效的流量记录 ID")
		}
		var out wire.HTTPFlow
		if err := invoke("GetHTTPFlowById", &wire.GetHTTPFlowByIdRequest{Id: id}, &out); err != nil {
			return nil, err
		}
		result = Detail{Flow: summary(&out, input.Agent), Request: packet(out.Request, input), Response: packet(out.Response, input)}
	default:
		return nil, errors.New("未知的流量读取操作")
	}
	if err := checkProject(); err != nil {
		return nil, err
	}
	return result, nil
}
