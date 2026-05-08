<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'

const containerRef = ref<HTMLDivElement | null>(null)

let renderer: THREE.WebGLRenderer | null = null
let animationId: number | null = null
let cleanupFns: (() => void)[] = []

onMounted(() => {
  if (!containerRef.value) return

  const container = containerRef.value
  const width = container.clientWidth
  const height = container.clientHeight

  // Mouse tracking
  const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 }

  const onMouseMove = (e: MouseEvent) => {
    // Normalize to -1 to 1 relative to viewport
    mouse.targetX = (e.clientX / window.innerWidth) * 2 - 1
    mouse.targetY = -(e.clientY / window.innerHeight) * 2 + 1
  }
  window.addEventListener('mousemove', onMouseMove)
  cleanupFns.push(() => window.removeEventListener('mousemove', onMouseMove))

  // Scene
  const scene = new THREE.Scene()

  // Camera — wide FOV, pulled back so sphere is fully within frustum
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100)
  camera.position.set(0, 0, 6)
  camera.lookAt(0, 0, 0)

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)
  container.appendChild(renderer.domElement)

  // Main group
  const group = new THREE.Group()
  scene.add(group)

  // ── Hex Sphere (icosahedron detail 2) — large radius ──
  const baseGeo = new THREE.IcosahedronGeometry(2.2, 2)

  // Custom shader material for the wireframe with gradient
  const edgesGeo = new THREE.EdgesGeometry(baseGeo)
  const edgePositions = edgesGeo.attributes.position
  const edgeColors = new Float32Array(edgePositions.count * 3)

  // Create blue-to-purple gradient based on Y position
  for (let i = 0; i < edgePositions.count; i++) {
    const y = edgePositions.getY(i)
    const t = (y + 2.2) / 4.4 // normalize 0-1

    // Blue (#2563eb) to Neon Purple (#a855f7)
    const r = 0.145 + t * (0.659 - 0.145)
    const g = 0.388 + t * (0.333 - 0.388)
    const b = 0.922 + t * (0.969 - 0.922)

    edgeColors[i * 3] = r
    edgeColors[i * 3 + 1] = g
    edgeColors[i * 3 + 2] = b
  }
  edgesGeo.setAttribute('color', new THREE.BufferAttribute(edgeColors, 3))

  const edgesMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.5
  })
  const wireframe = new THREE.LineSegments(edgesGeo, edgesMat)
  group.add(wireframe)

  // Subtle face fill with gradient
  const faceMat = new THREE.MeshBasicMaterial({
    color: 0x6366f1,
    transparent: true,
    opacity: 0.04,
    side: THREE.DoubleSide
  })
  const faceMesh = new THREE.Mesh(baseGeo, faceMat)
  group.add(faceMesh)

  // ── Vertex dots with color gradient ──
  const positions = baseGeo.attributes.position
  const uniqueVerts: THREE.Vector3[] = []
  const seen = new Set<string>()

  for (let i = 0; i < positions.count; i++) {
    const x = parseFloat(positions.getX(i).toFixed(3))
    const y = parseFloat(positions.getY(i).toFixed(3))
    const z = parseFloat(positions.getZ(i).toFixed(3))
    const key = `${x},${y},${z}`
    if (!seen.has(key)) {
      seen.add(key)
      uniqueVerts.push(new THREE.Vector3(x, y, z))
    }
  }

  const dotGeo = new THREE.BufferGeometry()
  const dotPositions = new Float32Array(uniqueVerts.length * 3)
  const dotColors = new Float32Array(uniqueVerts.length * 3)

  const blue = new THREE.Color(0x2563eb)
  const purple = new THREE.Color(0xa855f7)
  const neonPink = new THREE.Color(0xec4899)

  uniqueVerts.forEach((v, i) => {
    dotPositions[i * 3] = v.x
    dotPositions[i * 3 + 1] = v.y
    dotPositions[i * 3 + 2] = v.z

    // Gradient based on vertical position
    const t = (v.y + 2.2) / 4.4
    const rand = Math.random()
    let color: THREE.Color

    if (rand < 0.15) {
      color = neonPink.clone()
    } else {
      color = blue.clone().lerp(purple, t)
    }

    dotColors[i * 3] = color.r
    dotColors[i * 3 + 1] = color.g
    dotColors[i * 3 + 2] = color.b
  })

  dotGeo.setAttribute('position', new THREE.BufferAttribute(dotPositions, 3))
  dotGeo.setAttribute('color', new THREE.BufferAttribute(dotColors, 3))

  const dotMat = new THREE.PointsMaterial({
    size: 0.05,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    sizeAttenuation: true
  })
  const dots = new THREE.Points(dotGeo, dotMat)
  group.add(dots)

  // ── Outer ring particles (orbiting) ──
  const ringCount = 80
  const ringGeo = new THREE.BufferGeometry()
  const ringPos = new Float32Array(ringCount * 3)
  const ringCol = new Float32Array(ringCount * 3)
  const ringAngles: number[] = []
  const ringRadii: number[] = []
  const ringSpeeds: number[] = []
  const ringOffsets: number[] = []

  for (let i = 0; i < ringCount; i++) {
    const angle = Math.random() * Math.PI * 2
    const radius = 2.8 + Math.random() * 0.8
    const yOff = (Math.random() - 0.5) * 1.8

    ringAngles.push(angle)
    ringRadii.push(radius)
    ringSpeeds.push(0.2 + Math.random() * 0.4)
    ringOffsets.push(yOff)

    ringPos[i * 3] = Math.cos(angle) * radius
    ringPos[i * 3 + 1] = yOff
    ringPos[i * 3 + 2] = Math.sin(angle) * radius

    // Blue to purple
    const t = Math.random()
    const c = blue.clone().lerp(purple, t)
    ringCol[i * 3] = c.r
    ringCol[i * 3 + 1] = c.g
    ringCol[i * 3 + 2] = c.b
  }

  ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3))
  ringGeo.setAttribute('color', new THREE.BufferAttribute(ringCol, 3))

  const ringMat = new THREE.PointsMaterial({
    size: 0.025,
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true
  })
  const ringPoints = new THREE.Points(ringGeo, ringMat)
  group.add(ringPoints)

  // ── Inner glow ──
  const glowGeo = new THREE.SphereGeometry(1.6, 32, 32)
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x6366f1,
    transparent: true,
    opacity: 0.03
  })
  const glow = new THREE.Mesh(glowGeo, glowMat)
  group.add(glow)

  // Position: push to bottom-right of view, partially off-screen
  group.position.set(2.2, -1.2, 0)

  // Initial tilt
  group.rotation.x = 0.2
  group.rotation.z = 0.05

  // ── Animation ──
  const clock = new THREE.Clock()

  function animate() {
    animationId = requestAnimationFrame(animate)
    const t = clock.getElapsedTime()

    // Smooth mouse follow
    mouse.x += (mouse.targetX - mouse.x) * 0.05
    mouse.y += (mouse.targetY - mouse.y) * 0.05

    // Mouse affects rotation (interactive tilt)
    group.rotation.y = t * 0.1 + mouse.x * 0.5
    group.rotation.x = 0.2 + mouse.y * 0.3

    // Breathing
    const breath = 1 + Math.sin(t * 0.7) * 0.025
    group.scale.setScalar(breath)

    // Edge pulse
    edgesMat.opacity = 0.4 + Math.sin(t * 0.5) * 0.15

    // Face pulse
    faceMat.opacity = 0.04 + Math.sin(t * 1.0) * 0.02

    // Glow pulse
    glowMat.opacity = 0.03 + Math.sin(t * 0.8) * 0.015

    // Update ring particles (orbit)
    const ringPositions = ringGeo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < ringCount; i++) {
      const angle = ringAngles[i] + t * ringSpeeds[i] * 0.3
      const radius = ringRadii[i] + Math.sin(t * 0.5 + i) * 0.05
      ringPositions.setXYZ(
        i,
        Math.cos(angle) * radius,
        ringOffsets[i] + Math.sin(t * 0.4 + i * 0.5) * 0.15,
        Math.sin(angle) * radius
      )
    }
    ringPositions.needsUpdate = true

    renderer!.render(scene, camera)
  }

  animate()

  // Resize
  const onResize = () => {
    if (!container || !renderer) return
    const w = container.clientWidth
    const h = container.clientHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  window.addEventListener('resize', onResize)
  cleanupFns.push(() => window.removeEventListener('resize', onResize))

  // Cleanup disposables
  cleanupFns.push(() => {
    if (animationId !== null) cancelAnimationFrame(animationId)
    baseGeo.dispose()
    edgesGeo.dispose()
    edgesMat.dispose()
    faceMat.dispose()
    dotGeo.dispose()
    dotMat.dispose()
    ringGeo.dispose()
    ringMat.dispose()
    glowGeo.dispose()
    glowMat.dispose()
    renderer?.dispose()
    if (renderer?.domElement && container.contains(renderer.domElement)) {
      container.removeChild(renderer.domElement)
    }
  })
})

onBeforeUnmount(() => {
  cleanupFns.forEach(fn => fn())
  cleanupFns = []
})
</script>

<template>
  <div ref="containerRef" class="w-full h-full"></div>
</template>
