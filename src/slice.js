import * as THREE from 'three';

/**
 * Slices a mesh into 2 polylines, assuming the mesh is pre-oriented
 * with its top face normal as (0,0,1) and bottom face normal as (0,0,-1).
 * @param {THREE.Mesh} mainMesh - The mesh to slice.
 * @param {number} [Z0] - An optional explicit Z value for the bottom slice.
 * @param {number} [Z1] - An optional explicit Z value for the top slice.
 */
export function slice(mainMesh, Z_bottom, Z_top) {
    if (!mainMesh) return null;

    const geometry = mainMesh.geometry;

    // 1. Determine Z levels for slicing
    const P0_Z = (typeof Z_bottom !== 'undefined')
        ? Z_bottom
        : (() => {
            geometry.computeBoundingBox();
            return geometry.boundingBox.min.z;
        })();

    const P1_Z = (typeof Z_top !== 'undefined')
        ? Z_top
        : (() => {
            geometry.computeBoundingBox();
            return geometry.boundingBox.max.z;
        })();

    if (!isFinite(P0_Z) || !isFinite(P1_Z)) {
        console.error("Failed to determine top and bottom Z levels for slicing.");
        return null;
    }

    // 2. Calculate perimeters at each Z level
    const P0 = polylineSort(perimeterSegments(mainMesh, P0_Z));
    const P1 = polylineSort(perimeterSegments(mainMesh, P1_Z));

    // 3. Return the calculated perimeters
    return {
        P0,
        P1
    };
}

/**
 * Extracts perimeter edges from a mesh at a specific Z height which must be the top or bottom face.
 * @param {THREE.Mesh} mainMesh - The mesh to process.
 * @param {number} Z - The Z plane to extract edges from.
 * @returns {Array<[THREE.Vector3, THREE.Vector3]>} Array of edge segments.
 */
function perimeterSegments(mainMesh, Z) {
    if (!mainMesh) return [];
    
    const geometry = mainMesh.geometry;
    const positions = geometry.attributes.position;
    const vertexCount = positions.count;
    const edges = [];

    for (let i = 0; i < vertexCount; i += 3) {
        const vA = new THREE.Vector3().fromBufferAttribute(positions, i);
        const vB = new THREE.Vector3().fromBufferAttribute(positions, i + 1);
        const vC = new THREE.Vector3().fromBufferAttribute(positions, i + 2);

        const atZ = [
            Math.abs(vA.z - Z) < 1e-9,
            Math.abs(vB.z - Z) < 1e-9,
            Math.abs(vC.z - Z) < 1e-9
        ];

        const countAtZ = atZ.filter(Boolean).length;

        // A triangle is considered part of the perimeter if exactly two of its
        // vertices lie on the Z plane. The edge connecting these two vertices
        // forms a segment of the perimeter of a flat face.
        if (countAtZ === 2) {
            const points = [vA, vB, vC];
            const edgePoints = points.filter((_, idx) => atZ[idx]);
            edges.push([edgePoints[0], edgePoints[1]]);
        }
    }
    return edges;
}

/**
 * Sorts disconnected line segments into one or more contiguous polylines.
 * This is achieved by treating the line segments as a graph where points
 * are nodes and segments are edges, then finding paths through the graph.
 * @param {Array<[THREE.Vector3, THREE.Vector3]>} lineSegments - An array of line segments to sort.
 * @returns {Array<Array<[number, number, number]>>} An array of polylines.
 */
function polylineSort(lineSegments) {
    if (!lineSegments || lineSegments.length === 0) return [];

    const segmentsAsArrays = lineSegments.map(segment => [
        [segment[0].x, segment[0].y, segment[0].z],
        [segment[1].x, segment[1].y, segment[1].z]
    ]);

    const EPS = 1e-9;

    function distSq(p1, p2) {
        const dx = p1[0] - p2[0];
        const dy = p1[1] - p2[1];
        const dz = p1[2] - p2[2];
        return dx * dx + dy * dy + dz * dz;
    }

    function pointsEqual(p1, p2) {
        return distSq(p1, p2) < (EPS * EPS);
    }

    let uniquePoints = [];
    const adj = [];

    function findOrAddPoint(p) {
        for (let i = 0; i < uniquePoints.length; i++) {
            if (pointsEqual(uniquePoints[i], p)) {
                return i;
            }
        }
        const index = uniquePoints.length;
        uniquePoints.push([...p]);
        adj.push([]);
        return index;
    }

    // Step 1: Build a graph representation of the line segments.
    // Each unique point is a node, and a segment is an edge between two nodes.
    // An adjacency list `adj` is used to store the graph.
    segmentsAsArrays.forEach(segment => {
        if (segment.length !== 2 || pointsEqual(segment[0], segment[1])) return;
        const i1 = findOrAddPoint(segment[0]);
        const i2 = findOrAddPoint(segment[1]);
        adj[i1].push(i2);
        adj[i2].push(i1);
    });

    const polylines = [];
    const visited = new Set();

    // Step 2: Traverse the graph to form polylines.
    // First, trace paths starting from endpoints (nodes with only one connection).
    // This finds all the open-ended polylines.
    for (let i = 0; i < uniquePoints.length; i++) {
        if (!visited.has(i) && adj[i].length <= 1) {
            visited.add(i);
            const path = [i];
            let current = i;
            
            while (true) {
                const neighbors = adj[current].filter(n => !visited.has(n));
                if (neighbors.length === 0) break;
                
                const next = neighbors[0];
                visited.add(next);
                path.push(next);
                current = next;
            }
            polylines.push(path.map(index => uniquePoints[index]));
        }
    }
    
    // Step 3: Handle any remaining segments, which must be part of closed loops.
    // Any node not yet visited must belong to a closed loop.
    for (let i = 0; i < uniquePoints.length; i++) {
        if (!visited.has(i)) {
             visited.add(i);
            const path = [i];
            let current = i;
            
            while (true) {
                const neighbors = adj[current].filter(n => !visited.has(n));
                if (neighbors.length === 0) break;
                
                const next = neighbors[0];
                visited.add(next);
                path.push(next);
                current = next;
            }

            const finalPath = path.map(index => uniquePoints[index]);
            // Check if it's a closed loop and close it
            if (path.length > 2) {
                const firstNode = path[0];
                const lastNode = path[path.length - 1];
                const lastNodeNeighbors = adj[lastNode];
                if (lastNodeNeighbors.includes(firstNode)) {
                    finalPath.push([...finalPath[0]]);
                }
            }
            polylines.push(finalPath);
        }
    }
    return polylines;
}
