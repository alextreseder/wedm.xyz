import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { eventBus, EVENTS } from '../utils/eventBus';
import { OrientationGizmo } from '../utils/OrientationGizmo';

const SceneWindow: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const gizmoRef = useRef<OrientationGizmo | null>(null);
  const gizmoContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize Scene
    const scene = new THREE.Scene();
    const backgroundColor = 0x16161D;
    scene.background = new THREE.Color(backgroundColor);
    scene.fog = new THREE.Fog(backgroundColor, 200, 600);
    sceneRef.current = scene;

    // Initialize Camera
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    // this.camera = new THREE.PerspectiveCamera (45, 1, 1, 5000);
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 5000);
    camera.position.set(50, 100, 150);
    camera.lookAt(0, 45, 0);
    cameraRef.current = camera;

    // Initialize Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    // this.renderer.shadowMap.enabled = true;
    // this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Initialize Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 45, 0);
    controls.panSpeed = 2;
    controls.zoomSpeed = 1;
    controls.enableDamping = false; // Disabled as per request
    controls.screenSpacePanning = true;
    controls.update();
    controlsRef.current = controls;

    // Lazy Rendering Logic
    // Using a ref to track dirty state across closures
    const viewDirtyRef = { current: true };
    const markDirty = () => { viewDirtyRef.current = true; };

    controls.addEventListener('change', markDirty);

    // Initialize Orientation Gizmo
    if (gizmoContainerRef.current) {
        const gizmo = new OrientationGizmo(camera, { size: 100 });
        gizmoContainerRef.current.appendChild(gizmo.getElement());
        
        gizmo.onAxisSelected = (axis) => {
            const distance = camera.position.distanceTo(controls.target);
            const newPos = axis.direction.multiplyScalar(distance).add(controls.target);
            camera.position.copy(newPos);
            camera.lookAt(controls.target);
            controls.update(); // Update controls to match new camera pos
            markDirty();
        };
        gizmoRef.current = gizmo;
    }

    // Lights
    const light = new THREE.HemisphereLight(0xffffff, 0x444444);
    light.position.set(0, 200, 0);
    scene.add(light);

    const light2 = new THREE.DirectionalLight(0xbbbbbb);
    light2.position.set(6, 50, -12);
    light2.castShadow = true;
    light2.shadow.camera.top = 200;
    light2.shadow.camera.bottom = -200;
    light2.shadow.camera.left = -200;
    light2.shadow.camera.right = 200;
    light2.shadow.mapSize.width = 1024; // 128 is very low resolution
    light2.shadow.mapSize.height = 1024;
    scene.add(light2);

    // Load the Shiny Dull Metal Matcap Material
    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin('');
    const matcap = textureLoader.load('./textures/dullFrontLitMetal.png', () => {
      markDirty();
    });

    const matcapMaterial = new THREE.MeshMatcapMaterial({
      color: new THREE.Color(0xf5f5f5),
      matcap: matcap,
      polygonOffset: true,
      polygonOffsetFactor: 2.0,
      polygonOffsetUnits: 1.0
    });

    // Create the ground mesh
    const groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.MeshPhongMaterial({
        color: 0x080808,
        depthWrite: true,
        dithering: true,
        polygonOffset: true,
        polygonOffsetFactor: 6.0,
        polygonOffsetUnits: 1.0
      })
    );
    groundMesh.position.y = -0.1;
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // Create the Ground Grid
    const grid = new THREE.GridHelper(2000, 20, 0xcccccc, 0xcccccc);
    grid.position.y = -0.01;
    grid.material.opacity = 0.3;
    grid.material.transparent = true;
    scene.add(grid);

    // Main Object Group
    const mainObject = new THREE.Group();
    mainObject.name = "shape";
    mainObject.rotation.x = -Math.PI / 2;
    scene.add(mainObject);

    // Listen for model loading events
    const unsubscribe = eventBus.on(EVENTS.MODEL_LOADED, (url: string | null) => {
      // Clear previous model if needed
      mainObject.clear();
      
      if (!url) {
        console.log('Scene cleared');
        markDirty();
        return;
      }

      console.log('SceneWindow received model URL:', url);
      const loader = new GLTFLoader();
      loader.load(url, (gltf: any) => {
        // Clear previous model if needed - Done above
        // mainObject.clear(); 
        // For now, let's add to mainObject instead of scene root
        
        mainObject.add(gltf.scene);
        console.log('Model added to scene');
        
        // Enable shadows and apply matcap material for the loaded model
        gltf.scene.traverse((child: any) => {
           if (child.isMesh) {
             child.castShadow = true;
             child.receiveShadow = true;
             child.material = matcapMaterial; // Apply the metal matcap
           }
        });

        // Center camera on object
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 * Math.tan(fov * 2));
        cameraZ *= 1.5; // Zoom out a bit

        // camera.position.set(center.x + cameraZ, center.y + cameraZ / 2, center.z + cameraZ);
        controls.target.copy(center);
        controls.update();
        markDirty(); // Trigger render

      }, undefined, (error: any) => {
        console.error('Error loading GLTF:', error);
      });
    });

    // Animation Loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);

      if (controlsRef.current) {
        controlsRef.current.update();
      }
      
      // Always update gizmo on each frame if camera moves
      // But for lazy rendering, we might only want to update if dirty.
      // However, gizmo needs continuous updates during drag.
      // Let's hook it into the dirty check or just run it.
      // Running it always is safer for smoothness during interaction.
      if (gizmoRef.current) {
          gizmoRef.current.update();
      }

      // Lazy rendering: only render if view is dirty or loading happened
      if (viewDirtyRef.current && rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
        viewDirtyRef.current = false;
      }
    };
    animate();

    // Handle Resize
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;

      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;

      cameraRef.current.aspect = newWidth / newHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(newWidth, newHeight);
      markDirty();
    };

    const resizeObserver = new ResizeObserver(() => {
        handleResize();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      unsubscribe();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
        if (containerRef.current?.contains(rendererRef.current.domElement)) {
            containerRef.current.removeChild(rendererRef.current.domElement);
        }
      }
      if (gizmoRef.current) {
        gizmoRef.current.dispose();
        if (gizmoContainerRef.current && gizmoRef.current.getElement()) {
            gizmoContainerRef.current.innerHTML = '';
        }
      }
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '100%', 
        height: '100%', 
        overflow: 'hidden',
        position: 'relative'
      }} 
    >
      <div 
        ref={gizmoContainerRef} 
        style={{
            position: 'absolute',
            top: '15px',
            left: '15px',
            zIndex: 1000
            // pointerEvents: 'none' removed to allow interaction with the gizmo
        }}
      />
    </div>
  );
};

export default SceneWindow;
