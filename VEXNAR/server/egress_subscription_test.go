// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const subBody = "c3M6Ly9hZXMtMTI4LWdjbTpwd0BleGFtcGxlLmNvbTo4Mzg4"

func TestResolveSubscription(t *testing.T) {
	ctx := context.Background()

	// Pasted text wins and is returned untouched.
	got, err := resolveSubscription(ctx, "proxies:\n  - {name: a, type: ss, server: h, port: 1}", "")
	if err != nil || !strings.Contains(got, "proxies") {
		t.Fatalf("text passthrough: %q %v", got, err)
	}

	if _, err := resolveSubscription(ctx, "", "ftp://example.com/x"); err == nil {
		t.Fatal("ftp subscription must be rejected")
	}
	if _, err := resolveSubscription(ctx, "", ""); err == nil {
		t.Fatal("empty input must be rejected")
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("User-Agent") == "" {
			t.Error("missing User-Agent")
		}
		_, _ = io.WriteString(w, subBody)
	}))
	defer srv.Close()
	got, err = resolveSubscription(ctx, "", srv.URL)
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	// The resolver returns the raw subscription body; decoding to URIs is ParseInput's job.
	if got != subBody {
		t.Fatalf("unexpected body: %q", got)
	}

	bad := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer bad.Close()
	if _, err := resolveSubscription(ctx, "", bad.URL); err == nil {
		t.Fatal("non-2xx subscription must error")
	}
}
