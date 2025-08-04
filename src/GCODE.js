// GCODE.js

/**
 * Calculates the Euclidean distance between two 3D points.
 * @param {number[]} p1 - The first point [x, y, z].
 * @param {number[]} p2 - The second point [x, y, z].
 * @returns {number} The distance.
 */
function distance(p1, p2) {
    return Math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2 + (p1[2] - p2[2]) ** 2);
}

/**
 * Calculates the total length of a polyline path.
 * @param {Array<[number, number, number]>} path - An array of points.
 * @returns {number} The total length.
 */
function pathLength(path) {
    let len = 0;
    for (let i = 0; i < path.length - 1; i++) {
        len += distance(path[i], path[i + 1]);
    }
    return len;
}

/**
 * Finds the coordinates of a point at a fractional distance along a polyline.
 * @param {Array<[number, number, number]>} path - The polyline to travel along.
 * @param {number} totalLength - The pre-calculated total length of the path.
 * @param {number} fraction - The fractional distance (0.0 to 1.0) to travel.
 * @returns {number[]} The interpolated point [x, y, z].
 */
function findPointAtFraction(path, totalLength, fraction) {
    if (fraction <= 0) return path[0];
    if (fraction >= 1) return path[path.length - 1];

    const targetLength = totalLength * fraction;
    let accumulatedLength = 0;

    for (let i = 0; i < path.length - 1; i++) {
        const segmentStart = path[i];
        const segmentEnd = path[i + 1];
        const segmentLength = distance(segmentStart, segmentEnd);

        if (accumulatedLength + segmentLength >= targetLength) {
            const lengthIntoSegment = targetLength - accumulatedLength;
            const segmentFraction = lengthIntoSegment / segmentLength;
            const p = [
                segmentStart[0] + (segmentEnd[0] - segmentStart[0]) * segmentFraction,
                segmentStart[1] + (segmentEnd[1] - segmentStart[1]) * segmentFraction,
                segmentStart[2] + (segmentEnd[2] - segmentStart[2]) * segmentFraction,
            ];
            return p;
        }
        accumulatedLength += segmentLength;
    }
    return path[path.length - 1]; // Fallback
}


/**
 * Generates 4-axis G-code from top and bottom perimeters and their sync points.
 * @param {Array<[number, number, number]>} topPerimeter - The top polyline.
 * @param {Array<[number, number, number]>} bottomPerimeter - The bottom polyline.
 * @param {Array<[number, number]>} syncPairs - An array of [topIndex, bottomIndex] pairs.
 * @returns {string} The generated G-code.
 */
