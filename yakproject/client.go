// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

// Package yakproject links local workspace identities to the upstream Yakit project catalog.
package yakproject

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"

	"github.com/zhongxinxuhk/vexnar/yakproject/wire"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
)

const externalModule = "vexnar"

var (
	invalidName = regexp.MustCompile(`[^a-zA-Z0-9_\p{Han}]+`)
	// Yak checks a project's name before inserting it. Serialize lookup/create
	// so two dsh sessions in the same directory cannot both create it.
	projectWrites sync.Mutex
)

type Project struct {
	ID   int64  `json:"id,string"`
	Name string `json:"name"`
}

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
		grpc.WithDefaultCallOptions(grpc.MaxCallRecvMsgSize(1<<20)),
	)
	return conn, token, err
}

func workspaceIdentity(workspace string) (name, code string) {
	hash := sha256.Sum256([]byte(workspace))
	code = hex.EncodeToString(hash[:])
	label := strings.Trim(invalidName.ReplaceAllString(filepath.Base(workspace), "_"), "_")
	if label == "" {
		label = "workspace"
	}
	runes := []rune(label)
	return "VEXNAR_" + string(runes[:min(len(runes), 30)]) + "_" + code[:12], code
}

// Ensure creates at most one linked project for an already-canonical local
// workspace. It only calls the upstream project listing and creation methods.
func Ensure(ctx context.Context, socket, tokenFile, workspace string) (Project, bool, error) {
	conn, token, err := open(socket, tokenFile)
	if err != nil {
		return Project{}, false, err
	}
	defer conn.Close()
	ctx = metadata.AppendToOutgoingContext(ctx, "authorization", "Bearer "+token)
	name, code := workspaceIdentity(workspace)

	projectWrites.Lock()
	defer projectWrites.Unlock()
	lookup := func() (Project, error) {
		list := new(wire.GetProjectsResponse)
		err := conn.Invoke(ctx, "/ypb.Yak/GetProjects", &wire.GetProjectsRequest{
			ProjectName: name, Type: "project", FrontendType: "project",
			ExternalModule: externalModule, ExternalProjectCode: code,
			Pagination: &wire.Paging{Page: 1, Limit: 20},
		}, list)
		if err != nil {
			return Project{}, err
		}
		var found Project
		for _, row := range list.Projects {
			if row.ExternalModule != externalModule || row.ExternalProjectCode != code || row.Id <= 0 {
				continue
			}
			if found.ID != 0 {
				return Project{}, errors.New("发现多个关联的 Yakit 项目")
			}
			found = Project{ID: row.Id, Name: row.ProjectName}
		}
		return found, nil
	}
	if found, err := lookup(); found.ID != 0 || err != nil {
		return found, false, err
	}
	created := new(wire.NewProjectResponse)
	err = conn.Invoke(ctx, "/ypb.Yak/NewProject", &wire.NewProjectRequest{
		ProjectName: name, Type: "project", Description: "VEXNAR local workspace",
		ExternalModule: externalModule, ExternalProjectCode: code,
	}, created)
	if err == nil && created.Id > 0 {
		return Project{ID: created.Id, Name: created.ProjectName}, true, nil
	}
	if found, lookupErr := lookup(); lookupErr == nil && found.ID != 0 {
		return found, false, nil
	}
	return Project{}, false, errors.New("Yakit 项目创建失败，请检查认证和内核版本")
}
