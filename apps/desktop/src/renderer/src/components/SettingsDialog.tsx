import { useEffect, useState } from 'react'
import { FolderOpen, KeyRound, Languages, Loader2, ShieldCheck } from 'lucide-react'
import type { SettingsInput } from '@shared/contracts'
import { useAppStore } from '@/store/app'
import { useI18n, useT } from '@/lib/i18n'
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
  'flex h-9 w-full rounded-lg border border-line bg-panel-2 px-3 text-sm text-ink outline-none focus:ring-2 focus:ring-accent/40'

export function SettingsDialog(): React.JSX.Element {
  const open = useAppStore((state) => state.settingsOpen)
  const setOpen = useAppStore((state) => state.setSettingsOpen)
  const settings = useAppStore((state) => state.settings)
  const saveSettings = useAppStore((state) => state.saveSettings)
  const info = useAppStore((state) => state.info)
  const locale = useI18n((state) => state.locale)
  const setLocale = useI18n((state) => state.setLocale)
  const t = useT()
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
      baseUrl: settings.baseUrl,
      backendUrl: settings.backendUrl
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
      <DialogContent className="max-h-[min(720px,90vh)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t('settings.title')}
            <Badge variant="accent">electron</Badge>
          </DialogTitle>
          <DialogDescription>{t('settings.description')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-[132px_1fr] items-center gap-3">
            <label className="text-xs text-muted" htmlFor="theme">
              {t('settings.theme')}
            </label>
            <select
              id="theme"
              value={draft.theme}
              onChange={(event) => update('theme', event.target.value as SettingsInput['theme'])}
              className={fieldClass}
            >
              <option value="dark">{t('settings.theme.dark')}</option>
              <option value="light">{t('settings.theme.light')}</option>
              <option value="system">{t('settings.theme.system')}</option>
            </select>
          </div>

          <div className="grid grid-cols-[132px_1fr] items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-muted" htmlFor="locale">
              <Languages className="h-3.5 w-3.5" />
              {t('settings.language')}
            </label>
            <select
              id="locale"
              value={locale}
              onChange={(event) => setLocale(event.target.value === 'en' ? 'en' : 'zh')}
              className={fieldClass}
            >
              <option value="zh">{t('app.chinese')}</option>
              <option value="en">English</option>
            </select>
          </div>

          <div className="grid grid-cols-[132px_1fr] items-start gap-3">
            <label className="pt-2 text-xs text-muted" htmlFor="workspace">
              {t('settings.workspace')}
            </label>
            <div className="flex gap-2">
              <Input
                id="workspace"
                value={draft.workspaceRoot}
                onChange={(event) => update('workspaceRoot', event.target.value)}
                placeholder="/path/to/project"
                className="font-mono text-xs"
              />
              <Button variant="secondary" size="icon" onClick={() => void choose()} aria-label={t('app.chooseFolder')}>
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-[132px_1fr] items-center gap-3">
            <label className="text-xs text-muted" htmlFor="shell">
              {t('settings.shell')}
            </label>
            <Input
              id="shell"
              value={draft.shell}
              onChange={(event) => update('shell', event.target.value)}
              placeholder={t('settings.shellPlaceholder')}
              className="font-mono text-xs"
            />
          </div>

          <div className="my-1 h-px bg-line-soft" />

          <div className="grid grid-cols-[132px_1fr] items-center gap-3">
            <label className="text-xs text-muted" htmlFor="backendUrl">
              {t('settings.backendUrl')}
            </label>
            <Input
              id="backendUrl"
              value={draft.backendUrl}
              onChange={(event) => update('backendUrl', event.target.value)}
              placeholder="http://127.0.0.1:8787"
              className="font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-[132px_1fr] items-center gap-3">
            <label className="text-xs text-muted" htmlFor="model">
              {t('settings.model')}
            </label>
            <Input
              id="model"
              value={draft.model}
              onChange={(event) => update('model', event.target.value)}
              placeholder="gpt-5-codex"
              className="font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-[132px_1fr] items-center gap-3">
            <label className="text-xs text-muted" htmlFor="baseUrl">
              {t('settings.baseUrl')}
            </label>
            <Input
              id="baseUrl"
              value={draft.baseUrl}
              onChange={(event) => update('baseUrl', event.target.value)}
              placeholder="https://api.openai.com/v1"
              className="font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-[132px_1fr] items-start gap-3">
            <label className="pt-2 text-xs text-muted" htmlFor="apiKey">
              {t('settings.apiKey')}
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
                  placeholder={
                    settings.hasApiKey ? `•••••••• (${t('settings.apiKeyStored')})` : t('settings.apiKeyPlaceholder')
                  }
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
                  {t('settings.clearApiKey')}
                </label>
                <span className="ml-auto flex items-center gap-1 font-mono text-[10px] text-muted/70">
                  <ShieldCheck className="h-3 w-3" /> {t('settings.safeStorage')}
                </span>
              </div>
            </div>
          </div>

          {!apiKey && !settings.hasApiKey ? (
            <div className="rounded-lg border border-line bg-panel-2/60 px-3 py-2 font-mono text-[10px] leading-5 text-muted">
              {t('settings.noKey')}
            </div>
          ) : null}

          <div className="rounded-lg border border-line bg-panel-2/50 px-3 py-2 font-mono text-[10px] leading-5 text-muted">
            {t('settings.backendUrlHint')} · {settings.hasBackendToken ? t('settings.tokenStored') : t('system.noToken')}
          </div>
        </div>

        <DialogFooter>
          <span className="mr-auto font-mono text-[10px] text-muted/60">
            v{info?.version ?? '0.1.0'} · {info?.platform ?? 'desktop'}
          </span>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t('app.cancel')}
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t('app.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
