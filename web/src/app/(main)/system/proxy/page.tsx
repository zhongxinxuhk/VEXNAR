"use client";

import * as React from "react";

import {
  ActivityIcon,
  CheckCircle2Icon,
  ImportIcon,
  Link2Icon,
  PlusIcon,
  RefreshCwIcon,
  ServerIcon,
  ShieldAlertIcon,
  Trash2Icon,
  WaypointsIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api, sseUrl } from "@/lib/api";
import type {
  ProxyNodeView,
  ProxyParseResult,
  ProxyPool,
  ProxySessionSnapshot,
  ProxyState,
  TaskProxyBinding,
} from "@/lib/types";

const STRATEGIES = [
  { value: "balanced", label: "均衡（按延迟/成功率加权）" },
  { value: "sticky", label: "粘性（尽量不变）" },
  { value: "rotate", label: "轮换" },
  { value: "least_latency", label: "最低延迟" },
  { value: "failover", label: "主备顺序" },
];
const MODES = [
  { value: "sticky", label: "sticky（会话粘节点）" },
  { value: "rotate", label: "rotate（每连接换）" },
  { value: "fanout", label: "fanout（对抗模式，P3 生效）" },
];

const emptyPool: Partial<ProxyPool> = {
  name: "",
  strategy: "balanced",
  mode_default: "sticky",
  fallback: "block",
  fanout_k: 3,
  max_conns: 128,
  check_interval: 300,
  sticky_ttl: 1800,
};

const STATE_DOT: Record<string, string> = {
  up: "bg-emerald-500",
  degraded: "bg-amber-500",
  cooldown: "bg-rose-500",
  down: "bg-rose-500",
};

function stateDot(state: string) {
  const color = STATE_DOT[state] ?? "bg-muted-foreground/40";
  return <span className={`inline-block size-2 rounded-full ${color}`} title={state} />;
}

function stateLabel(state: string) {
  switch (state) {
    case "up":
      return "可用";
    case "degraded":
      return "降级";
    case "cooldown":
      return "冷却";
    case "down":
      return "不可用";
    default:
      return "未检测";
  }
}

