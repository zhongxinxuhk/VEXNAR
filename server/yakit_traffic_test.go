// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestYakitHARImportAndRegisterAssets(t *testing.T) {
	s, _, request := trafficEvidenceServer(t)
	s.m.mu.Lock()
	s.m.trafficOn = false
	s.m.mu.Unlock()
	host := fmt.Sprintf("yak-qa-%d.example", time.Now().UnixNano())
	t.Cleanup(func() {
		_, _ = s.m.pg.Exec("DELETE FROM assets WHERE domain=$1 OR root_domain=$1", host)
	})
	har := fmt.Sprintf(`{"log":{"creator":{"name":"Yakit"},"entries":[
		{"request":{"method":"POST","url":"https://%s:443/orders?label=private-value","httpVersion":"HTTP/2",
		  "postData":{"mimeType":"application/json","text":"{\"sku\":\"qa\"}"}},
		 "response":{"status":201,"content":{"mimeType":"text/plain","encoding":"base64","text":"c2F2ZWQ="}},
		 "metaData":{"id":385,"updated_at":"2026-11-21T01:02:03+08:00"}},
		{"request":{"method":"GET","url":"file:///not-http"}}]}}`, host)
	path := "/api/traffic/import/yakit"
	unauth := httptest.NewRecorder()
	s.Handler().ServeHTTP(unauth, httptest.NewRequest("POST", path, strings.NewReader(har)))
	if unauth.Code != 401 {
		t.Fatalf("unauthenticated import: %d", unauth.Code)
	}
	requestJSON := func(method, path, body string) map[string]any {
		t.Helper()
		w := request(method, path, body)
		if w.Code != 200 {
			t.Fatalf("%s %s: %d %s", method, path, w.Code, w.Body)
		}
		var decoded map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &decoded); err != nil {
			t.Fatal(err)
		}
		return decoded
	}
	first := requestJSON("POST", path, har)
	if first["imported"] != float64(1) || len(first["errors"].([]any)) != 1 {
		t.Fatalf("first import: %#v", first)
	}
	retry := requestJSON("POST", path, har)
	if retry["imported"] != float64(0) || retry["duplicates"] != float64(1) {
		t.Fatalf("retry: %#v", retry)
	}
	list := requestJSON("GET", "/api/traffic?page=0&size=50&source=yakit&method=POST", "")
	rows := list["exchanges"].([]any)
	if len(rows) != 1 || list["total"] != float64(1) || list["storage_available"] != true || list["enabled"] != false {
		t.Fatalf("traffic list: %#v", list)
	}
	row := rows[0].(map[string]any)
	when, err := time.Parse(time.RFC3339, row["ts"].(string))
	expected := time.Date(2026, 11, 20, 17, 2, 3, 0, time.UTC)
	if row["source"] != "yakit" || err != nil || !when.Equal(expected) {
		t.Fatalf("traffic provenance or timestamp: %#v", row)
	}
	native := requestJSON("GET", "/api/traffic?source=vexnar", "")
	if native["total"] != float64(0) {
		t.Fatalf("native filter includes Yakit entry: %#v", native)
	}
	id := row["id"].(string)
	detail := requestJSON("GET", "/api/traffic/exchange?id="+id, "")
	if !strings.Contains(detail["req"].(string), `{"sku":"qa"}`) || !strings.Contains(detail["resp"].(string), "saved") {
		t.Fatalf("request or response missing: %#v", detail)
	}
	payload := fmt.Sprintf(`{"id":%q}`, id)
	service := requestJSON("POST", "/api/traffic/promote", payload)
	repeat := requestJSON("POST", "/api/traffic/promote", payload)
	if service["service_id"] != repeat["service_id"] || service["endpoint_id"] != repeat["endpoint_id"] {
		t.Fatalf("registration did not reuse assets: %#v vs %#v", service, repeat)
	}
	assets, err := s.m.pg.Assets().GetByIDs([]int64{int64(service["service_id"].(float64)), int64(service["endpoint_id"].(float64))})
	if err != nil || len(assets) != 2 {
		t.Fatalf("registered assets: %v %v", assets, err)
	}
	for _, asset := range assets {
		switch asset.Type {
		case "service":
			if asset.URL != "https://"+host {
				t.Fatal(asset.URL)
			}
		case "endpoint":
			if asset.URL != "https://"+host+"/orders" || asset.Method != "POST" {
				t.Fatalf("endpoint: %#v", asset)
			}
		default:
			t.Fatal(asset.Type)
		}
	}
}