export function generateGCode(topPerimeter, bottomPerimeter, syncPairs) {
    if (!topPerimeter || !bottomPerimeter || !syncPairs || syncPairs.length === 0) {
        return "";
    }

    const topPoly = topPerimeter[0];
    const bottomPoly = bottomPerimeter[0];
    
    // 1. Align Perimeters
    const sortedSyncPairs = [...syncPairs].sort((a, b) => a[0] - b[0]);

    // Use the first available sync point as the lead-in.
    const leadInTopIndex = sortedSyncPairs[0][0];
    const leadInBottomIndex = sortedSyncPairs[0][1];

    // Roll the top and bottom polylines to start at the lead-in points.
    const rolledTopPoly = [...topPoly.slice(leadInTopIndex), ...topPoly.slice(0, leadInTopIndex)];
    const rolledBottomPoly = [...bottomPoly.slice(leadInBottomIndex), ...bottomPoly.slice(0, leadInBottomIndex)];

    // Re-map the sync pairs to the new rolled indices.
    const topIndexMap = new Map(topPoly.map((_, i) => [i, (i - leadInTopIndex + topPoly.length) % topPoly.length]));
    const bottomIndexMap = new Map(bottomPoly.map((_, i) => [i, (i - leadInBottomIndex + bottomPoly.length) % bottomPoly.length]));
    const remappedSyncPairs = sortedSyncPairs.map(([topIdx, bottomIdx]) => [topIndexMap.get(topIdx), bottomIndexMap.get(bottomIdx)]).sort((a, b) => a[0] - b[0]);

    // 2. Traversal and Interpolation
    const gcodeLines = [];
    
    // Add the starting point
    const startTop = rolledTopPoly[0];
    const startBottom = rolledBottomPoly[0];
    gcodeLines.push(`G1 X${startTop[0].toFixed(4)} Y${startTop[1].toFixed(4)} Z${startTop[2].toFixed(4)} U${startBottom[0].toFixed(4)} V${startBottom[1].toFixed(4)} W${startBottom[2].toFixed(4)}`);

    for (let i = 0; i < remappedSyncPairs.length; i++) {
        const [currentTopIdx, currentBottomIdx] = remappedSyncPairs[i];
        const [nextTopIdx, nextBottomIdx] = remappedSyncPairs[(i + 1) % remappedSyncPairs.length];

        // Extract sub-paths between sync points, handling wraparound.
        const topSubPath = [];
        for (let j = currentTopIdx; j !== nextTopIdx; j = (j + 1) % rolledTopPoly.length) {
            topSubPath.push(rolledTopPoly[j]);
        }
        topSubPath.push(rolledTopPoly[nextTopIdx]);

        const bottomSubPath = [];
        for (let j = currentBottomIdx; j !== nextBottomIdx; j = (j + 1) % rolledBottomPoly.length) {
            bottomSubPath.push(rolledBottomPoly[j]);
        }
        bottomSubPath.push(rolledBottomPoly[nextBottomIdx]);

        // Calculate lengths
        const topSubPathLength = pathLength(topSubPath);
        const bottomSubPathLength = pathLength(bottomSubPath);
        
        if (topSubPathLength < 1e-9 || bottomSubPathLength < 1e-9) continue;

        // Collect all intermediate vertices as "events".
        const events = [];
        let accumulatedLength = 0;
        for (let j = 0; j < topSubPath.length - 1; j++) {
            accumulatedLength += distance(topSubPath[j], topSubPath[j + 1]);
            if (j < topSubPath.length - 2) { // Exclude the final sync point
                events.push({ fraction: accumulatedLength / topSubPathLength, from: 'top', point: topSubPath[j + 1] });
            }
        }
        accumulatedLength = 0;
        for (let j = 0; j < bottomSubPath.length - 1; j++) {
            accumulatedLength += distance(bottomSubPath[j], bottomSubPath[j + 1]);
            if (j < bottomSubPath.length - 2) { // Exclude the final sync point
                events.push({ fraction: accumulatedLength / bottomSubPathLength, from: 'bottom', point: bottomSubPath[j + 1] });
            }
        }

        // Sort events by their fractional distance.
        events.sort((a, b) => a.fraction - b.fraction);
        
        // Process events to generate G-code
        for (const event of events) {
            let topPoint, bottomPoint;
            if (event.from === 'top') {
                topPoint = event.point;
                bottomPoint = findPointAtFraction(bottomSubPath, bottomSubPathLength, event.fraction);
            } else { // from 'bottom'
                bottomPoint = event.point;
                topPoint = findPointAtFraction(topSubPath, topSubPathLength, event.fraction);
            }
            gcodeLines.push(`G1 X${topPoint[0].toFixed(4)} Y${topPoint[1].toFixed(4)} Z${topPoint[2].toFixed(4)} U${bottomPoint[0].toFixed(4)} V${bottomPoint[1].toFixed(4)} W${bottomPoint[2].toFixed(4)}`);
        }
        
        // Add the G-code for the next sync point.
        const finalTopPoint = rolledTopPoly[nextTopIdx];
        const finalBottomPoint = rolledBottomPoly[nextBottomIdx];
        gcodeLines.push(`G1 X${finalTopPoint[0].toFixed(4)} Y${finalTopPoint[1].toFixed(4)} Z${finalTopPoint[2].toFixed(4)} U${finalBottomPoint[0].toFixed(4)} V${finalBottomPoint[1].toFixed(4)} W${finalBottomPoint[2].toFixed(4)}`);
    }

    return gcodeLines.join('\n');
}