import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
let controls = null; // Declare controls variable

// Function to initialize the renderer after DOM is ready
const initializeRenderer = () => {
  const container = document.getElementById('renderContainer');
  const width = container.clientWidth;
  const height = container.clientHeight;
  
  renderer.setSize(width, height);
  renderer.setClearColor(0x222936);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
  // Ensure the container is ready before appending
  if (container && !container.contains(renderer.domElement)) {
    container.appendChild(renderer.domElement);
  }
  
  // Update camera aspect ratio
  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  // Initialize or update controls
  if (!controls) {
    controls = new TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 1.0;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    controls.noZoom = false;
    controls.noPan = false;
    controls.staticMoving = true;
    controls.rotateButton = THREE.MOUSE.MIDDLE;
    controls.zoomButton = THREE.MOUSE.RIGHT;
    controls.panButton = null;
    controls.enabled = true;
    controls.screenSpacePanning = false;
  } else {
    controls.enabled = true;
  }
};

// Wait for DOM to be fully loaded and layout to be established
document.addEventListener('DOMContentLoaded', () => {
  // Small delay to ensure layout is complete
  setTimeout(() => {
    initializeRenderer();
    
    // Update on window resize
    window.addEventListener('resize', () => {
      initializeRenderer();
    });
  }, 0);
});

// Lighting
const light = new THREE.DirectionalLight(0xffffff, 2.0);
light.position.set(0, 0, 500);
light.castShadow = true;
light.shadow.mapSize.width = 1024;
light.shadow.mapSize.height = 1024;
light.shadow.camera.near = 0.5;
light.shadow.camera.far = 1000;
scene.add(light);
scene.add(new THREE.AmbientLight(0x606060, 1.5));

// Coordinate vectors (axes) with dynamic scaling
let axisLength = 50;
const axes = new THREE.Group();
let xAxis, yAxis, zAxis;
const createTextSprite = (text, color) => {
  const canvas = document.createElement('canvas');
  const size = 32;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  context.fillStyle = color;
  context.font = 'Bold 20px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, size / 2, size / 2);
  const texture = new THREE.Texture(canvas);
  texture.needsUpdate = true;
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(10, 10, 1);
  return sprite;
};
let xLabel, yLabel, zLabel;
const updateAxes = (bbox) => {
  const bboxSize = new THREE.Vector3(
    bbox.max.x - bbox.min.x,
    bbox.max.y - bbox.min.y,
    bbox.max.z - bbox.min.z
  );
  axisLength = 2 * Math.max(bboxSize.x, bboxSize.y, bboxSize.z);

  if (xAxis) axes.remove(xAxis);
  if (yAxis) axes.remove(yAxis);
  if (zAxis) axes.remove(zAxis);

  xAxis = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), axisLength, 0xff0000);
  yAxis = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), axisLength, 0x00ff00);
  zAxis = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), axisLength, 0x0000ff);

  if (xLabel) scene.remove(xLabel);
  if (yLabel) scene.remove(yLabel);
  if (zLabel) scene.remove(zLabel);
  xLabel = createTextSprite('X', '#ff0000');
  yLabel = createTextSprite('Y', '#00ff00');
  zLabel = createTextSprite('Z', '#0000ff');
  const labelOffset = axisLength * 0.1;
  xLabel.position.set(axisLength + labelOffset, 0, 0);
  yLabel.position.set(0, axisLength + labelOffset, 0);
  zLabel.position.set(0, 0, axisLength + labelOffset);
  xLabel.scale.set(axisLength / 5, axisLength / 5, 1);
  yLabel.scale.set(axisLength / 5, axisLength / 5, 1);
  zLabel.scale.set(axisLength / 5, axisLength / 5, 1);

  axes.add(xAxis, yAxis, zAxis, xLabel, yLabel, zLabel);
};
scene.add(axes);

