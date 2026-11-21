// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/zhongxinxuhk/vexnar/egress"
)

const maxEgressBodyBytes = 4 << 20 // pasting a large subscription must still fit

// egressOrErr resolves the pool runtime or writes a 503.
func (s *Server) egressOrErr(w http.ResponseWriter) *egress.Manager {
	mgr := s.m.Egress()
	if mgr == nil {
		writeErr(w, http.StatusServiceUnavailable, "代理池未启用（egress 初始化失败，检查数据目录权限）")
		return nil
	}
	return mgr
}

func (s *Server) reloadEgress(w http.ResponseWriter, mgr *egress.Manager) bool {
	if err := mgr.Reload(context.Background()); err != nil {
		writeErr(w, http.StatusInternalServerError, "重载代理池失败: "+err.Error())
		return false
	}
	return true
}

// GET /api/proxy/state
func (s *Server) egressState(w http.ResponseWriter, r *http.Request) {
	mgr := s.egressOrErr(w)
	if mgr == nil {
		return
	}
	st, err := mgr.State(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	st.DefaultPool = s.m.EgressPoolID()
	writeJSON(w, http.StatusOK, struct {
		egress.State
		Recordings int    `json:"recordings"`
		Socks      string `json:"socks"`
	}{st, s.m.RecordingCount(), mgr.SocksAddr()})
}

// GET/POST /api/proxy/pools
func (s *Server) egressPools(w http.ResponseWriter, r *http.Request) {
	mgr := s.egressOrErr(w)
	if mgr == nil {
		return
	}
	if r.Method == http.MethodGet {
		pools, err := mgr.Store().Pools(r.Context())
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, pools)
		return
	}
	var req egress.Pool
	if err := decodeLimited(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeErr(w, http.StatusBadRequest, "池名称不能为空")
		return
	}
	id, err := mgr.Store().CreatePool(r.Context(), req)
	if err != nil {
		writeErr(w, http.StatusConflict, "创建池失败（名称可能重复）: "+err.Error())
		return
	}
	s.reloadEgress(w, mgr)
	req.ID = id
	writeJSON(w, http.StatusOK, req)
}

// PATCH/DELETE /api/proxy/pools/{id}
func (s *Server) egressPoolByID(w http.ResponseWriter, r *http.Request) {
	mgr := s.egressOrErr(w)
	if mgr == nil {
		return
	}
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "池 ID 无效")
		return
	}
	pool, err := mgr.Store().Pool(r.Context(), id)
	if err != nil || pool == nil {
		writeErr(w, http.StatusNotFound, "池不存在")
		return
	}
	switch r.Method {
	case http.MethodDelete:
		bindings, _ := mgr.Store().Bindings(r.Context())
		for _, b := range bindings {
			if b.PoolID == id {
				writeErr(w, http.StatusConflict, "该池仍被任务绑定，先解除绑定再删除")
				return
			}
		}
		if s.m.EgressPoolID() == id {
			if err := s.m.SetProxyDefaultPool(0); err != nil {
				writeErr(w, http.StatusInternalServerError, err.Error())
				return
			}
		}
		if err := mgr.Store().DeletePool(r.Context(), id); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		s.reloadEgress(w, mgr)
		writeJSON(w, http.StatusOK, map[string]any{"deleted": id})
	case http.MethodPatch:
		var req egress.Pool
		if err := decodeLimited(r, &req); err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		req.ID = id
		if strings.TrimSpace(req.Name) == "" {
			req.Name = pool.Name
		}
		// Omitted numeric fields keep their stored value.
		if req.Strategy == "" {
			req.Strategy = pool.Strategy
		}
		if req.ModeDefault == "" {
			req.ModeDefault = pool.ModeDefault
		}
		if req.Fallback == "" {
			req.Fallback = pool.Fallback
		}
		if req.FanoutK == 0 {
			req.FanoutK = pool.FanoutK
		}
		if req.MaxConns == 0 {
			req.MaxConns = pool.MaxConns
		}
		if req.HealthURL == "" {
			req.HealthURL = pool.HealthURL
		}
		if req.IPProbeURL == "" {
			req.IPProbeURL = pool.IPProbeURL
		}
		if req.CheckSeconds == 0 {
			req.CheckSeconds = pool.CheckSeconds
		}
		if req.StickyTTL == 0 {
			req.StickyTTL = pool.StickyTTL
		}
		if req.Note == "" {
			req.Note = pool.Note
		}
		if err := mgr.Store().UpdatePool(r.Context(), req); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		s.reloadEgress(w, mgr)
		writeJSON(w, http.StatusOK, req)
	default:
		writeErr(w, http.StatusMethodNotAllowed, "不支持的方法")
	}
}

