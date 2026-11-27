// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"errors"
	"testing"

	"github.com/Autumn-27/norma/harness"
)

func TestIsLLMAuthError(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want bool
	}{
		{"nil", nil, false},
		{"anthropic 401", errors.New(`anthropic: status 401: {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}`), true},
		{"openai 403", errors.New("openai: status 403: forbidden"), true},
		{"generic 500", errors.New("openai: status 500: internal server error"), false},
		{"transport reset", errors.New("dial tcp: connection reset by peer"), false},
	}
	for _, c := range cases {
		if got := isLLMAuthError(c.err); got != c.want {
			t.Errorf("%s: isLLMAuthError = %v, want %v", c.name, got, c.want)
		}
	}
}

func TestShouldParkTaskAfterLLMFailure(t *testing.T) {
	auth := errors.New("anthropic: status 401: invalid x-api-key")
	transient := errors.New("openai: status 500: internal server error")
	cases := []struct {
		name        string
		reason      harness.TerminalReason
		err         error
		retriesUsed int
		maxRetries  int
		want        bool
	}{
		{"auth error is not replayed", harness.ReasonModelError, auth, 0, 2, true},
		{"transient after budget spent", harness.ReasonModelError, transient, 2, 2, true},
		{"transient with budget left", harness.ReasonModelError, transient, 1, 2, false},
		{"retries disabled", harness.ReasonModelError, transient, 0, 0, true},
		{"max turns is not an LLM outage", harness.ReasonMaxTurns, transient, 0, 2, false},
		{"timeout is not an LLM outage", harness.ReasonTimeout, transient, 0, 2, false},
		{"no error", harness.ReasonModelError, nil, 0, 2, false},
		{"chain exhausted keeps legacy semantics", harness.ReasonModelError,
			&taskLLMError{taskID: "1", chainExhausted: true, cause: transient}, 0, 2, false},
	}
	for _, c := range cases {
		if got := shouldParkTaskAfterLLMFailure(c.reason, c.err, c.retriesUsed, c.maxRetries); got != c.want {
			t.Errorf("%s: shouldParkTaskAfterLLMFailure = %v, want %v", c.name, got, c.want)
		}
	}
}
