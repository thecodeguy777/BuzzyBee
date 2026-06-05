<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'

const props = withDefaults(defineProps<{
  /** Overall opacity of the gradient (0-1) */
  opacity?: number
  /** Animation speed multiplier */
  speed?: number
  /** Shift color emphasis: 'blue' | 'purple' | 'mixed' */
  tone?: 'blue' | 'purple' | 'mixed'
}>(), {
  opacity: 1,
  speed: 1,
  tone: 'mixed'
})

const containerRef = ref<HTMLDivElement | null>(null)

let renderer: THREE.WebGLRenderer | null = null
let animationId: number | null = null
let cleanupFns: (() => void)[] = []

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = `
  uniform float uTime;
  uniform vec2 uMouse;
  uniform vec2 uResolution;
  uniform float uSpeed;
  uniform float uTone;
  varying vec2 vUv;

  // Simplex-like noise
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m;
    m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    vec2 uv = vUv;

    // Mouse influence (subtle displacement)
    vec2 mouseInfluence = (uMouse - 0.5) * 0.15;
    uv += mouseInfluence * smoothstep(0.8, 0.0, length(uv - 0.5));

    float t = uTime * 0.15 * uSpeed;

    // Multiple noise layers for organic flow
    float n1 = snoise(uv * 1.5 + vec2(t * 0.4, t * 0.3));
    float n2 = snoise(uv * 2.5 + vec2(-t * 0.3, t * 0.5));
    float n3 = snoise(uv * 3.5 + vec2(t * 0.2, -t * 0.4));

    // Color palette: light and airy — sky blue -> royal blue -> soft indigo -> lavender -> light violet
    vec3 col1 = vec3(0.85, 0.91, 1.0);    // light sky
    vec3 col2 = vec3(0.55, 0.7, 0.98);    // soft blue
    vec3 col3 = vec3(0.45, 0.52, 0.95);   // periwinkle
    vec3 col4 = vec3(0.72, 0.55, 0.96);   // lavender
    vec3 col5 = vec3(0.82, 0.7, 1.0);     // light violet

    // Mix colors based on noise
    float blend1 = smoothstep(-0.5, 0.5, n1);
    float blend2 = smoothstep(-0.3, 0.6, n2);
    float blend3 = smoothstep(-0.4, 0.4, n3);

    vec3 color = mix(col1, col2, blend1);
    color = mix(color, col3, blend2 * 0.7);
    color = mix(color, col4, blend3 * 0.5);

    // Add subtle bright spots
    float highlight = smoothstep(0.4, 0.8, n1 * n2);
    color = mix(color, vec3(1.0), highlight * 0.15);

    // Vignette: fade edges to transparent
    float vignette = smoothstep(0.0, 0.4, uv.x) * smoothstep(1.0, 0.6, uv.x)
                   * smoothstep(0.0, 0.3, uv.y) * smoothstep(1.0, 0.7, uv.y);

    // Stronger presence in bottom-right
    float bottomRight = smoothstep(0.0, 1.0, uv.x * 0.7 + (1.0 - uv.y) * 0.5);
    float alpha = vignette * mix(0.4, 0.85, bottomRight);

    gl_FragColor = vec4(color, alpha);
  }
`

onMounted(() => {
  if (!containerRef.value) return

  const container = containerRef.value
  const width = container.clientWidth
  const height = container.clientHeight

  // Mouse
  const mouse = { x: 0.5, y: 0.5, targetX: 0.5, targetY: 0.5 }
  const onMouseMove = (e: MouseEvent) => {
    mouse.targetX = e.clientX / window.innerWidth
    mouse.targetY = 1.0 - (e.clientY / window.innerHeight)
  }
  window.addEventListener('mousemove', onMouseMove)
  cleanupFns.push(() => window.removeEventListener('mousemove', onMouseMove))

  // Scene
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)
  container.appendChild(renderer.domElement)

  // Fullscreen quad with shader
  const geometry = new THREE.PlaneGeometry(2, 2)
  const uniforms = {
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    uResolution: { value: new THREE.Vector2(width, height) },
    uSpeed: { value: props.speed },
    uTone: { value: props.tone === 'blue' ? 0.0 : props.tone === 'purple' ? 1.0 : 0.5 }
  }

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false
  })

  const mesh = new THREE.Mesh(geometry, material)
  scene.add(mesh)

  // Animation (THREE.Clock is deprecated — use a plain timestamp)
  const startTime = performance.now()

  function animate() {
    animationId = requestAnimationFrame(animate)

    // Smooth mouse
    mouse.x += (mouse.targetX - mouse.x) * 0.03
    mouse.y += (mouse.targetY - mouse.y) * 0.03

    uniforms.uTime.value = (performance.now() - startTime) / 1000
    uniforms.uMouse.value.set(mouse.x, mouse.y)

    renderer!.render(scene, camera)
  }
  animate()

  // Resize
  const onResize = () => {
    if (!container || !renderer) return
    const w = container.clientWidth
    const h = container.clientHeight
    renderer.setSize(w, h)
    uniforms.uResolution.value.set(w, h)
  }
  window.addEventListener('resize', onResize)
  cleanupFns.push(() => window.removeEventListener('resize', onResize))

  // Cleanup
  cleanupFns.push(() => {
    if (animationId !== null) cancelAnimationFrame(animationId)
    geometry.dispose()
    material.dispose()
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
  <div ref="containerRef" class="w-full h-full" :style="{ opacity: props.opacity }"></div>
</template>
