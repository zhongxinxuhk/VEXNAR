import type { AppView } from '@/store/app'
import { OverviewView } from './OverviewView'
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
