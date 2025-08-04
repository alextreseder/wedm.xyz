function orientation(p, q, r, eps = 0.0001) {
    const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
    if (Math.abs(val) < eps) return 0;
    return val > 0 ? 1 : -1;
}

function intersect(seg1, seg2, eps = 0.0001) {
    const p1 = seg1[0], q1 = seg1[1];
    const p2 = seg2[0], q2 = seg2[1];
    const dx1 = q1.x - p1.x;
    const dy1 = q1.y - p1.y;
    const dx2 = q2.x - p2.x;
    const dy2 = q2.y - p2.y;
    const den = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(den) < eps) {
        // parallel
        const o1 = orientation(p1, q1, p2, eps);
        const o2 = orientation(p1, q1, q2, eps);
        if (o1 === 0 && o2 === 0) {
            // collinear
            const key = Math.abs(dx1) >= Math.abs(dy1) ? p => p.x : p => p.y;
            let a = { ...p1 }, b = { ...q1 };
            if (key(a) > key(b)) [a, b] = [b, a];
            let c = { ...p2 }, d = { ...q2 };
            if (key(c) > key(d)) [c, d] = [d, c];
            const start_k = Math.max(key(a), key(c));
            const end_k = Math.min(key(b), key(d));
            if (start_k > end_k + eps) return null;
            const dk = key(b) - key(a);
            if (Math.abs(dk) < eps) {
                // degenerate seg1
                if (Math.abs(key(a) - key(c)) < eps || Math.abs(key(a) - key(d)) < eps || (key(c) < key(a) && key(a) < key(d))) {
                    return { type: 'point', point: { ...a } };
                }
                return null;
            }
            const t1 = (start_k - key(a)) / dk;
            const start = {
                x: a.x + t1 * (b.x - a.x),
                y: a.y + t1 * (b.y - a.y)
            };
            if (Math.abs(start_k - end_k) < eps) {
                return { type: 'point', point: start };
            }
            const t2 = (end_k - key(a)) / dk;
            const end = {
                x: a.x + t2 * (b.x - a.x),
                y: a.y + t2 * (b.y - a.y)
            };
            return { type: 'segment', start, end };
        }
        return null;
    } else {
        // not parallel
        const t_num = (p2.x - p1.x) * dy2 - (p2.y - p1.y) * dx2;
        const t = t_num / den;
        const s_num = (p2.x - p1.x) * dy1 - (p2.y - p1.y) * dx1;
        const s = s_num / den;
        if (t > -eps && t < 1 + eps && s > -eps && s < 1 + eps) {
            const px = p1.x + t * dx1;
            const py = p1.y + t * dy1;
            // Interpolate Z from the first segment
            const pz = p1.z + t * (q1.z - p1.z);
            return { type: 'point', point: { x: px, y: py, z: pz } };
        }
        return null;
    }
}