// GET/POST /api/proxy/pools/{id}/nodes
func (s *Server) egressPoolNodes(w http.ResponseWriter, r *http.Request) {
	mgr := s.egressOrErr(w)
	if mgr == nil {
		return
	}
	poolID, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "池 ID 无效")
		return
	}
	st, err := mgr.State(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	switch r.Method {
	case http.MethodGet:
		var members []int64
		for _, p := range st.Pools {
			if p.ID == poolID {
				members = p.Members
			}
		}
		out := make([]egress.NodeView, 0, len(members))
		for _, n := range st.Nodes {
			for _, id := range members {
				if n.ID == id {
					out = append(out, n)
				}
			}
		}
		writeJSON(w, http.StatusOK, out)
	case http.MethodPost:
		var req struct {
			NodeIDs []int64 `json:"node_ids"`
		}
		if err := decodeLimited(r, &req); err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		existing, err := mgr.Store().PoolNodes(r.Context(), poolID)
		if err != nil {
			writeErr(w, http.StatusNotFound, "池不存在")
			return
		}
		seen := map[int64]bool{}
		merged := make([]int64, 0, len(existing)+len(req.NodeIDs))
		for _, id := range existing {
			if !seen[id] {
				merged = append(merged, id)
				seen[id] = true
			}
		}
		for _, id := range req.NodeIDs {
			if !seen[id] {
				merged = append(merged, id)
				seen[id] = true
			}
		}
		if err := mgr.Store().SetPoolNodes(r.Context(), poolID, merged); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		s.reloadEgress(w, mgr)
		writeJSON(w, http.StatusOK, map[string]any{"pool_id": poolID, "node_ids": merged})
	default:
		writeErr(w, http.StatusMethodNotAllowed, "不支持的方法")
	}
}

// DELETE /api/proxy/pools/{id}/nodes/{nodeID}
func (s *Server) egressPoolNodeDelete(w http.ResponseWriter, r *http.Request) {
	mgr := s.egressOrErr(w)
	if mgr == nil {
		return
	}
	poolID, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "池 ID 无效")
		return
	}
	nodeID, ok := pathInt(r, "nodeID")
	if !ok {
		writeErr(w, http.StatusBadRequest, "节点 ID 无效")
		return
	}
	ids, err := mgr.Store().PoolNodes(r.Context(), poolID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "池不存在")
		return
	}
	kept := ids[:0]
	for _, id := range ids {
		if id != nodeID {
			kept = append(kept, id)
		}
	}
	if err := mgr.Store().SetPoolNodes(r.Context(), poolID, kept); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.reloadEgress(w, mgr)
	writeJSON(w, http.StatusOK, map[string]any{"pool_id": poolID, "node_ids": kept})
}

// GET/POST /api/proxy/nodes
func (s *Server) egressNodes(w http.ResponseWriter, r *http.Request) {
	mgr := s.egressOrErr(w)
	if mgr == nil {
		return
	}
	if r.Method == http.MethodGet {
		st, err := mgr.State(r.Context())
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, st.Nodes)
		return
	}
	var req egressNodeRequest
	if err := decodeLimited(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	node, err := req.toNode()
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	created, updated, err := mgr.Store().UpsertNodes(r.Context(), []egress.Node{node}, req.Tags)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.reloadEgress(w, mgr)
	writeJSON(w, http.StatusOK, map[string]any{"created": created, "updated": updated})
}

