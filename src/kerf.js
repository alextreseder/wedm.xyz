import * as THREE from 'three';

/**
 * Calculates the kerf-compensated and projected toolpath points for a 4-axis wire EDM cut.
 *
 * @param {object} points - An object containing the geometry points.
 * @param {THREE.Vector3} points.A - The common vertex on the top profile.
 * @param {THREE.Vector3} points.B - The trailing vertex on the top profile.
 * @param {THREE.Vector3} points.C - The leading vertex on the top profile.
 * @param {THREE.Vector3} points.D - The common vertex on the bottom profile.
 * @param {THREE.Vector3} points.E - The trailing vertex on the bottom profile.
 * @param {THREE.Vector3} points.F - The leading vertex on the bottom profile.
 * @param {number} R - The kerf radius.
 * @param {number} Z0 - The Z-coordinate of the bottom guide plane.
 * @param {number} Z1 - The Z-coordinate of the top guide plane.
 * @returns {object} An object containing the four calculated endpoint vectors.
 */
export function kerf(points, R, Z0, Z1) {
    // The caller in main.js passes uppercase A, B, C...
    const { A, B, C, D, E, F } = points;

    // 1. Create vectors for each of the line segments.
    const V_A = new THREE.Vector3().subVectors(A, D);
    const V_B = new THREE.Vector3().subVectors(B, A);
    const V_C = new THREE.Vector3().subVectors(C, A);
    const V_D = new THREE.Vector3().subVectors(D, A);
    const V_E = new THREE.Vector3().subVectors(E, D);
    const V_F = new THREE.Vector3().subVectors(F, D);

    // 2. Calculate cross products.
    let X_B = new THREE.Vector3().crossVectors(V_B, V_D);
    let X_C = new THREE.Vector3().crossVectors(V_C, V_D);
    let X_E = new THREE.Vector3().crossVectors(V_E, V_A);
    let X_F = new THREE.Vector3().crossVectors(V_F, V_A);

    // 3. Scale the cross products to the magnitude of the kerf radius "R".
    X_B.normalize().multiplyScalar(R);
    X_C.normalize().multiplyScalar(R);
    X_E.normalize().multiplyScalar(R);
    X_F.normalize().multiplyScalar(R);

    // 4. Calculate dot products for orientation check.
    const D_B = new THREE.Vector3().copy(X_C).dot(V_B);
    const D_C = new THREE.Vector3().copy(X_B).dot(V_C);
    const D_E = new THREE.Vector3().copy(X_F).dot(V_E);
    const D_F = new THREE.Vector3().copy(X_E).dot(V_F);

    // 5. Conditionally invert vectors based on dot product signs, to guarantee an external solution
    if (D_B > 0) {
        X_C.multiplyScalar(-1);
    }
    if (D_C > 0) {
        X_B.multiplyScalar(-1);
    }
    if (D_F > 0) {
        X_E.multiplyScalar(-1);
    }
    if (D_E > 0) {
        X_F.multiplyScalar(-1);
    }

    // 6. Add the cross products back to the original point coordinates to get the endpoints.
    const E_B = new THREE.Vector3().addVectors(A, X_B);
    const E_C = new THREE.Vector3().addVectors(A, X_C);
    const E_E = new THREE.Vector3().addVectors(D, X_E);
    const E_F = new THREE.Vector3().addVectors(D, X_F);

    // 7. Calculate the M point precursors
    const X_BC = new THREE.Vector3().addVectors(X_B, X_C).normalize().multiplyScalar(R);
    const X_EF = new THREE.Vector3().addVectors(X_E, X_F).normalize().multiplyScalar(R);

    const M_BC = new THREE.Vector3().addVectors(X_BC, A);
    const M_EF = new THREE.Vector3().addVectors(X_EF, D);

    // 8. function to intersect a line with a plane
    const intersectLinePlane = (lineOrigin, lineDirection, planePoint, planeNormal) => {
        const n = planeNormal;
        const l = lineDirection;
        const l_dot_n = l.dot(n);

        if (Math.abs(l_dot_n) < 1e-9) {
            return null; 
        }

        const P0_minus_L0 = planePoint.clone().sub(lineOrigin);
        const t = P0_minus_L0.dot(n) / l_dot_n;
        
        return lineOrigin.clone().add(l.clone().multiplyScalar(t));
    };

    //9. Calulate the M points
    const M_B = intersectLinePlane(E_B, new THREE.Vector3().subVectors(A, B), M_BC, X_BC);
    const M_C = intersectLinePlane(E_C, new THREE.Vector3().subVectors(A, C), M_BC, X_BC);
    const M_E = intersectLinePlane(E_E, new THREE.Vector3().subVectors(D, E), M_EF, X_EF);
    const M_F = intersectLinePlane(E_F, new THREE.Vector3().subVectors(D, F), M_EF, X_EF);
    
    //10. Calculate the I points
    const I_BC = intersectLinePlane(
        new THREE.Vector3().subVectors(A, X_B),
        V_B,
        new THREE.Vector3().subVectors(A, X_C),
        X_C
    );

    const I_EF = intersectLinePlane(
        new THREE.Vector3().subVectors(D, X_E),
        V_E,
        new THREE.Vector3().subVectors(D, X_F),
        X_F
    );

    // 11. Project the points to the guide planes
    const [P_D, P_A] = (D && A) ? project(D, A, Z0, Z1) : [null, null];
    const [P_E_E, P_E_B] = (E_E && E_B) ? project(E_E, E_B, Z0, Z1) : [null, null];
    const [P_E_F, P_E_C] = (E_F && E_C) ? project(E_F, E_C, Z0, Z1) : [null, null];
    const [P_M_E, P_M_B] = (M_E && M_B) ? project(M_E, M_B, Z0, Z1) : [null, null];
    const [P_M_F, P_M_C] = (M_F && M_C) ? project(M_F, M_C, Z0, Z1) : [null, null];
    const [P_I_EF, P_I_BC] = (I_EF && I_BC) ? project(I_EF, I_BC, Z0, Z1) : [null, null];

    //12. Return the endpoints and M/I points
    return {
        P_E_B,
        P_E_C,
        P_E_E,
        P_E_F,
        P_M_B,
        P_M_C,
        P_M_E,
        P_M_F,
        P_I_BC,
        P_I_EF,
        P_A,
        P_D
    };
}

