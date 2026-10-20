import { useMemo } from 'react'
import { useAppStore } from '../store/appStore'
import { useUiStore } from '../store/uiStore'
import { computeTodayGroups, type TodayItem } from '../lib/today'
import { blockColor } from '../lib/color'
import { formatKorean, formatShort, formatShortWithDay } from '../lib/date'

type GroupKey = 'inProgress' | 'dueToday' | 'upcoming' | 'overdue'

const GROUPS: { key: GroupKey; title: string; empty: string }[] = [
  { key: 'inProgress', title: '진행 중', empty: '진행 중인 기간 블럭이 없습니다' },
  { key: 'dueToday', title: '오늘 마감', empty: '오늘 마감인 항목이 없습니다' },
  { key: 'upcoming', title: '7일 이내 마커', empty: '다가오는 마커가 없습니다' },
  { key: 'overdue', title: '지난 미완료', empty: '밀린 항목이 없습니다' },
]

function metaText(key: GroupKey, item: TodayItem): string {
  const { block, dDay } = item
  switch (key) {
    case 'inProgress':
      return `~${formatShort(block.endDate)} · D-${dDay}`
    case 'dueToday':
      return block.kind === 'marker' ? '◆ 오늘' : `${formatShort(block.startDate)}~ · 오늘 종료`
    case 'upcoming':
      return `D-${dDay} · ${formatShortWithDay(block.startDate)}`
    case 'overdue':
      return `${formatShort(block.endDate)} · ${-dDay}일 지남`
  }
}

export function TodayPanel() {
  const projects = useAppStore((s) => s.projects)
  const blocks = useAppStore((s) => s.blocks)
  const toggleDone = useAppStore((s) => s.toggleDone)
  const today = useUiStore((s) => s.today)
  const requestFocus = useUiStore((s) => s.requestFocus)

  const groups = useMemo(() => computeTodayGroups(projects, blocks, today), [projects, blocks, today])
  const total = groups.inProgress.length + groups.dueToday.length

  return (
    <aside className="panel" aria-label="오늘 할 일">
      <header className="panel__head">
        <h2>오늘 할 일</h2>
        <div className="panel__date">{formatKorean(today)}</div>
        <div className="panel__summary">{total > 0 ? `오늘선에 걸린 일 ${total}개` : '오늘선에 걸린 일이 없습니다'}</div>
      </header>
      <div className="panel__groups">
        {GROUPS.map((g) => {
          const items = groups[g.key]
          return (
            <section key={g.key} className={`group group--${g.key}`}>
              <h3>
                {g.title}
                <span className="group__count">{items.length}</span>
              </h3>
              {items.length === 0 ? (
                <p className="group__empty">{g.empty}</p>
              ) : (
                <ul>
                  {items.map((item) => (
                    <li key={item.block.id} className="todo">
                      <input
                        type="checkbox"
                        checked={item.block.done}
                        onChange={() => toggleDone(item.block.id)}
                        aria-label={`${item.block.title} 완료`}
                      />
                      <button type="button" className="todo__body" onClick={() => requestFocus(item.block.id)} title="타임라인에서 보기">
                        <span className="todo__title">
                          <span
                            className={item.block.kind === 'marker' ? 'todo__kind todo__kind--marker' : 'todo__kind'}
                            style={{ background: blockColor(item.block, item.project) }}
                          />
                          <span className="todo__project">{item.project.name}</span>
                          <span className="todo__sep">·</span>
                          {item.block.title || '(제목 없음)'}
                        </span>
                        <span className="todo__meta">{metaText(g.key, item)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </aside>
  )
}