type egressNodeRequest struct {
	Name     string            `json:"name"`
	Protocol string            `json:"protocol"`
	Server   string            `json:"server"`
	Port     int               `json:"port"`
	Config   map[string]any    `json:"config"`
	Secrets  map[string]string `json:"secrets"`
	URI      string            `json:"uri"`
	Tags     []string          `json:"tags"`
	Weight   int               `json:"weight"`
	MaxConns int               `json:"max_conns"`
	Enabled  *bool             `json:"enabled"`
	Note     string            `json:"note"`
}

func (req egressNodeRequest) toNode() (egress.Node, error) {
	if strings.TrimSpace(req.URI) != "" {
		res := egress.ParseInput(req.URI)
		if len(res.Nodes) != 1 {
			return egress.Node{}, errors.New("URI 无法解析为单个节点")
		}
		return egress.Node{NodeConfig: res.Nodes[0], Tags: req.Tags, Enabled: true}, nil
	}
	cfg := egress.NodeConfig{
		Name: strings.TrimSpace(req.Name), Protocol: strings.ToLower(strings.TrimSpace(req.Protocol)),
		Server: strings.TrimSpace(req.Server), Port: req.Port, Config: req.Config, Secrets: req.Secrets,
	}
	if cfg.Name == "" {
		cfg.Name = cfg.Protocol + "-" + cfg.Server
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	return egress.Node{
		NodeConfig: cfg, Tags: req.Tags, Weight: req.Weight, MaxConns: req.MaxConns,
		Enabled: enabled, Note: req.Note,
	}, nil
}

// PATCH/DELETE /api/proxy/nodes/{id}
func (s *Server) egressNodeByID(w http.ResponseWriter, r *http.Request) {
	mgr := s.egressOrErr(w)
	if mgr == nil {
		return
	}
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "节点 ID 无效")
		return
	}
	node, err := mgr.Store().Node(r.Context(), id)
	if err != nil || node == nil {
		writeErr(w, http.StatusNotFound, "节点不存在")
		return
	}
	switch r.Method {
	case http.MethodDelete:
		if err := mgr.Store().DeleteNode(r.Context(), id); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		s.reloadEgress(w, mgr)
		writeJSON(w, http.StatusOK, map[string]any{"deleted": id})
	case http.MethodPatch:
		var req struct {
			Name     *string           `json:"name"`
			Tags     *[]string         `json:"tags"`
			Weight   *int              `json:"weight"`
			MaxConns *int              `json:"max_conns"`
			Enabled  *bool             `json:"enabled"`
			Note     *string           `json:"note"`
			Config   map[string]any    `json:"config"`
			Secrets  map[string]string `json:"secrets"`
		}
		if err := decodeLimited(r, &req); err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		if req.Name != nil && strings.TrimSpace(*req.Name) != "" {
			node.Name = strings.TrimSpace(*req.Name)
		}
		if req.Tags != nil {
			node.Tags = *req.Tags
		}
		if req.Weight != nil {
			node.Weight = *req.Weight
		}
		if req.MaxConns != nil {
			node.MaxConns = *req.MaxConns
		}
		if req.Enabled != nil {
			node.Enabled = *req.Enabled
		}
		if req.Note != nil {
			node.Note = *req.Note
		}
		if req.Config != nil {
			node.Config = req.Config
		}
		if req.Secrets != nil {
			node.Secrets = req.Secrets
		}
		if err := mgr.Store().UpdateNode(r.Context(), *node); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		s.reloadEgress(w, mgr)
		writeJSON(w, http.StatusOK, node)
	default:
		writeErr(w, http.StatusMethodNotAllowed, "不支持的方法")
	}
}

