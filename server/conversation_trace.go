// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"bytes"
	"encoding/json"
	"regexp"
	"strings"
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
