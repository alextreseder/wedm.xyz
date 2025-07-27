import * as THREE from 'three';

function highlightZPlane(mainMesh, targetZ) {
    if (!mainMesh) return;
    
    const geometry = mainMesh.geometry;
    const positions = geometry.attributes.position;
    const vertexCount = positions.count;
    
    mainMesh.material.vertexColors = true;
    
    let colors = geometry.attributes.color;
    if (!colors || colors.count !== vertexCount) {
        colors = new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3);
        geometry.setAttribute('color', colors);
    }
    
    const highlightColor = new THREE.Color(0x87ceeb); // Sky Blue
    const originalColor = mainMesh.material.color.clone();

    for (let i = 0; i < vertexCount; i += 3) {
        const vA = new THREE.Vector3().fromBufferAttribute(positions, i);
        const vB = new THREE.Vector3().fromBufferAttribute(positions, i + 1);
        const vC = new THREE.Vector3().fromBufferAttribute(positions, i + 2);

        const isPlane = vA.z === targetZ && vB.z === targetZ && vC.z === targetZ;

        const color = isPlane ? highlightColor : originalColor;

        colors.setXYZ(i, color.r, color.g, color.b);
        colors.setXYZ(i + 1, color.r, color.g, color.b);
        colors.setXYZ(i + 2, color.r, color.g, color.b);
    }
    colors.needsUpdate = true;
}

/**
 * Colors all triangles white where all 3 vertices are at the target Z.
 * @param {THREE.Mesh} mainMesh - The mesh to process.
 * @param {number} targetZ - The Z plane to match.
 */
function colorFlatTrianglesWhite(mainMesh, targetZ) {
    return extractFlatTrianglesGeometry(mainMesh, targetZ);
}

function extractFlatTrianglesGeometry(mainMesh, targetZ) {
    if (!mainMesh) return null;
    
    const geometry = mainMesh.geometry;
    const positions = geometry.attributes.position;
    const vertexCount = positions.count;
    
    const flatPositions = [];
    const flatIndices = [];
    let index = 0;

    for (let i = 0; i < vertexCount; i += 3) {
        const vA = new THREE.Vector3().fromBufferAttribute(positions, i);
        const vB = new THREE.Vector3().fromBufferAttribute(positions, i + 1);
        const vC = new THREE.Vector3().fromBufferAttribute(positions, i + 2);

        const isFlatPlane = vA.z === targetZ && vB.z === targetZ && vC.z === targetZ;

        if (isFlatPlane) {
            flatPositions.push(vA.x, vA.y, vA.z, vB.x, vB.y, vB.z, vC.x, vC.y, vC.z);
            flatIndices.push(index, index + 1, index + 2);
            index += 3;
        }
    }
    
    if (flatPositions.length === 0) return null;
    
    const flatGeometry = new THREE.BufferGeometry();
    flatGeometry.setAttribute('position', new THREE.Float32BufferAttribute(flatPositions, 3));
    flatGeometry.setIndex(flatIndices);
    flatGeometry.computeVertexNormals();
    
    return flatGeometry;
}

/**
 * Extracts perimeter edges: line segments where exactly 2 vertices of a triangle are at target Z.
 * Returns an array of [start, end] points for drawing red lines.
 * @param {THREE.Mesh} mainMesh - The mesh to process.
 * @param {number} targetZ - The Z plane to match.
 * @returns {Array<[THREE.Vector3, THREE.Vector3]>} Array of edge pairs.
 */
function extractPerimeterEdges(mainMesh, targetZ) {
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
            vA.z === targetZ,
            vB.z === targetZ,
            vC.z === targetZ
        ];

        const countAtZ = atZ.filter(Boolean).length;

        if (countAtZ === 2) {
            // Find the two points at Z and add the edge
            const points = [vA, vB, vC];
            const edgePoints = points.filter((_, idx) => atZ[idx]);
            edges.push([edgePoints[0], edgePoints[1]]);
        }
    }

    return edges;
}

