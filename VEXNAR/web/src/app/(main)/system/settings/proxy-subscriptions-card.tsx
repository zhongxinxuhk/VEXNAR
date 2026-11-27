"use client";

import * as React from "react";

import { PlusIcon, RefreshCwIcon, SatelliteIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import type { ProxyPool, ProxySubscription } from "@/lib/types";

const emptyForm: Partial<ProxySubscription> = {
  name: "",
  url: "",
  pool_id: 0,
  interval_seconds: 3600,
  enabled: true,
};

function fmtTime(v?: string) {
  if (!v || v.startsWith("0001")) return "从未";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

// ProxySubscriptionsCard 维护托管订阅：定时拉取、与上次结果做差异（新增/移除/改名），
// 把节点写入代理池。手动导入的节点不会被订阅刷新删除。
export function ProxySubscriptionsCard() {
  const [subs, setSubs] = React.useState<ProxySubscription[]>([]);
  const [pools, setPools] = React.useState<ProxyPool[]>([]);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<Partial<ProxySubscription>>(emptyForm);
  const [busy, setBusy] = React.useState(false);
  const [preview, setPreview] = React.useState<{ count: number; issues: number } | null>(null);

  const load = React.useCallback(() => {
    api
      .proxySubscriptions()
      .then(setSubs)
      .catch(() => undefined);
    api
      .proxyPools()
      .then(setPools)
      .catch(() => undefined);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  function openForm(sub?: ProxySubscription) {
    setForm(sub ? { ...sub } : { ...emptyForm });
    setPreview(null);
    setOpen(true);
  }

  async function save() {
    if (!form.name?.trim() || !form.url?.trim()) {
      toast.error("名称与订阅 URL 必填");
      return;
    }
    setBusy(true);
    try {
      await api.saveProxySubscription(form);
      toast.success(form.id ? "订阅已更新" : "订阅已添加，后台会按间隔刷新");
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function refresh(sub: ProxySubscription) {
    setBusy(true);
    try {
      const res = await api.refreshProxySubscription(sub.id);
      toast.success(`刷新完成：新增 ${res.added}，移除 ${res.removed}，改名 ${res.changed}`);
      if (res.issues?.length) toast.warning(`${res.issues.length} 行未识别`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "刷新失败");
    } finally {
      setBusy(false);
    }
  }

  async function remove(sub: ProxySubscription) {
    setBusy(true);
    try {
      await api.deleteProxySubscription(sub.id);
      toast.success("订阅已删除（已导入节点保留）");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  async function doPreview() {
    if (!form.url?.trim()) {
      toast.error("先填订阅 URL");
      return;
    }
    setBusy(true);
    try {
      const res = await api.previewProxySubscription(form.url.trim());
      setPreview({ count: res.nodes?.length ?? 0, issues: res.issues?.length ?? 0 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "拉取失败");
    } finally {
      setBusy(false);
    }
  }

  function saveLabel() {
    if (busy) return "保存中…";
    return form.id ? "保存修改" : "添加订阅";
  }

  return (
    <Card className="mb-4 break-inside-avoid md:mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SatelliteIcon className="size-4" />
          代理池订阅
        </CardTitle>
        <CardDescription>
          托管 clash / base64 订阅链接：按间隔自动拉取，与上一版做差异（新增 / 移除 /
          改名）后写入节点库，并可自动加入指定代理池。 手动添加的节点不受订阅刷新影响；删除订阅不会删除已导入节点。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={busy}>
            <RefreshCwIcon className="size-4" /> 刷新列表
          </Button>
          <Button size="sm" onClick={() => openForm()}>
            <PlusIcon className="size-4" /> 添加订阅
          </Button>
          <span className="text-muted-foreground text-xs">在「代理池」页管理节点与池绑定</span>
        </div>

        {subs.length === 0 ? (
          <div className="py-4 text-muted-foreground text-sm">还没有托管订阅。添加一个订阅链接即可定时同步节点。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-muted-foreground text-xs">
                <tr className="border-b">
                  <th className="py-2 pr-2">名称</th>
                  <th className="py-2 pr-2">订阅 URL</th>
                  <th className="py-2 pr-2">目标池</th>
                  <th className="py-2 pr-2">间隔</th>
                  <th className="py-2 pr-2">最后刷新</th>
                  <th className="py-2 pr-2">差异</th>
                  <th className="py-2 pr-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-2">
                        {s.name}
                        {!s.enabled && <Badge variant="outline">停用</Badge>}
                      </div>
                      {s.last_error && (
                        <div className="max-w-[220px] truncate text-rose-500 text-xs">{s.last_error}</div>
                      )}
                    </td>
                    <td className="max-w-[260px] truncate py-2 pr-2 font-mono text-muted-foreground text-xs">
                      {s.url}
                    </td>
                    <td className="py-2 pr-2 text-xs">{pools.find((p) => p.id === s.pool_id)?.name ?? "—"}</td>
                    <td className="py-2 pr-2 text-xs">{Math.round(s.interval_seconds / 60)} 分钟</td>
                    <td className="py-2 pr-2 text-xs">{fmtTime(s.last_fetch_at)}</td>
                    <td className="py-2 pr-2 text-xs">
                      <span className="text-emerald-600">+{s.last_added}</span>{" "}
                      <span className="text-rose-500">-{s.last_removed}</span>{" "}
                      <span className="text-muted-foreground">~{s.last_changed}</span>
                    </td>
                    <td className="py-2 pr-2">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => refresh(s)} disabled={busy}>
                          立即刷新
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openForm(s)} disabled={busy}>
                          编辑
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(s)} disabled={busy}>
                          <Trash2Icon className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{form.id ? "编辑订阅" : "添加订阅"}</SheetTitle>
            <SheetDescription>支持 clash/mihomo YAML 与 base64 订阅；只接受 http/https。</SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-3">
            <div>
              <Label>名称</Label>
              <Input value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>订阅 URL</Label>
              <Input
                value={form.url ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value, id: f.id }))}
                placeholder="https://example.com/api/v1/client/subscribe?token=..."
                className="font-mono text-xs"
              />
              <div className="mt-1 flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={doPreview} disabled={busy}>
                  预览解析
                </Button>
                {preview && (
                  <span className="text-muted-foreground text-xs">
                    识别 {preview.count} 个节点
                    {preview.issues ? `，${preview.issues} 行失败` : ""}
                  </span>
                )}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>自动加入池</Label>
                <Select
                  value={form.pool_id ? String(form.pool_id) : "0"}
                  onValueChange={(v) => setForm((f) => ({ ...f, pool_id: Number(v) }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="不加入" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">不加入</SelectItem>
                    {pools.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>刷新间隔（分钟）</Label>
                <Input
                  type="number"
                  min={5}
                  value={Math.max(5, Math.round((form.interval_seconds ?? 3600) / 60))}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, interval_seconds: Math.max(5, Number(e.target.value) || 60) * 60 }))
                  }
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>启用定时刷新</Label>
                <p className="text-muted-foreground text-xs">关闭后只能手动刷新。</p>
              </div>
              <Switch checked={form.enabled ?? true} onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
            </div>
            <Button onClick={save} disabled={busy}>
              {saveLabel()}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
