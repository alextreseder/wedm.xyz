import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { eventBus, EVENTS } from '../utils/eventBus';
import { OrientationGizmo } from '../utils/OrientationGizmo';
import type { MeshResult } from '../services/occtService';

const SceneWindow: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const gizmoRef = useRef<OrientationGizmo | null>(null);
  const gizmoContainerRef = useRef<HTMLDivElement>(null);
  
  // Raycaster state
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const highlightedFaceRef = useRef<{ object: THREE.Mesh, index: number } | null>(null);
  const highlightedEdgeRef = useRef<{ object: THREE.LineSegments, index: number } | null>(null);

  // Using a ref to track dirty state across closures
  const viewDirtyRef = { current: true };
  const markDirty = () => { viewDirtyRef.current = true; };

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
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 5000);
    camera.position.set(50, 100, 150);
    camera.lookAt(0, 45, 0);
    cameraRef.current = camera;

    // Initialize Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Initialize Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 45, 0);
    controls.panSpeed = 2;
    controls.zoomSpeed = 1;
    controls.enableDamping = false;
    controls.screenSpacePanning = true;
    controls.update();
    controlsRef.current = controls;

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
            controls.update();
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
    light2.shadow.mapSize.width = 1024;
    light2.shadow.mapSize.height = 1024;
    scene.add(light2);

    // Load Materials
    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin('');
    const matcap = textureLoader.load('./textures/dullFrontLitMetal.png', () => markDirty());

    const matcapMaterial = new THREE.MeshMatcapMaterial({
      color: new THREE.Color(0xf5f5f5),
      matcap: matcap,
      polygonOffset: true,
      polygonOffsetFactor: 2.0,
      polygonOffsetUnits: 1.0,
      vertexColors: true // Enable vertex colors for highlighting
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

    // --- Interaction Logic ---
    const onMouseMove = (event: MouseEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        // Raycasting for highlight
        raycasterRef.current.setFromCamera(mouseRef.current, camera);
        
        // Intersect main object children (Mesh and Lines)
        const intersects = raycasterRef.current.intersectObjects(mainObject.children, false);
        
        if (intersects.length > 0) {
            const hit = intersects[0];
            const object = hit.object;

            if (object instanceof THREE.Mesh) {
                // Handle Face Highlight
                // The hit.face.a is the index of the first vertex of the triangle hit
                const faceIdAttribute = object.geometry.getAttribute('faceId');
                
                if (faceIdAttribute && hit.face) {
                    const faceId = faceIdAttribute.getX(hit.face.a); // Get custom Face ID

                    // Only update if changed
                    if (!highlightedFaceRef.current || highlightedFaceRef.current.index !== faceId) {
                        
                        // Clear previous highlight
                        if (highlightedFaceRef.current) {
                            const colors = highlightedFaceRef.current.object.geometry.getAttribute('color');
                            // Reset to white
                             for (let i = 0; i < colors.count; i++) {
                                colors.setXYZ(i, 1, 1, 1);
                            }
                            colors.needsUpdate = true;
                        }

                        // Apply new highlight
                        const colors = object.geometry.getAttribute('color');
                        for (let i = 0; i < faceIdAttribute.count; i++) {
                            if (faceIdAttribute.getX(i) === faceId) {
                                colors.setXYZ(i, 1, 0, 0); // Red highlight
                            }
                        }
                        colors.needsUpdate = true;
                        
                        highlightedFaceRef.current = { object, index: faceId };
                        containerRef.current!.title = `Face Index: ${faceId}`;
                        markDirty();
                    }
                }
            } else if (object instanceof THREE.LineSegments) {
                // Handle Edge Highlight
                // Line intersection gives index of segment
                const edgeIdAttribute = object.geometry.getAttribute('edgeId');
                if (edgeIdAttribute && hit.index !== undefined) {
                    // For LineSegments, index is the index of the start vertex of the segment
                    const edgeId = edgeIdAttribute.getX(hit.index);

                    if (!highlightedEdgeRef.current || highlightedEdgeRef.current.index !== edgeId) {
                        // Clear previous
                         if (highlightedEdgeRef.current) {
                            const colors = highlightedEdgeRef.current.object.geometry.getAttribute('color');
                            for (let i = 0; i < colors.count; i++) colors.setXYZ(i, 1, 1, 1);
                            colors.needsUpdate = true;
                        }

                        // Highlight
                        const colors = object.geometry.getAttribute('color');
                        for (let i = 0; i < edgeIdAttribute.count; i++) {
                            if (edgeIdAttribute.getX(i) === edgeId) {
                                colors.setXYZ(i, 1, 0, 0); // Red
                            }
                        }
                        colors.needsUpdate = true;

                        highlightedEdgeRef.current = { object, index: edgeId };
                        containerRef.current!.title = `Edge Index: ${edgeId}`;
                        markDirty();
                    }
                }
            }
        } else {
            // Clear highlights if nothing hit
            if (highlightedFaceRef.current) {
                 const colors = highlightedFaceRef.current.object.geometry.getAttribute('color');
                 for (let i = 0; i < colors.count; i++) colors.setXYZ(i, 1, 1, 1);
                 colors.needsUpdate = true;
                 highlightedFaceRef.current = null;
                 containerRef.current!.title = "";
                 markDirty();
            }
            if (highlightedEdgeRef.current) {
                const colors = highlightedEdgeRef.current.object.geometry.getAttribute('color');
                for (let i = 0; i < colors.count; i++) colors.setXYZ(i, 1, 1, 1);
                colors.needsUpdate = true;
                highlightedEdgeRef.current = null;
                containerRef.current!.title = "";
                markDirty();
            }
        }
    };

    containerRef.current.addEventListener('mousemove', onMouseMove);

    // --- Event Listeners ---
    const unsubscribe = eventBus.on(EVENTS.MODEL_LOADED, (meshData: MeshResult | null) => {
      mainObject.clear();
      highlightedFaceRef.current = null;
      highlightedEdgeRef.current = null;
      
      if (!meshData) {
        markDirty();
        return;
      }

      // console.log('Building geometry from manual mesh data...');
      // console.log('Faces:', meshData.faces.positions.length / 3, 'vertices');
      // console.log('Edges:', meshData.edges.positions.length / 3, 'vertices');

      // 1. Build Face Mesh
      if (meshData.faces.positions.length === 0) {
          console.warn("No face data received from worker.");
      }

      const faceGeo = new THREE.BufferGeometry();
      faceGeo.setAttribute('position', new THREE.BufferAttribute(meshData.faces.positions, 3));
      faceGeo.setAttribute('normal', new THREE.BufferAttribute(meshData.faces.normals, 3));
      faceGeo.setIndex(new THREE.BufferAttribute(meshData.faces.indices, 1));
      
      // Custom Attribute: Face ID
      faceGeo.setAttribute('faceId', new THREE.BufferAttribute(meshData.faces.ids, 1));
      
      // Color Attribute (Initialized to White)
      const faceCount = meshData.faces.positions.length / 3;
      const faceColors = new Float32Array(faceCount * 3).fill(1); // RGB: 1,1,1
      faceGeo.setAttribute('color', new THREE.BufferAttribute(faceColors, 3));

      const mesh = new THREE.Mesh(faceGeo, matcapMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mainObject.add(mesh);

      // 2. Build Edge Lines
      if (meshData.edges && meshData.edges.positions.length > 0) {
          const edgeGeo = new THREE.BufferGeometry();
          edgeGeo.setAttribute('position', new THREE.BufferAttribute(meshData.edges.positions, 3));
          edgeGeo.setAttribute('edgeId', new THREE.BufferAttribute(meshData.edges.ids, 1));
          
          const edgeCount = meshData.edges.positions.length / 3;
          const edgeColors = new Float32Array(edgeCount * 3).fill(1);
          edgeGeo.setAttribute('color', new THREE.BufferAttribute(edgeColors, 3));

          const lineMat = new THREE.LineBasicMaterial({ 
              vertexColors: true, 
              linewidth: 2, 
              depthTest: false // Draw on top
          });
          // Note: depthTest false makes lines always visible, might want polygonOffset instead?
          // Trying polygonOffset on lines is tricky, usually handled by material.
          
          const lines = new THREE.LineSegments(edgeGeo, lineMat);
          mainObject.add(lines);
      }

      // Center camera
      const box = new THREE.Box3().setFromObject(mainObject);
      const center = box.getCenter(new THREE.Vector3());
      controls.target.copy(center);
      controls.update();
      markDirty();
    });

    // Animation Loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);

      if (controlsRef.current) controlsRef.current.update();
      if (gizmoRef.current) gizmoRef.current.update();

      if (viewDirtyRef.current && rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
        viewDirtyRef.current = false;
      }
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;
      cameraRef.current.aspect = newWidth / newHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(newWidth, newHeight);
      markDirty();
    };

    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(containerRef.current);

    return () => {
      unsubscribe();
      containerRef.current?.removeEventListener('mousemove', onMouseMove);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (rendererRef.current) {
        rendererRef.current.dispose();
        containerRef.current?.removeChild(rendererRef.current.domElement);
      }
      if (gizmoRef.current) gizmoRef.current.dispose();
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div 
      ref={containerRef} 
      style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }} 
    >
      <div 
        ref={gizmoContainerRef} 
        style={{ position: 'absolute', top: '15px', left: '15px', zIndex: 1000 }}
      />
    </div>
  );
};

export default SceneWindow;
