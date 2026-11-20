// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package db

import "testing"

// 独立验证（purpose=verify）复现成功才把 pending 提升为 confirmed；
// inconclusive 保持原状；人工复测（purpose=retest）不受此规则影响。
func TestFindingVerificationGatesConfirmation(t *testing.T) {
	d, fid := retestDB(t)

	run := func(purpose, verdict string) *DBFinding {
		t.Helper()
		var (
			r  *FindingRetest
			c  *Conversation
			ok bool
			e  error
		)
		if purpose == RetestPurposeVerify {
			r, c, ok, e = d.CreateFindingVerification(t.Context(), fid, "auto")
		} else {
			r, c, ok, e = d.CreateFindingRetest(t.Context(), fid, "manual")
		}
		if e != nil || !ok {
			t.Fatalf("create %s: %v (created=%v)", purpose, e, ok)
		}
		if r.Purpose != purpose {
			t.Fatalf("purpose = %q，期望 %q", r.Purpose, purpose)
		}
		if _, err := d.StartFindingRetest(t.Context(), r.ID); err != nil {
			t.Fatalf("start: %v", err)
		}
		if err := d.RecordFindingRetestResult(t.Context(), c.ID, verdict, "结论", "本次实测证据"); err != nil {
			t.Fatalf("record: %v", err)
		}
		if err := d.FinishFindingRetest(r.ID, "completed", ""); err != nil {
			t.Fatalf("finish: %v", err)
		}
		f, err := d.GetFinding(fid)
		if err != nil || f == nil {
			t.Fatalf("reload finding: %v", err)
		}
		return f
	}

	// 先人工复测 reproduced：不改变待处理状态。
	if f := run(RetestPurposeRetest, "reproduced"); f.Status != FindingPending {
		t.Fatalf("人工复测 reproduced 后 status = %q，期望保持 %q", f.Status, FindingPending)
	}
	if f := run(RetestPurposeVerify, "inconclusive"); f.Status != FindingPending {
		t.Fatalf("验证 inconclusive 后 status = %q，期望保持 %q", f.Status, FindingPending)
	}
	if f := run(RetestPurposeVerify, "reproduced"); f.Status != FindingConfirmed {
		t.Fatalf("验证 reproduced 后 status = %q，期望 %q", f.Status, FindingConfirmed)
	}
}

// 独立验证确认误报时，待处理漏洞应被标记为误报（人工分诊权之外的另一条
// 可审计路径）；人工复测给同一结论不自动改状态。
func TestFindingVerificationMarksFalsePositive(t *testing.T) {
	d, fid := retestDB(t)
	r, c, _, err := d.CreateFindingVerification(t.Context(), fid, "auto")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := d.StartFindingRetest(t.Context(), r.ID); err != nil {
		t.Fatal(err)
	}
	if err := d.RecordFindingRetestResult(t.Context(), c.ID, "false_positive", "确认误报", "实际响应已被转义，无脚本执行"); err != nil {
		t.Fatal(err)
	}
	if err := d.FinishFindingRetest(r.ID, "completed", ""); err != nil {
		t.Fatal(err)
	}
	f, err := d.GetFinding(fid)
	if err != nil || f == nil {
		t.Fatalf("reload finding: %v", err)
	}
	if f.Status != FindingFalsePositive {
		t.Fatalf("status = %q，期望 %q", f.Status, FindingFalsePositive)
	}
}