// Raycaster for face selection, lead-in, and lead-out selection
const raycaster = new THREE.Raycaster();
let mesh = null;
let selectionMode = false;
let leadInSelectionMode = false;
let leadOutSelectionMode = false; // New mode for lead-out selection
let selectedFaces = [];
let partCenter = new THREE.Vector3();
let currentPerimeterLine = null;
let topFaceSet = [];
let bottomFaceSet = [];
let wallFaceSet = [];
let topPerimeterSet = [];
let bottomPerimeterSet = [];
let maxBoundingBoxDimension = 1;
let topLeadIn = null;
let leadInDot = null;
let topLeadOut = null; // Store the selected lead-out point
let leadOutDot = null; // The dot mesh for highlighting the lead-out point

// Reset face colors, perimeters, lead-in, and lead-out to default
const resetFaceColors = () => {
  if (!mesh) return;
  mesh.material.forEach(material => {
    material.color.set(0x807c84); // Reset to default color
    material.emissive.set(0x404040); // Reset emissive
  });
  topFaceSet = [];
  bottomFaceSet = [];
  wallFaceSet = [];
  selectedFaces = [];
  topPerimeterSet = [];
  bottomPerimeterSet = [];
  topLeadIn = null;
  topLeadOut = null;
  if (currentPerimeterLine) {
    scene.remove(currentPerimeterLine);
    currentPerimeterLine = null;
  }
  if (leadInDot) {
    scene.remove(leadInDot);
    leadInDot = null;
  }
  if (leadOutDot) {
    scene.remove(leadOutDot);
    leadOutDot = null;
  }
};

// Toggle face selection mode
const selectTopFaceBtn = document.getElementById('selectTopFaceBtn');
selectTopFaceBtn.addEventListener('click', () => {
  selectionMode = !selectionMode;
  leadInSelectionMode = false;
  leadOutSelectionMode = false;
  selectTopFaceBtn.textContent = selectionMode ? 'Exit Selection Mode' : 'Select Top Face';
  const selectLeadInBtn = document.getElementById('selectLeadInBtn');
  const selectLeadOutBtn = document.getElementById('selectLeadOutBtn');
  selectLeadInBtn.textContent = 'Select Lead-In';
  selectLeadOutBtn.textContent = 'Select Lead-Out';
  if (!selectionMode) {
    resetFaceColors();
  }
});

// Toggle lead-in selection mode
const selectLeadInBtn = document.getElementById('selectLeadInBtn');
selectLeadInBtn.addEventListener('click', () => {
  if (topFaceSet.length === 0) {
    alert('Select Top Face First');
    return;
  }
  leadInSelectionMode = !leadInSelectionMode;
  selectionMode = false;
  leadOutSelectionMode = false;
  selectLeadInBtn.textContent = leadInSelectionMode ? 'Exit Lead-In Mode' : 'Select Lead-In';
  selectTopFaceBtn.textContent = 'Select Top Face';
  const selectLeadOutBtn = document.getElementById('selectLeadOutBtn');
  selectLeadOutBtn.textContent = 'Select Lead-Out';
  if (!leadInSelectionMode) {
    // If exiting lead-in mode, keep the selected lead-in dot if it exists
    if (topLeadIn && !leadInDot) {
      const dotGeometry = new THREE.SphereGeometry(maxBoundingBoxDimension * 0.02, 16, 16);
      const dotMaterial = new THREE.MeshBasicMaterial({ color: 0x006400 }); // Dark green
      leadInDot = new THREE.Mesh(dotGeometry, dotMaterial);
      leadInDot.position.copy(topLeadIn);
      scene.add(leadInDot);
    }
  } else {
    // If entering lead-in mode, show the perimeters
    detectPerimeters();
    // If a lead-in point is already selected, show it as dark green
    if (topLeadIn) {
      if (leadInDot) {
        scene.remove(leadInDot);
      }
      const dotGeometry = new THREE.SphereGeometry(maxBoundingBoxDimension * 0.02, 16, 16);
      const dotMaterial = new THREE.MeshBasicMaterial({ color: 0x006400 }); // Dark green
      leadInDot = new THREE.Mesh(dotGeometry, dotMaterial);
      leadInDot.position.copy(topLeadIn);
      scene.add(leadInDot);
    }
    // If a lead-out point is selected, show it
    if (topLeadOut) {
      if (leadOutDot) {
        scene.remove(leadOutDot);
      }
      const dotGeometry = new THREE.SphereGeometry(maxBoundingBoxDimension * 0.02, 16, 16);
      const dotMaterial = new THREE.MeshBasicMaterial({ color: 0x8b0000 }); // Dark red
      leadOutDot = new THREE.Mesh(dotGeometry, dotMaterial);
      leadOutDot.position.copy(topLeadOut);
      scene.add(leadOutDot);
    }
  }
});