export default function ProxyPoolPage() {
  const [state, setState] = React.useState<ProxyState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [selectedPool, setSelectedPool] = React.useState<number | null>(null);

  const [poolOpen, setPoolOpen] = React.useState(false);
  const [editingPool, setEditingPool] = React.useState<ProxyPool | null>(null);
  const [poolForm, setPoolForm] = React.useState<Partial<ProxyPool>>(emptyPool);
  const [savingPool, setSavingPool] = React.useState(false);

  const [importOpen, setImportOpen] = React.useState(false);
  const [importText, setImportText] = React.useState("");
  const [importURL, setImportURL] = React.useState("");
  const [importPool, setImportPool] = React.useState<string>("0");
  const [importTags, setImportTags] = React.useState("");
  const [preview, setPreview] = React.useState<ProxyParseResult | null>(null);
  const [parsing, setParsing] = React.useState(false);
  const [importing, setImporting] = React.useState(false);

  const [bindingTask, setBindingTask] = React.useState("");
  const [binding, setBinding] = React.useState<TaskProxyBinding | null>(null);
  const [bindingSession, setBindingSession] = React.useState<ProxySessionSnapshot | null>(null);
  const [bindingBusy, setBindingBusy] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<number>>(new Set());

  const [fanoutTask, setFanoutTask] = React.useState("");
  const [fanoutURL, setFanoutURL] = React.useState("");
  const [fanoutK, setFanoutK] = React.useState(3);
  const [fanoutBusy, setFanoutBusy] = React.useState(false);
  const [fanoutResult, setFanoutResult] = React.useState<import("@/lib/types").ProxyFanoutResult | null>(null);

  const [nodeOpen, setNodeOpen] = React.useState(false);
  const [editingNode, setEditingNode] = React.useState<ProxyNodeView | null>(null);
  const [nodeForm, setNodeForm] = React.useState({
    name: "",
    protocol: "socks5",
    server: "",
    port: 1080,
    username: "",
    password: "",
    uuid: "",
    configText: "",
    tags: "",
    weight: 1,
    max_conns: 32,
    enabled: true,
    note: "",
  });
  const [savingNode, setSavingNode] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const st = await api.proxyState();
      setState(st);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载代理池失败");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  // 健康/会话/池变更由 SSE 推送；合并 400ms 内的多条事件，避免体检时刷屏。
  React.useEffect(() => {
    const es = new EventSource(sseUrl("/proxy/events"));
    let timer: ReturnType<typeof setTimeout> | null = null;
    es.onmessage = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void load();
      }, 400);
    };
    return () => {
      es.close();
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  const pools = state?.pools ?? [];
  const nodes = state?.nodes ?? [];
  const sessions = state?.sessions ?? [];
  const activePool = selectedPool ?? null;
  const poolMembers = React.useMemo(() => {
    const p = pools.find((x) => x.id === activePool);
    return new Set(p?.members ?? []);
  }, [pools, activePool]);

  const visibleNodes = activePool ? nodes.filter((n) => poolMembers.has(n.id)) : nodes;
  const healthy = nodes.filter((n) => n.state === "up").length;

  async function checkPool(id: number) {
    try {
      const res = await api.proxyCheckPool(id);
      const up = res.filter((h) => h.state === "up").length;
      toast.success(`体检完成：${up}/${res.length} 可用`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "体检失败");
    }
  }

  async function checkNode(id: number) {
    try {
      const h = await api.proxyCheckNode(id);
      toast[h.state === "up" ? "success" : "error"](
        `节点 ${id}：${stateLabel(h.state)}${h.latency_ms ? ` · ${h.latency_ms}ms` : ""}${h.last_error ? ` · ${h.last_error}` : ""}`,
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "体检失败");
    }
  }

  async function setDefault(id: number) {
    try {
      await api.setProxyDefaultPool(id);
      toast.success("已设为默认池");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "设置失败");
    }
  }

  async function removePool(id: number) {
    try {
      await api.deleteProxyPool(id);
      toast.success("池已删除");
      if (selectedPool === id) setSelectedPool(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  function openPoolForm(pool?: ProxyPool) {
    setEditingPool(pool ?? null);
    setPoolForm(pool ? { ...pool } : { ...emptyPool });
    setPoolOpen(true);
  }

  function poolSaveLabel() {
    if (savingPool) return "保存中…";
    return editingPool ? "保存修改" : "创建池";
  }

  async function savePool() {
    if (!poolForm.name?.trim()) {
      toast.error("池名称不能为空");
      return;
    }
    setSavingPool(true);
    try {
      if (editingPool) {
        await api.updateProxyPool(editingPool.id, poolForm);
        toast.success("池已更新");
      } else {
        const created = await api.createProxyPool(poolForm);
        setSelectedPool(created.id);
        toast.success("池已创建");
      }
      setPoolOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingPool(false);
    }
  }

  function openNodeForm(node?: ProxyNodeView) {
    setEditingNode(node ?? null);
    if (node) {
      const cfg = node.config ?? {};
      setNodeForm({
        name: node.name,
        protocol: node.protocol,
        server: node.server,
        port: node.port,
        username: "",
        password: "",
        uuid: "",
        configText: Object.keys(cfg).length ? JSON.stringify(cfg, null, 2) : "",
        tags: (node.tags ?? []).join(","),
        weight: node.weight,
        max_conns: node.max_conns,
        enabled: node.enabled,
        note: node.note ?? "",
      });
    } else {
      setNodeForm({
        name: "",
        protocol: "socks5",
        server: "",
        port: 1080,
        username: "",
        password: "",
        uuid: "",
        configText: "",
        tags: "",
        weight: 1,
        max_conns: 32,
        enabled: true,
        note: "",
      });
    }
    setNodeOpen(true);
  }

  async function saveNode() {
    if (!nodeForm.name.trim() || !nodeForm.server.trim()) {
      toast.error("名称与服务器地址必填");
      return;
    }
    let config: Record<string, unknown> = {};
    if (nodeForm.configText.trim()) {
      try {
        config = JSON.parse(nodeForm.configText);
      } catch {
        toast.error("附加配置不是合法 JSON");
        return;
      }
    }
    if (nodeForm.username.trim()) config.username = nodeForm.username.trim();
    const secrets: Record<string, string> = {};
    if (nodeForm.password) secrets.password = nodeForm.password;
    if (nodeForm.uuid.trim()) secrets.uuid = nodeForm.uuid.trim();
    const tags = nodeForm.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    setSavingNode(true);
    try {
      if (editingNode) {
        await api.updateProxyNode(editingNode.id, {
          name: nodeForm.name.trim(),
          tags,
          weight: nodeForm.weight,
          max_conns: nodeForm.max_conns,
          enabled: nodeForm.enabled,
          note: nodeForm.note,
          config,
          ...(Object.keys(secrets).length ? { secrets } : {}),
        });
        toast.success("节点已更新");
      } else {
        await api.createProxyNode({
          name: nodeForm.name.trim(),
          protocol: nodeForm.protocol,
          server: nodeForm.server.trim(),
          port: nodeForm.port,
          config,
          secrets,
          tags,
          weight: nodeForm.weight,
          max_conns: nodeForm.max_conns,
          enabled: nodeForm.enabled,
          note: nodeForm.note,
        });
        toast.success("节点已添加");
      }
      setNodeOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存节点失败");
    } finally {
      setSavingNode(false);
    }
  }

  function nodeSaveLabel() {
    if (savingNode) return "保存中…";
    return editingNode ? "保存修改" : "添加节点";
  }

  async function toggleNode(node: ProxyNodeView, enabled: boolean) {
    try {
      await api.updateProxyNode(node.id, { enabled });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "更新失败");
    }
  }

  async function removeNode(node: ProxyNodeView) {
    try {
      await api.deleteProxyNode(node.id);
      toast.success("节点已删除");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === visibleNodes.length ? new Set() : new Set(visibleNodes.map((n) => n.id))));
  }

  async function batch(action: string) {
    const ids = [...selected];
    if (ids.length === 0) {
      toast.error("先选择节点");
      return;
    }
    try {
      const res = await api.proxyBatch({ ids, action, pool_id: activePool ?? undefined });
      toast.success(
        `批量操作完成：更新 ${res.updated}，删除 ${res.deleted}${res.checked ? `，体检 ${res.checked.length}` : ""}`,
      );
      setSelected(new Set());
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "批量操作失败");
    }
  }

  async function removeFromPool(node: ProxyNodeView) {
    if (!activePool) return;
    try {
      await api.removeProxyPoolNode(activePool, node.id);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "移出失败");
    }
  }

  async function doParse() {
    setParsing(true);
    try {
      setPreview(await api.proxyParse(importText, importURL));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "解析失败");
    } finally {
      setParsing(false);
    }
  }

  async function doImport() {
    setImporting(true);
    try {
      const tags = importTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await api.proxyImport(importText, Number(importPool) || 0, tags, importURL);
      toast.success(`导入完成：新增 ${res.created}，更新 ${res.updated}，入池 ${res.added_to_pool}`);
      if (res.issues?.length) {
        toast.warning(`${res.issues.length} 行未识别，可在预览里查看`);
      }
      setImportOpen(false);
      setImportText("");
      setPreview(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导入失败");
    } finally {
      setImporting(false);
    }
  }

  async function loadBinding() {
    const id = Number(bindingTask);
    if (!id) {
      toast.error("先填写任务 ID");
      return;
    }
    setBindingBusy(true);
    try {
      const res = await api.proxyTaskBinding(id);
      setBinding(res.binding ?? null);
      setBindingSession(res.worker_session ?? null);
      if (!res.binding) toast.info("该任务还没有绑定代理池");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "读取绑定失败");
    } finally {
      setBindingBusy(false);
    }
  }

  async function saveBinding() {
    const id = Number(bindingTask);
    if (!id || !binding?.pool_id) {
      toast.error("需要任务 ID 与代理池");
      return;
    }
    setBindingBusy(true);
    try {
      await api.setProxyTaskBinding(id, {
        pool_id: binding.pool_id,
        mode: binding.mode,
        fanout_k: binding.fanout_k,
        fallback: binding.fallback,
        max_conns: binding.max_conns,
      });
      toast.success("任务绑定已保存（下一次 Agent 启动生效）");
      await loadBinding();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBindingBusy(false);
    }
  }

  async function clearBinding() {
    const id = Number(bindingTask);
    if (!id) return;
    setBindingBusy(true);
    try {
      await api.deleteProxyTaskBinding(id);
      setBinding(null);
      setBindingSession(null);
      toast.success("已解除任务绑定");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "解除失败");
    } finally {
      setBindingBusy(false);
    }
  }

  async function runFanout() {
    const id = Number(fanoutTask);
    if (!id || !fanoutURL.trim()) {
      toast.error("需要任务 ID 与目标 URL");
      return;
    }
    setFanoutBusy(true);
    try {
      const res = await api.proxyFanout({ task_id: id, url: fanoutURL.trim(), k: fanoutK });
      setFanoutResult(res);
      toast[res.blocked ? "error" : "success"](
        res.blocked ? "全部出口被判定为拦截" : `成功：节点 ${res.winner_node} · HTTP ${res.status}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "对抗请求失败");
    } finally {
      setFanoutBusy(false);
    }
  }

  async function resetLeases() {
    try {
      await api.proxyResetLeases(Number(bindingTask) || 0);
      toast.success("已重置租约（下次请求重新选节点）");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "重置失败");
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-semibold text-xl">
            <WaypointsIcon className="size-5" /> 代理池
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            内置 mihomo 协议核：节点口令加密存放在本地 SQLite，Agent
            的目标流量按会话经网关出网；绑定池后默认失败关闭，不会回落直连。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCwIcon className="size-4" /> 刷新
          </Button>
          <Button variant="outline" size="sm" onClick={() => openNodeForm()}>
            <PlusIcon className="size-4" /> 自定义节点
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <ImportIcon className="size-4" /> 导入节点
          </Button>
          <Button size="sm" onClick={() => openPoolForm()}>
            <PlusIcon className="size-4" /> 新建池
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>会话网关（HTTP）</CardDescription>
            <CardTitle className="font-mono text-sm">{state?.gateway || "—"}</CardTitle>
            <p className="font-mono text-muted-foreground text-xs">SOCKS5 {state?.socks || "未启动"}</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>默认池</CardDescription>
            <CardTitle className="text-sm">
              {pools.find((p) => p.id === state?.default_pool)?.name ?? "未设置（回落全局代理）"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>节点健康</CardDescription>
            <CardTitle className="flex items-center gap-2 text-sm">
              <CheckCircle2Icon className="size-4 text-emerald-500" />
              {healthy}/{nodes.length} 可用
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>活跃会话</CardDescription>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ActivityIcon className="size-4" /> {sessions.length}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Tabs defaultValue="pools">
        <TabsList>
          <TabsTrigger value="pools">池与节点</TabsTrigger>
          <TabsTrigger value="sessions">会话出口</TabsTrigger>
          <TabsTrigger value="binding">任务绑定</TabsTrigger>
          <TabsTrigger value="fanout">对抗测试</TabsTrigger>
        </TabsList>

        <TabsContent value="pools" className="mt-3">
          <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-muted-foreground text-xs">
                <span>代理池</span>
                <button type="button" className="hover:underline" onClick={() => setSelectedPool(null)}>
                  查看全部节点
                </button>
              </div>
              {pools.length === 0 && (
                <Card>
                  <CardContent className="py-6 text-muted-foreground text-sm">
                    还没有代理池。先「新建池」，再「导入节点」。
                  </CardContent>
                </Card>
              )}
              {pools.map((p) => (
                <Card
                  key={p.id}
                  className={`cursor-pointer transition-colors ${activePool === p.id ? "ring-2 ring-primary" : ""}`}
                  onClick={() => setSelectedPool(p.id)}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <ServerIcon className="size-4" />
                        {p.name}
                      </span>
                      {state?.default_pool === p.id && <Badge variant="secondary">默认</Badge>}
                    </CardTitle>
                    <CardDescription className="flex flex-wrap gap-1 text-xs">
                      <Badge variant="outline">{p.strategy}</Badge>
                      <Badge variant="outline">{p.mode_default}</Badge>
                      {p.fallback === "direct" ? (
                        <Badge variant="destructive">允许直连</Badge>
                      ) : (
                        <Badge variant="outline">失败关闭</Badge>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    <div className="text-muted-foreground text-xs">
                      {p.healthy_count ?? 0}/{p.node_count ?? 0} 节点可用
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          void checkPool(p.id);
                        }}
                      >
                        体检
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          void setDefault(p.id);
                        }}
                      >
                        设为默认
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          openPoolForm(p);
                        }}
                      >
                        编辑
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          void removePool(p.id);
                        }}
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  {activePool ? `节点 · ${pools.find((p) => p.id === activePool)?.name ?? ""}` : "全部节点"}
                </CardTitle>
                <CardDescription>
                  状态来自健康探测与真实拨号；出口 IP 用于判断多个节点是否共用同一出口。节点口令不会显示。
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground text-xs">已选 {selected.size}</span>
                  <Button size="sm" variant="outline" onClick={toggleSelectAll}>
                    全选 / 清空
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void batch("enable")}>
                    启用
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void batch("disable")}>
                    禁用
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void batch("check")}>
                    批量体检
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void batch("add_to_pool")} disabled={!activePool}>
                    加入当前池
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void batch("remove_from_pool")}
                    disabled={!activePool}
                  >
                    移出当前池
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => void batch("delete")}>
                    删除
                  </Button>
                </div>
                {visibleNodes.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground text-sm">
                    该池还没有节点。去「导入节点」并选择这个池，或在全部节点里「加入池」。
                  </div>
                ) : (
                  <table className="w-full min-w-[880px] text-sm">
                    <thead className="text-left text-muted-foreground text-xs">
                      <tr className="border-b">
                        <th className="w-8 py-2 pr-2">
                          <Checkbox
                            checked={visibleNodes.length > 0 && selected.size === visibleNodes.length}
                            onCheckedChange={toggleSelectAll}
                          />
                        </th>
                        <th className="py-2 pr-2">名称</th>
                        <th className="py-2 pr-2">协议</th>
                        <th className="py-2 pr-2">地址</th>
                        <th className="py-2 pr-2">状态</th>
                        <th className="py-2 pr-2">延迟</th>
                        <th className="py-2 pr-2">出口 IP</th>
                        <th className="py-2 pr-2">请求</th>
                        <th className="py-2 pr-2">启用</th>
                        <th className="py-2 pr-2 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleNodes.map((n) => {
                        const isMember = poolMembers.has(n.id);
                        return (
                          <tr key={n.id} className="border-b last:border-0">
                            <td className="py-2 pr-2">
                              <Checkbox checked={selected.has(n.id)} onCheckedChange={() => toggleSelect(n.id)} />
                            </td>
                            <td className="py-2 pr-2">{n.name}</td>
                            <td className="py-2 pr-2">
                              <Badge variant="outline">{n.protocol}</Badge>
                            </td>
                            <td className="py-2 pr-2 font-mono text-xs">
                              {n.server}:{n.port}
                            </td>
                            <td className="py-2 pr-2">
                              <span className="flex items-center gap-1.5">
                                {stateDot(n.state)} {stateLabel(n.state)}
                              </span>
                            </td>
                            <td className="py-2 pr-2 text-xs">{n.latency_ms ? `${n.latency_ms}ms` : "—"}</td>
                            <td className="py-2 pr-2 font-mono text-xs">{n.egress_ip || "—"}</td>
                            <td className="py-2 pr-2 text-xs">
                              {n.requests}
                              {n.failures > 0 && <span className="text-rose-500"> / 失败 {n.failures}</span>}
                            </td>
                            <td className="py-2 pr-2">
                              <Switch checked={n.enabled} onCheckedChange={(v) => toggleNode(n, v)} />
                            </td>
                            <td className="py-2 pr-2">
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="ghost" onClick={() => checkNode(n.id)}>
                                  体检
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => openNodeForm(n)}>
                                  编辑
                                </Button>
                                {activePool && isMember && (
                                  <Button size="sm" variant="ghost" onClick={() => removeFromPool(n)}>
                                    移出池
                                  </Button>
                                )}
                                {!activePool && (
                                  <Button size="sm" variant="ghost" onClick={() => removeNode(n)}>
                                    <Trash2Icon className="size-4" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                {!activePool && (
                  <div className="mt-3 flex items-center gap-2 text-muted-foreground text-xs">
                    <Link2Icon className="size-3" /> 选中左侧某个池后，可把这里的节点「加入池」。
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="sessions" className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">会话出口</CardTitle>
              <CardDescription>
                每个任务角色一个会话：sticky 显示租约节点，rotate/fanout 显示最近一次实际使用的节点。
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {sessions.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">当前没有活跃会话</div>
              ) : (
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="text-left text-muted-foreground text-xs">
                    <tr className="border-b">
                      <th className="py-2 pr-2">会话</th>
                      <th className="py-2 pr-2">任务</th>
                      <th className="py-2 pr-2">池</th>
                      <th className="py-2 pr-2">模式</th>
                      <th className="py-2 pr-2">当前节点</th>
                      <th className="py-2 pr-2">请求 / 失败</th>
                      <th className="py-2 pr-2">最近错误</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => (
                      <tr key={s.session} className="border-b last:border-0">
                        <td className="py-2 pr-2 font-mono text-xs">{s.session}</td>
                        <td className="py-2 pr-2">{s.task_id || "—"}</td>
                        <td className="py-2 pr-2">{s.pool_name || s.pool_id || "—"}</td>
                        <td className="py-2 pr-2">
                          <Badge variant="outline">{s.mode}</Badge>
                        </td>
                        <td className="py-2 pr-2">
                          {s.node_name || "—"}
                          {s.node_ip && <span className="ml-1 text-muted-foreground text-xs">{s.node_ip}</span>}
                        </td>
                        <td className="py-2 pr-2 text-xs">
                          {s.requests} / {s.failures}
                        </td>
                        <td className="max-w-[240px] truncate py-2 pr-2 text-muted-foreground text-xs">
                          {s.last_error || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="binding" className="mt-3">
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle className="text-sm">任务绑定</CardTitle>
              <CardDescription>
                绑定后该任务的 Agent（worker/planner/main）各自持有独立会话与租约。捕获开启时使用会话级录制实例，
                流量仍会落库并带任务/会话标记。
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label htmlFor="binding-task">任务 ID</Label>
                  <Input
                    id="binding-task"
                    inputMode="numeric"
                    placeholder="例如 12"
                    value={bindingTask}
                    onChange={(e) => setBindingTask(e.target.value)}
                  />
                </div>
                <Button variant="outline" onClick={loadBinding} disabled={bindingBusy}>
                  读取
                </Button>
              </div>

              <Separator />

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>代理池</Label>
                  <Select
                    value={binding?.pool_id ? String(binding.pool_id) : ""}
                    onValueChange={(v) =>
                      setBinding((b) => ({
                        task_id: Number(bindingTask),
                        pool_id: Number(v),
                        mode: b?.mode ?? "sticky",
                        fanout_k: b?.fanout_k ?? 3,
                        fallback: b?.fallback ?? "block",
                        max_conns: b?.max_conns ?? 8,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择池" />
                    </SelectTrigger>
                    <SelectContent>
                      {pools.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>模式</Label>
                  <Select
                    value={binding?.mode ?? "sticky"}
                    onValueChange={(v) =>
                      setBinding((b) => ({
                        task_id: Number(bindingTask),
                        pool_id: b?.pool_id ?? 0,
                        mode: v,
                        fanout_k: b?.fanout_k ?? 3,
                        fallback: b?.fallback ?? "block",
                        max_conns: b?.max_conns ?? 8,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MODES.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>会话并发上限</Label>
                  <Input
                    type="number"
                    min={1}
                    value={binding?.max_conns ?? 8}
                    onChange={(e) =>
                      setBinding((b) => ({
                        task_id: Number(bindingTask),
                        pool_id: b?.pool_id ?? 0,
                        mode: b?.mode ?? "sticky",
                        fanout_k: b?.fanout_k ?? 3,
                        fallback: b?.fallback ?? "block",
                        max_conns: Number(e.target.value) || 8,
                      }))
                    }
                  />
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <Label>无可用节点时允许直连</Label>
                    <p className="text-muted-foreground text-xs">默认关闭；开启会暴露平台真实出口 IP。</p>
                  </div>
                  <Switch
                    checked={binding?.fallback === "direct"}
                    onCheckedChange={(v) =>
                      setBinding((b) => ({
                        task_id: Number(bindingTask),
                        pool_id: b?.pool_id ?? 0,
                        mode: b?.mode ?? "sticky",
                        fanout_k: b?.fanout_k ?? 3,
                        fallback: v ? "direct" : "block",
                        max_conns: b?.max_conns ?? 8,
                      }))
                    }
                  />
                </div>
              </div>

              {binding?.fallback === "direct" && (
                <div className="flex items-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 p-2 text-rose-600 text-xs">
                  <ShieldAlertIcon className="size-4" /> 直连已开启：池不可用时目标会看到平台真实 IP。
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button onClick={saveBinding} disabled={bindingBusy || !binding?.pool_id}>
                  保存绑定
                </Button>
                <Button variant="outline" onClick={clearBinding} disabled={bindingBusy}>
                  解除绑定
                </Button>
                <Button variant="ghost" onClick={resetLeases}>
                  重置租约
                </Button>
              </div>

              {bindingSession && (
                <div className="rounded-md border p-2 text-muted-foreground text-xs">
                  worker 会话：{bindingSession.session} · 节点{" "}
                  {bindingSession.node_name || bindingSession.node_id || "—"} · 请求 {bindingSession.requests} · 失败{" "}
                  {bindingSession.failures}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="fanout" className="mt-3">
          <Card className="max-w-3xl">
            <CardHeader>
              <CardTitle className="text-sm">对抗测试（fanout）</CardTitle>
              <CardDescription>
                同一请求从 K 个出口同时发出，取第一个未被 WAF
                拦截的响应；结果按节点列出判定，用于验证池的"对抗"效果。会消耗该任务本小时预算。
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_2fr_100px_auto]">
                <div>
                  <Label>任务 ID</Label>
                  <Input
                    inputMode="numeric"
                    value={fanoutTask}
                    onChange={(e) => setFanoutTask(e.target.value)}
                    placeholder="12"
                  />
                </div>
                <div>
                  <Label>目标 URL</Label>
                  <Input
                    value={fanoutURL}
                    onChange={(e) => setFanoutURL(e.target.value)}
                    placeholder="https://target.example.com/login"
                  />
                </div>
                <div>
                  <Label>K</Label>
                  <Input
                    type="number"
                    min={1}
                    max={8}
                    value={fanoutK}
                    onChange={(e) => setFanoutK(Number(e.target.value) || 3)}
                  />
                </div>
                <div className="flex items-end">
                  <Button onClick={() => void runFanout()} disabled={fanoutBusy}>
                    {fanoutBusy ? "请求中…" : "发起"}
                  </Button>
                </div>
              </div>

              {fanoutResult && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant={fanoutResult.blocked ? "destructive" : "secondary"}>
                      {fanoutResult.blocked ? "全部被拦" : `胜出节点 ${fanoutResult.winner_node}`}
                    </Badge>
                    <span className="text-muted-foreground text-xs">HTTP {fanoutResult.status}</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="text-left text-muted-foreground text-xs">
                      <tr className="border-b">
                        <th className="py-2 pr-2">节点</th>
                        <th className="py-2 pr-2">出口 IP</th>
                        <th className="py-2 pr-2">状态</th>
                        <th className="py-2 pr-2">判定</th>
                        <th className="py-2 pr-2">耗时</th>
                        <th className="py-2 pr-2">错误</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(fanoutResult.attempts ?? []).map((a) => (
                        <tr key={a.node_id} className="border-b last:border-0">
                          <td className="py-2 pr-2">{a.node_name || a.node_id}</td>
                          <td className="py-2 pr-2 font-mono text-xs">{a.egress_ip || "—"}</td>
                          <td className="py-2 pr-2 text-xs">{a.status || "—"}</td>
                          <td className="py-2 pr-2">
                            <Badge variant={a.verdict === "pass" ? "secondary" : "outline"}>{a.verdict}</Badge>
                          </td>
                          <td className="py-2 pr-2 text-xs">{a.ms ? `${a.ms}ms` : "—"}</td>
                          <td className="max-w-[220px] truncate py-2 pr-2 text-muted-foreground text-xs">
                            {a.error || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {fanoutResult.body && (
                    <pre className="max-h-48 overflow-auto rounded-md border p-2 text-xs">
                      {fanoutResult.body.slice(0, 2000)}
                    </pre>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 新建/编辑池 */}
      <Sheet open={poolOpen} onOpenChange={setPoolOpen}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{editingPool ? "编辑代理池" : "新建代理池"}</SheetTitle>
            <SheetDescription>池决定选路策略与失败语义；节点在「导入节点」里加入。</SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-3">
            <div>
              <Label>名称</Label>
              <Input
                value={poolForm.name ?? ""}
                onChange={(e) => setPoolForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="例如 hk-residential"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>选路策略</Label>
                <Select
                  value={poolForm.strategy ?? "balanced"}
                  onValueChange={(v) => setPoolForm((f) => ({ ...f, strategy: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STRATEGIES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>默认模式</Label>
                <Select
                  value={poolForm.mode_default ?? "sticky"}
                  onValueChange={(v) => setPoolForm((f) => ({ ...f, mode_default: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>池并发上限</Label>
                <Input
                  type="number"
                  min={1}
                  value={poolForm.max_conns ?? 128}
                  onChange={(e) => setPoolForm((f) => ({ ...f, max_conns: Number(e.target.value) || 128 }))}
                />
              </div>
              <div>
                <Label>粘性租约（秒）</Label>
                <Input
                  type="number"
                  min={60}
                  value={poolForm.sticky_ttl ?? 1800}
                  onChange={(e) => setPoolForm((f) => ({ ...f, sticky_ttl: Number(e.target.value) || 1800 }))}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>无可用节点时直连</Label>
                <p className="text-muted-foreground text-xs">默认关闭（失败关闭）。</p>
              </div>
              <Switch
                checked={poolForm.fallback === "direct"}
                onCheckedChange={(v) => setPoolForm((f) => ({ ...f, fallback: v ? "direct" : "block" }))}
              />
            </div>
            <div>
              <Label>健康检查地址</Label>
              <Input
                value={poolForm.health_url ?? ""}
                placeholder="http://www.gstatic.com/generate_204"
                onChange={(e) => setPoolForm((f) => ({ ...f, health_url: e.target.value }))}
              />
            </div>
            <Button onClick={() => void savePool()} disabled={savingPool}>
              {poolSaveLabel()}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* 自定义 / 编辑节点 */}
      <Sheet open={nodeOpen} onOpenChange={setNodeOpen}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{editingNode ? "编辑节点" : "自定义节点"}</SheetTitle>
            <SheetDescription>
              口令/uuid 编辑时留空表示保持不变；附加配置是 clash proxies 条目（不含口令），用于 ws-opts/reality
              等高级参数。
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>名称</Label>
                <Input value={nodeForm.name} onChange={(e) => setNodeForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label>协议</Label>
                <Select
                  value={nodeForm.protocol}
                  onValueChange={(v) => setNodeForm((f) => ({ ...f, protocol: v }))}
                  disabled={!!editingNode}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["socks5", "ss", "ssr", "vmess", "vless", "trojan", "http", "hysteria2", "tuic", "anytls"].map(
                      (p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>服务器</Label>
                <Input
                  value={nodeForm.server}
                  onChange={(e) => setNodeForm((f) => ({ ...f, server: e.target.value }))}
                  disabled={!!editingNode}
                  placeholder="example.com 或 1.2.3.4"
                />
              </div>
              <div>
                <Label>端口</Label>
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={nodeForm.port}
                  onChange={(e) => setNodeForm((f) => ({ ...f, port: Number(e.target.value) || 0 }))}
                  disabled={!!editingNode}
                />
              </div>
              <div>
                <Label>用户名（可选）</Label>
                <Input
                  value={nodeForm.username}
                  onChange={(e) => setNodeForm((f) => ({ ...f, username: e.target.value }))}
                />
              </div>
              <div>
                <Label>密码（{editingNode ? "留空保持不变" : "可选"}）</Label>
                <Input
                  type="password"
                  value={nodeForm.password}
                  onChange={(e) => setNodeForm((f) => ({ ...f, password: e.target.value }))}
                />
              </div>
              <div>
                <Label>UUID（vmess/vless/tuic，{editingNode ? "留空保持不变" : "可选"}）</Label>
                <Input value={nodeForm.uuid} onChange={(e) => setNodeForm((f) => ({ ...f, uuid: e.target.value }))} />
              </div>
              <div>
                <Label>标签（逗号分隔）</Label>
                <Input
                  value={nodeForm.tags}
                  onChange={(e) => setNodeForm((f) => ({ ...f, tags: e.target.value }))}
                  placeholder="hk,residential"
                />
              </div>
            </div>
            <div>
              <Label>附加配置（JSON，clash proxies 条目）</Label>
              <Textarea
                rows={5}
                className="font-mono text-xs"
                value={nodeForm.configText}
                onChange={(e) => setNodeForm((f) => ({ ...f, configText: e.target.value }))}
                placeholder={'{"sni":"cdn.example.com","network":"ws","ws-opts":{"path":"/ray"}}'}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>权重</Label>
                <Input
                  type="number"
                  min={1}
                  value={nodeForm.weight}
                  onChange={(e) => setNodeForm((f) => ({ ...f, weight: Number(e.target.value) || 1 }))}
                />
              </div>
              <div>
                <Label>并发上限</Label>
                <Input
                  type="number"
                  min={1}
                  value={nodeForm.max_conns}
                  onChange={(e) => setNodeForm((f) => ({ ...f, max_conns: Number(e.target.value) || 1 }))}
                />
              </div>
              <div className="flex items-end justify-between">
                <Label>启用</Label>
                <Switch
                  checked={nodeForm.enabled}
                  onCheckedChange={(v) => setNodeForm((f) => ({ ...f, enabled: v }))}
                />
              </div>
            </div>
            <div>
              <Label>备注</Label>
              <Input value={nodeForm.note} onChange={(e) => setNodeForm((f) => ({ ...f, note: e.target.value }))} />
            </div>
            <Button onClick={() => void saveNode()} disabled={savingNode}>
              {nodeSaveLabel()}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* 导入节点 */}
      <Sheet open={importOpen} onOpenChange={setImportOpen}>
        <SheetContent className="w-full sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>导入节点</SheetTitle>
            <SheetDescription>
              支持 clash/mihomo YAML 片段、base64 订阅、单条 ss/vmess/vless/trojan/socks5 链接（每行一条）。
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-3">
            <div>
              <Label>订阅 URL（可选）</Label>
              <Input
                value={importURL}
                onChange={(e) => setImportURL(e.target.value)}
                placeholder="https://example.com/sub?token=..."
                className="font-mono text-xs"
              />
              <p className="mt-1 text-muted-foreground text-xs">
                只拉取 http/https；也可以直接粘贴内容。两者都填时以粘贴内容为准。
              </p>
            </div>
            <Textarea
              rows={8}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={
                "proxies:\n  - {name: hk-01, type: trojan, server: hk01.example.com, port: 443, password: pw}"
              }
              className="font-mono text-xs"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>导入到池（可选）</Label>
                <Select value={importPool} onValueChange={setImportPool}>
                  <SelectTrigger>
                    <SelectValue placeholder="不加入池" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">不加入池</SelectItem>
                    {pools.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>标签（逗号分隔）</Label>
                <Input
                  value={importTags}
                  onChange={(e) => setImportTags(e.target.value)}
                  placeholder="hk,residential"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={doParse} disabled={parsing || !importText.trim()}>
                {parsing ? "解析中…" : "解析预览"}
              </Button>
              <Button onClick={doImport} disabled={importing || !importText.trim()}>
                {importing ? "导入中…" : "确认导入"}
              </Button>
            </div>
            {preview && (
              <div className="rounded-md border p-2 text-xs">
                <div className="mb-1">
                  识别到 <b>{preview.nodes?.length ?? 0}</b> 个节点
                  {preview.issues?.length ? `，${preview.issues.length} 行失败` : ""}
                </div>
                <div className="max-h-40 overflow-auto">
                  {(preview.nodes ?? []).map((n) => (
                    <div
                      key={`${n.protocol}-${n.server}-${n.port}`}
                      className="flex justify-between gap-2 border-b py-1 last:border-0"
                    >
                      <span className="truncate">{n.name}</span>
                      <span className="font-mono text-muted-foreground">
                        {n.protocol} · {n.server}:{n.port}
                      </span>
                    </div>
                  ))}
                  {(preview.issues ?? []).map((issue) => (
                    <div key={`${issue.raw ?? ""}-${issue.error}`} className="py-1 text-rose-500">
                      {issue.raw ? `${issue.raw.slice(0, 60)}… ` : ""}
                      {issue.error}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="text-muted-foreground text-xs">
              节点口令导入后立即 AES-GCM 加密；接口与页面都不会再回显。重复导入同一节点只会更新配置，不会重复创建。
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
