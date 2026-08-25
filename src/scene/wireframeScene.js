import * as THREE from 'three'

export function worldToScreen(camera, worldPosition, width, height) {
  const projected = worldPosition.clone().project(camera)
  return {
    x: (projected.x * 0.5 + 0.5) * width,
    y: (-projected.y * 0.5 + 0.5) * height
  }
}

export function createWireframeScene({ mount, overlay }) {
  const sizeRef = { current: { w: 800, h: 560 } }

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x000000)

  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 600)
  camera.position.set(0, 0.5, -14) // Start 16 units away from target, just like before
  camera.rotation.order = 'YXZ'

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  mount.appendChild(renderer.domElement)

  const whiteLine = new THREE.LineBasicMaterial({ color: 0xffffff })

  const roomEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(60, 20, 60)),
    whiteLine
  )
  roomEdges.position.set(0, 0, 0)
  scene.add(roomEdges)

  const targetGroup = new THREE.Group()
  // Wall is at Z = -30. Place target just slightly in front of it.
  targetGroup.position.set(0, 0.5, -29.9)

  const targetOuter = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 64 }, (_, i) => {
        const a = (i / 64) * Math.PI * 2
        return new THREE.Vector3(Math.cos(a) * 2.5, Math.sin(a) * 2.5, 0)
      })
    ),
    whiteLine
  )

  const targetInner = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 64 }, (_, i) => {
        const a = (i / 64) * Math.PI * 2
        return new THREE.Vector3(Math.cos(a) * 0.8, Math.sin(a) * 0.8, 0)
      })
    ),
    whiteLine
  )

  const horizontal = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-2.5, 0, 0),
      new THREE.Vector3(2.5, 0, 0)
    ]),
    whiteLine
  )

  const vertical = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -2.5, 0),
      new THREE.Vector3(0, 2.5, 0)
    ]),
    whiteLine
  )

  targetGroup.add(targetOuter)
  targetGroup.add(targetInner)
  targetGroup.add(horizontal)
  targetGroup.add(vertical)
  scene.add(targetGroup)

  // Collider for physical bullet raycasting
  const roomCollider = new THREE.Mesh(
    new THREE.BoxGeometry(60, 20, 60),
    new THREE.MeshBasicMaterial({ side: THREE.BackSide, visible: false })
  )
  scene.add(roomCollider)

  // Group for 3D bullet impacts
  const impactGroup = new THREE.Group()
  scene.add(impactGroup)

  // ------------------------------------------------------------------
  // 3D UI Panel (CanvasTexture)
  // ------------------------------------------------------------------
  const uiCanvas = document.createElement('canvas')
  uiCanvas.width = 1024
  uiCanvas.height = 1024
  const uiCtx = uiCanvas.getContext('2d')
  const uiTexture = new THREE.CanvasTexture(uiCanvas)
  // Disable mipmaps for sharper text
  uiTexture.minFilter = THREE.LinearFilter
  uiTexture.generateMipmaps = false

  const uiMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 16),
    new THREE.MeshBasicMaterial({ map: uiTexture, transparent: true })
  )
  // Place on the front wall to the left of the diana
  uiMesh.position.set(-16, 2.0, -29.8)
  scene.add(uiMesh)

  let uiButtons = []
  const renderUI = (state) => {
    uiCtx.clearRect(0, 0, 1024, 1024)
    uiCtx.fillStyle = 'rgba(0, 0, 0, 0.85)'
    uiCtx.fillRect(0, 0, 1024, 1024)
    
    uiCtx.strokeStyle = '#ffffff'
    uiCtx.lineWidth = 4
    uiCtx.strokeRect(2, 2, 1020, 1020)

    uiCtx.fillStyle = '#ffffff'
    uiCtx.font = 'bold 44px ui-monospace, monospace'
    uiCtx.textAlign = 'center'
    uiCtx.textBaseline = 'top'
    uiCtx.fillText('CONTROL PANEL (SHOOT TO SELECT)', 512, 40)
    
    uiCtx.beginPath()
    uiCtx.moveTo(0, 110)
    uiCtx.lineTo(1024, 110)
    uiCtx.stroke()

    uiButtons = []
    const drawBtn = (x, y, w, h, text, id, active = false) => {
      uiCtx.fillStyle = active ? 'rgba(0, 255, 128, 0.4)' : 'rgba(255, 255, 255, 0.1)'
      uiCtx.fillRect(x, y, w, h)
      uiCtx.strokeStyle = active ? '#00ff80' : '#ffffff'
      uiCtx.lineWidth = 2
      uiCtx.strokeRect(x, y, w, h)
      
      uiCtx.fillStyle = active ? '#00ff80' : '#ffffff'
      uiCtx.font = 'bold 32px ui-monospace, monospace'
      uiCtx.textAlign = 'center'
      uiCtx.textBaseline = 'middle'
      uiCtx.fillText(text, x + w / 2, y + h / 2)
      
      uiButtons.push({ x, y, w, h, id })
    }

    // Weapons
    uiCtx.fillStyle = '#ffffff'
    uiCtx.textAlign = 'left'
    uiCtx.font = 'bold 36px ui-monospace, monospace'
    uiCtx.textBaseline = 'bottom'
    uiCtx.fillText('Arma:', 50, 180)
    const weapons = ['ak47', 'm4a4', 'galil', 'famas', 'mac10']
    weapons.forEach((wKey, i) => {
      const col = i % 4
      const row = Math.floor(i / 4)
      drawBtn(50 + col * 220, 200 + row * 100, 200, 80, wKey.toUpperCase(), `weapon_${wKey}`, state.weaponKey === wKey)
    })

    // Camera Recoil
    uiCtx.fillStyle = '#ffffff'
    uiCtx.textAlign = 'left'
    uiCtx.fillText('Retroceso de Cámara (Modo CS2):', 50, 480)
    drawBtn(50, 500, 200, 80, 'ACTIVADO', 'recoil_on', state.enableCameraRecoil === true)
    drawBtn(270, 500, 200, 80, 'DESACTIVADO', 'recoil_off', state.enableCameraRecoil === false)

    // Sensibilidad
    uiCtx.fillStyle = '#ffffff'
    uiCtx.textAlign = 'left'
    uiCtx.fillText(`Sensibilidad: ${state.sensitivity.toFixed(2)}`, 50, 680)
    drawBtn(50, 700, 100, 80, '-0.5', 'sens_down_large')
    drawBtn(170, 700, 100, 80, '-0.1', 'sens_down_small')
    drawBtn(290, 700, 100, 80, '+0.1', 'sens_up_small')
    drawBtn(410, 700, 100, 80, '+0.5', 'sens_up_large')

    // Reset
    drawBtn(50, 860, 450, 100, 'REINICIAR PATRÓN', 'reset_run')
    drawBtn(524, 860, 450, 100, 'RESETEAR POSICIÓN', 'reset_pos')

    uiTexture.needsUpdate = true
  }

  const handleUIInteraction = (uv, callbacks) => {
    const x = uv.x * 1024
    const y = (1 - uv.y) * 1024 // UV y is bottom-up
    let hitSomething = false
    for (const btn of uiButtons) {
      if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
        if (btn.id.startsWith('weapon_')) callbacks.setWeaponKey(btn.id.replace('weapon_', ''))
        if (btn.id === 'recoil_on') callbacks.setEnableCameraRecoil(true)
        if (btn.id === 'recoil_off') callbacks.setEnableCameraRecoil(false)
        if (btn.id === 'sens_down_large') callbacks.setSensitivity(Math.max(0.1, callbacks.currentSens - 0.5))
        if (btn.id === 'sens_down_small') callbacks.setSensitivity(Math.max(0.1, callbacks.currentSens - 0.1))
        if (btn.id === 'sens_up_small') callbacks.setSensitivity(Math.min(10, callbacks.currentSens + 0.1))
        if (btn.id === 'sens_up_large') callbacks.setSensitivity(Math.min(10, callbacks.currentSens + 0.5))
        if (btn.id === 'reset_run') callbacks.resetRun()
        if (btn.id === 'reset_pos') callbacks.resetPosition()
        hitSomething = true
      }
    }
    return hitSomething
  }

  const addImpact = (hitPoint, isBullseye, hit) => {
    const size = 0.15
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-size, -size, 0), new THREE.Vector3(size, size, 0),
      new THREE.Vector3(-size, size, 0), new THREE.Vector3(size, -size, 0)
    ])
    
    let color = 0xffffff
    let opacity = hit ? 0.9 : 0.35
    if (isBullseye) color = 0xffeb78 // Yellowish for bullseye
    
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity })
    const cross = new THREE.LineSegments(geometry, material)
    
    // Nudge slightly away from the wall towards camera to prevent z-fighting
    const normal = hitPoint.clone().sub(camera.position).normalize().negate()
    cross.position.copy(hitPoint).add(normal.multiplyScalar(0.05))
    cross.lookAt(camera.position)
    
    impactGroup.add(cross)
  }

  const clearImpacts = () => {
    while (impactGroup.children.length > 0) {
      const child = impactGroup.children[0]
      impactGroup.remove(child)
      child.geometry.dispose()
      child.material.dispose()
    }
  }

  const overlayCtx = overlay.getContext('2d')

  const resize = () => {
    const w = mount.clientWidth || 800
    const h = mount.clientHeight || 560
    sizeRef.current = { w, h }
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h, false)
    overlay.width = w
    overlay.height = h
  }

  const render = () => {
    renderer.render(scene, camera)
  }

  const dispose = () => {
    clearImpacts()
    renderer.dispose()
    mount.removeChild(renderer.domElement)
  }

  return {
    camera,
    renderer,
    overlayCtx,
    targetPosition: targetGroup.position,
    targetRadiusWorld: { inner: 0.8, outer: 2.5 },
    roomCollider,
    uiMesh,
    renderUI,
    handleUIInteraction,
    addImpact,
    clearImpacts,
    sizeRef,
    resize,
    render,
    dispose
  }
}
