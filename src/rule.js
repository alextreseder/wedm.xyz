import * as THREE from 'three';

/**
 * Finds ruling lines in a mesh geometry by identifying continuous straight lines of edges.
 *
 * @param {THREE.Mesh} mesh - The mesh to analyze.
 * @param {number} bottomZ - The Z-coordinate of the bottom perimeter.
 * @param {number} topZ - The Z-coordinate of the top perimeter.
 * @param {number} [spanPercentage=1] - The minimum required span of a ruling line, as a percentage of the total model height.
 * @returns {Array<Array<Array<number>>>} An array of ruling line segments.
 */
export function getRulings(mesh, bottomZ, topZ, spanPercentage = 1) {
    console.time('getRulings');

    if (!mesh || !mesh.geometry) {
        console.error("Invalid mesh or geometry provided.");
        return [];
    }
    
    if (typeof bottomZ === 'undefined' || typeof topZ === 'undefined') {
        console.error("Bottom and top Z-coordinates must be provided for ruling filtering.");
        return [];
    }

    const geometry = mesh.geometry;
    const positions = geometry.attributes.position.array;
    const vertexCount = positions.length / 3;

    // --- Preprocessing: Build unique vertices and adjacency list ---
    const uniqueVertices = [];
    const vertexMap = new Map();
    function getVertexIndex(x, y, z) {
        const key = `${x.toFixed(6)}_${y.toFixed(6)}_${z.toFixed(6)}`;
        if (vertexMap.has(key)) {
            return vertexMap.get(key);
        }
        const newIndex = uniqueVertices.length;
        uniqueVertices.push(new THREE.Vector3(x, y, z));
        vertexMap.set(key, newIndex);
        return newIndex;
    }

    const adj = [];
    const edges = new Map();
    for (let i = 0; i < vertexCount * 3; i += 9) { // Iterate over triangle vertices
        const i1 = getVertexIndex(positions[i], positions[i + 1], positions[i + 2]);
        const i2 = getVertexIndex(positions[i + 3], positions[i + 4], positions[i + 5]);
        const i3 = getVertexIndex(positions[i + 6], positions[i + 7], positions[i + 8]);
        
        const faceEdges = [[i1, i2], [i2, i3], [i3, i1]];
        for (const edge of faceEdges) {
            const u = Math.min(edge[0], edge[1]);
            const v = Math.max(edge[0], edge[1]);
            if (u === v) continue;
            if (!adj[u]) adj[u] = [];
            if (!adj[v]) adj[v] = [];
            if (!adj[u].includes(v)) adj[u].push(v);
            if (!adj[v].includes(u)) adj[v].push(u);
            const edgeKey = `${u}-${v}`;
            if (!edges.has(edgeKey)) {
                edges.set(edgeKey, [u, v]);
            }
        }
    }

    // --- Step 2: Extract All Maximal Straight Polylines ---
    const usedEdges = new Set();
    const polylines = [];
    const epsilon = 1e-6;
    const directionEpsilon = 0.999; 

    for (const [edgeKey, edge] of edges.entries()) {
        if (usedEdges.has(edgeKey)) continue;

        usedEdges.add(edgeKey);
        const polyline = [edge[0], edge[1]];
        const v1 = uniqueVertices[edge[0]];
        const v2 = uniqueVertices[edge[1]];
        const mainDir = new THREE.Vector3().subVectors(v2, v1).normalize();

        // Extend front
        let currentFront = edge[1];
        while (true) {
            const neighbors = adj[currentFront] || [];
            const candidates = [];
            for (const neighbor of neighbors) {
                const key = `${Math.min(currentFront, neighbor)}-${Math.max(currentFront, neighbor)}`;
                if (usedEdges.has(key)) continue;
                const nextVec = new THREE.Vector3().subVectors(uniqueVertices[neighbor], uniqueVertices[currentFront]);
                if (nextVec.lengthSq() < epsilon) continue;
                const nextDir = nextVec.normalize();
                if (nextDir.dot(mainDir) > directionEpsilon) {
                    candidates.push(neighbor);
                }
            }
            if (candidates.length === 1) {
                const nextV = candidates[0];
                polyline.push(nextV);
                usedEdges.add(`${Math.min(currentFront, nextV)}-${Math.max(currentFront, nextV)}`);
                currentFront = nextV;
            } else {
                break;
            }
        }
        
        // Extend back
        let currentBack = edge[0];
        while (true) {
            const neighbors = adj[currentBack] || [];
            const candidates = [];
            for (const neighbor of neighbors) {
                const key = `${Math.min(currentBack, neighbor)}-${Math.max(currentBack, neighbor)}`;
                if (usedEdges.has(key)) continue;
                const nextVec = new THREE.Vector3().subVectors(uniqueVertices[neighbor], uniqueVertices[currentBack]);
                if (nextVec.lengthSq() < epsilon) continue;
                const nextDir = nextVec.normalize();
                if (nextDir.dot(mainDir) < -directionEpsilon) { 
                    candidates.push(neighbor);
                }
            }
            if (candidates.length === 1) {
                const nextV = candidates[0];
                polyline.unshift(nextV);
                usedEdges.add(`${Math.min(currentBack, nextV)}-${Math.max(currentBack, nextV)}`);
                currentBack = nextV;
        } else {
                break;
            }
        }
        polylines.push(polyline);
    }

    // --- Step 3: Filter and Format polylines into ruling line segments ---
    const rulingLines = [];
    const totalHeight = Math.abs(topZ - bottomZ);

    for (const p of polylines) {
        if (p.length >= 2) {
            const startVertex = uniqueVertices[p[0]];
            const endVertex = uniqueVertices[p[p.length - 1]];

            const rulingHeight = Math.abs(endVertex.z - startVertex.z);

            if (rulingHeight >= totalHeight * spanPercentage) {
                rulingLines.push([
                    [startVertex.x, startVertex.y, startVertex.z],
                    [endVertex.x, endVertex.y, endVertex.z]
                ]);
            }
        }
    }

    console.timeEnd('getRulings');
    console.log(`Found ${rulingLines.length} ruling candidates after filtering.`);
    return rulingLines;
}