// POST /api/proxy/nodes/parse  (preview only)
func (s *Server) egressParse(w http.ResponseWriter, r *http.Request) {
	if s.egressOrErr(w) == nil {
		return
	}
	var req struct {
		Text string `json:"text"`
		URL  string `json:"url"`
	}
	if err := decodeLimited(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	text, err := resolveSubscription(r.Context(), req.Text, req.URL)
	if err != nil {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	res := egress.ParseInput(text)
	writeJSON(w, http.StatusOK, res)
}

// POST /api/proxy/nodes/import
func (s *Server) egressImport(w http.ResponseWriter, r *http.Request) {
	mgr := s.egressOrErr(w)
	if mgr == nil {
		return
	}
	var req struct {
		Text   string   `json:"text"`
		URL    string   `json:"url"`
		PoolID int64    `json:"pool_id"`
		Tags   []string `json:"tags"`
	}
	if err := decodeLimited(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	text, err := resolveSubscription(r.Context(), req.Text, req.URL)
	if err != nil {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	res := egress.ParseInput(text)
	if len(res.Nodes) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"error": "没有解析到可用节点", "issues": res.Issues,
		})
		return
	}
	nodes := make([]egress.Node, 0, len(res.Nodes))
	for _, n := range res.Nodes {
		nodes = append(nodes, egress.Node{NodeConfig: n, Tags: req.Tags, Enabled: true})
	}
	created, updated, err := mgr.Store().UpsertNodes(r.Context(), nodes, req.Tags)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	added := 0
	if req.PoolID > 0 {
		ids, err := mgr.Store().PoolNodes(r.Context(), req.PoolID)
		if err != nil {
			writeErr(w, http.StatusNotFound, "池不存在")
			return
		}
		all, err := mgr.Store().Nodes(r.Context())
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		seen := map[int64]bool{}
		for _, id := range ids {
			seen[id] = true
		}
		for _, n := range all {
			fp := n.Fingerprint()
			for _, parsed := range res.Nodes {
				if parsed.Fingerprint() == fp && !seen[n.ID] {
					ids = append(ids, n.ID)
					seen[n.ID] = true
					added++
				}
			}
		}
		if err := mgr.Store().SetPoolNodes(r.Context(), req.PoolID, ids); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	s.reloadEgress(w, mgr)
	writeJSON(w, http.StatusOK, map[string]any{
		"created": created, "updated": updated, "added_to_pool": added,
		"issues": res.Issues,
	})
}

// POST /api/proxy/nodes/{id}/check
func (s *Server) egressNodeCheck(w http.ResponseWriter, r *http.Request) {
	mgr := s.egressOrErr(w)
	if mgr == nil {
		return
	}
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "节点 ID 无效")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	h, err := mgr.CheckNode(ctx, id)
	if err != nil {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, h)
}

// POST /api/proxy/pools/{id}/check
func (s *Server) egressPoolCheck(w http.ResponseWriter, r *http.Request) {
	mgr := s.egressOrErr(w)
	if mgr == nil {
		return
	}
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "池 ID 无效")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 120*time.Second)
	defer cancel()
	writeJSON(w, http.StatusOK, mgr.CheckPool(ctx, id))
}

// POST /api/proxy/leases/reset
func (s *Server) egressResetLeases(w http.ResponseWriter, r *http.Request) {
	mgr := s.egressOrErr(w)
	if mgr == nil {
		return
	}
	var req struct {
		TaskID int64 `json:"task_id"`
	}
	_ = decodeLimited(r, &req)
	if req.TaskID > 0 {
		mgr.RevokeTask(req.TaskID)
	} else {
		for _, snap := range mgr.Sessions() {
			mgr.Revoke(snap.Session)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"reset": true, "task_id": req.TaskID})
}