// Toggle lead-out selection mode
const selectLeadOutBtn = document.getElementById('selectLeadOutBtn');
selectLeadOutBtn.addEventListener('click', () => {
  if (topFaceSet.length === 0) {
    alert('Select Top Face First');
    return;
  }
  leadOutSelectionMode = !leadOutSelectionMode;
  selectionMode = false;
  leadInSelectionMode = false;
  selectLeadOutBtn.textContent = leadOutSelectionMode ? 'Exit Lead-Out Mode' : 'Select Lead-Out';
  selectTopFaceBtn.textContent = 'Select Top Face';
  const selectLeadInBtn = document.getElementById('selectLeadInBtn');
  selectLeadInBtn.textContent = 'Select Lead-In';
  if (!leadOutSelectionMode) {
    // If exiting lead-out mode, keep the selected lead-out dot if it exists
    if (topLeadOut && !leadOutDot) {
      const dotGeometry = new THREE.SphereGeometry(maxBoundingBoxDimension * 0.02, 16, 16);
      const dotMaterial = new THREE.MeshBasicMaterial({ color: 0x8b0000 }); // Dark red
      leadOutDot = new THREE.Mesh(dotGeometry, dotMaterial);
      leadOutDot.position.copy(topLeadOut);
      scene.add(leadOutDot);
    }
  } else {
    // If entering lead-out mode, show the perimeters
    detectPerimeters();
    // If a lead-out point is already selected, show it as dark red
    if (topLeadOut) {
      if (leadOutDot) {
        scene.remove(leadOutDot);
      }
      const dotGeometry = new THREE.SphereGeometry(maxBoundingBoxDimension * 0.02, 16, 16);
      const dotMaterial = new THREE.MeshBasicMaterial({ color: 0x8b0000 }); // Dark red
      leadOutDot = new THREE.Mesh(dotGeometry, dotMaterial);
      leadOutDot.position.copy(topLeadOut);
      scene.add(leadOutDot);
    }
    // If a lead-in point is selected, show it
    if (topLeadIn) {
      if (leadInDot) {
        scene.remove(leadInDot);
      }
      const dotGeometry = new THREE.SphereGeometry(maxBoundingBoxDimension * 0.02, 16, 16);
      const dotMaterial = new THREE.MeshBasicMaterial({ color: 0x006400 }); // Dark green
      leadInDot = new THREE.Mesh(dotGeometry, dotMaterial);
      leadInDot.position.copy(topLeadIn);
      scene.add(leadInDot);
    }
  }
});

// Add these variables at the top with other state variables
let topViewCanvas = null;
let topViewContext = null;
let perimeterScale = 1;
let perimeterOffset = new THREE.Vector2();
let topSortedPerimeter = [];
let bottomSortedPerimeter = [];

