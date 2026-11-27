// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"testing"
	"time"
)

func TestNextFireAtDaily(t *testing.T) {
	now := time.Date(2026, 11, 20, 18, 30, 0, 0, time.Local)
	got := time.Unix(nextFireAt("daily", "09:00", now), 0)
	want := time.Date(2026, 11, 21, 9, 0, 0, 0, time.Local)
	if !got.Equal(want) {
		t.Fatalf("daily next = %v, want %v", got, want)
	}
	// 当天时刻未到 → 今天
	now2 := time.Date(2026, 11, 20, 7, 0, 0, 0, time.Local)
	got2 := time.Unix(nextFireAt("daily", "09:00", now2), 0)
	want2 := time.Date(2026, 11, 20, 9, 0, 0, 0, time.Local)
	if !got2.Equal(want2) {
		t.Fatalf("daily same-day next = %v, want %v", got2, want2)
	}
}

func TestNextFireAtWeeklyMonthly(t *testing.T) {
	now := time.Date(2026, 11, 20, 10, 0, 0, 0, time.Local)
	weekly := time.Unix(nextFireAt("weekly", "09:00", now), 0)
	if want := time.Date(2026, 11, 27, 9, 0, 0, 0, time.Local); !weekly.Equal(want) {
		t.Fatalf("weekly next = %v, want %v", weekly, want)
	}
	monthly := time.Unix(nextFireAt("monthly", "09:00", now), 0)
	if want := time.Date(2026, 12, 20, 9, 0, 0, 0, time.Local); !monthly.Equal(want) {
		t.Fatalf("monthly next = %v, want %v", monthly, want)
	}
}

func TestNextFireAtBadTimeOfDay(t *testing.T) {
	now := time.Date(2026, 11, 20, 10, 0, 0, 0, time.Local)
	got := time.Unix(nextFireAt("daily", "not-a-time", now), 0)
	want := time.Date(2026, 11, 21, 9, 0, 0, 0, time.Local) // 缺省 09:00，已过 → 明天
	if !got.Equal(want) {
		t.Fatalf("bad time_of_day next = %v, want %v", got, want)
	}
}
