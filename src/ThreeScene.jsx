import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import weaponsData from './weapons.json'
import { useTrainingGame } from './game/useTrainingGame'
import { createWireframeScene, worldToScreen } from './scene/wireframeScene'

const WEAPONS = weaponsData
const FOV_PRESETS = {
  '4:3': { label: '4:3', degrees: 90 },
  '16:10': { label: '16:10', degrees: 100.39 },
  '16:9': { label: '16:9', degrees: 106.26 }
}

function applyHorizontalFov(camera, horizontalFov) {
  camera.userData.horizontalFov = horizontalFov
  camera.fov = (2 * Math.atan(Math.tan((horizontalFov * Math.PI) / 360) / camera.aspect) * 180) / Math.PI
  camera.updateProjectionMatrix()
}

export default function ThreeScene() {
  const mountRef = useRef(null)
  const overlayRef = useRef(null)
  const loopRef = useRef(0)
  const fireIntervalRef = useRef(null)
  const clearImpactsRef = useRef(null)

  const keysRef = useRef({ w: false, a: false, s: false, d: false })

  const {
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
  } = useTrainingGame(WEAPONS, 'ak47')

  const [enableCameraRecoil, setEnableCameraRecoil] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sensitivityDraft, setSensitivityDraft] = useState(String(sensitivity))
  const [fovAspect, setFovAspect] = useState('4:3')
  const [fov, setFov] = useState(FOV_PRESETS['4:3'].degrees)
  const cameraRecoilRef = useRef(enableCameraRecoil)
  const sensitivityRef = useRef(sensitivity)
  const fovRef = useRef(fov)
  const weaponKeyRef = useRef(weaponKey)
  const settingsOpenRef = useRef(settingsOpen)
  const sceneApiRef = useRef(null)

  useEffect(() => {
    cameraRecoilRef.current = enableCameraRecoil
    sensitivityRef.current = sensitivity
    fovRef.current = fov
    weaponKeyRef.current = weaponKey
    settingsOpenRef.current = settingsOpen

    if (sceneApiRef.current) {
      applyHorizontalFov(sceneApiRef.current.camera, fov)
      sceneApiRef.current.renderUI({
        weaponKey,
        enableCameraRecoil,
        sensitivity
      })
    }
  }, [enableCameraRecoil, fov, sensitivity, settingsOpen, weaponKey])

  const closeSettings = () => {
    const parsedSensitivity = Number(sensitivityDraft)
    const nextSensitivity = sensitivityDraft.trim() === '' || !Number.isFinite(parsedSensitivity)
      ? 1
      : Math.min(10, Math.max(0.01, Math.round(parsedSensitivity * 100) / 100))
    setSensitivity(nextSensitivity)
    setSensitivityDraft(String(nextSensitivity))
    setSettingsOpen(false)
  }

  useEffect(() => {
    const onSettingsKey = (event) => {
      if (!['KeyY', 'Escape'].includes(event.code)) return
      event.preventDefault()
      if (event.code === 'Escape' && !settingsOpenRef.current) return
      if (settingsOpenRef.current) closeSettings()
      else if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return
      else {
        setSensitivityDraft(sensitivityRef.current.toFixed(2))
        setSettingsOpen(true)
      }
    }
    window.addEventListener('keydown', onSettingsKey)
    return () => window.removeEventListener('keydown', onSettingsKey)
  }, [closeSettings])

  useEffect(() => {
    if (!settingsOpen) return
    if (document.pointerLockElement) document.exitPointerLock()
    stopFiring()
  }, [settingsOpen, stopFiring])

  useEffect(() => {
    const mount = mountRef.current
    const overlay = overlayRef.current
    if (!mount || !overlay) return undefined

    const sceneApi = createWireframeScene({ mount, overlay })
    sceneApiRef.current = sceneApi
    clearImpactsRef.current = sceneApi.clearImpacts
    applyHorizontalFov(sceneApi.camera, fovRef.current)
    
    sceneApi.renderUI({ weaponKey: weaponKeyRef.current, enableCameraRecoil: cameraRecoilRef.current, sensitivity: sensitivityRef.current })

    const clearFireInterval = () => {
      if (fireIntervalRef.current) {
        clearInterval(fireIntervalRef.current)
        fireIntervalRef.current = null
      }
    }

    const releaseFire = () => {
      clearFireInterval()
      stopFiring()
    }

    const raycaster = new THREE.Raycaster()
    let previousFrameTime = performance.now()

    const startFire = () => {
      const weapon = beginFiring()
      if (!weapon) return
      
      sceneApi.clearImpacts()

      const shootTick = () => {
        const result = fireShot()
        if (result.empty) {
          releaseFire()
          return
        }

        const point = result.patternPoint
        const bulletPitchRad = aimRef.current.pitch + (point.y * Math.PI) / 180
        const bulletYawRad = aimRef.current.yaw + (point.x * Math.PI) / 180
        
        const bulletEuler = new THREE.Euler(bulletPitchRad, bulletYawRad, 0, 'YXZ')
        const bulletDir = new THREE.Vector3(0, 0, -1).applyEuler(bulletEuler)
        
        raycaster.set(sceneApi.camera.position, bulletDir)
        const intersects = raycaster.intersectObject(sceneApi.roomCollider)
        
        if (intersects.length > 0) {
          const hitPoint = intersects[0].point
          const distToCenter = hitPoint.distanceTo(sceneApi.targetPosition)
          
          const isBullseye = distToCenter <= sceneApi.targetRadiusWorld.inner
          const hit = distToCenter <= sceneApi.targetRadiusWorld.outer
          
          result.shotRecord.isBullseye = isBullseye
          result.shotRecord.hit = hit
          result.shotRecord.score = isBullseye ? 100 : (hit ? 70 : 0)
          result.shotRecord.hitPoint = hitPoint
          
          sceneApi.addImpact(hitPoint, isBullseye, hit)
        }
      }

      shootTick()
      const interval = Math.max(20, Math.round(60000 / weapon.rpm))
      fireIntervalRef.current = setInterval(shootTick, interval)
    }

    const onMouseMove = (event) => {
      if (document.pointerLockElement !== mount) return
      if (!Number.isFinite(event.movementX) || !Number.isFinite(event.movementY)) return
      // Pointer-lock can report a stale, very large delta after a tab switch.
      const movementX = THREE.MathUtils.clamp(event.movementX, -250, 250)
      const movementY = THREE.MathUtils.clamp(event.movementY, -250, 250)
      const degPerCount = sensitivityRef.current * mYaw
      const radiansPerCount = (degPerCount * Math.PI) / 180
      aimRef.current.yaw -= movementX * radiansPerCount
      aimRef.current.pitch -= movementY * radiansPerCount
      aimRef.current.pitch = THREE.MathUtils.clamp(aimRef.current.pitch, -1.33, 1.33)
      const compDegX = movementX * degPerCount
      const compDegY = movementY * degPerCount
      recordMouseMovement(compDegX, compDegY)
    }

    const onPointerLockChange = () => {
      const isLocked = document.pointerLockElement === mount
      setLocked(isLocked)
      if (!isLocked) releaseFire()
    }

    const onMouseDown = (event) => {
      if (event.button !== 0) return
      if (document.pointerLockElement !== mount) {
        mount.requestPointerLock()
        return
      }

      const dir = new THREE.Vector3(0, 0, -1).applyEuler(
        new THREE.Euler(aimRef.current.pitch, aimRef.current.yaw, 0, 'YXZ')
      )
      raycaster.set(sceneApi.camera.position, dir)
      const uiIntersects = raycaster.intersectObject(sceneApi.uiMesh)
      
      if (uiIntersects.length > 0) {
        const hitButton = sceneApi.handleUIInteraction(uiIntersects[0].uv, {
          setWeaponKey,
          setEnableCameraRecoil,
          setSensitivity,
          currentSens: sensitivityRef.current,
          resetRun: () => {
            resetCurrentRun()
            if (clearImpactsRef.current) clearImpactsRef.current()
          },
          resetPosition: () => {
            sceneApi.camera.position.set(0, 0.5, -14)
            aimRef.current.yaw = 0
            aimRef.current.pitch = 0
          }
        })
        if (hitButton) return
      }

      startFire()
    }

    const onMouseUp = (event) => {
      if (event.button !== 0) return
      releaseFire()
    }

    const drawOverlay = () => {
      const { overlayCtx, camera, targetPosition, sizeRef } = sceneApi
      const { w, h } = sizeRef.current
      overlayCtx.clearRect(0, 0, w, h)

      const targetProjected = targetPosition.clone().project(camera)
      const isTargetVisible = targetProjected.z < 1.0

      const anchor = {
        x: (targetProjected.x * 0.5 + 0.5) * w,
        y: (-targetProjected.y * 0.5 + 0.5) * h
      }

      const vFovRad = (camera.fov * Math.PI) / 180
      const focalLengthPx = (h / 2) / Math.tan(vFovRad / 2)
      const pxPerDegree = focalLengthPx * (Math.PI / 180)

      const pattern = getPattern()
      const isFiring = getIsFiring()

      if (pattern.length > 1 && isTargetVisible) {
        overlayCtx.save()
        const visualScale = cameraRecoilRef.current ? 0.5 : 1.0

        overlayCtx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
        overlayCtx.lineWidth = 1.5
        overlayCtx.beginPath()
        for (let i = 0; i < pattern.length; i += 1) {
          const p = pattern[i]
          const px = anchor.x + p.x * visualScale * pxPerDegree
          const py = anchor.y + p.y * visualScale * pxPerDegree
          if (i === 0) overlayCtx.moveTo(px, py)
          else overlayCtx.lineTo(px, py)
        }
        overlayCtx.stroke()

        overlayCtx.fillStyle = 'rgba(255, 255, 255, 0.4)'
        for (let i = 0; i < pattern.length; i += 1) {
          const p = pattern[i]
          const px = anchor.x + p.x * visualScale * pxPerDegree
          const py = anchor.y + p.y * visualScale * pxPerDegree
          overlayCtx.beginPath()
          overlayCtx.arc(px, py, 1.8, 0, Math.PI * 2)
          overlayCtx.fill()
        }

        const shotsFired = getShots()
        const targetIndex = isFiring
          ? Math.min(pattern.length - 1, shotsFired)
          : 0
        const targetPoint = pattern[targetIndex] || pattern[0]
        const gx = anchor.x + targetPoint.x * visualScale * pxPerDegree
        const gy = anchor.y + targetPoint.y * visualScale * pxPerDegree

        const crosshairDist = Math.hypot(w / 2 - gx, h / 2 - gy)
        const isLockedOn = crosshairDist < 18

        overlayCtx.strokeStyle = isLockedOn ? 'rgba(0, 255, 128, 0.6)' : 'rgba(0, 240, 255, 0.45)'
        overlayCtx.lineWidth = isLockedOn ? 2.5 : 2.0
        overlayCtx.beginPath()
        overlayCtx.arc(gx, gy, isLockedOn ? 6.0 : 4.0, 0, Math.PI * 2)
        overlayCtx.stroke()

        overlayCtx.fillStyle = isLockedOn ? 'rgba(0, 255, 128, 0.95)' : 'rgba(0, 240, 255, 0.9)'
        overlayCtx.beginPath()
        overlayCtx.arc(gx, gy, isLockedOn ? 3.0 : 2.0, 0, Math.PI * 2)
        overlayCtx.fill()

        overlayCtx.restore()
      }

      const history = getShotHistory()
      if (history.length > 0) {
        overlayCtx.save()
        overlayCtx.font = '10px ui-monospace, monospace'
        for (let i = 0; i < history.length; i += 1) {
          const shot = history[i]
          if (shot.hitPoint) {
            const projected = shot.hitPoint.clone().project(camera)
            if (projected.z < 1.0) {
              const sx = (projected.x * 0.5 + 0.5) * w
              const sy = (-projected.y * 0.5 + 0.5) * h
              overlayCtx.fillStyle = shot.hit ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.4)'
              overlayCtx.fillText(`${shot.bulletNumber}`, sx + 6, sy - 4)
            }
          }
        }
        overlayCtx.restore()
      }
    }

    const animate = (frameTime = performance.now()) => {
      loopRef.current = requestAnimationFrame(animate)
      const currentFrameTime = Number.isFinite(frameTime) ? frameTime : performance.now()
      const deltaTime = THREE.MathUtils.clamp((currentFrameTime - previousFrameTime) / 1000, 0, 0.1)
      previousFrameTime = currentFrameTime

      const isFiring = getIsFiring()
      const recoilSpeed = isFiring ? 28 : 8
      aimRef.current.recoilPitch = THREE.MathUtils.damp(
        aimRef.current.recoilPitch,
        aimRef.current.recoilPitchTarget ?? 0,
        recoilSpeed,
        deltaTime
      )
      aimRef.current.recoilYaw = THREE.MathUtils.damp(
        aimRef.current.recoilYaw,
        aimRef.current.recoilYawTarget ?? 0,
        recoilSpeed,
        deltaTime
      )

      aimRef.current.punchPitch = THREE.MathUtils.damp(aimRef.current.punchPitch, 0, 20, deltaTime)
      aimRef.current.punchYaw = THREE.MathUtils.damp(aimRef.current.punchYaw, 0, 20, deltaTime)
      
      const speed = 9 * deltaTime
      const dir = new THREE.Vector3()
      
      const yawEuler = new THREE.Euler(0, aimRef.current.yaw, 0, 'YXZ')
      const forward = new THREE.Vector3(0, 0, -1).applyEuler(yawEuler)
      const right = new THREE.Vector3(1, 0, 0).applyEuler(yawEuler)

      if (keysRef.current.w) dir.add(forward)
      if (keysRef.current.s) dir.sub(forward)
      if (keysRef.current.a) dir.sub(right)
      if (keysRef.current.d) dir.add(right)

      if (dir.lengthSq() > 0) {
        dir.normalize().multiplyScalar(speed)
        sceneApi.camera.position.add(dir)
        
        sceneApi.camera.position.x = THREE.MathUtils.clamp(sceneApi.camera.position.x, -29, 29)
        sceneApi.camera.position.z = THREE.MathUtils.clamp(sceneApi.camera.position.z, -29, 29)
      }

      // Apply recoil to the camera based on toggle (CS2 style view kick = 50%)
      const viewRecoilScale = cameraRecoilRef.current ? 0.5 : 0.0
      const punchScale = cameraRecoilRef.current ? 1.0 : 0.0
      
      sceneApi.camera.rotation.order = 'YXZ'
      sceneApi.camera.rotation.x = aimRef.current.pitch + aimRef.current.recoilPitch * viewRecoilScale + aimRef.current.punchPitch * punchScale
      sceneApi.camera.rotation.y = aimRef.current.yaw + aimRef.current.recoilYaw * viewRecoilScale + aimRef.current.punchYaw * punchScale

      sceneApi.render()
      drawOverlay()
    }

    const onKeyDown = (e) => {
      const k = e.code
      if (settingsOpenRef.current) return
      if (k === 'KeyW') keysRef.current.w = true
      if (k === 'KeyA') keysRef.current.a = true
      if (k === 'KeyS') keysRef.current.s = true
      if (k === 'KeyD') keysRef.current.d = true
    }

    const onKeyUp = (e) => {
      const k = e.code
      if (k === 'KeyW') keysRef.current.w = false
      if (k === 'KeyA') keysRef.current.a = false
      if (k === 'KeyS') keysRef.current.s = false
      if (k === 'KeyD') keysRef.current.d = false
    }

    const onVisibilityChange = () => {
      previousFrameTime = performance.now()
      if (document.hidden) releaseFire()
    }

    window.addEventListener('resize', sceneApi.resize)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('pointerlockchange', onPointerLockChange)
    mount.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    document.addEventListener('visibilitychange', onVisibilityChange)

    sceneApi.resize()
    animate()

    return () => {
      releaseFire()
      cancelAnimationFrame(loopRef.current)
      window.removeEventListener('resize', sceneApi.resize)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('pointerlockchange', onPointerLockChange)
      mount.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      sceneApi.dispose()
    }
  }, [
    aimRef,
    beginFiring,
    fireShot,
    getPattern,
    getUserPath,
    getShotHistory,
    getShots,
    getIsFiring,
    mYaw,
    recordMouseMovement,
    setLocked,
    stopFiring
  ])

  return (
    <div className={`trainer${settingsOpen ? ' settings-open' : ''}`}>
      <div ref={mountRef} className="three-wrap">
        <canvas ref={overlayRef} className="overlay-canvas" />
        <div className="crosshair" aria-hidden="true">+</div>
        <div className="hud">
          <span>Recoil Trainer</span>
          <span>{locked ? 'LIVE' : 'PAUSED'}</span>
          <span className="precision-chip" style={precision == null ? { marginLeft: '16px', color: '#ccc' } : precision < 40 ? { marginLeft: '16px', color: '#ff2600' } : precision < 80 ? { marginLeft: '16px', color: '#fffb00' } : { marginLeft: '16px', color: '#00ff80' }}>
            Accuracy: {precision == null ? '...' : `${precision}%`}
          </span>
        </div>
      </div>

      <div className="control-bar">
        <span>{getCurrentWeapon().label} / RDS {shots}/{currentWeapon.mag}</span>
        <span>Shoot the panel to select a recoil pattern</span>
      </div>

      {settingsOpen && (
        <div className="settings-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeSettings()
        }}>
          <section className="settings-menu" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="settings-heading">
              <div>
                <p className="eyebrow">CONFIGURACIÓN</p>
                <h2 id="settings-title">Ajustes de entrenamiento</h2>
              </div>
              <button type="button" className="settings-close" onClick={closeSettings} aria-label="Cerrar ajustes">×</button>
            </div>

            <label className="settings-field">
              <span>Sensibilidad</span>
              <small>CS2 · precisión de 2 decimales</small>
              <input
                type="number"
                min="0.10"
                max="10.00"
                step="0.01"
                value={sensitivityDraft}
                onChange={(event) => {
                  setSensitivityDraft(event.target.value)
                }}
              />
            </label>

            <label className="settings-field">
              <span>Formato y FOV</span>
              <small>FOV horizontal equivalente de CS2 (4:3 = 90°)</small>
              <select
                value={fovAspect}
                onChange={(event) => {
                  const nextAspect = event.target.value
                  setFovAspect(nextAspect)
                  setFov(FOV_PRESETS[nextAspect].degrees)
                }}
              >
                {Object.entries(FOV_PRESETS).map(([aspect, preset]) => (
                  <option key={aspect} value={aspect}>{preset.label} · {preset.degrees.toFixed(2)}° horizontal</option>
                ))}
              </select>
            </label>

            <label className="settings-toggle">
              <input type="checkbox" checked={enableCameraRecoil} onChange={(event) => setEnableCameraRecoil(event.target.checked)} />
              <span>Retroceso de cámara estilo CS2</span>
            </label>

            <p className="settings-hint">Pulsa <strong>Y</strong> o <strong>ESC</strong> para cerrar · vacío = sensibilidad 1.00</p>
          </section>
        </div>
      )}
    </div>
  )
}