// Add this function to draw the sorted perimeter vectors in the 2D viewport
function drawPerimeters2D(topPerimeter, bottomPerimeter, leadIn = null, leadOut = null) {
  if (!topViewCanvas || !topViewContext) return;
  topViewContext.clearRect(0, 0, topViewCanvas.width, topViewCanvas.height);

  // Helper to project 3D point to 2D (X, Y)
  const project = (v) => [
    (v.x * perimeterScale) + perimeterOffset.x,
    (v.y * perimeterScale) + perimeterOffset.y
  ];

  // Draw top perimeter (cyan)
  if (topPerimeter && topPerimeter.length > 1) {
    topViewContext.strokeStyle = '#00ffff';
    topViewContext.lineWidth = 2;
    topViewContext.beginPath();
    let [x, y] = project(topPerimeter[0]);
    topViewContext.moveTo(x, y);
    for (let i = 1; i < topPerimeter.length; i++) {
      [x, y] = project(topPerimeter[i]);
      topViewContext.lineTo(x, y);
    }
    [x, y] = project(topPerimeter[0]);
    topViewContext.lineTo(x, y);
    topViewContext.stroke();
  }

  // Draw bottom perimeter (magenta)
  if (bottomPerimeter && bottomPerimeter.length > 1) {
    topViewContext.strokeStyle = '#ff00ff';
    topViewContext.lineWidth = 2;
    topViewContext.beginPath();
    let [x, y] = project(bottomPerimeter[0]);
    topViewContext.moveTo(x, y);
    for (let i = 1; i < bottomPerimeter.length; i++) {
      [x, y] = project(bottomPerimeter[i]);
      topViewContext.lineTo(x, y);
    }
    [x, y] = project(bottomPerimeter[0]);
    topViewContext.lineTo(x, y);
    topViewContext.stroke();
  }

  // Draw lead-in point (green)
  if (leadIn) {
    const [x, y] = project(leadIn);
    topViewContext.beginPath();
    topViewContext.arc(x, y, 7, 0, 2 * Math.PI);
    topViewContext.fillStyle = '#00ff00';
    topViewContext.fill();
    topViewContext.strokeStyle = '#006400';
    topViewContext.lineWidth = 2;
    topViewContext.stroke();
  }

  // Draw lead-out point (red)
  if (leadOut) {
    const [x, y] = project(leadOut);
    topViewContext.beginPath();
    topViewContext.arc(x, y, 7, 0, 2 * Math.PI);
    topViewContext.fillStyle = '#ff4040';
    topViewContext.fill();
    topViewContext.strokeStyle = '#8b0000';
    topViewContext.lineWidth = 2;
    topViewContext.stroke();
  }
}

