import type { AppData } from '../types'
import { parseAppDataJson } from '../lib/appData'
import { todayISO } from '../lib/date'

/** AppData를 JSON 파일로 내려받는다. */
export function downloadAppData(data: AppData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `today-line-${todayISO()}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 선택한 파일을 읽어 검증된 AppData로 돌려준다. 형식이 틀리면 AppDataError를 던진다. */
export async function readAppDataFile(file: File): Promise<AppData> {
  return parseAppDataJson(await file.text())
}
