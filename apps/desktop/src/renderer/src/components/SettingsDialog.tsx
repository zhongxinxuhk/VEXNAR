import { useEffect, useState } from 'react'
import { FolderOpen, KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import type { SettingsInput } from '@shared/contracts'
import { useAppStore } from '@/store/app'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input
} from '@/components/ui'

const fieldClass =
  'flex h-9 w-full rounded-lg border border-line bg-panel-2 px-3 text-sm text-ink outline-none focus:ring-2 focus:ring-accent/50'

export function SettingsDialog(): React.JSX.Element {
  const open = useAppStore((state) => state.settingsOpen)
  const setOpen = useAppStore((state) => state.setSettingsOpen)
  const settings = useAppStore((state) => state.settings)
  const saveSettings = useAppStore((state) => state.saveSettings)
  const info = useAppStore((state) => state.info)
  const [draft, setDraft] = useState<SettingsInput>(settings)
  const [apiKey, setApiKey] = useState('')
  const [clearApiKey, setClearApiKey] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setDraft({
      theme: settings.theme,
      workspaceRoot: settings.workspaceRoot,
      shell: settings.shell,
      model: settings.model,
      baseUrl: settings.baseUrl
    })
    setApiKey('')
    setClearApiKey(false)
  }, [open, settings])

  const update = <K extends keyof SettingsInput>(key: K, value: SettingsInput[K]): void => {
    setDraft((previous) => ({ ...previous, [key]: value }))
  }

  const choose = async (): Promise<void> => {
    const result = await window.vexnar.workspace.choose()
    if (result.ok && result.data) update('workspaceRoot', result.data)
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    const ok = await saveSettings({
      ...draft,
      apiKey: apiKey.trim() || undefined,
      clearApiKey
    })
    setSaving(false)
    if (ok) setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Desktop settings
            <Badge variant="accent">independent</Badge>
          </DialogTitle>
          <DialogDescription>
            These preferences only apply to the Electron desktop client. The web console and Go
            backend are untouched.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-[120px_1fr] items-center gap-3">
            <label className="text-xs text-muted" htmlFor="theme">
              Theme
            </label>
            <select
              id="theme"
              value={draft.theme}
              onChange={(event) => update('theme', event.target.value as SettingsInput['theme'])}
              className={fieldClass}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">Follow system</option>
            </select>
          </div>

          <div className="grid grid-cols-[120px_1fr] items-start gap-3">
            <label className="pt-2 text-xs text-muted" htmlFor="workspace">
              Workspace
            </label>
            <div className="flex gap-2">
              <Input
                id="workspace"
                value={draft.workspaceRoot}
                onChange={(event) => update('workspaceRoot', event.target.value)}
                placeholder="/path/to/project"
                className="font-mono text-xs"
              />
              <Button variant="secondary" size="icon" onClick={() => void choose()} aria-label="Choose folder">
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-[120px_1fr] items-center gap-3">
            <label className="text-xs text-muted" htmlFor="shell">
              Shell
            </label>
            <Input
              id="shell"
              value={draft.shell}
              onChange={(event) => update('shell', event.target.value)}
              placeholder="Leave empty for $SHELL"
              className="font-mono text-xs"
            />
          </div>

          <div className="my-1 h-px bg-line-soft" />

          <div className="grid grid-cols-[120px_1fr] items-center gap-3">
            <label className="text-xs text-muted" htmlFor="model">
              Model
            </label>
            <Input
              id="model"
              value={draft.model}
              onChange={(event) => update('model', event.target.value)}
              placeholder="gpt-5-codex"
              className="font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-[120px_1fr] items-center gap-3">
            <label className="text-xs text-muted" htmlFor="baseUrl">
              Base URL
            </label>
            <Input
              id="baseUrl"
              value={draft.baseUrl}
              onChange={(event) => update('baseUrl', event.target.value)}
              placeholder="https://api.openai.com/v1"
              className="font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-[120px_1fr] items-start gap-3">
            <label className="pt-2 text-xs text-muted" htmlFor="apiKey">
              API key
            </label>
            <div>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
                <Input
                  id="apiKey"
                  type="password"
                  value={apiKey}
                  onChange={(event) => {
                    setApiKey(event.target.value)
                    setClearApiKey(false)
                  }}
                  placeholder={settings.hasApiKey ? '•••••••• (stored securely)' : 'Optional provider key'}
                  className="pl-9 font-mono text-xs"
                />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-[11px] text-muted">
                  <input
                    type="checkbox"
                    checked={clearApiKey}
                    onChange={(event) => {
                      setClearApiKey(event.target.checked)
                      if (event.target.checked) setApiKey('')
                    }}
                    className="accent-[var(--color-accent)]"
                  />
                  Clear stored key
                </label>
                <span className="ml-auto flex items-center gap-1 font-mono text-[10px] text-muted/70">
                  <ShieldCheck className="h-3 w-3" /> safeStorage
                </span>
              </div>
            </div>
          </div>

          {!apiKey && !settings.hasApiKey ? (
            <div className="rounded-lg border border-line bg-panel-2/60 px-3 py-2 font-mono text-[10px] leading-5 text-muted">
              No provider key configured. The agent runtime will use its local inspection fallback.
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <span className="mr-auto font-mono text-[10px] text-muted/60">
            v{info?.version ?? '0.1.0'} · {info?.platform ?? 'desktop'}
          </span>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