// Modify the detectPerimeters function to ensure we're using the same perimeter detection
const detectPerimeters = () => {
  if (!mesh) return;

  const geometry = mesh.geometry;
  const positions = geometry.attributes.position.array;

  // Helper function to get vertices of a triangle
  const getTriangleVertices = (faceIdx) => {
    const vertices = [];
    for (let i = 0; i < 3; i++) {
      vertices.push(new THREE.Vector3(
        positions[faceIdx * 9 + i * 3],
        positions[faceIdx * 9 + i * 3 + 1],
        positions[faceIdx * 9 + i * 3 + 2]
      ));
    }
    return vertices;
  };

  // Helper function to compare two vertices (with epsilon for floating-point)
  const areVerticesEqual = (v1, v2, epsilon = 0.0001) => {
    return v1.distanceTo(v2) < epsilon;
  };

  // Helper function to find shared edge between two triangles
  const findSharedEdge = (tri1Verts, tri2Verts) => {
    const sharedVerts = [];
    for (let v1 of tri1Verts) {
      for (let v2 of tri2Verts) {
        if (areVerticesEqual(v1, v2)) {
          sharedVerts.push(v1.clone());
        }
      }
    }
    if (sharedVerts.length === 2) {
      return sharedVerts; // Return the two shared vertices as a line segment
    }
    return null;
  };

  // Detect TopPerimeterSet
  topPerimeterSet = [];
  for (let topFaceIdx of topFaceSet) {
    const topVerts = getTriangleVertices(topFaceIdx);
    for (let wallFaceIdx of wallFaceSet) {
      const wallVerts = getTriangleVertices(wallFaceIdx);
      const sharedEdge = findSharedEdge(topVerts, wallVerts);
      if (sharedEdge) {
        topPerimeterSet.push(sharedEdge);
      }
    }
  }

  // Detect BottomPerimeterSet
  bottomPerimeterSet = [];
  for (let bottomFaceIdx of bottomFaceSet) {
    const bottomVerts = getTriangleVertices(bottomFaceIdx);
    for (let wallFaceIdx of wallFaceSet) {
      const wallVerts = getTriangleVertices(wallFaceIdx);
      const sharedEdge = findSharedEdge(bottomVerts, wallVerts);
      if (sharedEdge) {
        bottomPerimeterSet.push(sharedEdge);
      }
    }
  }

  // --- Calculate sorted connect-the-dots perimeter arrays first ---
  topSortedPerimeter = [];
  if (topPerimeterSet.length > 0) {
    const pointKey = (v) => `${v.x.toFixed(5)},${v.y.toFixed(5)},${v.z.toFixed(5)}`;
    const used = new Set();
    const firstEdge = topPerimeterSet[0];
    let current = firstEdge[0];
    topSortedPerimeter = [current.clone()];
    used.add(pointKey(current));
    while (true) {
      let found = false;
      for (let [a, b] of topPerimeterSet) {
        if (areVerticesEqual(current, a) && !used.has(pointKey(b))) {
          if (!areVerticesEqual(b, topSortedPerimeter[topSortedPerimeter.length - 1])) {
            topSortedPerimeter.push(b.clone());
          }
          used.add(pointKey(b));
          current = b;
          found = true;
          break;
        } else if (areVerticesEqual(current, b) && !used.has(pointKey(a))) {
          if (!areVerticesEqual(a, topSortedPerimeter[topSortedPerimeter.length - 1])) {
            topSortedPerimeter.push(a.clone());
          }
          used.add(pointKey(a));
          current = a;
          found = true;
          break;
        }
      }
      if (!found) break;
    }
    console.log('Top perimeter connect-the-dots vector:', topSortedPerimeter);
  }

  bottomSortedPerimeter = [];
  if (bottomPerimeterSet.length > 0) {
    const pointKey = (v) => `${v.x.toFixed(5)},${v.y.toFixed(5)},${v.z.toFixed(5)}`;
    const used = new Set();
    const firstEdge = bottomPerimeterSet[0];
    let current = firstEdge[0];
    bottomSortedPerimeter = [current.clone()];
    used.add(pointKey(current));
    while (true) {
      let found = false;
      for (let [a, b] of bottomPerimeterSet) {
        if (areVerticesEqual(current, a) && !used.has(pointKey(b))) {
          if (!areVerticesEqual(b, bottomSortedPerimeter[bottomSortedPerimeter.length - 1])) {
            bottomSortedPerimeter.push(b.clone());
          }
          used.add(pointKey(b));
          current = b;
          found = true;
          break;
        } else if (areVerticesEqual(current, b) && !used.has(pointKey(a))) {
          if (!areVerticesEqual(a, bottomSortedPerimeter[bottomSortedPerimeter.length - 1])) {
            bottomSortedPerimeter.push(a.clone());
          }
          used.add(pointKey(a));
          current = a;
          found = true;
          break;
        }
      }
      if (!found) break;
    }
    console.log('Bottom perimeter connect-the-dots vector:', bottomSortedPerimeter);
  }
  // --- End perimeter sorting ---

  // Draw the sorted perimeters in the 2D viewport
  drawPerimeters2D(topSortedPerimeter, bottomSortedPerimeter, topLeadIn, topLeadOut);

  // Now generate the yellow tube geometry from the perimeter sets
  if (currentPerimeterLine) {
    scene.remove(currentPerimeterLine);
  }
  const allSegments = [...topPerimeterSet, ...bottomPerimeterSet];
  if (allSegments.length > 0) {
    const tubeRadius = maxBoundingBoxDimension * 0.01;
    const tubeGeometries = [];
    allSegments.forEach(segment => {
      const path = new THREE.LineCurve3(segment[0], segment[1]);
      const tubeGeometry = new THREE.TubeGeometry(path, 1, tubeRadius, 8, false);
      tubeGeometries.push(tubeGeometry);
    });

    const mergedGeometry = BufferGeometryUtils.mergeGeometries(tubeGeometries);
    const tubeMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 }); // Yellow
    currentPerimeterLine = new THREE.Mesh(mergedGeometry, tubeMaterial);
    scene.add(currentPerimeterLine);
  }
};

