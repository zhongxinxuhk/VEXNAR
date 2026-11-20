import { useEffect, useRef, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  ChevronRight,
  CircleHelp,
  CircleUserRound,
  LogOut,
  Palette,
  Settings,
  Sparkles,
  UserPlus
} from 'lucide-react'
import type { AvatarColor } from '@shared/contracts'
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input } from '@/components/ui'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app'

const AVATAR_COLORS: Array<{ id: AvatarColor; className: string }> = [
  { id: 'orange', className: 'bg-[#d97736]' },
  { id: 'blue', className: 'bg-[#3b82f6]' },
  { id: 'green', className: 'bg-[#2f9e44]' },
  { id: 'purple', className: 'bg-[#8b5cf6]' },
  { id: 'rose', className: 'bg-[#e11d48]' },
  { id: 'slate', className: 'bg-[#475569]' }
]

const AVATAR_CLASS: Record<AvatarColor, string> = Object.fromEntries(
  AVATAR_COLORS.map((color) => [color.id, color.className])
) as Record<AvatarColor, string>

const menuItem =
  'flex cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[12.5px] text-ink-soft outline-none data-[highlighted]:bg-panel-2 data-[highlighted]:text-ink'

function avatarInitials(name: string): string {
  const cleaned = name.trim()
  if (!cleaned) return 'V'
  if (/[\u3400-\u9fff]/.test(cleaned)) return Array.from(cleaned)[0] ?? 'V'
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
  }
  return cleaned.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'V'
}

export function ProfileAvatar({
  name,
  color,
  size = 'md',
  className
}: {
  name: string
  color: AvatarColor
  size?: 'sm' | 'md' | 'lg'
  className?: string
}): React.JSX.Element {
  const sizes = {
    sm: 'h-7 w-7 text-[10px]',
    md: 'h-8 w-8 text-[11px]',
    lg: 'h-12 w-12 text-[16px]'
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center rounded-full font-semibold text-white shadow-sm ring-1 ring-black/5',
        sizes[size],
        AVATAR_CLASS[color],
        className
      )}
    >
      {avatarInitials(name)}
    </span>
  )
}

function MenuRow({
  icon,
  label,
  shortcut,
  trailing,
  onSelect
}: {
  icon: React.ReactNode
  label: string
  shortcut?: string
  trailing?: React.ReactNode
  onSelect: () => void
}): React.JSX.Element {
  return (
    <DropdownMenu.Item className={menuItem} onSelect={onSelect}>
      <span className="grid h-4 w-4 shrink-0 place-items-center text-ink-soft">{icon}</span>
      <span className="truncate">{label}</span>
      {shortcut ? (
        <span className="ml-auto shrink-0 font-mono text-[10.5px] text-muted/75">{shortcut}</span>
      ) : null}
      {trailing ? <span className="ml-auto shrink-0 text-muted">{trailing}</span> : null}
    </DropdownMenu.Item>
  )
}

function Shortcut({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <span className="rounded-md border border-line-soft bg-panel px-1.5 py-0.5 font-mono text-[10px] text-ink-soft">
      {children}
    </span>
  )
}

function ShortcutRow({ keys, label }: { keys: string; label: string }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="text-[12px] text-ink-soft">{label}</span>
      <Shortcut>{keys}</Shortcut>
    </div>
  )
}

function ProfileDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const t = useT()
  const settings = useAppStore((state) => state.settings)
  const updateProfile = useAppStore((state) => state.updateProfile)
  const [name, setName] = useState('')
  const [color, setColor] = useState<AvatarColor>('orange')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(settings.displayName)
    setColor(settings.avatarColor)
    setError(null)
  }, [open, settings.displayName, settings.avatarColor])

  const preview = name.trim() || t('profile.defaultName')

  const save = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    const ok = await updateProfile({ displayName: name.trim(), avatarColor: color })
    setSaving(false)
    if (ok) onOpenChange(false)
    else setError(t('app.error'))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(440px,calc(100vw-32px))] rounded-2xl border-line bg-bg p-5 codex-popover">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">{t('profile.profileTitle')}</DialogTitle>
        </DialogHeader>

        <div className="mb-4 flex items-center gap-3 rounded-xl border border-line-soft bg-panel px-3 py-3">
          <ProfileAvatar name={preview} color={color} size="lg" />
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-medium text-ink">{preview}</div>
            <div className="mt-0.5 text-[11.5px] text-muted">{t('profile.plan')}</div>
          </div>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[11.5px] font-medium text-muted">
              {t('profile.displayName')}
            </span>
            <Input
              value={name}
              maxLength={80}
              autoFocus
              onChange={(event) => setName(event.target.value)}
              placeholder={t('profile.defaultName')}
              className="h-8 text-[12.5px]"
            />
          </label>

          <div>
            <span className="mb-1.5 block text-[11.5px] font-medium text-muted">
              {t('profile.avatarColor')}
            </span>
            <div className="flex items-center gap-2">
              {AVATAR_COLORS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-label={t(`profile.color.${item.id}`)}
                  aria-pressed={color === item.id}
                  onClick={() => setColor(item.id)}
                  className={cn(
                    'h-6 w-6 rounded-full ring-offset-2 ring-offset-bg transition-transform hover:scale-110',
                    item.className,
                    color === item.id ? 'ring-2 ring-ink/70' : 'ring-1 ring-black/10'
                  )}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-[86px_1fr] gap-y-2 rounded-xl border border-line-soft px-3 py-2.5 text-[12px]">
            <span className="text-muted">{t('profile.planLabel')}</span>
            <span className="text-ink-soft">{t('profile.plan')}</span>
            <span className="text-muted">{t('profile.runtimeLabel')}</span>
            <span className="text-ink-soft">{t('profile.runtime')}</span>
          </div>

          <p className="text-[11px] leading-5 text-muted">{t('profile.profileDescription')}</p>
          {error ? <p className="text-[11.5px] text-danger">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {t('app.cancel')}
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={saving}>
            {t('app.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function HelpDialog({
  open,
  onOpenChange,
  mac
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mac: boolean
}): React.JSX.Element {
  const t = useT()
  const info = useAppStore((state) => state.info)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(460px,calc(100vw-32px))] rounded-2xl border-line bg-bg p-5 codex-popover">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">{t('profile.helpTitle')}</DialogTitle>
        </DialogHeader>
        <p className="text-[12px] leading-6 text-muted">{t('profile.helpIntro')}</p>

        <div className="mt-4 overflow-hidden rounded-xl border border-line-soft">
          <div className="border-b border-line-soft bg-panel px-3 py-2 text-[11px] font-medium text-muted">
            {t('profile.shortcuts')}
          </div>
          <div className="divide-y divide-line-soft">
            <ShortcutRow
              keys={`${mac ? '⌘' : 'Ctrl+'}N`}
              label={t('profile.shortcut.newChat')}
            />
            <ShortcutRow
              keys={`${mac ? '⌘' : 'Ctrl+'},`}
              label={t('profile.shortcut.settings')}
            />
            <ShortcutRow
              keys={`${mac ? '⌘' : 'Ctrl+'}B`}
              label={t('profile.shortcut.panel')}
            />
            <ShortcutRow
              keys={mac ? '⌥Space' : 'Alt+Space'}
              label={t('profile.shortcut.companion')}
            />
            <ShortcutRow keys="Enter / Shift+Enter" label={t('profile.shortcut.send')} />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-[10.5px] text-muted">
          <span>VEXNAR Desktop</span>
          <span className="font-mono">
            v{info?.version ?? '0.1.0'} · {info?.platform ?? 'desktop'}
          </span>
        </div>

        <DialogFooter>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            {t('app.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LogoutDialog({
  open,
  onOpenChange,
  onReset
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onReset: () => Promise<boolean>
}): React.JSX.Element {
  const t = useT()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) setError(null)
  }, [open])

  const reset = async (): Promise<void> => {
    setSaving(true)
    const ok = await onReset()
    setSaving(false)
    if (ok) onOpenChange(false)
    else setError(t('app.error'))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(430px,calc(100vw-32px))] rounded-2xl border-line bg-bg p-5 codex-popover">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">{t('profile.logoutTitle')}</DialogTitle>
        </DialogHeader>
        <p className="text-[12.5px] leading-6 text-muted">{t('profile.logoutBody')}</p>
        {error ? <p className="mt-2 text-[11.5px] text-danger">{error}</p> : null}
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {t('app.cancel')}
          </Button>
          <Button variant="danger" size="sm" onClick={() => void reset()} disabled={saving}>
            {t('profile.resetProfile')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ProfileMenu(): React.JSX.Element {
  const t = useT()
  const settings = useAppStore((state) => state.settings)
  const info = useAppStore((state) => state.info)
  const openSettings = useAppStore((state) => state.openSettings)
  const setRightTab = useAppStore((state) => state.setRightTab)
  const updateProfile = useAppStore((state) => state.updateProfile)
  const [dialog, setDialog] = useState<'profile' | 'help' | 'logout' | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)

  const mac =
    (info?.platform ?? (navigator.userAgent.includes('Mac') ? 'darwin' : '')) === 'darwin'
  const displayName = settings.displayName.trim() || t('profile.defaultName')

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
    },
    []
  )

  const notify = (message: string): void => {
    setToast(message)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }

  const copyInvite = async (): Promise<void> => {
    const text = t('profile.inviteText', { version: info?.version ?? '0.1.0' })
    const result = await window.vexnar.app.copyText(text)
    notify(result.ok ? t('profile.inviteCopied') : result.error || t('profile.copyFailed'))
  }

  const resetProfile = async (): Promise<boolean> => {
    const ok = await updateProfile({ displayName: '', avatarColor: 'orange' })
    if (ok) notify(t('profile.resetDone'))
    return ok
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label={t('rail.account')}
            className="no-drag rounded-full outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <ProfileAvatar name={displayName} color={settings.avatarColor} size="sm" />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="right"
            align="end"
            sideOffset={10}
            collisionPadding={12}
            className="z-50 w-[262px] rounded-xl border border-line bg-bg p-1.5 codex-popover outline-none"
          >
            <div className="flex items-start gap-2.5 px-2 py-2">
              <ProfileAvatar name={displayName} color={settings.avatarColor} />
              <div className="min-w-0 pt-0.5">
                <div className="truncate text-[13px] font-medium leading-4 text-ink">
                  {displayName}
                </div>
                <div className="mt-0.5 text-[11px] leading-4 text-muted">{t('profile.plan')}</div>
              </div>
            </div>
            <div className="px-2 pb-2 text-[11.5px] text-muted">{t('profile.runtime')}</div>
            <DropdownMenu.Separator className="my-1 h-px bg-line-soft" />

            <MenuRow
              icon={<Sparkles className="h-4 w-4" strokeWidth={1.8} />}
              label={t('profile.companion')}
              shortcut={mac ? '⌥Space' : 'Alt+Space'}
              onSelect={() => setRightTab('workspace')}
            />
            <MenuRow
              icon={<UserPlus className="h-4 w-4" strokeWidth={1.8} />}
              label={t('profile.invite')}
              onSelect={() => void copyInvite()}
            />
            <MenuRow
              icon={<Palette className="h-4 w-4" strokeWidth={1.8} />}
              label={t('profile.personalize')}
              onSelect={() => openSettings('appearance')}
            />
            <MenuRow
              icon={<CircleUserRound className="h-4 w-4" strokeWidth={1.8} />}
              label={t('profile.profile')}
              onSelect={() => setDialog('profile')}
            />
            <MenuRow
              icon={<Settings className="h-4 w-4" strokeWidth={1.8} />}
              label={t('app.settings')}
              shortcut={mac ? '⌘,' : 'Ctrl+,'}
              onSelect={() => openSettings('general')}
            />

            <DropdownMenu.Separator className="my-1 h-px bg-line-soft" />
            <MenuRow
              icon={<CircleHelp className="h-4 w-4" strokeWidth={1.8} />}
              label={t('profile.help')}
              trailing={<ChevronRight className="h-3.5 w-3.5" />}
              onSelect={() => setDialog('help')}
            />

            <DropdownMenu.Separator className="my-1 h-px bg-line-soft" />
            <MenuRow
              icon={<LogOut className="h-4 w-4" strokeWidth={1.8} />}
              label={t('profile.logout')}
              onSelect={() => setDialog('logout')}
            />
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <ProfileDialog
        open={dialog === 'profile'}
        onOpenChange={(open) => setDialog(open ? 'profile' : null)}
      />
      <HelpDialog
        open={dialog === 'help'}
        onOpenChange={(open) => setDialog(open ? 'help' : null)}
        mac={mac}
      />
      <LogoutDialog
        open={dialog === 'logout'}
        onOpenChange={(open) => setDialog(open ? 'logout' : null)}
        onReset={resetProfile}
      />

      {toast ? (
        <div
          role="status"
          className="fixed bottom-[68px] left-[68px] z-[60] max-w-[280px] rounded-lg border border-line bg-bg px-3 py-2 text-[12px] text-ink codex-popover"
        >
          {toast}
        </div>
      ) : null}
    </>
  )
}