// PUT /api/proxy/default-pool  {pool_id}
func (s *Server) egressDefaultPool(w http.ResponseWriter, r *http.Request) {
	mgr := s.egressOrErr(w)
	if mgr == nil {
		return
	}
	var req struct {
		PoolID int64 `json:"pool_id"`
	}
	if err := decodeLimited(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.PoolID > 0 {
		pool, err := mgr.Store().Pool(r.Context(), req.PoolID)
		if err != nil || pool == nil {
			writeErr(w, http.StatusNotFound, "池不存在")
			return
		}
	}
	if err := s.m.SetProxyDefaultPool(req.PoolID); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"pool_id": req.PoolID})
}

// GET/PUT/DELETE /api/tasks/{id}/proxy
func (s *Server) egressTaskBinding(w http.ResponseWriter, r *http.Request) {
	mgr := s.egressOrErr(w)
	if mgr == nil {
		return
	}
	taskID, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "任务 ID 无效")
		return
	}
	switch r.Method {
	case http.MethodGet:
		binding, err := mgr.Store().Binding(r.Context(), taskID)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		out := map[string]any{"task_id": taskID, "binding": binding}
		if binding != nil {
			if snap, ok := mgr.SessionSnapshot(taskSessionKey(taskID, "worker")); ok {
				out["worker_session"] = snap
			}
		}
		writeJSON(w, http.StatusOK, out)
	case http.MethodPut:
		var req egress.Binding
		if err := decodeLimited(r, &req); err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		if req.PoolID <= 0 {
			writeErr(w, http.StatusBadRequest, "pool_id 必须 >0")
			return
		}
		pool, err := mgr.Store().Pool(r.Context(), req.PoolID)
		if err != nil || pool == nil {
			writeErr(w, http.StatusNotFound, "池不存在")
			return
		}
		req.TaskID = taskID
		if err := mgr.Store().SetBinding(r.Context(), req); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		s.reloadEgress(w, mgr)
		writeJSON(w, http.StatusOK, req)
	case http.MethodDelete:
		mgr.RevokeTask(taskID)
		if err := mgr.Store().DeleteBinding(r.Context(), taskID); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		s.reloadEgress(w, mgr)
		writeJSON(w, http.StatusOK, map[string]any{"task_id": taskID, "binding": nil})
	default:
		writeErr(w, http.StatusMethodNotAllowed, "不支持的方法")
	}
}

// agentEgressProxy resolves the proxy URL + CA for one task/agent role.
//
// Capture OFF: a task bound to a pool (or the server default pool) gets its own
// session credential URL, so each role can hold an independent lease.
// Capture ON: the recording MITM is shared and cannot carry a per-session identity
// in its intercepted path (see docs §8.1), so the pool applies at the global
// upstream instead and tools keep pointing at the MITM.
func (s *Server) agentEgressProxy(taskID string, role string) (addr, ca string) {
	tid, err := strconv.ParseInt(taskID, 10, 64)
	if err != nil || tid <= 0 {
		return s.m.ProxyAddr(), s.m.ProxyCACert()
	}
	mgr := s.m.Egress()
	if mgr == nil {
		return s.m.ProxyAddr(), s.m.ProxyCACert()
	}
	poolID := int64(0)
	var mode egress.Mode
	var fallback egress.Fallback
	maxConns := 0
	if binding, err := mgr.Store().Binding(context.Background(), tid); err == nil && binding != nil {
		poolID = binding.PoolID
		mode = egress.Mode(binding.Mode)
		fallback = egress.Fallback(binding.Fallback)
		maxConns = binding.MaxConns
	} else if def := s.m.EgressPoolID(); def > 0 {
		poolID = def
	}
	if poolID == 0 {
		return s.m.ProxyAddr(), s.m.ProxyCACert()
	}
	key := taskSessionKey(tid, role)
	// Register the session first: the recording listener's upstream resolver looks
	// it up by key, so an unregistered session would fail closed on every request.
	if _, err := mgr.Endpoint(egress.SessionSpec{
		Key: key, TaskID: tid, Role: role,
		PoolID: poolID, Mode: mode, Fallback: fallback, MaxConns: maxConns,
	}); err != nil {
		return s.m.ProxyAddr(), s.m.ProxyCACert()
	}
	if s.m.TrafficEnabled() {
		// Capture on: per-session recording listener. Tools talk plain HTTP proxy to
		// it (no credential needed — the listener IS the session), while the node is
		// resolved at its upstream. Traffic rows carry scope/session.
		if addr, err := s.m.recordingAddr(tid, key); err == nil {
			return addr, s.m.ProxyCACert()
		}
		return s.m.ProxyAddr(), s.m.ProxyCACert()
	}
	ep, err := mgr.Endpoint(egress.SessionSpec{
		Key: key, TaskID: tid, Role: role,
		PoolID: poolID, Mode: mode, Fallback: fallback, MaxConns: maxConns,
	})
	if err != nil {
		return s.m.ProxyAddr(), s.m.ProxyCACert()
	}
	return ep.URL, ""
}

