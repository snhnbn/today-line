export interface LaneInterval {
  id: string
  /** 시작 칸(포함) */
  start: number
  /** 끝 칸(포함) */
  end: number
}

export interface LaneLayout {
  laneOf: Map<string, number>
  laneCount: number
}

/** 겹치는 구간을 서로 다른 줄(lane)에 배치한다. 가능한 가장 위 줄을 쓴다. */
export function assignLanes(items: LaneInterval[]): LaneLayout {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id))
  const laneEnds: number[] = []
  const laneOf = new Map<string, number>()

  for (const item of sorted) {
    let lane = laneEnds.findIndex((end) => end < item.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(item.end)
    } else {
      laneEnds[lane] = item.end
    }
    laneOf.set(item.id, lane)
  }
  return { laneOf, laneCount: laneEnds.length }
}