// Handle face selection with raycasting
const onMouseClick = (event) => {
  if (selectionMode && mesh) {
    // Normalize mouse coordinates to [-1, 1]
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Update raycaster
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(mesh, true);

    if (intersects.length > 0) {
      const intersect = intersects[0];
      const faceIndex = intersect.faceIndex; // Index of the clicked triangle

      // Reset previous selections
      resetFaceColors();

      // Get the normal of the clicked face
      const geometry = mesh.geometry;
      const normals = geometry.attributes.normal.array;
      const clickedNormal = new THREE.Vector3(
        normals[faceIndex * 3 * 3],     // First vertex normal x
        normals[faceIndex * 3 * 3 + 1], // First vertex normal y
        normals[faceIndex * 3 * 3 + 2]  // First vertex normal z
      ).normalize();
      const oppositeNormal = clickedNormal.clone().negate();

      // Find triangles with matching, opposite, and neither normals
      const faceCount = geometry.attributes.position.count / 3;
      topFaceSet = [];
      bottomFaceSet = [];
      wallFaceSet = [];
      for (let i = 0; i < faceCount; i++) {
        const normal = new THREE.Vector3(
          normals[i * 3 * 3],
          normals[i * 3 * 3 + 1],
          normals[i * 3 * 3 + 2]
        ).normalize();

        // Compare normals (using a small epsilon for floating-point comparison)
        const epsilon = 0.0001;
        if (normal.distanceTo(clickedNormal) < epsilon) {
          topFaceSet.push(i);
        } else if (normal.distanceTo(oppositeNormal) < epsilon) {
          bottomFaceSet.push(i);
        } else {
          wallFaceSet.push(i);
        }
      }

      // Highlight TopFaceSet (cyan), BottomFaceSet (magenta), and WallFaceSet (light orange)
      topFaceSet.forEach(faceIdx => {
        mesh.material[faceIdx].color.set(0x00ffff); // Cyan
        mesh.material[faceIdx].emissive.set(0x00ffff); // Cyan emissive for glow
      });
      bottomFaceSet.forEach(faceIdx => {
        mesh.material[faceIdx].color.set(0xff00ff); // Magenta
        mesh.material[faceIdx].emissive.set(0xff00ff); // Magenta emissive for glow
      });
      wallFaceSet.forEach(faceIdx => {
        mesh.material[faceIdx].color.set(0xffa500); // Light orange
        mesh.material[faceIdx].emissive.set(0xffa500); // Light orange emissive for glow
      });

      // Store the selected faces for later use
      selectedFaces = topFaceSet;

      // Detect and highlight perimeters
      detectPerimeters();
    }
  } else if (leadInSelectionMode) {
    // Confirm the lead-in point on click
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // Find the closest point in topPerimeterSet to the mouse ray
    let closestPoint = null;
    let minDistance = Infinity;
    topPerimeterSet.forEach(segment => {
      [segment[0], segment[1]].forEach(point => {
        const distance = raycaster.ray.distanceToPoint(point);
        if (distance < minDistance) {
          minDistance = distance;
          closestPoint = point;
        }
      });
    });

    if (closestPoint) {
      topLeadIn = closestPoint.clone();
      if (leadInDot) {
        scene.remove(leadInDot);
      }
      const dotGeometry = new THREE.SphereGeometry(maxBoundingBoxDimension * 0.02, 16, 16);
      const dotMaterial = new THREE.MeshBasicMaterial({ color: 0x006400 }); // Dark green
      leadInDot = new THREE.Mesh(dotGeometry, dotMaterial);
      leadInDot.position.copy(topLeadIn);
      scene.add(leadInDot);

      // Exit lead-in selection mode after selecting the point
      leadInSelectionMode = false;
      const selectLeadInBtn = document.getElementById('selectLeadInBtn');
      selectLeadInBtn.textContent = 'Select Lead-In';

      // Draw the sorted perimeters in the 2D viewport
      drawPerimeters2D(topSortedPerimeter, bottomSortedPerimeter, topLeadIn, topLeadOut);
    }
  } else if (leadOutSelectionMode) {
    // Confirm the lead-out point on click
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // Find the closest point in topPerimeterSet to the mouse ray
    let closestPoint = null;
    let minDistance = Infinity;
    topPerimeterSet.forEach(segment => {
      [segment[0], segment[1]].forEach(point => {
        const distance = raycaster.ray.distanceToPoint(point);
        if (distance < minDistance) {
          minDistance = distance;
          closestPoint = point;
        }
      });
    });

    if (closestPoint) {
      topLeadOut = closestPoint.clone();
      if (leadOutDot) {
        scene.remove(leadOutDot);
      }
      const dotGeometry = new THREE.SphereGeometry(maxBoundingBoxDimension * 0.02, 16, 16);
      const dotMaterial = new THREE.MeshBasicMaterial({ color: 0x8b0000 }); // Dark red
      leadOutDot = new THREE.Mesh(dotGeometry, dotMaterial);
      leadOutDot.position.copy(topLeadOut);
      scene.add(leadOutDot);

      // Exit lead-out selection mode after selecting the point
      leadOutSelectionMode = false;
      const selectLeadOutBtn = document.getElementById('selectLeadOutBtn');
      selectLeadOutBtn.textContent = 'Select Lead-Out';

      // Draw the sorted perimeters in the 2D viewport
      drawPerimeters2D(topSortedPerimeter, bottomSortedPerimeter, topLeadIn, topLeadOut);
    }
  }
};

