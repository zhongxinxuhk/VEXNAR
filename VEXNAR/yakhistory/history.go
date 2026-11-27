// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package yakhistory

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/zhongxinxuhk/vexnar/yakhistory/wire"
)

type Source struct {
	Name      string `json:"name"`
	Workspace string `json:"workspace"`
	Socket    string `json:"socket"`
	TokenFile string `json:"token_file"`
	ProjectID int64  `json:"project_id"`
}

type Request struct {
	Action        string `json:"action"`
	Workspace     string `json:"workspace"`
	Source        string `json:"source"`
	ID            string `json:"id"`
	Page          int    `json:"page"`
	URL           string `json:"url"`
	Method        string `json:"method"`
	Status        string `json:"status"`
	ContentType   string `json:"content_type"`
	CaptureSource string `json:"capture_source"`
	Keyword       string `json:"keyword"`
	Tag           string `json:"tag"`
	OrderBy       string `json:"order_by"`
	Ascending     bool   `json:"ascending"`
	Websocket     bool   `json:"websocket"`
	Agent         bool   `json:"agent"`
	IncludeBody   bool   `json:"include_body"`
}

func Sources(path string) ([]Source, error) {
	var sources = []Source{}
	if path == "" {
		return sources, nil
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, (64<<10)+1))
	if err != nil || len(data) > 64<<10 || json.Unmarshal(data, &sources) != nil {
		return nil, errors.New("无效的 Yak 流量来源配置")
	}

	names, workspaces, sockets := map[string]bool{}, map[string]bool{}, map[string]bool{}
	for i := range sources {
		source := &sources[i]
		if strings.TrimSpace(source.Name) == "" || !filepath.IsAbs(source.Workspace) ||
			!filepath.IsAbs(source.Socket) || !filepath.IsAbs(source.TokenFile) || source.ProjectID <= 0 {
			return nil, errors.New("流量来源需要名称、绝对路径及 Yak 项目 ID")
		}
		source.Workspace = canonicalPath(source.Workspace)
		source.Socket = canonicalPath(source.Socket)
		if names[source.Name] || workspaces[source.Workspace] || sockets[source.Socket] {
			return nil, errors.New("流量来源的名称、工作区和 IPC socket 需要唯一")
		}
		names[source.Name], workspaces[source.Workspace], sockets[source.Socket] = true, true, true
	}
	return sources, nil
}

func canonicalPath(path string) string {
	if resolved, err := filepath.EvalSymlinks(path); err == nil {
		return resolved
	}
	return filepath.Clean(path)
}

func Resolve(sources []Source, input Request) (Source, error) {
	if input.Workspace != "" {
		workspace := canonicalPath(input.Workspace)
		for _, source := range sources {
			if source.Workspace == workspace && (input.Source == "" || source.Name == input.Source) {
				return source, nil
			}
		}
		return Source{}, errors.New("此会话的本地项目没有配置对应的 Yak 流量来源")
	}
	if !input.Agent {
		for _, source := range sources {
			if source.Name == input.Source {
				return source, nil
			}
		}
	}
	return Source{}, errors.New("请选择已配置的 Yak 流量来源")
}

type Summary struct {
	ID          uint64 `json:"id,string"`
	URL         string `json:"url"`
	Method      string `json:"method"`
	Status      int64  `json:"status"`
	Bytes       int64  `json:"bytes"`
	ContentType string `json:"content_type"`
	Source      string `json:"source"`
	IP          string `json:"ip"`
	Title       string `json:"title"`
	Tags        string `json:"tags"`
	Time        int64  `json:"time"`
	Websocket   bool   `json:"websocket"`
}

type Page struct {
	Rows  []Summary `json:"rows"`
	Total int64     `json:"total"`
	Size  int       `json:"size"`
}

type Detail struct {
	Flow     Summary `json:"flow"`
	Request  Packet  `json:"request"`
	Response Packet  `json:"response"`
}

type Packet struct {
	Text      string `json:"text"`
	Base64    string `json:"base64,omitempty"`
	Bytes     int    `json:"bytes"`
	Truncated bool   `json:"truncated"`
}

func summary(flow *wire.HTTPFlow, agent bool) Summary {
	raw := flow.Url
	if agent {
		raw = stripURLSecrets(raw)
	}
	return Summary{ID: flow.Id, URL: raw, Method: flow.Method, Status: flow.StatusCode, Bytes: flow.BodyLength,
		ContentType: flow.ContentType, Source: flow.SourceType, IP: flow.IpAddress, Title: flow.Title, Tags: flow.Tags, Time: flow.CreatedAt, Websocket: flow.IsWebsocket}
}

func stripURLSecrets(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return strings.SplitN(raw, "?", 2)[0]
	}
	u.User, u.RawQuery, u.Fragment, u.RawFragment, u.ForceQuery = nil, "", "", "", false
	return u.String()
}

func packet(raw []byte, input Request) Packet {
	result := Packet{Bytes: len(raw)}
	if !input.Agent {
		const limit = 128 << 10
		preview := raw[:min(len(raw), limit)]
		result.Text = string(preview)
		result.Base64 = base64.StdEncoding.EncodeToString(preview)
		result.Truncated = len(raw) > limit
		return result
	}

	head, body, ok := bytes.Cut(raw, []byte("\r\n\r\n"))
	if !ok {
		head, body, _ = bytes.Cut(raw, []byte("\n\n"))
	}
	const limit = 4 << 10
	lines := strings.Split(string(head[:min(len(head), limit)]), "\n")
	first := strings.Fields(strings.TrimRight(lines[0], "\r"))
	if len(first) == 3 && strings.HasPrefix(first[2], "HTTP/") {
		first[1] = stripURLSecrets(first[1])
		lines[0] = strings.Join(first, " ")
	}
	for i := 1; i < len(lines); i++ {
		line := lines[i]
		if strings.HasPrefix(line, " ") || strings.HasPrefix(line, "\t") {
			lines[i] = "[folded header omitted]"
			continue
		}
		name, _, _ := strings.Cut(line, ":")
		key := strings.ToLower(strings.TrimSpace(name))
		switch key {
		case "host", "content-type", "content-length", "content-encoding", "transfer-encoding", "accept":
		default:
			lines[i] = name + ": [omitted]"
		}
	}
	result.Text = strings.Join(lines, "\n")
	if input.IncludeBody && len(body) > 0 {
		result.Text += "\n\n" + string(body[:min(len(body), limit)])
	}
	result.Truncated = len(head) > limit || (len(body) > 0 && (!input.IncludeBody || len(body) > limit))
	return result
}
