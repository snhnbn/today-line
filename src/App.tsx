import { useEffect } from 'react'
import { useAppStore } from './store/appStore'
import { useUiStore } from './store/uiStore'
import { createLocalAdapter } from './storage/localAdapter'
import { todayISO } from './lib/date'
import { Toolbar } from './components/Toolbar'
import { Timeline } from './components/Timeline'
import { TodayPanel } from './components/TodayPanel'
import { BlockEditor } from './components/BlockEditor'
import { ProjectForm } from './components/ProjectForm'
import './styles/app.css'

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

function useGlobalKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUiStore.getState()
      if (e.key === 'Escape') {
        if (ui.editor) ui.closeEditor()
        else if (ui.projectForm) ui.closeProjectForm()
        else ui.select(null)
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && ui.selectedId && !isTyping(e.target) && !ui.projectForm) {
        const app = useAppStore.getState()
        const block = app.blocks.find((b) => b.id === ui.selectedId)
        if (!block) return
        e.preventDefault()
        if (!window.confirm(`"${block.title}"을(를) 삭제할까요?`)) return
        app.deleteBlock(block.id)
        ui.closeEditor()
        ui.select(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** 자정을 넘기면 오늘 날짜(오늘선·패널)를 갱신한다 */
function useTodayTicker() {
  useEffect(() => {
    const check = () => {
      const t = todayISO()
      if (t !== useUiStore.getState().today) useUiStore.getState().setToday(t)
    }
    const id = setInterval(check, 60_000)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
}

function App() {
  const status = useAppStore((s) => s.status)
  const editor = useUiStore((s) => s.editor)
  const projectForm = useUiStore((s) => s.projectForm)

  useEffect(() => {
    void useAppStore.getState().init(createLocalAdapter())
  }, [])
  useGlobalKeys()
  useTodayTicker()

  if (status === 'error') {
    return <div className="boot">브라우저 저장소를 열 수 없습니다. 시크릿 창이 아닌지 확인한 뒤 새로고침하세요.</div>
  }
  if (status !== 'ready') return <div className="boot">불러오는 중…</div>

  return (
    <div className="app">
      <Toolbar />
      <div className="app__body">
        <Timeline />
        <TodayPanel />
      </div>
      {editor && <BlockEditor />}
      {projectForm && <ProjectForm key={projectForm.mode === 'edit' ? projectForm.projectId : 'new'} />}
    </div>
  )
}

export default App
