// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package egress

import (
	"crypto/tls"
	"io"
	"log"
	"strings"
)

// logPrintf is a seam for tests that want to assert diagnostics.
var logPrintf = log.Printf

// insecureTLSConfig is used ONLY for health probes: a broken certificate on the
// probe endpoint must not be reported as "node down".
func insecureTLSConfig() *tls.Config { return &tls.Config{InsecureSkipVerify: true} }

// ioCopyDiscard drains a small probe body so the connection can be reused/closed
// cleanly by the transport.
func ioCopyDiscard(r io.Reader) (int64, error) { return io.Copy(io.Discard, io.LimitReader(r, 64<<10)) }

func readLimited(r io.Reader, n int64) ([]byte, error) { return io.ReadAll(io.LimitReader(r, n)) }

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return strings.ToValidUTF8(s[:n], "") + "…"
}
