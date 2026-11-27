// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package traffic

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/zhongxinxuhk/vexnar/db"
	"golang.org/x/net/http/httpguts"
)

const yakitIDPrefix = "yakit-"

// ErrInvalidHAR identifies a malformed or unsupported archive envelope.
var ErrInvalidHAR = errors.New("无效 HAR")

// ExchangeSource returns the provenance encoded in a persisted exchange ID.
func ExchangeSource(id string) string {
	if strings.HasPrefix(id, yakitIDPrefix) {
		return "yakit"
	}
	return "vexnar"
}

type HARImportResult struct {
	Imported   int              `json:"imported"`
	Duplicates int              `json:"duplicates"`
	Errors     []HARImportError `json:"errors"`
}

type HARImportError struct {
	Entry int    `json:"entry"`
	Error string `json:"error"`
}

type harHeader struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type harEntry struct {
	Started time.Time `json:"startedDateTime"`
	Request struct {
		Method  string      `json:"method"`
		URL     string      `json:"url"`
		Version string      `json:"httpVersion"`
		Headers []harHeader `json:"headers"`
		Post    struct {
			Text string `json:"text"`
			MIME string `json:"mimeType"`
		} `json:"postData"`
	} `json:"request"`
	Response struct {
		Status  int         `json:"status"`
		Version string      `json:"httpVersion"`
		Headers []harHeader `json:"headers"`
		Content struct {
			Text     string `json:"text"`
			MIME     string `json:"mimeType"`
			Encoding string `json:"encoding"`
		} `json:"content"`
	} `json:"response"`
	Metadata struct {
		ID        uint64    `json:"id"`
		UpdatedAt time.Time `json:"updated_at"`
	} `json:"metaData"`
}

// ImportYakitHAR reads a Yakit History export. Each valid entry commits
// independently so interrupted uploads can be retried without duplicate rows.
func (t *Traffic) ImportYakitHAR(ctx context.Context, data []byte) (HARImportResult, error) {
	var document struct {
		Log struct {
			Entries []json.RawMessage `json:"entries"`
		} `json:"log"`
	}
	result := HARImportResult{Errors: []HARImportError{}}
	if err := json.Unmarshal(data, &document); err != nil || len(document.Log.Entries) == 0 {
		return result, fmt.Errorf("%w: 需要非空的 log.entries", ErrInvalidHAR)
	}
	if len(document.Log.Entries) > 2000 {
		return result, fmt.Errorf("%w: 每份最多导入 2000 条记录", ErrInvalidHAR)
	}
	for i, raw := range document.Log.Entries {
		if err := ctx.Err(); err != nil {
			return result, err
		}
		record, err := decodeHAREntry(raw)
		if err != nil {
			result.Errors = append(result.Errors, HARImportError{Entry: i + 1, Error: err.Error()})
			continue
		}
		duplicate, err := t.insertHARExchange(record)
		if err != nil {
			return result, err
		}
		if duplicate {
			result.Duplicates++
		} else {
			result.Imported++
		}
	}
	return result, nil
}

func (t *Traffic) insertHARExchange(record exchangeRecord) (bool, error) {
	t.wmu.Lock()
	defer t.wmu.Unlock()
	var exists int
	err := t.db.QueryRow("SELECT 1 FROM exchanges WHERE id=?", record.ID).Scan(&exists)
	if err == nil {
		return true, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return false, err
	}
	return false, t.persistExchange(record)
}

