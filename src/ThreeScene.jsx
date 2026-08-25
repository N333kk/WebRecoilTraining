import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import weaponsData from './weapons.json'
import { useTrainingGame } from './game/useTrainingGame'
import { createWireframeScene, worldToScreen } from './scene/wireframeScene'

const WEAPONS = weaponsData

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
  const cameraRecoilRef = useRef(enableCameraRecoil)
  const sensitivityRef = useRef(sensitivity)
  const weaponKeyRef = useRef(weaponKey)
  const sceneApiRef = useRef(null)

  useEffect(() => {
    cameraRecoilRef.current = enableCameraRecoil
    sensitivityRef.current = sensitivity
    weaponKeyRef.current = weaponKey

    if (sceneApiRef.current) {
      sceneApiRef.current.renderUI({
        weaponKey,
        enableCameraRecoil,
        sensitivity
      })
    }
  }, [enableCameraRecoil, sensitivity, weaponKey])

  useEffect(() => {
    const mount = mountRef.current
    const overlay = overlayRef.current
    if (!mount || !overlay) return undefined

    const sceneApi = createWireframeScene({ mount, overlay })
    sceneApiRef.current = sceneApi
    clearImpactsRef.current = sceneApi.clearImpacts
    
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
      const degPerCount = sensitivityRef.current * mYaw
      const radiansPerCount = (degPerCount * Math.PI) / 180
      aimRef.current.yaw -= event.movementX * radiansPerCount
      aimRef.current.pitch -= event.movementY * radiansPerCount
      aimRef.current.pitch = THREE.MathUtils.clamp(aimRef.current.pitch, -1.33, 1.33)
      const compDegX = event.movementX * degPerCount
      const compDegY = event.movementY * degPerCount
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

    const animate = () => {
      loopRef.current = requestAnimationFrame(animate)

      const isFiring = getIsFiring()
      const recoilSpeed = isFiring ? 28 : 8
      aimRef.current.recoilPitch = THREE.MathUtils.damp(
        aimRef.current.recoilPitch,
        aimRef.current.recoilPitchTarget ?? 0,
        recoilSpeed,
        1 / 60
      )
      aimRef.current.recoilYaw = THREE.MathUtils.damp(
        aimRef.current.recoilYaw,
        aimRef.current.recoilYawTarget ?? 0,
        recoilSpeed,
        1 / 60
      )

      aimRef.current.punchPitch = THREE.MathUtils.damp(aimRef.current.punchPitch, 0, 20, 1 / 60)
      aimRef.current.punchYaw = THREE.MathUtils.damp(aimRef.current.punchYaw, 0, 20, 1 / 60)
      
      const speed = 0.15
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

    window.addEventListener('resize', sceneApi.resize)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('pointerlockchange', onPointerLockChange)
    mount.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

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
    <div className="trainer">
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
        <span>Shoot the panel to change CFG. Just shoot the target and GRIND.</span>
      </div>
    </div>
  )
}
