// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package db

import (
	"testing"
)

// schema.sql upgrades rows a previous app version wrote for the NewAPI platform:
// the wire format becomes Responses and the legacy "default" name becomes
// "newapi", so the web LLM page and the desktop app label the same row the same
// way. Startup re-executes schema.sql, so re-opening the database is exactly the
// upgrade path a user hits after installing the new build.
func TestSchemaUpgradesLegacyManagedProfile(t *testing.T) {
	first, err := Open(testDSN(t))
	if err != nil {
		t.Skipf("postgres unavailable (%v) — skipping", err)
	}

	// Start from an empty profile table: tests share one database.
	existing, _ := first.ListProfiles()
	for _, p := range existing {
		if p.IsDefault {
			_, _ = first.Exec(`UPDATE llm_profiles SET is_default=false WHERE id=$1`, p.ID)
		}
		_ = first.DeleteProfile(p.ID)
	}

	legacy := &LLMProfile{
		Name: "default", Format: "openai", Model: "gpt-5-codex",
		BaseURL: "https://api.sec.hn.cn/v1", APIKey: "sk-legacy", Streaming: true,
	}
	id, err := first.SaveProfile(legacy)
	if err != nil {
		first.Close()
		t.Fatal(err)
	}
	// A previous build could also persist a full endpoint URL; the same migration
	// must reduce it to the API root the provider expects.
	fullID, err := first.SaveProfile(&LLMProfile{
		Name: "full-url", Format: "openai", Model: "gpt-5-mini",
		BaseURL: "https://api.sec.hn.cn/v1/chat/completions", APIKey: "sk-full", Streaming: true,
	})
	if err != nil {
		first.Close()
		t.Fatal(err)
	}
	if err := first.SetActiveProfile(id); err != nil {
		first.Close()
		t.Fatal(err)
	}
	if err := first.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	upgraded, err := Open(testDSN(t))
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer upgraded.Close()
	t.Cleanup(func() {
		_, _ = upgraded.Exec(`UPDATE llm_profiles SET is_default=false WHERE id=$1`, id)
		_ = upgraded.DeleteProfile(id)
	})

	active, err := upgraded.ActiveProfile()
	if err != nil || active == nil {
		t.Fatalf("active profile: %v", err)
	}
	if active.Format != "openai-responses" {
		t.Fatalf("format=%q, want openai-responses", active.Format)
	}
	if active.Name != "newapi" {
		t.Fatalf("name=%q, want newapi so app and web show the same managed row", active.Name)
	}
	if active.BaseURL != "https://api.sec.hn.cn/v1" {
		t.Fatalf("base_url=%q, want the API root untouched", active.BaseURL)
	}
	full, err := upgraded.ProfileByID(fullID)
	if err != nil || full == nil {
		t.Fatalf("full-url profile: %v", err)
	}
	if full.BaseURL != "https://api.sec.hn.cn/v1" {
		t.Fatalf("stored full endpoint was not reduced: %q", full.BaseURL)
	}
	t.Cleanup(func() { _ = upgraded.DeleteProfile(fullID) })
}