function isClose(p1, p2, eps, is3D = false) {
    const distSq = (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2 + (is3D ? (p1.z - p2.z) ** 2 : 0);
    return distSq < eps ** 2;
}

/**
 * Finds all intersection points and overlapping segments between two polylines.
 * Polylines are expected in the format [[x,y,z], [x,y,z], ...]
 * @param {Array<[number, number, number]>} poly1 - The first polyline.
 * @param {Array<[number, number, number]>} poly2 - The second polyline.
 * @param {number} epsilon - A small tolerance for floating point comparisons.
 * @returns {{points: Array<{x: number, y: number, z: number}>, segments: Array<{start: {x: number, y: number}, end: {x: number, y: number}}>}}
 */
function findIntersections(poly1, poly2, epsilon = 0.0001) {
    // Project to 2D by ignoring z and converting to {x, y, z} objects
    const poly1_3d = poly1.map(p => ({ x: p[0], y: p[1], z: p[2] }));
    const poly2_3d = poly2.map(p => ({ x: p[0], y: p[1], z: p[2] }));

    const segments1 = [];
    for (let i = 0; i < poly1_3d.length; i++) {
        segments1.push([poly1_3d[i], poly1_3d[(i + 1) % poly1_3d.length]]);
    }
    const segments2 = [];
    for (let i = 0; i < poly2_3d.length; i++) {
        segments2.push([poly2_3d[i], poly2_3d[(i + 1) % poly2_3d.length]]);
    }
    const inters = [];
    for (const seg1 of segments1) {
        for (const seg2 of segments2) {
            const inter = intersect(seg1, seg2, epsilon);
            if (inter) inters.push(inter);
        }
    }
    const points = [];
    const segments = [];
    for (const inter of inters) {
        if (inter.type === 'point') {
            const p = inter.point;
            if (!points.some(ex => isClose(p, ex, epsilon, true))) {
                points.push(p);
            }
        } else {
            let start = inter.start;
            let end = inter.end;
            if (isClose(start, end, epsilon, true)) { // Use 3D check for segments
                const avg = {
                    x: (start.x + end.x) / 2,
                    y: (start.y + end.y) / 2,
                    z: (start.z + end.z) / 2
                };
                if (!points.some(ex => isClose(avg, ex, epsilon, true))) {
                    points.push(avg);
                }
            } else {
                // Optional: sort start/end for consistency
                if (start.x > end.x || (start.x === end.x && start.y > end.y)) {
                    [start, end] = [end, start];
                }
                segments.push({ start, end });
            }
        }
    }
    return { points, segments };
}

function getAngle(p1, p2, p3) {
    // p2 is the vertex of the angle, points are [x,y,z]
    const v1 = { x: p1[0] - p2[0], y: p1[1] - p2[1] };
    const v2 = { x: p3[0] - p2[0], y: p3[1] - p2[1] };

    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
    
    if (mag1 * mag2 < 1e-9) return 180;

    const cosAngle = dot / (mag1 * mag2);
    const angleRad = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
    return angleRad * (180 / Math.PI);
}

function mirrorPolyline(polyline, mirrorPoint) {
    const m = {x: mirrorPoint[0], y: mirrorPoint[1], z: mirrorPoint[2]};
    return polyline.map(p_arr => {
        const p = {x: p_arr[0], y: p_arr[1], z: p_arr[2]};
        return [2 * m.x - p.x, 2 * m.y - p.y, 2 * m.z - p.z];
    });
}

function insertPointIntoPolyline(polyline, point, epsilon = 1e-6) {
    // Check if the point is already a vertex and return its index
    for (let i = 0; i < polyline.length; i++) {
        const vertex = polyline[i];
        if (isClose({x: vertex[0], y: vertex[1], z: vertex[2]}, point, epsilon, true)) {
            return i;
        }
    }

    // Find the segment where the point should be inserted
    for (let i = 0; i < polyline.length; i++) {
        const p1 = {x: polyline[i][0], y: polyline[i][1], z: polyline[i][2]};
        const p2_index = (i + 1) % polyline.length;
        const p2 = {x: polyline[p2_index][0], y: polyline[p2_index][1], z: polyline[p2_index][2]};

        const distLine = Math.sqrt((p2.x - p1.x)**2 + (p2.y - p1.y)**2 + (p2.z - p1.z)**2);
        const dist1 = Math.sqrt((point.x - p1.x)**2 + (point.y - p1.y)**2 + (point.z - p1.z)**2);
        const dist2 = Math.sqrt((point.x - p2.x)**2 + (point.y - p2.y)**2 + (point.z - p2.z)**2);
        
        if (Math.abs(dist1 + dist2 - distLine) < epsilon) {
            polyline.splice(p2_index, 0, [point.x, point.y, point.z]);
            return p2_index; // Return the index of the newly inserted point
        }
    }
    return -1; // Return -1 if point is not on the polyline
}


/**
 * Generates intersection solutions for sharp corners of a middle perimeter.
 * @param {{topPerimeter: any, upperQuarterPerimeter: any, middlePerimeter: any, lowerQuarterPerimeter: any, bottomPerimeter: any}} perimeters
 * @param {number} angleThreshold The angle to determine a "sharp" corner.
 */
function calculateSyncSolutions({ topPerimeter, upperQuarterPerimeter, middlePerimeter, lowerQuarterPerimeter, bottomPerimeter }, angleThreshold) {
    const solutionLines = [];
    const syncPairs = [];

    const middlePoly = middlePerimeter[0]; 
    if (!middlePoly || middlePoly.length < 3) return { solutionLines: [], modifiedTopPerimeter: topPerimeter, modifiedBottomPerimeter: bottomPerimeter, syncPairs: [] };

    const bottomPoly = bottomPerimeter[0];
    const lowerPoly = lowerQuarterPerimeter[0];
    const upperPoly = upperQuarterPerimeter[0];
    const topPoly = topPerimeter[0];

    if (!bottomPoly || !lowerPoly || !upperPoly || !topPoly) return { solutionLines: [], modifiedTopPerimeter: topPerimeter, modifiedBottomPerimeter: bottomPerimeter, syncPairs: [] };
    
    // Create copies to modify
    const modifiedTopPoly = topPoly.map(p => [...p]);
    const modifiedBottomPoly = bottomPoly.map(p => [...p]);

    for (let i = 0; i < middlePoly.length; i++) {
        const p_prev = middlePoly[(i - 1 + middlePoly.length) % middlePoly.length];
        const p_curr = middlePoly[i];
        const p_next = middlePoly[(i + 1) % middlePoly.length];

        const angle = getAngle(p_prev, p_curr, p_next);

        if (Math.abs(angle - 180) < 1e-6) continue;

        if (angle < angleThreshold) {
            const mirrorPoint = p_curr;

            const mirroredBottom = mirrorPolyline(bottomPoly, mirrorPoint);
            const mirroredLower = mirrorPolyline(lowerPoly, mirrorPoint);

            const bottomTopIntersections = findIntersections(mirroredBottom, topPoly);
            const lowerUpperIntersections = findIntersections(mirroredLower, upperPoly);

            let bestSolution = null;
            let minDistance = Infinity;

            if (bottomTopIntersections.points.length > 0 && lowerUpperIntersections.points.length > 0) {
                bottomTopIntersections.points.forEach(btPoint => {
                    const lineStart = {x: mirrorPoint[0], y: mirrorPoint[1], z: mirrorPoint[2]};
                    const lineEnd = btPoint;

                    lowerUpperIntersections.points.forEach(luPoint => {
                        const distLine = Math.sqrt((lineEnd.x - lineStart.x)**2 + (lineEnd.y - lineStart.y)**2 + (lineEnd.z - lineStart.z)**2);
                        const dist1 = Math.sqrt((luPoint.x - lineStart.x)**2 + (luPoint.y - lineStart.y)**2 + (luPoint.z - lineStart.z)**2);
                        const dist2 = Math.sqrt((luPoint.x - lineEnd.x)**2 + (luPoint.y - lineEnd.y)**2 + (luPoint.z - lineEnd.z)**2);

                        if (Math.abs(dist1 + dist2 - distLine) < 1e-6) {
                             if (distLine < minDistance) {
                                minDistance = distLine;
                                bestSolution = lineEnd; // This is the top sync point
                            }
                        }
                    });
                });
            }

            if (bestSolution) {
                const topSyncPoint = bestSolution;
                // Unmirror the top sync point to find the bottom sync point
                const bottomSyncPoint = {
                    x: 2 * mirrorPoint[0] - topSyncPoint.x,
                    y: 2 * mirrorPoint[1] - topSyncPoint.y,
                    z: 2 * mirrorPoint[2] - topSyncPoint.z
                };
                
                solutionLines.push({
                    startPoint: bottomSyncPoint,
                    endPoint: topSyncPoint
                });

                // Insert points into the copied polylines and get their indices
                const topIndex = insertPointIntoPolyline(modifiedTopPoly, topSyncPoint);
                const bottomIndex = insertPointIntoPolyline(modifiedBottomPoly, bottomSyncPoint);

                if (topIndex !== -1 && bottomIndex !== -1) {
                    syncPairs.push([topIndex, bottomIndex]);
                }
            }
        }
    }
    
    return { 
        solutionLines, 
        modifiedTopPerimeter: [modifiedTopPoly], 
        modifiedBottomPerimeter: [modifiedBottomPoly],
        syncPairs
    };
}


export { findIntersections, calculateSyncSolutions }; 