export function project(p0, p1, z0, z1) {
    const V = new THREE.Vector3().subVectors(p1, p0);

    if (Math.abs(V.z) < 1e-9) {
        return null; // Line is parallel to the XY plane
    }

    const t0 = (z0 - p0.z) / V.z;
    const P0 = new THREE.Vector3().copy(p0).add(V.clone().multiplyScalar(t0));

    const t1 = (z1 - p0.z) / V.z;
    const P1 = new THREE.Vector3().copy(p0).add(V.clone().multiplyScalar(t1));

    return [P0, P1];
}

/*

Point Notation:
                     C
                   /
                 /
B_____________A/
              |
              |
              |      F
              |    /
              |  /
E_____________D/

Variable Notation:
A, B, C, D, E, F - Points
R - Kerf Radius
V_ = Vector
X_ = Cross Product
D_ = Dot Product
E_ = End Point
M_ = Middle Point
I_ = Inside Point

External solution contains 4 line segments: 2 "M" segments terminated by 2 "E" segments
Internal solution contains 1 line segment: "I"

Return Notation Example:
P_E_B = Line Segment E_B -> E_E projected onto Z1 plane.
    E_B = Endpoint for B -> A line segment.

P_M_E = Line Segment M_E -> M_B projected onto Z0 plane.
    M_E = Endpoint for E -> D line segment.

First, lets work with kerf.js. For the puposes of this algorithm, treat rulings and stiches the same. Basically, each stich / ruling is the AD line segment. The BA and AC line segments are the connecting edges on P1 and the ED and DF are the connecting edges on P0. The R input is the kerf radius and Z0 and Z1 are the bottom guide and top guide z heights, respectively, which should connect to the sidebar text fields. The kerf algorithm will calculate the concave and convex solutions, which it calls external and internal in the comments. 

Plot Line Segments (P_E_B,P_E_E) (P_E_C,P_E_F) (P_M_B,P_M_E) (P_M_C,P_M_F) in blue. 

Plot Line Segments (P_I_BC,P_I_EF) in orange

Plot Line Segments (P_E_B,P_M_B) (P_M_B,P_M_C) (P_M_C,P_E_C) (P_E_E,P_M_E) (P_M_E,P_M_F) (P_M_F,P_E_F) in white

*/