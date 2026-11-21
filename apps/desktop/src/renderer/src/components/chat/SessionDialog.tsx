// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState, type FormEvent } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input } from '@/components/ui'
import { useT } from '@/lib/i18n'
import { useAppStore } from '@/store/app'
import type { Session } from '@shared/contracts'

export type SessionAction = 'rename' | 'delete'

export function SessionDialog({ action, session, close }: {
  action: SessionAction
  session: Session
  close: () => void
}): React.JSX.Element {
  const t = useT()
  const rename = useAppStore((state) => state.renameSession)
  const remove = useAppStore((state) => state.removeSession)
  const [title, setTitle] = useState(session.title)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const normalized = title.trim()
  const deleting = action === 'delete'
  const invalid = !deleting && (!normalized || normalized === session.title || [...normalized].length > 160)
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (busy || invalid) return
    setBusy(true)
    setError('')
    try {
      if (deleting) {
        if (!await remove(session.id)) throw new Error(useAppStore.getState().error || t('app.sessionActionFailed'))
      } else {
        await rename(session.id, normalized)
      }
      close()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('app.sessionActionFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) close() }}>
      <DialogContent className="max-w-sm">
        <form onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{t(deleting ? 'app.deleteSessionTitle' : 'app.renameSessionTitle')}</DialogTitle>
            <DialogDescription>{t(deleting ? 'app.deleteSessionDescription' : 'app.renameSessionDescription', { title: session.title })}</DialogDescription>
          </DialogHeader>
          {!deleting ? (
            <Input
              aria-label={t('app.sessionTitleField')}
              value={title}
              disabled={busy}
              maxLength={320}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => { setTitle(event.currentTarget.value); setError('') }}
            />
          ) : null}
          {error ? <p role="alert" className="mt-2 break-words text-xs text-danger">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={busy} onClick={close}>{t('app.sessionActionCancel')}</Button>
            <Button type="submit" disabled={invalid || busy}
              className={deleting ? 'bg-danger text-white hover:bg-danger/85' : undefined}>
              {t(deleting ? 'app.delete' : 'app.renameSessionTitle')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
