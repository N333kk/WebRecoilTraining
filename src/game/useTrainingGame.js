import { useCallback, useEffect, useRef, useState } from 'react'
import { buildCompensationPattern, calculateShotScore } from './trainingMath'

export function useTrainingGame(weapons, initialWeaponKey = 'ak47') {
  const [weaponKey, setWeaponKey] = useState(initialWeaponKey)
  const [sensitivity, setSensitivity] = useState(1)
  const [locked, setLocked] = useState(false)
  const [shots, setShots] = useState(0)
  const [status, setStatus] = useState('Click inside the view to capture the mouse')
  const [precision, setPrecision] = useState(null)
  const [mYaw] = useState(0.022)

  const weaponRef = useRef(initialWeaponKey)
  const isFiringRef = useRef(false)
  const shotCounterRef = useRef(0)
  const userPathRef = useRef([])
  const userAccumRef = useRef({ x: 0, y: 0 })
  const shotHistoryRef = useRef([])
  const recoilPatternRef = useRef([])
  const patternBoundsRef = useRef({ maxAbsX: 1, maxAbsY: 1 })
  const aimRef = useRef({
    yaw: 0,
    pitch: 0,
    recoilPitch: 0,
    recoilYaw: 0,
    recoilPitchTarget: 0,
    recoilYawTarget: 0,
    punchPitch: 0,
    punchYaw: 0
  })

  const currentWeapon = weapons[weaponKey]

  const reloadMagazineOnly = useCallback((showMessage = true) => {
    shotCounterRef.current = 0
    setShots(0)
    if (showMessage) {
      setStatus(`Magazine reloaded (${weapons[weaponRef.current].label})`)
    }
  }, [weapons])

  const resetRunData = useCallback(() => {
    userPathRef.current = []
    userAccumRef.current = { x: 0, y: 0 }
    shotHistoryRef.current = []
    setPrecision(null)
  }, [])

  const analyzeRun = useCallback(() => {
    const weapon = weapons[weaponRef.current]
    const history = shotHistoryRef.current
    if (!history || history.length === 0) {
      setStatus('No shots to evaluate')
      return
    }

    const totalShots = history.length
    const totalHits = history.filter((s) => s.hit).length
    const bullseyes = history.filter((s) => s.isBullseye).length
    const avgScore = Math.round(
      history.reduce((acc, s) => acc + s.score, 0) / totalShots
    )

    setPrecision(avgScore)
    setStatus(`${weapon.label} run: ${totalHits}/${totalShots} hits (${bullseyes} bullseyes) · Accuracy ${avgScore}%`)
  }, [weapons])

  const stopFiring = useCallback(() => {
    if (!isFiringRef.current) return
    isFiringRef.current = false
    aimRef.current.recoilPitchTarget = 0
    aimRef.current.recoilYawTarget = 0
    analyzeRun()
    reloadMagazineOnly(false)
  }, [analyzeRun, reloadMagazineOnly])

  const beginFiring = useCallback(() => {
    if (isFiringRef.current) return null
    isFiringRef.current = true
    resetRunData()
    return weapons[weaponRef.current]
  }, [resetRunData, weapons])

  const fireShot = useCallback(({ baseInaccuracyDeg = 0, applyFireSpread = false } = {}) => {
    const weapon = weapons[weaponRef.current]
    if (shotCounterRef.current >= weapon.mag) {
      setStatus(`Magazine empty (${weapon.label})`)
      return { fired: false, empty: true }
    }

    const shotIndex = shotCounterRef.current
    shotCounterRef.current += 1
    setShots(shotCounterRef.current)

    const point = recoilPatternRef.current[Math.min(shotIndex, recoilPatternRef.current.length - 1)] || { x: 0, y: 0 }
    const userOffset = { x: userAccumRef.current.x, y: userAccumRef.current.y }
    const heatFraction = weapon.mag > 1 ? shotIndex / (weapon.mag - 1) : 0
    const inaccuracyDeg = Math.max(0, baseInaccuracyDeg + (applyFireSpread ? (weapon.fireInaccuracyDeg ?? 0) * heatFraction : 0))
    const spreadAngle = Math.random() * Math.PI * 2
    const spreadRadius = Math.sqrt(Math.random()) * inaccuracyDeg
    const spreadOffset = {
      x: Math.cos(spreadAngle) * spreadRadius,
      y: Math.sin(spreadAngle) * spreadRadius
    }

    // Bullet angular deviation relative to bullseye (in degrees)
    const errDegX = userOffset.x - point.x - spreadOffset.x
    const errDegY = userOffset.y - point.y - spreadOffset.y
    const distDeg = Math.hypot(errDegX, errDegY)

    // Score based on distance from center:
    // Inner ring (<= 1.97 deg): 90% - 100%
    // Outer ring (<= 4.47 deg): 50% - 90%
    // Outside (> 4.47 deg): 0% - 50%
    const score = calculateShotScore(distDeg, 1.97, 4.47)
    const hit = distDeg <= 4.47
    const isBullseye = distDeg <= 1.97

    const shotRecord = {
      shotIndex,
      bulletNumber: shotIndex + 1,
      patternPoint: { x: point.x, y: point.y },
      spreadOffset,
      userOffset: { x: userOffset.x, y: userOffset.y },
      errDegX,
      errDegY,
      distDeg,
      score,
      hit,
      isBullseye
    }
    shotHistoryRef.current.push(shotRecord)

    // Target recoil angles in radians: gun kicks UP (+pitch) and sways (+yaw)
    aimRef.current.recoilPitchTarget = (point.y * Math.PI) / 180
    aimRef.current.recoilYawTarget = (point.x * Math.PI) / 180

    // Authentic CS2 snappy view punch per bullet - using target for smooth interpolation
    const punchStrength = (weapon.recoilPitch ?? 0.04) * 0.75 // slightly reduced magnitude
    aimRef.current.punchPitchTarget = (aimRef.current.punchPitchTarget ?? 0) + punchStrength
    aimRef.current.punchYawTarget = (aimRef.current.punchYawTarget ?? 0) + (weapon.recoilYaw ?? 0.015) * (Math.random() - 0.5) * 0.7

    setStatus(`Firing ${weapon.label}: ${shotCounterRef.current}/${weapon.mag}`)

    return {
      fired: true,
      empty: false,
      shotIndex,
      shotRecord,
      patternPoint: { x: point.x, y: point.y },
      spreadOffset,
      userOffset
    }
  }, [weapons])

  const recordMouseMovement = useCallback((dxDeg, dyDeg) => {
    if (!isFiringRef.current) return
    userAccumRef.current.x += dxDeg
    userAccumRef.current.y += dyDeg
    userPathRef.current.push({ x: userAccumRef.current.x, y: userAccumRef.current.y })
  }, [])

  const resetCurrentRun = useCallback(() => {
    resetRunData()
    reloadMagazineOnly(false)
    setStatus(`Weapon ready: ${weapons[weaponRef.current].label}`)
  }, [reloadMagazineOnly, resetRunData, weapons])

  const getPattern = useCallback(() => recoilPatternRef.current, [])
  const getUserPath = useCallback(() => userPathRef.current, [])
  const getShotHistory = useCallback(() => shotHistoryRef.current, [])
  const getShots = useCallback(() => shotCounterRef.current, [])
  const getCurrentWeapon = useCallback(() => weapons[weaponRef.current], [weapons])
  const getIsFiring = useCallback(() => isFiringRef.current, [])

  const computePatternBounds = useCallback((pattern) => {
    if (!pattern.length) return { maxAbsX: 1, maxAbsY: 1 }
    let maxAbsX = 1
    let maxAbsY = 1
    for (let i = 0; i < pattern.length; i += 1) {
      const p = pattern[i]
      maxAbsX = Math.max(maxAbsX, Math.abs(p.x))
      maxAbsY = Math.max(maxAbsY, Math.abs(p.y))
    }
    return { maxAbsX, maxAbsY }
  }, [])

  useEffect(() => {
    weaponRef.current = weaponKey
    recoilPatternRef.current = buildCompensationPattern(weapons[weaponKey])
    patternBoundsRef.current = computePatternBounds(recoilPatternRef.current)
    aimRef.current.punchPitch = 0
    aimRef.current.punchYaw = 0
    reloadMagazineOnly(false)
    resetRunData()
    setStatus(`Weapon ready: ${weapons[weaponKey].label}`)
  }, [weaponKey, weapons, reloadMagazineOnly, resetRunData, computePatternBounds])

  return {
    weaponKey,
    setWeaponKey,
    sensitivity,
    setSensitivity,
    mYaw,
    currentWeapon,
    locked,
    setLocked,
    shots,
    status,
    precision,
    aimRef,
    beginFiring,
    stopFiring,
    fireShot,
    recordMouseMovement,
    resetCurrentRun,
    getPattern,
    getUserPath,
    getShotHistory,
    getShots,
    getCurrentWeapon,
    getIsFiring
  }
}
