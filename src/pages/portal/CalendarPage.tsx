import { ModulePage } from './ModulePage'
import { calendarConfig } from './moduleConfigs'
import { CalendarSubscribePanel } from '../../components/kit/AddToCalendar'

export default function CalendarPage() {
  return (
    <div className="space-y-5">
      <CalendarSubscribePanel feedPath="/portal/calendar/feed" />
      <ModulePage config={calendarConfig} />
    </div>
  )
}