// revokeTaskEgress drops every egress session/lease of a deleted task.
func (s *Server) revokeTaskEgress(taskID int64) {
	mgr := s.m.Egress()
	if mgr == nil {
		return
	}
	mgr.RevokeTask(taskID)
	s.m.closeTaskRecordings(taskID)
	_ = mgr.Store().DeleteBinding(context.Background(), taskID)
}

// taskSessionKey is the canonical session key for one task role.
func taskSessionKey(taskID int64, role string) string {
	return "task:" + strconv.FormatInt(taskID, 10) + ":" + role
}

// decodeLimited decodes a JSON body with a size cap.
func decodeLimited(r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(nil, r.Body, maxEgressBodyBytes)
	return decode(r, v)
}

// resolveSubscription returns the pasted text, or fetches a subscription URL when
// no text was given. Only http(s) is accepted, the body is capped, and a non-2xx
// status is an error rather than an empty node list.
func resolveSubscription(ctx context.Context, text, rawURL string) (string, error) {
	if strings.TrimSpace(text) != "" {
		return text, nil
	}
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return "", errors.New("需要粘贴节点内容或填写订阅 URL")
	}
	if !strings.HasPrefix(rawURL, "http://") && !strings.HasPrefix(rawURL, "https://") {
		return "", errors.New("订阅 URL 只允许 http/https")
	}
	ctx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", fmt.Errorf("订阅 URL 无效: %w", err)
	}
	req.Header.Set("User-Agent", "vexnar/egress")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("拉取订阅失败: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("订阅返回 HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return "", fmt.Errorf("读取订阅失败: %w", err)
	}
	if strings.TrimSpace(string(body)) == "" {
		return "", errors.New("订阅内容为空")
	}
	return string(body), nil
}