// --- Helper Functions for Stitching ---

function findClosestVertexIndex(point, polyline) {
    let closestIndex = -1;
    let minDistanceSq = Infinity;
    for (let i = 0; i < polyline.length; i++) {
        const dx = point[0] - polyline[i][0];
        const dy = point[1] - polyline[i][1];
        const dz = point[2] - polyline[i][2];
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < minDistanceSq) {
            minDistanceSq = distSq;
            closestIndex = i;
        }
    }
    return closestIndex;
}

function getArcLength(polyline, startIndex, endIndex) {
    let length = 0;
    const n = polyline.length;
    if (n < 2) return 0;

    // If the start and end are the same, we're calculating the full closed-loop perimeter length.
    if (startIndex === endIndex) {
        for (let i = 0; i < n; i++) {
            const p1 = polyline[i];
            const p2 = polyline[(i + 1) % n];
            const dx = p1[0] - p2[0];
            const dy = p1[1] - p2[1];
            const dz = p1[2] - p2[2];
            length += Math.sqrt(dx * dx + dy * dy + dz * dz);
        }
        return length;
    }

    // Otherwise, calculate length along the segment.
    for (let i = startIndex; i !== endIndex; i = (i + 1) % n) {
        const p1 = polyline[i];
        const p2 = polyline[(i + 1) % n];
        const dx = p1[0] - p2[0];
        const dy = p1[1] - p2[1];
        const dz = p1[2] - p2[2];
        length += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    return length;
}

function getPointAtArcLength(polyline, startIndex, targetLength) {
    let accumulatedLength = 0;
    const n = polyline.length;
    for (let i = startIndex; i !== (startIndex - 1 + n) % n; i = (i + 1) % n) {
        const p1 = polyline[i];
        const p2 = polyline[(i + 1) % n];
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const dz = p2[2] - p1[2];
        const segmentLength = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (accumulatedLength + segmentLength >= targetLength) {
            const remainder = targetLength - accumulatedLength;
            const ratio = remainder / segmentLength;
            return [
                p1[0] + dx * ratio,
                p1[1] + dy * ratio,
                p1[2] + dz * ratio
            ];
        }
        accumulatedLength += segmentLength;
    }
    return polyline[startIndex]; // Fallback
}


/**
 * Creates an ordered toolpath by stitching two perimeters together, guided by ruling lines.
 * The toolpath starts at a specified lead-in point and traverses the perimeters.
 *
 * @param {Array<Array<number>>} P0 - The bottom perimeter, a closed loop of [x, y, z] points.
 * @param {Array<Array<number>>} P1 - The top perimeter, a closed loop of [x, y, z] points.
 * @param {Array<Array<Array<number>>>} rulings - The ruling lines connecting P0 and P1.
 * @param {Array<number>|null} leadInPoint - The [x, y, z] starting point on P1. Defaults to P1[0].
 * @returns {Array<Array<Array<number>|boolean>>} An ordered list of [P0_point, P1_point, isRuling] for the toolpath.
 */
export function stitchRulings(P0, P1, rulings, leadInPoint = null) {
    if (P0.length < 2 || P1.length < 2) return [];

    // 1. Create a map of P1 vertex indices that are endpoints of rulings
    const rulingP1Indices = new Map();
    rulings.forEach(ruling => {
        const topPoint = ruling[0][2] > ruling[1][2] ? ruling[0] : ruling[1];
        const bottomPoint = ruling[0][2] > ruling[1][2] ? ruling[1] : ruling[0];
        const p1_idx = findClosestVertexIndex(topPoint, P1);
        const p0_idx = findClosestVertexIndex(bottomPoint, P0);
        if (p1_idx !== -1 && p0_idx !== -1) {
            rulingP1Indices.set(p1_idx, p0_idx);
        }
    });

    // 2. Find the starting index on P1
    let startIndex = 0;
    if (leadInPoint) {
        startIndex = findClosestVertexIndex(leadInPoint, P1);
    }
    if (startIndex === -1) startIndex = 0;

    // 3. Walk the P1 perimeter and generate the synchronized path
    const orderedPath = [];
    const n = P1.length;
    let lastRulingP1Index = -1;
    let lastRulingP0Index = -1;

    // Find the last ruling before the start index to correctly stitch the wrapping segment
    let searchIndex = (startIndex - 1 + n) % n;
    while (searchIndex !== startIndex) {
        if (rulingP1Indices.has(searchIndex)) {
            lastRulingP1Index = searchIndex;
            lastRulingP0Index = rulingP1Indices.get(searchIndex);
            break;
        }
        searchIndex = (searchIndex - 1 + n) % n;
    }
     // If no prior ruling was found, it means we start on a ruling or there are none.
    if (lastRulingP1Index === -1) {
        const firstRulingIndex = Array.from(rulingP1Indices.keys()).sort((a,b) => a-b)[0] || 0;
        lastRulingP1Index = firstRulingIndex;
        lastRulingP0Index = rulingP1Indices.get(firstRulingIndex) || 0;
    }


    for (let i = 0; i < n; i++) {
        const currentIndexP1 = (startIndex + i) % n;
        const currentPointP1 = P1[currentIndexP1];
        let correspondingPointP0;
        let isRuling = false;

        if (rulingP1Indices.has(currentIndexP1)) {
            // This point is a ruling sync point
            const correspondingIndexP0 = rulingP1Indices.get(currentIndexP1);
            correspondingPointP0 = P0[correspondingIndexP0];
            isRuling = true;
            lastRulingP1Index = currentIndexP1;
            lastRulingP0Index = correspondingIndexP0;
        } else {
            // This point is a stitch
            // Find the next ruling to interpolate between
            let nextRulingP1Index = -1;
            let nextRulingP0Index = -1;
            for (let j = 1; j <= n; j++) {
                const nextIndex = (currentIndexP1 + j) % n;
                if (rulingP1Indices.has(nextIndex)) {
                    nextRulingP1Index = nextIndex;
                    nextRulingP0Index = rulingP1Indices.get(nextIndex);
                    break;
                }
            }
            if(nextRulingP1Index === -1) { // Handle single ruling case
                nextRulingP1Index = lastRulingP1Index;
                nextRulingP0Index = lastRulingP0Index;
            }


            const segmentLengthP1 = getArcLength(P1, lastRulingP1Index, nextRulingP1Index);
            const partialLengthP1 = getArcLength(P1, lastRulingP1Index, currentIndexP1);
            
            const segmentLengthP0 = getArcLength(P0, lastRulingP0Index, nextRulingP0Index);

            const ratio = (segmentLengthP1 > 1e-9) ? partialLengthP1 / segmentLengthP1 : 0;
            const targetLengthP0 = ratio * segmentLengthP0;

            correspondingPointP0 = getPointAtArcLength(P0, lastRulingP0Index, targetLengthP0);
        }
        
        orderedPath.push([correspondingPointP0, currentPointP1, isRuling]);
    }

    // Add the starting point again to close the loop
    if (orderedPath.length > 0) {
        orderedPath.push(orderedPath[0]);
    }

    return orderedPath;
}