// Handle mouse movement to highlight the closest lead-in or lead-out point
const onMouseMove = (event) => {
  if (leadInSelectionMode && topPerimeterSet.length) {
    // Normalize mouse coordinates to [-1, 1]
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Update raycaster
    raycaster.setFromCamera(mouse, camera);

    // Find the closest point in topPerimeterSet to the mouse ray
    let closestPoint = null;
    let minDistance = Infinity;
    topPerimeterSet.forEach(segment => {
      [segment[0], segment[1]].forEach(point => {
        const distance = raycaster.ray.distanceToPoint(point);
        if (distance < minDistance) {
          minDistance = distance;
          closestPoint = point;
        }
      });
    });

    if (closestPoint && !topLeadIn) { // Only highlight if lead-in isn't selected
      if (leadInDot) {
        scene.remove(leadInDot);
      }
      const dotGeometry = new THREE.SphereGeometry(maxBoundingBoxDimension * 0.02, 16, 16);
      const dotMaterial = new THREE.MeshBasicMaterial({ color: 0x90ee90 }); // Pale green
      leadInDot = new THREE.Mesh(dotGeometry, dotMaterial);
      leadInDot.position.copy(closestPoint);
      scene.add(leadInDot);
    }
  } else if (leadOutSelectionMode && topPerimeterSet.length) {
    // Normalize mouse coordinates to [-1, 1]
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Update raycaster
    raycaster.setFromCamera(mouse, camera);

    // Find the closest point in topPerimeterSet to the mouse ray
    let closestPoint = null;
    let minDistance = Infinity;
    topPerimeterSet.forEach(segment => {
      [segment[0], segment[1]].forEach(point => {
        const distance = raycaster.ray.distanceToPoint(point);
        if (distance < minDistance) {
          minDistance = distance;
          closestPoint = point;
        }
      });
    });

    if (closestPoint && !topLeadOut) { // Only highlight if lead-out isn't selected
      if (leadOutDot) {
        scene.remove(leadOutDot);
      }
      const dotGeometry = new THREE.SphereGeometry(maxBoundingBoxDimension * 0.02, 16, 16);
      const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xff4040 }); // Pale red
      leadOutDot = new THREE.Mesh(dotGeometry, dotMaterial);
      leadOutDot.position.copy(closestPoint);
      scene.add(leadOutDot);
    }
  }
};

// Add event listeners for mouse click and movement
renderer.domElement.addEventListener('click', onMouseClick);
renderer.domElement.addEventListener('mousemove', onMouseMove);

// STL Loader
const loader = new STLLoader();