// POST /api/proxy/nodes/batch  {ids, action, pool_id?, tags?}
func (s *Server) egressBatch(w http.ResponseWriter, r *http.Request) {
	mgr := s.egressOrErr(w)
	if mgr == nil {
		return
	}
	var req struct {
		IDs    []int64  `json:"ids"`
		Action string   `json:"action"`
		PoolID int64    `json:"pool_id"`
		Tags   []string `json:"tags"`
	}
	if err := decodeLimited(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(req.IDs) == 0 {
		writeErr(w, http.StatusBadRequest, "ids 不能为空")
		return
	}
	ctx := r.Context()
	updated, deleted := 0, 0
	var checked []egress.Health
	seen := map[int64]bool{}
	for _, id := range req.IDs {
		if seen[id] {
			continue
		}
		seen[id] = true
		switch req.Action {
		case "enable", "disable":
			node, err := mgr.Store().Node(ctx, id)
			if err != nil || node == nil {
				continue
			}
			node.Enabled = req.Action == "enable"
			if err := mgr.Store().UpdateNode(ctx, *node); err != nil {
				writeErr(w, http.StatusInternalServerError, err.Error())
				return
			}
			updated++
		case "delete":
			if err := mgr.Store().DeleteNode(ctx, id); err != nil {
				writeErr(w, http.StatusInternalServerError, err.Error())
				return
			}
			deleted++
		case "check":
			cctx, cancel := context.WithTimeout(ctx, 30*time.Second)
			h, err := mgr.CheckNode(cctx, id)
			cancel()
			if err != nil {
				h = egress.Health{NodeID: id, State: "down", CheckedAt: time.Now(), LastError: truncateErr(err)}
			}
			checked = append(checked, h)
		case "add_to_pool", "remove_from_pool":
			// Applied once after the loop, against the pool's current membership.
		case "tag":
			node, err := mgr.Store().Node(ctx, id)
			if err != nil || node == nil {
				continue
			}
			node.Tags = mergeTags(node.Tags, req.Tags)
			if err := mgr.Store().UpdateNode(ctx, *node); err != nil {
				writeErr(w, http.StatusInternalServerError, err.Error())
				return
			}
			updated++
		default:
			writeErr(w, http.StatusBadRequest, "不支持的批量操作: "+req.Action)
			return
		}
	}
	if req.Action == "add_to_pool" || req.Action == "remove_from_pool" {
		if req.PoolID <= 0 {
			writeErr(w, http.StatusBadRequest, "需要 pool_id")
			return
		}
		current, err := mgr.Store().PoolNodes(ctx, req.PoolID)
		if err != nil {
			writeErr(w, http.StatusNotFound, "池不存在")
			return
		}
		set := map[int64]bool{}
		for _, id := range current {
			set[id] = true
		}
		for id := range seen {
			if req.Action == "add_to_pool" {
				set[id] = true
			} else {
				delete(set, id)
			}
		}
		merged := make([]int64, 0, len(set))
		for _, id := range current {
			if set[id] {
				merged = append(merged, id)
				delete(set, id)
			}
		}
		for id := range set {
			merged = append(merged, id)
		}
		if err := mgr.Store().SetPoolNodes(ctx, req.PoolID, merged); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		updated = len(merged)
	}
	if err := mgr.Reload(ctx); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"updated": updated, "deleted": deleted, "checked": checked,
	})
}

func mergeTags(existing, add []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(existing)+len(add))
	for _, t := range append(append([]string{}, existing...), add...) {
		t = strings.TrimSpace(t)
		if t == "" || seen[t] {
			continue
		}
		seen[t] = true
		out = append(out, t)
	}
	return out
}

func truncateErr(err error) string {
	if err == nil {
		return ""
	}
	msg := err.Error()
	if len(msg) > 200 {
		msg = msg[:200]
	}
	return msg
}

// GET /api/proxy/events — SSE stream of health/session/pool changes.
func (s *Server) egressEvents(w http.ResponseWriter, r *http.Request) {
	mgr := s.egressOrErr(w)
	if mgr == nil {
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeErr(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	send := func(v any) bool {
		b, err := json.Marshal(v)
		if err != nil {
			return false
		}
		if _, err := fmt.Fprintf(w, "data: %s\n\n", b); err != nil {
			return false
		}
		flusher.Flush()
		return true
	}
	// Initial snapshot so a fresh subscriber renders immediately.
	if st, err := mgr.State(r.Context()); err == nil {
		st.DefaultPool = s.m.EgressPoolID()
		payload, _ := json.Marshal(st)
		_, _ = fmt.Fprintf(w, "data: %s\n\n", payload)
		flusher.Flush()
	}
	ch, unsub := mgr.Subscribe()
	defer unsub()
	ping := time.NewTicker(20 * time.Second)
	defer ping.Stop()
	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ping.C:
			if _, err := fmt.Fprint(w, ": ping\n\n"); err != nil {
				return
			}
			flusher.Flush()
		case ev, ok := <-ch:
			if !ok {
				return
			}
			if !send(ev) {
				return
			}
		}
	}
}