function extractSegmentsAtZ(mainMesh, h) {
    
	// if the mesh is null then return an empty array
	
	if (!mainMesh) return [];
    
	// get the geometry of the mesh

    const geometry = mainMesh.geometry;
    const positions = geometry.attributes.position;
    const vertexCount = positions.count;

	// set up line segments array

    let lineSegments = [];

	// for loop to execute for each triangle in the mesh

    for (let i = 0; i < vertexCount; i += 3) {

		// get the vertices of the triangle

        const A = new THREE.Vector3().fromBufferAttribute(positions, i);
        const B = new THREE.Vector3().fromBufferAttribute(positions, i + 1);
        const C = new THREE.Vector3().fromBufferAttribute(positions, i + 2);

		// set up conditions array

        const vertices = [A, B, C];
        const conditions = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];

		// for loop to execute for each vertex in the triangle to fill in the conditions array

        vertices.forEach((v, index) => {
            if (v.z < h) conditions[index][0] = 1;
            else if (v.z > h) conditions[index][2] = 1;
            else conditions[index][1] = 1;
        });

		// compute condition sum vector which will be useful for the next if statement

        const conditionSum = [
            conditions[0][0] + conditions[1][0] + conditions[2][0],
            conditions[0][1] + conditions[1][1] + conditions[2][1],
            conditions[0][2] + conditions[1][2] + conditions[2][2]
        ];

		// Here are the four algorithm scenarios

        if (conditionSum.includes(3)) {

            // All vertices are on one side of the plane or all are on the plane so proceed to the next triangle.

        } else if (conditionSum[1] === 2) {

            // Exactly two vertices are on the plane, forming a line segment.

            const selectedVertices = vertices.filter((_, index) => conditions[index][1] === 1);
            lineSegments.push(selectedVertices);

        } else if (conditionSum[1] === 1) {

            // One vertex is on the plane, find the intersection with the opposing edge.

            const onPlaneVertex = vertices.find((_, index) => conditions[index][1] === 1);
            const otherVertices = vertices.filter((_, index) => conditions[index][1] !== 1);
            const [P1, P2] = otherVertices;

            // Check if the other two vertices are on opposite sides of the plane.

            if ((P1.z - h) * (P2.z - h) < 0) {

                // If they are, a valid line segment is formed.

                const t = (h - P1.z) / (P2.z - P1.z);
                const x = P1.x + t * (P2.x - P1.x);
                const y = P1.y + t * (P2.y - P1.y);
                const intersectionPoint = new THREE.Vector3(x, y, h);
                lineSegments.push([onPlaneVertex, intersectionPoint]);

            }

            // If the other two vertices are on the same side then proceed to the next triangle.

        } else {

            // The plane intersects two edges of the triangle.

            const intersections = [];
            const edges = [[A, B], [B, C], [C, A]];

            for (const [P1, P2] of edges) {

                // Check if the edge crosses the plane (and is not parallel to it)
				
                if ((P1.z - h) * (P2.z - h) < 0) {
                    const t = (h - P1.z) / (P2.z - P1.z);
                    const x = P1.x + t * (P2.x - P1.x);
                    const y = P1.y + t * (P2.y - P1.y);
                    intersections.push(new THREE.Vector3(x, y, h));
                }
            }
            
            if (intersections.length === 2) {
                lineSegments.push(intersections);
            }
        }
    }

    return lineSegments;

}

function segmentsToPolyline(edges) {
    if (!edges || edges.length === 0) return [];

    // Convert THREE.Vector3 edges to simple array segments for processing
    const segments = edges.map(edge => [
        [edge[0].x, edge[0].y, edge[0].z],
        [edge[1].x, edge[1].y, edge[1].z]
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

    // Build graph
    segments.forEach(segment => {
        if (segment.length !== 2 || pointsEqual(segment[0], segment[1])) return;
        const i1 = findOrAddPoint(segment[0]);
        const i2 = findOrAddPoint(segment[1]);
        adj[i1].push(i2);
        adj[i2].push(i1);
    });

    const polylines = [];
    const visited = new Set();

    for (let i = 0; i < uniquePoints.length; i++) {
        if (!visited.has(i) && adj[i].length <= 1) { // Start a new path from an endpoint
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
    
    // Handle any remaining closed loops
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
            polylines.push(path.map(index => uniquePoints[index]));
        }
    }

    return polylines;
}


export { highlightZPlane, colorFlatTrianglesWhite, extractPerimeterEdges, extractFlatTrianglesGeometry, extractSegmentsAtZ, segmentsToPolyline }; 