// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"bytes"
	"encoding/json"
	"regexp"
	"strings"
	"time"

	"github.com/zhongxinxuhk/vexnar/db"
)

const traceMask = "[REDACTED]"

var (
	traceKeyNormalizer    = strings.NewReplacer("_", "", "-", "", ".", "")
	traceCredentialKey    = regexp.MustCompile(`(?i)(?:apikey|token|password|passwd|clientsecret|privatekey|secretaccesskey|authorization|cookie)$`)
	traceCredentialText   = regexp.MustCompile(`(?i)(\b[\w.-]*(?:api[_-]?key|token|password|passwd|client[_-]?secret|private[_-]?key|authorization|cookie)\b["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\r\n,;}]+)`)
	traceCredentialScheme = regexp.MustCompile(`(?i)(\b(?:Bearer|Basic)[ \t]+)[A-Za-z0-9._~+/=-]+`)
	traceKnownToken       = regexp.MustCompile(`\b(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})`)
	traceURLPassword      = regexp.MustCompile(`(?i)(\b[a-z][a-z0-9+.-]*://[^/@\s:]+:)[^/@\s]+(@)`)
	tracePrivateKey       = regexp.MustCompile(`(?s)-----BEGIN [^-\r\n]*PRIVATE KEY-----.*?-----END [^-\r\n]*PRIVATE KEY-----`)
)

func redactTraceText(value string) string {
	value = tracePrivateKey.ReplaceAllString(value, traceMask)
	value = traceKnownToken.ReplaceAllString(value, traceMask)
	value = traceURLPassword.ReplaceAllString(value, "${1}"+traceMask+"${2}")
	value = traceCredentialScheme.ReplaceAllString(value, "${1}"+traceMask)
	return traceCredentialText.ReplaceAllString(value, "${1}"+traceMask)
}

func redactTrace(value string) string {
	data := []byte(value)
	if !json.Valid(data) {
		return redactTraceText(value)
	}
	var parsed any
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if err := decoder.Decode(&parsed); err != nil {
		return redactTraceText(value)
	}
	redacted, changed := redactTraceJSON(parsed)
	if !changed {
		return value
	}
	encoded, err := json.Marshal(redacted)
	if err != nil {
		return traceMask
	}
	return string(encoded)
}

func redactTraceJSON(value any) (any, bool) {
	changed := false
	switch v := value.(type) {
	case map[string]any:
		for key, field := range v {
			normalized := traceKeyNormalizer.Replace(key)
			if traceCredentialKey.MatchString(normalized) {
				v[key], changed = traceMask, true
			} else if redacted, modified := redactTraceJSON(field); modified {
				v[key], changed = redacted, true
			}
		}
	case []any:
		for i, field := range v {
			if redacted, modified := redactTraceJSON(field); modified {
				v[i], changed = redacted, true
			}
		}
	case string:
		redacted := redactTraceText(v)
		return redacted, v != redacted
	}
	return value, changed
}

type traceCallMetadata struct {
	Seq    int64  `json:"seq"`
	Tool   string `json:"tool"`
	Worker string `json:"worker"`
	TS     string `json:"ts"`
}

func relatedToolCall(events []db.Activity, resultID int64) (*traceCallMetadata, string) {
	pending := map[string][]db.Activity{}
	openCount := 0
	for _, event := range events {
		if event.Kind == "tool_use" {
			pending[event.Worker] = append(pending[event.Worker], event)
			openCount++
			continue
		}

		worker := event.Worker
		candidates := pending[worker]
		if worker == "" {
			if openCount > 1 {
				if event.ID == resultID {
					return nil, "ambiguous"
				}
				continue
			}
			for key, rows := range pending {
				if len(rows) > 0 {
					worker, candidates = key, rows
					break
				}
			}
		} else if len(candidates) == 0 {
			worker, candidates = "", pending[""]
		}
		if len(candidates) != 1 {
			if event.ID == resultID && len(candidates) > 1 {
				return nil, "ambiguous"
			}
			continue
		}
		call := candidates[0]
		if event.ID == resultID {
			return &traceCallMetadata{Seq: call.ID, Tool: call.Tool, Worker: call.Worker, TS: call.CreatedAt.Format(time.RFC3339Nano)}, "linked"
		}
		delete(pending, worker)
		openCount--
	}
	return nil, "unmatched"
}
