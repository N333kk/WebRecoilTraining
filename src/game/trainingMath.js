export function buildCompensationPattern(weapon) {
  if (Array.isArray(weapon.pattern) && weapon.pattern.length > 0) {
    const clean = weapon.pattern
      .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
      .map((p) => ({ x: p.x, y: p.y }))

    if (clean.length === 1) {
      return Array.from({ length: weapon.mag }, () => ({ x: clean[0].x, y: clean[0].y }))
    }
    if (clean.length === weapon.mag) {
      return clean
    }
    if (clean.length >= 2) {
      return resample(clean, Math.max(1, weapon.mag))
    }
  }

  const points = []
  const total = weapon.mag
  let x = 0
  let y = 0

  for (let i = 0; i < total; i += 1) {
    const t = total <= 1 ? 0 : i / (total - 1)
    const sway = Math.sin(t * Math.PI * 6) * (18 * (1 - t * 0.55))
    const drift = Math.sin(t * Math.PI * 2) * 5
    x += (sway + drift) * 0.34 * weapon.patternScaleX
    y += (9.2 + t * 5.2) * weapon.patternScaleY
    points.push({ x, y })
  }

  return points
}

export function resample(points, n) {
  if (!points || points.length === 0) return []
  if (points.length === 1) return Array.from({ length: n }, () => ({ x: points[0].x, y: points[0].y }))

  const dist = [0]
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i].x - points[i - 1].x
    const dy = points[i].y - points[i - 1].y
    dist.push(dist[i - 1] + Math.hypot(dx, dy))
  }

  const total = dist[dist.length - 1]
  if (total <= 0) return Array.from({ length: n }, () => ({ x: points[0].x, y: points[0].y }))

  const out = []
  for (let i = 0; i < n; i += 1) {
    const target = (i / Math.max(1, n - 1)) * total
    let j = 1
    while (j < dist.length - 1 && dist[j] < target) j += 1

    const a = points[j - 1]
    const b = points[j]
    const segment = dist[j] - dist[j - 1] || 1
    const t = (target - dist[j - 1]) / segment
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  }

  return out
}

export function meanDistance(a, b) {
  if (!a.length || !b.length) return 999
  const n = Math.min(a.length, b.length)
  let sum = 0
  for (let i = 0; i < n; i += 1) {
    sum += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y)
  }
  return sum / n
}

export function calculateShotScore(distDeg, innerRadiusDeg = 1.97, outerRadiusDeg = 4.47) {
  if (distDeg <= innerRadiusDeg) {
    return Math.max(90, Math.min(100, 100 - 10 * (distDeg / innerRadiusDeg)))
  }
  if (distDeg <= outerRadiusDeg) {
    const t = (distDeg - innerRadiusDeg) / (outerRadiusDeg - innerRadiusDeg)
    return Math.max(50, Math.min(90, 90 - 40 * t))
  }
  const missDist = distDeg - outerRadiusDeg
  return Math.max(0, Math.min(50, 50 - (missDist / outerRadiusDeg) * 50))
}

