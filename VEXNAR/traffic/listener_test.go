// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package traffic

import (
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"
)

// TestListenerRecordsScope proves the per-session listener tags its rows with the
// task scope and session key, which is what makes capture-on pool routing
// attributable in the traffic index.
func TestListenerRecordsScope(t *testing.T) {
	tr, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer tr.Close()

	ln, err := tr.NewListener("task:7", "task-7-worker")
	if err != nil {
		t.Fatalf("NewListener: %v", err)
	}
	ln.Start()
	defer ln.Close()

	waitListening(t, ln.Addr())

	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "ok")
	}))
	defer target.Close()

	pu, _ := url.Parse(ln.Addr())
	client := &http.Client{Transport: &http.Transport{Proxy: http.ProxyURL(pu)}}
	resp, err := client.Get(target.URL)
	if err != nil {
		t.Fatalf("GET via listener: %v", err)
	}
	_, _ = io.Copy(io.Discard, resp.Body)
	resp.Body.Close()

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		rows, err := tr.Search("127.0.0.1", 0, 20)
		if err != nil {
			t.Fatalf("Search: %v", err)
		}
		for _, row := range rows {
			if row.Scope == "task:7" && row.Session == "task-7-worker" {
				if row.URL == "" || row.Status != 200 {
					t.Fatalf("row = %+v", row)
				}
				return
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("listener did not record a scoped exchange")
}

func waitListening(t *testing.T, addr string) {
	t.Helper()
	host := addr
	if u, err := url.Parse(addr); err == nil && u.Host != "" {
		host = u.Host
	}
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		c, err := net.DialTimeout("tcp", host, 100*time.Millisecond)
		if err == nil {
			_ = c.Close()
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("listener %s never started", host)
}