// Handle drag and drop events
const handleFileDrop = (file) => {
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const geometry = loader.parse(e.target.result);
      geometry.computeVertexNormals();

      const faceCount = geometry.attributes.position.count / 3;
      const materials = new Array(faceCount).fill(null).map(() => new THREE.MeshPhongMaterial({
        color: 0x807c84,
        emissive: 0x404040,
        emissiveIntensity: 0.5,
        shininess: 30
      }));
      geometry.setAttribute('materialIndex', new THREE.BufferAttribute(new Uint32Array(faceCount * 3).fill(0).map((_, i) => Math.floor(i / 3)), 1));
      mesh = new THREE.Mesh(geometry, materials);
      mesh.geometry.groups = [];
      for (let i = 0; i < faceCount; i++) {
        mesh.geometry.groups.push({ start: i * 3, count: 3, materialIndex: i });
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);

      const wireframeGeometry = new THREE.WireframeGeometry(geometry);
      const wireframeMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 1, opacity: 0.5, transparent: true });
      const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
      scene.add(wireframe);

      geometry.computeBoundingBox();
      partCenter = geometry.boundingBox.getCenter(new THREE.Vector3());
      const bboxSize = geometry.boundingBox.getSize(new THREE.Vector3());
      maxBoundingBoxDimension = Math.max(bboxSize.x, bboxSize.y, bboxSize.z);
      mesh.position.set(0, 0, 0);
      axes.position.set(0, 0, 0);
      updateAxes(geometry.boundingBox);
      controls.target.set(0, 0, 0);

      // Position the camera along the (1, 1, 1) vector for an isometric view
      const offset = Math.max(bboxSize.x, bboxSize.y, bboxSize.z) * 2;
      const direction = new THREE.Vector3(1, 1, 1).normalize();
      const cameraPosition = direction.multiplyScalar(offset).add(partCenter);
      camera.position.copy(cameraPosition);
      camera.up.set(0, 0, 1);
      camera.lookAt(partCenter);
      controls.update();

      // Reset face colors and perimeters on new model load
      resetFaceColors();

      // Initialize the 2D view canvas
      const topView = document.getElementById('topView');
      topViewCanvas = document.createElement('canvas');
      topViewCanvas.width = topView.clientWidth;
      topViewCanvas.height = topView.clientHeight;
      topView.appendChild(topViewCanvas);
      topViewContext = topViewCanvas.getContext('2d');
      
      // Calculate scale and offset for the 2D view (can keep for future use)
      const viewBboxSize = geometry.boundingBox.getSize(new THREE.Vector3());
      const maxDim = Math.max(viewBboxSize.x, viewBboxSize.y);
      perimeterScale = Math.min(
        topViewCanvas.width / maxDim,
        topViewCanvas.height / maxDim
      ) * 0.8; // 80% of the available space
      
      perimeterOffset.set(
        topViewCanvas.width / 2,
        topViewCanvas.height / 2
      );
    };
    reader.readAsArrayBuffer(file);
  }
};

// Add drag and drop event listeners to the entire app
const app = document.getElementById('app');
app.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  app.style.backgroundColor = 'rgba(0, 180, 255, 0.1)';
});

app.addEventListener('dragleave', (e) => {
  e.preventDefault();
  e.stopPropagation();
  app.style.backgroundColor = '';
});

app.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  app.style.backgroundColor = '';
  
  const file = e.dataTransfer.files[0];
  if (file && file.name.toLowerCase().endsWith('.stl')) {
    handleFileDrop(file);
  }
});

// Keep the existing file input handler
document.getElementById('stlInput').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) {
    handleFileDrop(file);
  }
});

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  if (controls) {
    controls.update();
  }
  light.position.set(camera.position.x, camera.position.y, 500);
  light.target.position.set(camera.position.x, camera.position.y, 0);
  light.target.updateMatrixWorld();
  renderer.render(scene, camera);
}
animate();

// Add resize handler for the 2D view
window.addEventListener('resize', () => {
  if (topViewCanvas && mesh) {
    const topView = document.getElementById('topView');
    topViewCanvas.width = topView.clientWidth;
    topViewCanvas.height = topView.clientHeight;
    
    // Recalculate scale and offset
    const resizeBboxSize = mesh.geometry.boundingBox.getSize(new THREE.Vector3());
    const maxDim = Math.max(resizeBboxSize.x, resizeBboxSize.y);
    perimeterScale = Math.min(
      topViewCanvas.width / maxDim,
      topViewCanvas.height / maxDim
    ) * 0.8;
    
    perimeterOffset.set(
      topViewCanvas.width / 2,
      topViewCanvas.height / 2
    );
  }
});