func decodeHAREntry(raw json.RawMessage) (exchangeRecord, error) {
	var entry harEntry
	if err := json.Unmarshal(raw, &entry); err != nil {
		return exchangeRecord{}, errors.New("记录字段格式无效")
	}
	u, err := httpAssetURL(entry.Request.URL)
	if err != nil {
		return exchangeRecord{}, err
	}
	method := entry.Request.Method
	if !httpguts.ValidHeaderFieldName(method) || len(method) > 64 {
		return exchangeRecord{}, errors.New("缺少有效的 HTTP 方法，请在 Yakit 导出时选中 Method")
	}
	status := entry.Response.Status
	if status != 0 && (status < 100 || status > 599) {
		return exchangeRecord{}, errors.New("HTTP 状态码无效")
	}

	respBody := []byte(entry.Response.Content.Text)
	switch entry.Response.Content.Encoding {
	case "":
	case "base64":
		respBody, err = base64.StdEncoding.DecodeString(entry.Response.Content.Text)
		if err != nil {
			return exchangeRecord{}, errors.New("响应正文的 base64 无效")
		}
	default:
		return exchangeRecord{}, errors.New("响应正文编码不受支持")
	}
	reqHeaders := harHeaders(entry.Request.Headers, entry.Request.Post.MIME)
	if reqHeaders.Get("Host") == "" {
		reqHeaders.Set("Host", u.Host)
	}
	respHeaders := harHeaders(entry.Response.Headers, entry.Response.Content.MIME)
	responseHead := ""
	if status > 0 {
		responseHead = fmt.Sprintf("%s %d %s\n", harProtocol(entry.Response.Version), status, http.StatusText(status))
	}
	captured := entry.Started
	if captured.IsZero() {
		captured = entry.Metadata.UpdatedAt
	}
	if captured.IsZero() {
		captured = time.Now()
	}
	identity, err := json.Marshal(entry)
	if err != nil {
		return exchangeRecord{}, errors.New("记录时间格式无效")
	}
	return exchangeRecord{
		ExchangeMeta: ExchangeMeta{
			ID: fmt.Sprintf("%s%x", yakitIDPrefix, sha256.Sum256(identity)), TS: captured.Unix(),
			Host: u.Hostname(), Method: method, URL: u.String(), URLTemplate: db.TemplatePath(u.EscapedPath()),
			Status: status, ContentType: respHeaders.Get("Content-Type"),
		},
		requestHead:  fmt.Sprintf("%s %s %s\n%s", method, u.RequestURI(), harProtocol(entry.Request.Version), headerLines(reqHeaders)),
		responseHead: responseHead + headerLines(respHeaders),
		requestBody:  []byte(entry.Request.Post.Text), responseBody: respBody,
		requestContentType: reqHeaders.Get("Content-Type"),
	}, nil
}

func harHeaders(headers []harHeader, mime string) http.Header {
	result := make(http.Header)
	for _, h := range headers {
		if httpguts.ValidHeaderFieldName(h.Name) && httpguts.ValidHeaderFieldValue(h.Value) {
			result.Add(h.Name, h.Value)
		}
	}
	if result.Get("Content-Type") == "" && mime != "" && httpguts.ValidHeaderFieldValue(mime) {
		result.Set("Content-Type", mime)
	}
	return result
}

func harProtocol(version string) string {
	switch strings.ToUpper(version) {
	case "HTTP/1.0", "HTTP/1.1", "HTTP/2", "HTTP/2.0", "HTTP/3", "HTTP/3.0":
		return strings.ToUpper(version)
	default:
		return "HTTP/1.1"
	}
}

func httpAssetURL(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || u.User != nil {
		return nil, errors.New("需要有效的 HTTP(S) URL，请在 Yakit 导出时选中 URL")
	}
	if port := u.Port(); port != "" {
		p, err := strconv.Atoi(port)
		if err != nil || p <= 0 || p > 65535 {
			return nil, errors.New("URL 端口无效")
		}
	}
	return u, nil
}

// AssetURLs reads only the selected observation's URL and method. Query values,
// user information and fragments are excluded from asset identity.
func (t *Traffic) AssetURLs(id string) (service, endpoint, method string, err error) {
	var raw string
	if err := t.db.QueryRow("SELECT url,method FROM exchanges WHERE id=?", id).Scan(&raw, &method); err != nil {
		return "", "", "", err
	}
	u, err := httpAssetURL(raw)
	if err != nil {
		return "", "", "", err
	}
	u.RawQuery, u.Fragment, u.RawFragment = "", "", ""
	u.ForceQuery = false
	origin := &url.URL{Scheme: u.Scheme, Host: u.Host}
	if (u.Scheme == "http" && u.Port() == "80") || (u.Scheme == "https" && u.Port() == "443") {
		u.Host = strings.TrimSuffix(u.Host, ":"+u.Port())
		origin.Host = u.Host
	}
	return origin.String(), u.String(), method, nil
}
