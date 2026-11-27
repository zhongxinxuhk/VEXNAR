// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package vulnclass

import "testing"

func TestCatalogIsWellFormed(t *testing.T) {
	all := All()
	if len(all) < 8 {
		t.Fatalf("类目数 = %d，P0 至少覆盖 8 类", len(all))
	}
	seen := map[string]bool{}
	for _, c := range all {
		if c.Key == "" || c.Name == "" {
			t.Errorf("类目缺 key/name: %+v", c)
		}
		if seen[c.Key] {
			t.Errorf("重复类目 key: %s", c.Key)
		}
		seen[c.Key] = true
		if len(c.AppliesTo) == 0 {
			t.Errorf("%s 没有适用资产类型", c.Key)
		}
		if len(c.Probe) == 0 || len(c.Oracles) == 0 {
			t.Errorf("%s 缺探测步骤或成功判据", c.Key)
		}
		if c.Stop == "" {
			t.Errorf("%s 缺终止条件（会导致 planner 无限重派）", c.Key)
		}
	}
}

func TestNormalize(t *testing.T) {
	cases := []struct {
		in   string
		want string
		ok   bool
	}{
		{"SQLi", "sqli", true},
		{"sql 注入", "sqli", true},
		{"  XSS ", "xss", true},
		{"越权", "idor", true},
		{"IDOR", "idor", true},
		{"SSTI", "ssti", true},
		{"服务端请求伪造", "ssrf", true},
		{"文件上传", "upload", true},
		{"JWT", "jwt", true},
		{"XXE", "xxe", true},
		{"business-logic", "business-logic", false}, // 自定义类目原样保留
		{"", "", false},
	}
	for _, c := range cases {
		got, ok := Normalize(c.in)
		if got != c.want || ok != c.ok {
			t.Errorf("Normalize(%q) = (%q,%v)，期望 (%q,%v)", c.in, got, ok, c.want, c.ok)
		}
	}
}

func TestForAssetType(t *testing.T) {
	all := ForAssetType("")
	if len(all) != len(All()) {
		t.Fatalf("空类型应返回全部")
	}
	for _, c := range ForAssetType("endpoint") {
		ok := false
		for _, a := range c.AppliesTo {
			if a == "endpoint" {
				ok = true
			}
		}
		if !ok {
			t.Errorf("%s 不适用 endpoint 却被返回", c.Key)
		}
	}
	if got := ForAssetType("unknown-type"); len(got) != 0 {
		t.Errorf("未知类型应返回空，得到 %d", len(got))
	}
}
