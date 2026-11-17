package capability

import "testing"

func TestCatalogWellFormed(t *testing.T) {
	all := All()
	if len(all) < 7 {
		t.Fatalf("能力种类 = %d，文档约定至少 7 类", len(all))
	}
	seen := map[string]bool{}
	for _, k := range all {
		if k.Key == "" || k.Name == "" {
			t.Fatalf("能力缺少 key/name: %+v", k)
		}
		if seen[k.Key] {
			t.Fatalf("能力 key 重复: %s", k.Key)
		}
		seen[k.Key] = true
		for _, p := range k.Prereq {
			if _, ok := ByKey(p); !ok {
				t.Fatalf("%s 的前置 %s 不在目录里", k.Key, p)
			}
		}
	}
	if len(Keys()) != len(all) {
		t.Fatal("Keys 与 All 数量不一致")
	}
}

func TestDeriveFromVulnclass(t *testing.T) {
	cases := map[string]string{
		"sqli":   "db_read",
		"SSRF":   "net_reachable",
		"ssti":   "cmd_exec",
		"xxe":    "file_read",
		"upload": "file_write",
		"jwt":    "token_valid",
		"未知类目":   "",
	}
	for in, want := range cases {
		got := Derive(in)
		if want == "" {
			if len(got) != 0 {
				t.Fatalf("%q 不应推导出能力，得到 %+v", in, got)
			}
			continue
		}
		if len(got) != 1 || got[0].Kind != want {
			t.Fatalf("%q 推导 = %+v，期望 %s", in, got, want)
		}
		if got[0].Confidence <= 0 || got[0].Confidence > 1 || got[0].Rule == "" || got[0].Rationale == "" {
			t.Fatalf("%q 的推导规则不完整: %+v", in, got[0])
		}
	}
}

func TestGaps(t *testing.T) {
	gaps := Gaps([]string{"net_reachable"})
	byKind := map[string]Gap{}
	for _, g := range gaps {
		byKind[g.Kind] = g
	}
	if _, ok := byKind["net_reachable"]; ok {
		t.Fatal("已持有能力不应出现在缺口里")
	}
	if g := byKind["weblogin"]; len(g.Missing) != 0 {
		t.Fatalf("net_reachable 已具备时 weblogin 不应缺前置，得到 %+v", g.Missing)
	}
	if g := byKind["admin_panel"]; len(g.Missing) != 1 || g.Missing[0] != "weblogin" {
		t.Fatalf("admin_panel 缺口 = %+v，期望缺 weblogin", g.Missing)
	}
}

func TestNormalizeKind(t *testing.T) {
	if NormalizeKind("  NET_Reachable ") != "net_reachable" {
		t.Fatal("NormalizeKind 未统一大小写")
	}
}
