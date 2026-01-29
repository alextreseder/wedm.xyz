import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { eventBus, EVENTS } from '../utils/eventBus';
import { OrientationGizmo } from '../utils/OrientationGizmo';
import { useStore } from '../store/useStore';
import type { MeshResult } from '../services/occtService';

const SceneWindow: React.FC = () => {
  // Store refs for accessing current state in closures
  // (useEffect closures capture values at mount time, so we use refs)
  const storeRef = useRef(useStore.getState());
  
  // Subscribe to store changes to keep refs updated
  useEffect(() => {
    const unsubscribe = useStore.subscribe((state) => {
      storeRef.current = state;
    });
    return unsubscribe;
  }, []);
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
  const highlightedVertexRef = useRef<{ index: number } | null>(null);
  
  // Vertex highlight sphere (created once, shown/hidden as needed)
  const vertexSphereRef = useRef<THREE.Mesh | null>(null);
  
  // Store vertex positions for proximity detection
  const vertexPositionsRef = useRef<Float32Array | null>(null);

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

    // Vertex highlight sphere (screen-space sized)
    const vertexSphereGeometry = new THREE.SphereGeometry(1, 16, 16);
    const vertexSphereMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xff0000,
        depthTest: false,  // Always visible
        transparent: true,
        opacity: 0.9
    });
    const vertexSphere = new THREE.Mesh(vertexSphereGeometry, vertexSphereMaterial);
    vertexSphere.visible = false;
    vertexSphere.renderOrder = 999; // Render on top
    scene.add(vertexSphere);
    vertexSphereRef.current = vertexSphere;

    // =========================================================================
    // SCREEN-SPACE PROXIMITY SELECTION
    // =========================================================================
    // Uses screen-space distance to determine selection priority:
    // Vertex (closest) > Edge > Face
    // Thresholds and enabled states are read from the store at runtime.
    // =========================================================================

    const VERTEX_SPHERE_SCREEN_SIZE = 5;   // pixels - consistent visual size
    
    // Helper to get current selection settings from store
    const getSelectionSettings = () => storeRef.current.mesh.selection;

    /**
     * Projects a 3D world point to 2D screen coordinates (pixels).
     * Returns { x, y, z } where z is the NDC depth (0-1, with >1 being behind camera).
     */
    const projectToScreen = (point: THREE.Vector3, viewWidth: number, viewHeight: number): { x: number, y: number, z: number } => {
        const projected = point.clone().project(camera);
        return {
            x: (projected.x + 1) / 2 * viewWidth,
            y: (-projected.y + 1) / 2 * viewHeight,
            z: projected.z
        };
    };

    /**
     * Calculates the minimum distance from a point to a line segment in 2D.
     */
    const distanceToLineSegment2D = (
        px: number, py: number,
        x1: number, y1: number,
        x2: number, y2: number
    ): number => {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lengthSq = dx * dx + dy * dy;
        
        if (lengthSq === 0) {
            // Segment is a point
            return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
        }
        
        // Project point onto line, clamping to segment
        let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
        t = Math.max(0, Math.min(1, t));
        
        const closestX = x1 + t * dx;
        const closestY = y1 + t * dy;
        
        return Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
    };

    // Reusable raycaster for occlusion checks
    const occlusionRaycaster = new THREE.Raycaster();
    const tempDirection = new THREE.Vector3();
    const tempMidpoint = new THREE.Vector3();

    /**
     * Checks if an edge segment is occluded by the mesh.
     * Raycasts from camera toward edge midpoint - if mesh is hit first, edge is occluded.
     */
    const isEdgeOccluded = (v1: THREE.Vector3, v2: THREE.Vector3, meshObjects: THREE.Object3D[]): boolean => {
        // Calculate midpoint of edge segment
        tempMidpoint.lerpVectors(v1, v2, 0.5);
        
        // Direction from camera to edge midpoint
        tempDirection.subVectors(tempMidpoint, camera.position).normalize();
        
        // Distance from camera to edge midpoint
        const edgeDistance = camera.position.distanceTo(tempMidpoint);
        
        // Raycast from camera toward edge
        occlusionRaycaster.set(camera.position, tempDirection);
        occlusionRaycaster.far = edgeDistance + 0.1; // Only check up to the edge
        
        const hits = occlusionRaycaster.intersectObjects(meshObjects, false);
        
        if (hits.length > 0) {
            // If mesh is hit BEFORE the edge (with small tolerance), edge is occluded
            const meshHitDistance = hits[0].distance;
            const TOLERANCE = 0.5; // Allow edges slightly behind due to polygon offset
            
            if (meshHitDistance < edgeDistance - TOLERANCE) {
                return true; // Mesh is between camera and edge = occluded
            }
        }
        
        return false; // Edge is visible
    };

    /**
     * Finds the closest VISIBLE edge to the cursor in screen space.
     * Uses raycasting to filter out edges occluded by the mesh.
     * Returns { edgeId, distance, linesObject } or null if no visible edges nearby.
     */
    const findClosestEdgeScreenSpace = (
        cursorX: number, 
        cursorY: number, 
        viewWidth: number, 
        viewHeight: number,
        meshObjects: THREE.Object3D[]  // Mesh objects for occlusion check
    ): { edgeId: number, distance: number, linesObject: THREE.LineSegments } | null => {
        // Find the LineSegments object in mainObject
        let linesObject: THREE.LineSegments | null = null;
        for (const child of mainObject.children) {
            if (child instanceof THREE.LineSegments) {
                linesObject = child;
                break;
            }
        }
        
        if (!linesObject) return null;
        
        const positions = linesObject.geometry.getAttribute('position');
        const edgeIds = linesObject.geometry.getAttribute('edgeId');
        if (!positions || !edgeIds) return null;

        let closestEdgeId = -1;
        let closestDistance = Infinity;

        // Temporary vectors for world position calculation
        const v1 = new THREE.Vector3();
        const v2 = new THREE.Vector3();

        // Iterate through line segments (pairs of vertices)
        for (let i = 0; i < positions.count; i += 2) {
            // Get world positions (applying object transforms)
            v1.set(positions.getX(i), positions.getY(i), positions.getZ(i));
            v2.set(positions.getX(i + 1), positions.getY(i + 1), positions.getZ(i + 1));
            
            // Apply the mainObject's world matrix to get true world coordinates
            v1.applyMatrix4(mainObject.matrixWorld);
            v2.applyMatrix4(mainObject.matrixWorld);

            // Project to screen space
            const s1 = projectToScreen(v1, viewWidth, viewHeight);
            const s2 = projectToScreen(v2, viewWidth, viewHeight);

            // Skip segments fully behind the camera
            if (s1.z > 1 && s2.z > 1) continue;

            // Calculate 2D distance from cursor to this segment
            const screenDist = distanceToLineSegment2D(cursorX, cursorY, s1.x, s1.y, s2.x, s2.y);

            // Early exit if this edge is farther than current best in screen space
            if (screenDist >= closestDistance) continue;
            
            // Only do expensive occlusion check for edges within threshold
            const edgeThreshold = getSelectionSettings().edgeProximityThreshold;
            if (screenDist < edgeThreshold) {
                // Check if edge is occluded by the mesh
                if (isEdgeOccluded(v1, v2, meshObjects)) {
                    continue; // Edge is hidden behind mesh
                }
            }

            closestDistance = screenDist;
            closestEdgeId = edgeIds.getX(i);
        }

        if (closestEdgeId === -1) return null;
        
        return { edgeId: closestEdgeId, distance: closestDistance, linesObject };
    };

    /**
     * Finds the closest VISIBLE vertex to the cursor in screen space.
     * Returns { vertexId, distance, worldPosition } or null if no visible vertices nearby.
     */
    const findClosestVertexScreenSpace = (
        cursorX: number,
        cursorY: number,
        viewWidth: number,
        viewHeight: number,
        meshObjects: THREE.Object3D[]
    ): { vertexId: number, distance: number, worldPosition: THREE.Vector3 } | null => {
        const positions = vertexPositionsRef.current;
        if (!positions || positions.length === 0) return null;

        let closestVertexId = -1;
        let closestDistance = Infinity;
        let closestWorldPos = new THREE.Vector3();

        const v = new THREE.Vector3();
        const numVertices = positions.length / 3;

        for (let i = 0; i < numVertices; i++) {
            // Get vertex position in local coordinates
            v.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
            
            // Apply mainObject's world matrix
            v.applyMatrix4(mainObject.matrixWorld);

            // Project to screen space
            const screen = projectToScreen(v, viewWidth, viewHeight);

            // Skip vertices behind camera
            if (screen.z > 1) continue;

            // Calculate 2D distance from cursor
            const dx = cursorX - screen.x;
            const dy = cursorY - screen.y;
            const screenDist = Math.sqrt(dx * dx + dy * dy);

            if (screenDist >= closestDistance) continue;

            // Occlusion check: raycast toward vertex to see if mesh blocks it
            const vertexThreshold = getSelectionSettings().vertexProximityThreshold;
            if (screenDist < vertexThreshold) {
                tempDirection.subVectors(v, camera.position).normalize();
                const vertexDist = camera.position.distanceTo(v);
                
                occlusionRaycaster.set(camera.position, tempDirection);
                occlusionRaycaster.far = vertexDist + 0.1;
                
                const hits = occlusionRaycaster.intersectObjects(meshObjects, false);
                if (hits.length > 0 && hits[0].distance < vertexDist - 0.5) {
                    continue; // Vertex is occluded
                }
            }

            closestDistance = screenDist;
            closestVertexId = i;
            closestWorldPos.copy(v);
        }

        if (closestVertexId === -1) return null;

        return { vertexId: closestVertexId, distance: closestDistance, worldPosition: closestWorldPos };
    };

    /**
     * Calculates the world-space radius for a sphere to appear as a fixed pixel size on screen.
     */
    const getWorldSizeForScreenPixels = (worldPosition: THREE.Vector3, screenPixels: number): number => {
        const distance = camera.position.distanceTo(worldPosition);
        // Use camera FOV to calculate world size
        const vFov = camera.fov * Math.PI / 180;
        const worldHeightAtDistance = 2 * Math.tan(vFov / 2) * distance;
        const pixelsPerWorldUnit = renderer.domElement.clientHeight / worldHeightAtDistance;
        return screenPixels / pixelsPerWorldUnit;
    };

    /**
     * Clears face highlight and resets colors.
     */
    const clearFaceHighlight = () => {
        if (highlightedFaceRef.current) {
            const colors = highlightedFaceRef.current.object.geometry.getAttribute('color');
            for (let i = 0; i < colors.count; i++) colors.setXYZ(i, 1, 1, 1);
            colors.needsUpdate = true;
            highlightedFaceRef.current = null;
        }
    };

    /**
     * Clears edge highlight and resets colors.
     */
    const clearEdgeHighlight = () => {
        if (highlightedEdgeRef.current) {
            const colors = highlightedEdgeRef.current.object.geometry.getAttribute('color');
            for (let i = 0; i < colors.count; i++) colors.setXYZ(i, 1, 1, 1);
            colors.needsUpdate = true;
            highlightedEdgeRef.current = null;
        }
    };

    /**
     * Applies highlight to a face by setting vertex colors to red.
     */
    const applyFaceHighlight = (mesh: THREE.Mesh, faceId: number) => {
        const faceIdAttribute = mesh.geometry.getAttribute('faceId');
        const colors = mesh.geometry.getAttribute('color');
        
        for (let i = 0; i < faceIdAttribute.count; i++) {
            if (faceIdAttribute.getX(i) === faceId) {
                colors.setXYZ(i, 1, 0, 0);
            }
        }
        colors.needsUpdate = true;
        highlightedFaceRef.current = { object: mesh, index: faceId };
    };

    /**
     * Applies highlight to an edge by setting vertex colors to red.
     */
    const applyEdgeHighlight = (lines: THREE.LineSegments, edgeId: number) => {
        const edgeIdAttribute = lines.geometry.getAttribute('edgeId');
        const colors = lines.geometry.getAttribute('color');
        
        for (let i = 0; i < edgeIdAttribute.count; i++) {
            if (edgeIdAttribute.getX(i) === edgeId) {
                colors.setXYZ(i, 1, 0, 0);
            }
        }
        colors.needsUpdate = true;
        highlightedEdgeRef.current = { object: lines, index: edgeId };
    };

    /**
     * Clears vertex highlight (hides the sphere).
     */
    const clearVertexHighlight = () => {
        if (highlightedVertexRef.current) {
            if (vertexSphereRef.current) {
                vertexSphereRef.current.visible = false;
            }
            highlightedVertexRef.current = null;
        }
    };

    /**
     * Shows vertex highlight sphere at the given position with screen-space sizing.
     */
    const applyVertexHighlight = (vertexId: number, worldPosition: THREE.Vector3) => {
        if (vertexSphereRef.current) {
            // Position the sphere at the vertex
            vertexSphereRef.current.position.copy(worldPosition);
            
            // Scale sphere to maintain consistent screen size
            const worldRadius = getWorldSizeForScreenPixels(worldPosition, VERTEX_SPHERE_SCREEN_SIZE);
            vertexSphereRef.current.scale.setScalar(worldRadius);
            
            vertexSphereRef.current.visible = true;
        }
        highlightedVertexRef.current = { index: vertexId };
    };

    // --- Main Mouse Move Handler ---
    const onMouseMove = (event: MouseEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        const viewWidth = rect.width;
        const viewHeight = rect.height;
        
        // Cursor position in pixels (relative to canvas)
        const cursorX = event.clientX - rect.left;
        const cursorY = event.clientY - rect.top;
        
        // Normalized device coordinates for raycasting
        mouseRef.current.x = (cursorX / viewWidth) * 2 - 1;
        mouseRef.current.y = -(cursorY / viewHeight) * 2 + 1;

        // Get current selection settings from store
        const settings = getSelectionSettings();

        // Get mesh children for raycasting and occlusion checks
        const meshChildren = mainObject.children.filter(c => c instanceof THREE.Mesh);

        // 1. Find closest VISIBLE vertex in screen space (if enabled)
        const closestVertex = settings.vertexEnabled 
            ? findClosestVertexScreenSpace(cursorX, cursorY, viewWidth, viewHeight, meshChildren)
            : null;

        // 2. Find closest VISIBLE edge in screen space (if enabled)
        const closestEdge = settings.edgeEnabled
            ? findClosestEdgeScreenSpace(cursorX, cursorY, viewWidth, viewHeight, meshChildren)
            : null;

        // 3. Raycast mesh for face detection (if enabled)
        let faceId: number | null = null;
        let meshObject: THREE.Mesh | null = null;
        
        if (settings.faceEnabled) {
            raycasterRef.current.setFromCamera(mouseRef.current, camera);
            const intersects = raycasterRef.current.intersectObjects(meshChildren, false);
            const faceHit = intersects.length > 0 ? intersects[0] : null;
            
            if (faceHit && faceHit.object instanceof THREE.Mesh && faceHit.face) {
                meshObject = faceHit.object;
                const faceIdAttr = meshObject.geometry.getAttribute('faceId');
                if (faceIdAttr) {
                    faceId = faceIdAttr.getX(faceHit.face.a);
                }
            }
        }

        // 4. Decision priority: Vertex > Edge > Face (respecting enabled states)
        const vertexWins = closestVertex && closestVertex.distance < settings.vertexProximityThreshold;
        const edgeWins = !vertexWins && closestEdge && closestEdge.distance < settings.edgeProximityThreshold;

        if (vertexWins && closestVertex) {
            // Hover Vertex
            const { vertexId, worldPosition } = closestVertex;
            
            if (!highlightedVertexRef.current || highlightedVertexRef.current.index !== vertexId) {
                clearFaceHighlight();
                clearEdgeHighlight();
                clearVertexHighlight();
                applyVertexHighlight(vertexId, worldPosition);
                containerRef.current!.title = `Vertex Index: ${vertexId}`;
                storeRef.current.setHoveredEntity({ type: 'vertex', id: vertexId });
                markDirty();
            }
        } else if (edgeWins && closestEdge) {
            // Hover Edge
            const { edgeId, linesObject } = closestEdge;
            
            if (!highlightedEdgeRef.current || highlightedEdgeRef.current.index !== edgeId) {
                clearFaceHighlight();
                clearEdgeHighlight();
                clearVertexHighlight();
                applyEdgeHighlight(linesObject, edgeId);
                containerRef.current!.title = `Edge Index: ${edgeId}`;
                storeRef.current.setHoveredEntity({ type: 'edge', id: edgeId });
                markDirty();
            }
        } else if (faceId !== null && meshObject) {
            // Hover Face
            if (!highlightedFaceRef.current || highlightedFaceRef.current.index !== faceId) {
                clearEdgeHighlight();
                clearVertexHighlight();
                clearFaceHighlight();
                applyFaceHighlight(meshObject, faceId);
                containerRef.current!.title = `Face Index: ${faceId}`;
                storeRef.current.setHoveredEntity({ type: 'face', id: faceId });
                markDirty();
            }
        } else {
            // Clear all highlights
            if (highlightedFaceRef.current || highlightedEdgeRef.current || highlightedVertexRef.current) {
                clearFaceHighlight();
                storeRef.current.setHoveredEntity(null);
                clearEdgeHighlight();
                clearVertexHighlight();
                containerRef.current!.title = "";
                markDirty();
            }
        }
    };

    containerRef.current.addEventListener('mousemove', onMouseMove);

    // --- Click Handler for Selection ---
    const onClick = (_event: MouseEvent) => {
        // Toggle selection based on what's currently hovered
        const hovered = storeRef.current.hoveredEntity;
        if (!hovered) return;

        if (hovered.type === 'vertex') {
            storeRef.current.toggleVertexSelection(hovered.id);
        } else if (hovered.type === 'edge') {
            storeRef.current.toggleEdgeSelection(hovered.id);
        } else if (hovered.type === 'face') {
            storeRef.current.toggleFaceSelection(hovered.id);
        }
        
        markDirty();
    };

    containerRef.current.addEventListener('click', onClick);

    // --- Event Listeners ---
    const unsubscribe = eventBus.on(EVENTS.MODEL_LOADED, (meshData: MeshResult | null) => {
      mainObject.clear();
      highlightedFaceRef.current = null;
      highlightedEdgeRef.current = null;
      highlightedVertexRef.current = null;
      vertexPositionsRef.current = null;
      
      // Hide vertex sphere
      if (vertexSphereRef.current) {
          vertexSphereRef.current.visible = false;
      }
      
      if (!meshData) {
        markDirty();
        return;
      }
      
      // Store vertex positions for proximity detection
      if (meshData.vertices && meshData.vertices.positions.length > 0) {
          vertexPositionsRef.current = meshData.vertices.positions;
          console.log(`Loaded ${meshData.vertices.positions.length / 3} vertices for selection`);
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

      // 2. Build Edge Lines (wireframe)
      // Uses PolygonOnTriangulation data from worker for perfect mesh alignment
      if (meshData.edges && meshData.edges.positions.length > 0) {
          const edgeGeo = new THREE.BufferGeometry();
          edgeGeo.setAttribute('position', new THREE.BufferAttribute(meshData.edges.positions, 3));
          edgeGeo.setAttribute('edgeId', new THREE.BufferAttribute(meshData.edges.ids, 1));
          
          // Initialize all edge colors to white
          const edgeCount = meshData.edges.positions.length / 3;
          const edgeColors = new Float32Array(edgeCount * 3).fill(1);
          edgeGeo.setAttribute('color', new THREE.BufferAttribute(edgeColors, 3));

          const lineMat = new THREE.LineBasicMaterial({ 
              color: 0xffffff,
              vertexColors: true,
              // Use polygonOffset to render edges slightly in front of faces
              polygonOffset: true,
              polygonOffsetFactor: -1,
              polygonOffsetUnits: -1
          });
          
          const lines = new THREE.LineSegments(edgeGeo, lineMat);
          lines.renderOrder = 1;
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
      containerRef.current?.removeEventListener('click', onClick);
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
