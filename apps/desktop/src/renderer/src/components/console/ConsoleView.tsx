// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { AppView } from '@/store/app'
import { OverviewView } from './OverviewView'
import { ApprovalsView } from './ApprovalsView'
import { TasksView } from './TasksView'
import { FindingsView } from './FindingsView'
import { TrafficView } from './TrafficView'
import { AssetsView } from './AssetsView'
import { CommandsView } from './CommandsView'
import { SystemView } from './SystemView'

export function ConsoleView({ view }: { view: Exclude<AppView, 'chat'> }): React.JSX.Element {
  switch (view) {
    case 'overview':
      return <OverviewView />
    case 'approvals':
      return <ApprovalsView />
    case 'tasks':
      return <TasksView />
    case 'findings':
      return <FindingsView />
    case 'traffic':
      return <TrafficView />
    case 'assets':
      return <AssetsView />
    case 'commands':
      return <CommandsView />
    case 'system':
      return <SystemView />
    default:
      return <OverviewView />
  }
}
