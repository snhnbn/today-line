import { create } from 'zustand'
import type { ISODate } from '../types'
import { todayISO } from '../lib/date'

/** 화면 상태(저장하지 않음) */
export type Zoom = 'week' | 'month' | 'quarter'

export type ProjectFormState = { mode: 'create' } | { mode: 'edit'; projectId: string }

export interface EditorState {
  blockId: string
  x: number
  y: number
  isNew: boolean
}

export type ScrollCommand = 'today' | 'prev' | 'next'

interface UiState {
  zoom: Zoom
  hideDone: boolean
  today: ISODate
  selectedId: string | null
  editor: EditorState | null
  projectForm: ProjectFormState | null
  /** 타임라인에 보내는 일회성 요청 (nonce가 바뀔 때마다 실행) */
  scrollRequest: { command: ScrollCommand; nonce: number } | null
  focusRequest: { blockId: string; nonce: number } | null

  setZoom(zoom: Zoom): void
  setHideDone(hide: boolean): void
  setToday(today: ISODate): void
  select(id: string | null): void
  openEditor(editor: EditorState): void
  closeEditor(): void
  openProjectForm(form: ProjectFormState): void
  closeProjectForm(): void
  requestScroll(command: ScrollCommand): void
  requestFocus(blockId: string): void
}

let nonce = 0

export const useUiStore = create<UiState>()((set) => ({
  zoom: 'month',
  hideDone: false,
  today: todayISO(),
  selectedId: null,
  editor: null,
  projectForm: null,
  scrollRequest: null,
  focusRequest: null,

  setZoom: (zoom) => set({ zoom }),
  setHideDone: (hideDone) => set({ hideDone }),
  setToday: (today) => set({ today }),
  select: (selectedId) => set({ selectedId }),
  openEditor: (editor) => set({ editor, selectedId: editor.blockId }),
  closeEditor: () => set({ editor: null }),
  openProjectForm: (projectForm) => set({ projectForm }),
  closeProjectForm: () => set({ projectForm: null }),
  requestScroll: (command) => set({ scrollRequest: { command, nonce: ++nonce } }),
  requestFocus: (blockId) => set({ focusRequest: { blockId, nonce: ++nonce }, selectedId: blockId }),
}))
