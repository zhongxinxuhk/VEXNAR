import { useEffect, useState } from 'react'
import { FolderOpen, KeyRound, Loader2, ShieldCheck } from 'lucide-react'
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
      displayName: settings.displayName,
      avatarColor: settings.avatarColor,
      workspaceRoot: settings.workspaceRoot,
      shell: settings.shell,
      model: settings.model,
      baseUrl: settings.baseUrl
    })
    setApiKey('')
    setClearApiKey(false)
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
      <DialogContent className="max-h-[min(720px,88vh)] w-[min(580px,calc(100vw-32px))] overflow-y-auto rounded-2xl border-line bg-bg p-5 codex-popover">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-[15px] font-semibold">{t('settings.title')}</DialogTitle>
        </DialogHeader>

        <div id="settings-top" className="space-y-4">
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
              <Input
                id="model"
                value={draft.model}
                onChange={(event) => update('model', event.target.value)}
                placeholder="gpt-5-codex"
                className="h-8 font-mono text-[11.5px]"
              />
            </Row>
            <Row label={t('settings.baseUrl')} htmlFor="baseUrl">
              <Input
                id="baseUrl"
                value={draft.baseUrl}
                onChange={(event) => update('baseUrl', event.target.value)}
                placeholder="https://api.openai.com/v1"
                className="h-8 font-mono text-[11.5px]"
              />
            </Row>
            <Row label={t('settings.apiKey')} htmlFor="apiKey">
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted" />
                <Input
                  id="apiKey"
                  type="password"
                  value={apiKey}
                  onChange={(event) => {
                    setApiKey(event.target.value)
                    setClearApiKey(false)
                  }}
                  placeholder={
                    settings.hasApiKey
                      ? `•••••••• (${t('settings.apiKeyStored')})`
                      : t('settings.apiKeyPlaceholder')
                  }
                  className="h-8 pl-8 font-mono text-[11.5px]"
                />
              </div>
            </Row>
            {settings.hasApiKey ? (
              <Row label="">
                <label className="flex items-center gap-1.5 text-[11.5px] text-muted">
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
                  <span className="ml-auto flex items-center gap-1 font-mono text-[10px] text-muted/70">
                    <ShieldCheck className="h-3 w-3" /> {t('settings.safeStorage')}
                  </span>
                </label>
              </Row>
            ) : null}
            {!apiKey && !settings.hasApiKey ? (
              <div className="rounded-lg bg-panel px-2.5 py-2 font-mono text-[10.5px] leading-5 text-muted">
                {t('settings.noKey')}
              </div>
            ) : null}
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