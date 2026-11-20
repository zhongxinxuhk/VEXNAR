import { useEffect, useState } from 'react'
import { FolderOpen, Loader2, RefreshCw } from 'lucide-react'
import type { SettingsInput } from '@shared/contracts'
import { useAppStore } from '@/store/app'
import { useI18n, useT } from '@/lib/i18n'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input
} from '@/components/ui'

const fieldClass =
  'flex h-8 w-full rounded-lg border border-line bg-bg px-2.5 text-[12.5px] text-ink outline-none transition-shadow focus:ring-2 focus:ring-accent/25'

function Section({
  id,
  title,
  children
}: {
  id?: string
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section id={id} className="scroll-mt-4 border-t border-line-soft pt-4 first:border-t-0 first:pt-0">
      <h3 className="mb-2.5 text-[11px] font-medium text-muted">{title}</h3>
      <div className="space-y-2.5">{children}</div>
    </section>
  )
}

function Row({
  label,
  htmlFor,
  children
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-[118px_1fr] items-center gap-3">
      <label htmlFor={htmlFor} className="text-[12.5px] text-ink-soft">
        {label}
      </label>
      {children}
    </div>
  )
}

export function SettingsDialog(): React.JSX.Element {
  const open = useAppStore((state) => state.settingsOpen)
  const setOpen = useAppStore((state) => state.setSettingsOpen)
  const settings = useAppStore((state) => state.settings)
  const settingsSection = useAppStore((state) => state.settingsSection)
  const saveSettings = useAppStore((state) => state.saveSettings)
  const refreshNewApi = useAppStore((state) => state.refreshNewApi)
  const newApi = useAppStore((state) => state.newApi)
  const info = useAppStore((state) => state.info)
  const locale = useI18n((state) => state.locale)
  const setLocale = useI18n((state) => state.setLocale)
  const t = useT()
  const [draft, setDraft] = useState<SettingsInput>(settings)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    if (!open) return
    setDraft({
      theme: settings.theme,
      displayName: settings.displayName,
      avatarColor: settings.avatarColor,
      workspaceRoot: settings.workspaceRoot,
      shell: settings.shell,
      model: settings.model,
      newApiModels: settings.newApiModels,
      baseUrl: settings.baseUrl
    })
  }, [open, settings])

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      const id = settingsSection === 'general' ? 'settings-top' : `settings-${settingsSection}`
      document.getElementById(id)?.scrollIntoView({ block: 'start' })
    })
    return () => cancelAnimationFrame(frame)
  }, [open, settingsSection])

  const update = <K extends keyof SettingsInput>(key: K, value: SettingsInput[K]): void => {
    setDraft((previous) => ({ ...previous, [key]: value }))
  }

  const choose = async (): Promise<void> => {
    const result = await window.vexnar.workspace.choose()
    if (result.ok && result.data) update('workspaceRoot', result.data)
  }

  const syncModels = async (): Promise<void> => {
    setSyncing(true)
    await refreshNewApi()
    const latest = useAppStore.getState().settings
    setDraft({
      theme: latest.theme,
      displayName: latest.displayName,
      avatarColor: latest.avatarColor,
      workspaceRoot: latest.workspaceRoot,
      shell: latest.shell,
      model: latest.model,
      newApiModels: latest.newApiModels,
      baseUrl: latest.baseUrl
    })
    setSyncing(false)
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    const ok = await saveSettings(draft)
    setSaving(false)
    if (ok) setOpen(false)
  }

  const models = draft.newApiModels.length > 0 ? draft.newApiModels : settings.newApiModels
  const currentModel = draft.model
  const modelOptions = models.includes(currentModel) || !currentModel ? models : [currentModel, ...models]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[min(720px,88vh)] w-[min(580px,calc(100vw-32px))] overflow-y-auto rounded-2xl border-line bg-bg p-5 codex-popover">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-[15px] font-semibold">{t('settings.title')}</DialogTitle>
        </DialogHeader>

        <div id="settings-top" className="space-y-4">
          <Section id="settings-account" title={t('settings.accountSection')}>
            <div className="rounded-xl border border-line-soft bg-panel/60 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-ink">
                  {newApi?.user?.displayName || newApi?.user?.username || t('settings.notConnected')}
                </span>
                <span className="rounded-full border border-line-soft bg-bg px-1.5 py-0.5 text-[9.5px] text-muted">
                  {newApi?.user?.group || 'HXSEC'}
                </span>
                <span className="ml-auto text-[10px] text-muted">
                  {newApi?.authenticated ? t('settings.connected') : t('settings.notConnected')}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-muted">
                {newApi?.user?.email || 'platform.sec.hn.cn'}
              </div>
            </div>
            <Row label={t('settings.managedKey')}>
              <div className="flex min-w-0 items-center gap-2 rounded-lg border border-line-soft bg-panel px-2.5 py-1.5">
                <span className="truncate font-mono text-[11px] text-ink-soft">
                  {newApi?.token?.maskedKey || t('settings.keyPending')}
                </span>
                <span className="ml-auto shrink-0 text-[10px] text-muted">
                  {t('settings.managedKeyHint')}
                </span>
              </div>
            </Row>
            <Row label={t('settings.relayUrl')}>
              <div className="rounded-lg border border-line-soft bg-panel px-2.5 py-1.5 font-mono text-[11px] text-ink-soft">
                https://api.sec.hn.cn/v1
              </div>
            </Row>
          </Section>

          <Section id="settings-appearance" title={t('app.appearance')}>
            <Row label={t('settings.theme')} htmlFor="theme">
              <select
                id="theme"
                value={draft.theme}
                onChange={(event) => update('theme', event.target.value as SettingsInput['theme'])}
                className={fieldClass}
              >
                <option value="light">{t('settings.theme.light')}</option>
                <option value="dark">{t('settings.theme.dark')}</option>
                <option value="system">{t('settings.theme.system')}</option>
              </select>
            </Row>
            <Row label={t('settings.language')} htmlFor="locale">
              <select
                id="locale"
                value={locale}
                onChange={(event) => setLocale(event.target.value === 'en' ? 'en' : 'zh')}
                className={fieldClass}
              >
                <option value="zh">{t('app.chinese')}</option>
                <option value="en">English</option>
              </select>
            </Row>
          </Section>

          <Section id="settings-workspace" title={t('settings.workspaceSection')}>
            <Row label={t('settings.workspace')} htmlFor="workspace">
              <div className="flex gap-1.5">
                <Input
                  id="workspace"
                  value={draft.workspaceRoot}
                  onChange={(event) => update('workspaceRoot', event.target.value)}
                  placeholder="/path/to/project"
                  className="h-8 font-mono text-[11.5px]"
                />
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-8 w-8 shrink-0 rounded-lg"
                  onClick={() => void choose()}
                  aria-label={t('app.chooseFolder')}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Row>
            <Row label={t('settings.shell')} htmlFor="shell">
              <Input
                id="shell"
                value={draft.shell}
                onChange={(event) => update('shell', event.target.value)}
                placeholder={t('settings.shellPlaceholder')}
                className="h-8 font-mono text-[11.5px]"
              />
            </Row>
          </Section>

          <Section id="settings-model" title={t('settings.modelSection')}>
            <Row label={t('settings.model')} htmlFor="model">
              <select
                id="model"
                value={draft.model}
                onChange={(event) => update('model', event.target.value)}
                className={fieldClass}
              >
                {modelOptions.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </Row>
            <div className="flex items-center gap-2 rounded-lg bg-panel px-2.5 py-2 text-[10.5px] leading-5 text-muted">
              <span className="min-w-0 flex-1">{t('settings.modelsHint')}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 shrink-0 gap-1 px-1.5 text-[10px]"
                disabled={syncing}
                onClick={() => void syncModels()}
              >
                <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
                {t('settings.syncModels')}
              </Button>
            </div>
          </Section>

          <Section id="settings-runtime" title={t('settings.runtimeSection')}>
            <p className="rounded-lg bg-panel px-2.5 py-2 text-[11.5px] leading-5 text-muted">
              {t('settings.aboutLine')}
            </p>
          </Section>
        </div>

        <DialogFooter className="mt-5 items-center">
          <span className="mr-auto font-mono text-[10px] text-muted/60">
            v{info?.version ?? '0.1.0'} · {info?.platform ?? 'desktop'}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            {t('app.cancel')}
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {t('app.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}