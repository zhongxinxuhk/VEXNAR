// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

import * as React from "react";

import { api, sseUrl } from "@/lib/api";
import type {
  ConversationTrafficCapture,
  ConversationTrafficFlow,
  ConversationTrafficResp,
} from "@/lib/types";

// cap keeps a long-running conversation from growing the panel without bound.
const cap = 500;
// pollFallbackMs is the safety net when EventSource cannot stay open (proxy
// buffering, dev cross-origin failures). It matches the traffic page cadence.
const pollFallbackMs = 2000;

export type SessionTrafficState = {
  items: ConversationTrafficFlow[];
  enabled: boolean;
  connected: boolean;
  loading: boolean;
  error: string;
  unread: number;
  // autoOpenTick increments only for live events (never the initial history
  // load), so the sidebar opens when something is actually being sent.
  autoOpenTick: number;
  // Capture is armed per conversation: `capture` is the server's row for this
  // chat, `hook` is the Yakit mirror script bound to this conversation's scope.
  capture: ConversationTrafficCapture | null;
  captureBusy: boolean;
  hook: string;
  ingestUrl: string;
  startCapture: () => Promise<void>;
  stopCapture: () => Promise<void>;
  markRead: () => void;
  refresh: () => void;
};

// mergeFlow folds one event into the list. A response replaces the pending
// request row by id; a request for an already-known flow is ignored.
function mergeFlow(items: ConversationTrafficFlow[], flow: ConversationTrafficFlow): ConversationTrafficFlow[] {
  const next = items.filter((f) => f.id !== flow.id);
  next.push(flow);
  next.sort((a, b) => {
    if (a.seq > 0 && b.seq > 0 && a.seq !== b.seq) return a.seq - b.seq;
    if (a.ts !== b.ts) return a.ts - b.ts;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return next.length > cap ? next.slice(next.length - cap) : next;
}

// useSessionTraffic subscribes to one conversation's traffic stream. The SSE
// endpoint replays the stored window by seq, so a reconnect restores the list
// without a separate refetch; a failed stream degrades to after_seq polling.
export function useSessionTraffic(convId: number): SessionTrafficState {
  const [items, setItems] = React.useState<ConversationTrafficFlow[]>([]);
  const [enabled, setEnabled] = React.useState(true);
  const [connected, setConnected] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [unread, setUnread] = React.useState(0);
  const [autoOpenTick, setAutoOpenTick] = React.useState(0);
  const [capture, setCapture] = React.useState<ConversationTrafficCapture | null>(null);
  const [captureBusy, setCaptureBusy] = React.useState(false);
  const [hook, setHook] = React.useState("");
  const [ingestUrl, setIngestUrl] = React.useState("");
  const cursor = React.useRef(0);
  const source = React.useRef<EventSource | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposed = React.useRef(false);
  // gen invalidates responses from a previous conversation after a switch.
  const gen = React.useRef(0);
  const seen = React.useRef(new Set<string>());

  const apply = React.useCallback((flow: ConversationTrafficFlow, live: boolean) => {
    const isNew = !seen.current.has(flow.id);
    seen.current.add(flow.id);
    if (flow.seq > cursor.current) cursor.current = flow.seq;
    setItems((prev) => mergeFlow(prev, flow));
    if (live) {
      if (flow.phase === "request" || flow.phase === "response") {
        setAutoOpenTick((n) => n + 1);
      }
      if (isNew) setUnread((n) => n + 1);
    }
  }, []);

  const loadWindow = React.useCallback(async (afterSeq: number) => {
    const myGen = gen.current;
    const r: ConversationTrafficResp = await api.conversationTraffic(convId, afterSeq);
    if (disposed.current || myGen !== gen.current) return;
    setEnabled(r.enabled);
    setError("");
    const rows = r.items ?? [];
    setItems((prev) => {
      let next = prev;
      for (const row of rows) {
        seen.current.add(row.id);
        next = mergeFlow(next, row);
      }
      return next;
    });
    if (typeof r.next_seq === "number" && r.next_seq > cursor.current) cursor.current = r.next_seq;
    setLoading(false);
  }, [convId]);

  // Capture state lives on the conversation, so it is fetched alongside the
  // window: the sidebar's empty state must say "not capturing yet" and offer
  // the arm button instead of pointing at a station-wide settings toggle.
  const loadEndpoint = React.useCallback(async () => {
    const myGen = gen.current;
    try {
      const r = await api.conversationTrafficEndpoint(convId);
      if (disposed.current || myGen !== gen.current) return;
      setCapture(r.capture ?? null);
      setHook(r.hook ?? "");
      setIngestUrl(r.ingest_url ?? "");
      setEnabled(r.enabled);
    } catch (e) {
      if (!disposed.current && myGen === gen.current) setError((e as Error).message);
    }
  }, [convId]);

  const arm = React.useCallback(
    async (action: "start" | "stop") => {
      setCaptureBusy(true);
      try {
        const r = await api.conversationTrafficCapture(convId, action);
        if (disposed.current) return;
        setCapture(r.capture ?? null);
        setHook(r.hook ?? "");
        setIngestUrl(r.ingest_url ?? "");
        setEnabled(r.enabled);
        setError("");
        void loadWindow(0).catch(() => undefined);
      } catch (e) {
        if (!disposed.current) setError((e as Error).message);
      } finally {
        if (!disposed.current) setCaptureBusy(false);
      }
    },
    [convId, loadWindow],
  );

  const poll = React.useCallback(() => {
    if (disposed.current) return;
    void loadWindow(cursor.current)
      .catch((e: Error) => setError(e.message))
      .finally(() => {
        if (!disposed.current) timer.current = setTimeout(poll, pollFallbackMs);
      });
  }, [loadWindow]);

  const connect = React.useCallback(() => {
    if (disposed.current) return;
    const es = new EventSource(sseUrl(`/api/conversations/${convId}/traffic/stream?since=${cursor.current}`));
    source.current = es;
    es.addEventListener("hello", () => {
      if (disposed.current) return;
      setConnected(true);
      setError("");
    });
    es.addEventListener("flow", (ev) => {
      try {
        const payload = JSON.parse((ev as MessageEvent).data) as {
          seq: number;
          phase: "request" | "response" | "error";
          flow: ConversationTrafficFlow;
        };
        if (!payload?.flow) return;
        // Replayed rows carry seq <= cursor and must not open the panel.
        const live = payload.seq === 0 || payload.seq > cursor.current;
        apply({ ...payload.flow, phase: payload.phase }, live);
        if (payload.seq > 0) cursor.current = Math.max(cursor.current, payload.seq);
      } catch {
        // Ignore malformed frames; the next reconnect replays from seq.
      }
    });
    es.onerror = () => {
      if (disposed.current) return;
      setConnected(false);
      es.close();
      source.current = null;
      // Fall back to polling; do not spin reconnecting while the server is down.
      if (!timer.current) timer.current = setTimeout(poll, pollFallbackMs);
    };
  }, [apply, convId, poll]);

  React.useEffect(() => {
    gen.current++;
    disposed.current = false;
    cursor.current = 0;
    seen.current = new Set();
    setItems([]);
    setUnread(0);
    setLoading(true);
    setConnected(false);
    setCapture(null);
    void loadEndpoint();
    void loadWindow(0)
      .then(() => {
        if (!disposed.current) connect();
      })
      .catch((e: Error) => {
        if (disposed.current) return;
        setError(e.message);
        setLoading(false);
        timer.current = setTimeout(poll, pollFallbackMs);
      });
    return () => {
      disposed.current = true;
      gen.current++;
      source.current?.close();
      source.current = null;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [convId, connect, loadEndpoint, loadWindow, poll]);

  const markRead = React.useCallback(() => setUnread(0), []);
  const refresh = React.useCallback(() => {
    void loadWindow(cursor.current).catch((e: Error) => setError(e.message));
  }, [loadWindow]);

  const startCapture = React.useCallback(() => arm("start"), [arm]);
  const stopCapture = React.useCallback(() => arm("stop"), [arm]);

  return {
    items,
    enabled,
    connected,
    loading,
    error,
    unread,
    autoOpenTick,
    capture,
    captureBusy,
    hook,
    ingestUrl,
    startCapture,
    stopCapture,
    markRead,
    refresh,
  };
}
