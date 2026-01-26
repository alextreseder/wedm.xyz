/* eslint-disable no-restricted-globals */
import initOpenCascade from 'opencascade.js/dist/opencascade.full.js';

// Define worker self type
const ctx: Worker = self as any;

let oc: any = null;

/**
 * Initializes the OpenCascade library.
 */
const initOCCT = async () => {
  if (oc) return oc;

  try {
    oc = await initOpenCascade({
      locateFile: (path: string) => {
        if (path.endsWith('.wasm')) {
          return `/wasm/opencascade.full.wasm`;
        }
        return `/wasm/${path}`;
      }
    });
    console.log("OpenCascade (Worker) initialized");
    return oc;
  } catch (error) {
    console.error("Failed to initialize OpenCascade in worker:", error);
    throw error;
  }
};

/**
 * Helper to safely create OpenCascade class instances.
 */
const createInstance = (OC: any, className: string, ...args: any[]) => {
  try {
    if (OC[className]) return new OC[className](...args);
  } catch (e) { /* ignore */ }
  
  for (let i = 1; i <= 5; i++) {
     const name = `${className}_${i}`;
     if (OC[name]) {
       try { return new OC[name](...args); } catch(e) { /* continue */ }
     }
  }
  throw new Error(`Could not instantiate ${className} or any of its numbered variants.`);
};

// --- Iterators ---

function ForEachFace(OC: any, shape: any, callback: (index: number, face: any) => void) {
  let face_index = 0;
  let anExplorer;

  try {
      // 1. Try safe, robust instantiation with Init
      // This pattern is most compatible across binding versions
      try {
        anExplorer = new OC.TopExp_Explorer();
      } catch(e) {
        // Try fallback names
        if (OC.TopExp_Explorer_1) anExplorer = new OC.TopExp_Explorer_1();
        else if (OC.TopExp_Explorer_2) anExplorer = new OC.TopExp_Explorer_2();
      }

      // If constructor failed or wasn't found
      if (!anExplorer) {
          // Last ditch: use helper (which might try constructor with args)
          anExplorer = createInstance(OC, "TopExp_Explorer");
      }

      // 2. Resolve the Enum
      let faceEnum = OC.TopAbs_FACE;
      if (faceEnum === undefined && OC.TopAbs_ShapeEnum) {
          faceEnum = OC.TopAbs_ShapeEnum.TopAbs_FACE;
      }
      
      // 3. Init
      // The error says "expected 3 args", meaning ToAvoid is mandatory for this binding
      // Init(S: TopoDS_Shape, ToFind: TopAbs_ShapeEnum, ToAvoid: TopAbs_ShapeEnum): void;
      // We can pass TopAbs_SHAPE as "ToAvoid" which effectively means "don't avoid anything specific that stops recursion"
      // or we can try to find a None/Shape enum.
      
      let shapeEnum = OC.TopAbs_SHAPE;
      if (shapeEnum === undefined && OC.TopAbs_ShapeEnum) {
          shapeEnum = OC.TopAbs_ShapeEnum.TopAbs_SHAPE;
      }

      anExplorer.Init(shape, faceEnum, shapeEnum);

  } catch (e) {
      console.error("ForEachFace init failed:", e);
      throw e;
  }

  for (; anExplorer.More(); anExplorer.Next()) {
    let face = anExplorer.Current();
    
    // In many bindings, TopoDS.Face(shape) is the standard cast.
    // If OC.TopoDS.Face is missing, it might be OC.TopoDS.Face_1 or similar.
    // Also sometimes it's just 'TopoDS.Face' if TopoDS is a global namespace within OC.
    // However, the error says "OC.TopoDS.Face is not a function", meaning OC.TopoDS exists but Face does not.
    
    let faceCasted;
    if (OC.TopoDS.Face) {
        faceCasted = OC.TopoDS.Face(face);
    } else if (OC.TopoDS.Face_1) {
        faceCasted = OC.TopoDS.Face_1(face);
    } else if (OC.TopoDS.prototype && OC.TopoDS.prototype.Face) {
        // Fallback to prototype method if static failed
        faceCasted = OC.TopoDS.prototype.Face(face);
    } else {
        // Last resort: assume the shape is already a face if coming from Explorer(FACE)
        // But in strict typing this might fail downstream.
        console.warn("Could not find TopoDS.Face cast function, using raw shape.");
        faceCasted = face;
    }

    callback(face_index++, faceCasted);
  }
  anExplorer.delete();
}

function ForEachEdge(OC: any, shape: any, callback: (index: number, edge: any) => void) {
  let edgeHashes: {[key: number]: number} = {};
  let edgeIndex = 0;
  let anExplorer;

  try {
      try {
        anExplorer = new OC.TopExp_Explorer();
      } catch(e) {
        if (OC.TopExp_Explorer_1) anExplorer = new OC.TopExp_Explorer_1();
        else if (OC.TopExp_Explorer_2) anExplorer = new OC.TopExp_Explorer_2();
      }

      if (!anExplorer) {
          anExplorer = createInstance(OC, "TopExp_Explorer");
      }

      let edgeEnum = OC.TopAbs_EDGE;
      if (edgeEnum === undefined && OC.TopAbs_ShapeEnum) {
          edgeEnum = OC.TopAbs_ShapeEnum.TopAbs_EDGE;
      }

      let shapeEnum = OC.TopAbs_SHAPE;
      if (shapeEnum === undefined && OC.TopAbs_ShapeEnum) {
          shapeEnum = OC.TopAbs_ShapeEnum.TopAbs_SHAPE;
      }

      anExplorer.Init(shape, edgeEnum, shapeEnum);

  } catch(e) {
      console.error("ForEachEdge init failed:", e);
      throw e;
  }

  for (; anExplorer.More(); anExplorer.Next()) {
    let edge = anExplorer.Current();
    let edgeCasted;
    
    if (OC.TopoDS.Edge) {
        edgeCasted = OC.TopoDS.Edge(edge);
    } else if (OC.TopoDS.Edge_1) {
        edgeCasted = OC.TopoDS.Edge_1(edge);
    } else if (OC.TopoDS.prototype && OC.TopoDS.prototype.Edge) {
        edgeCasted = OC.TopoDS.prototype.Edge(edge);
    } else {
        edgeCasted = edge;
    }

    let edgeHash = edgeCasted.HashCode(100000000);
    if(!edgeHashes.hasOwnProperty(edgeHash)){
      edgeHashes[edgeHash] = edgeIndex;
      callback(edgeIndex++, edge);
    }
  }
  anExplorer.delete();
}

/**
 * Converts a STEP file buffer to Raw Mesh Data (Faces & Edges) with Metadata.
 */
const convertStepToMesh = async (fileBuffer: ArrayBuffer, linearDeflection: number = 1.0) => {
  const OC = await initOCCT();
  const fileName = "import.step";
  
  try {
    // 1. Write file
    OC.FS.createDataFile("/", fileName, new Uint8Array(fileBuffer), true, true, true);

    // 2. Read STEP
    const reader = createInstance(OC, "STEPControl_Reader");
    const readResult = reader.ReadFile(fileName);
    if (readResult !== OC.IFSelect_ReturnStatus.IFSelect_RetDone) {
      throw new Error(`Failed to read STEP file. Return status: ${readResult}`);
    }
    
    reader.TransferRoots(createInstance(OC, "Message_ProgressRange"));
    const shape = reader.OneShape();

    // 3. Tessellate
    createInstance(OC, "BRepMesh_IncrementalMesh", shape, linearDeflection, false, 0.5, false);

    // 4. Extract Face Mesh Data
    let faceVertices: number[] = [];
    let faceNormals: number[] = [];
    let faceIndices: number[] = [];
    let faceIds: number[] = []; // Maps vertex -> Face Index
    let globalVertexOffset = 0;
    // let processedFaces = 0; // Removed debug counter

    ForEachFace(OC, shape, (faceIndex, myFace) => {
        // processedFaces++; // Removed debug counter
        let aLocation;
        try {
            aLocation = new OC.TopLoc_Location();
        } catch(e) {
            aLocation = createInstance(OC, "TopLoc_Location");
        }

        // BRep_Tool::Triangulation(const TopoDS_Face& F, TopLoc_Location& L, const Standard_Real& MeshDeflection = -1)
        // It seems the 3rd argument (MeshDeflection) is mandatory in this binding.
        // Passing 0 or -1 usually means "use existing" or "ignore check".
        
        let myT;
        if (OC.BRep_Tool && OC.BRep_Tool.Triangulation) {
            try {
                myT = OC.BRep_Tool.Triangulation(myFace, aLocation, 0); // Try with 3 args
            } catch (e) {
                myT = OC.BRep_Tool.Triangulation(myFace, aLocation); // Fallback to 2
            }
        } else if (OC.BRep_Tool && OC.BRep_Tool.prototype && OC.BRep_Tool.prototype.Triangulation) {
             try {
                myT = OC.BRep_Tool.prototype.Triangulation(myFace, aLocation, 0);
            } catch (e) {
                myT = OC.BRep_Tool.prototype.Triangulation(myFace, aLocation);
            }
        } else {
            // Try numbered variants or assume static
            try {
                if (OC.BRep_Tool_1 && OC.BRep_Tool_1.Triangulation) {
                     try {
                        myT = OC.BRep_Tool_1.Triangulation(myFace, aLocation, 0);
                    } catch (e) {
                        myT = OC.BRep_Tool_1.Triangulation(myFace, aLocation);
                    }
                } else {
                    throw new Error("Cannot find BRep_Tool.Triangulation");
                }
            } catch(e) {
                console.error("BRep_Tool.Triangulation missing");
                return;
            }
        }
        
        if (!myT || (myT.IsNull && myT.IsNull())) {
             // console.warn(`Face ${faceIndex}: No triangulation found.`);
             return;
        }

        // In some OCCT versions, Triangulation returns a Handle, and we need to dereference it.
        // myT.get() usually returns the Poly_Triangulation object.
        // If myT is already the object, myT.get might not exist or return self.
        
        let triangulation;
        if (myT.get) {
            triangulation = myT.get();
        } else {
            triangulation = myT;
        }

        // triangulation.IsNull is typically for Handles.
        // If we unwrapped it, it might be the raw pointer/object which doesn't have IsNull().
        // We should check if triangulation is null/undefined.
        if (!triangulation) return;
        if (triangulation.IsNull && triangulation.IsNull()) return;

        // --- STRATEGY: Determine Access Mode (Array vs Direct) ---
        let nodeAccessorType = "unknown";
        let nodesLength = 0;
        let nodesLower = 1;
        let NodesArray = null;

        // Check for modern OCCT API: NbNodes() and Node(i)
        if (triangulation.NbNodes) {
            nodeAccessorType = "direct";
            nodesLength = triangulation.NbNodes();
            nodesLower = 1;
        } 
        // Check for Legacy OCCT API: Nodes() returning Array
        else if (triangulation.Nodes || triangulation.Nodes_1) {
             let nodesFunc = triangulation.Nodes || triangulation.Nodes_1;
             NodesArray = nodesFunc.call(triangulation);
             
             if (NodesArray && NodesArray.get) NodesArray = NodesArray.get();

             if (NodesArray) {
                 nodeAccessorType = "array";
                 if (NodesArray.Length) nodesLength = NodesArray.Length();
                 else if (NodesArray.Upper && NodesArray.Lower) nodesLength = NodesArray.Upper() - NodesArray.Lower() + 1;
                 
                 if (NodesArray.Lower) nodesLower = NodesArray.Lower();
             }
        }

        if (nodeAccessorType === "unknown") {
             // console.warn(`Face ${faceIndex}: Could not determine node access method. Keys:`, Object.keys(triangulation));
             return;
        }

        // --- Triangles ---
        // Similarly check for Triangles
        let triangleAccessorType = "unknown";
        let trianglesLength = 0;
        let trianglesLower = 1;
        let TrianglesArray = null;

        if (triangulation.NbTriangles) {
            triangleAccessorType = "direct";
            trianglesLength = triangulation.NbTriangles();
        } else if (triangulation.Triangles || triangulation.Triangles_1) {
             let triFunc = triangulation.Triangles || triangulation.Triangles_1;
             TrianglesArray = triFunc.call(triangulation);
             if (TrianglesArray && TrianglesArray.get) TrianglesArray = TrianglesArray.get();
             if (TrianglesArray) {
                 triangleAccessorType = "array";
                 if (TrianglesArray.Length) trianglesLength = TrianglesArray.Length();
                 else if (TrianglesArray.Upper) trianglesLength = TrianglesArray.Upper() - TrianglesArray.Lower() + 1;
             }
        }

        // -- Vertices --
        for(let i = 0; i < nodesLength; i++) {
            let idx = nodesLower + i;
            let p;
            
            if (nodeAccessorType === "direct") {
                // triangulation.Node(i)
                if (triangulation.Node) p = triangulation.Node(idx);
                else if (triangulation.Node_1) p = triangulation.Node_1(idx);
            } else {
                // NodesArray.Value(i)
                p = NodesArray.Value(idx);
            }

            if (p) {
                let pt = p.Transformed(aLocation.Transformation());
                faceVertices.push(pt.X(), pt.Y(), pt.Z());
                faceIds.push(faceIndex);
            }
        }

        // -- Normals --
        // (Keep existing normal logic, it usually works or fails gracefully)
        
        let pc;
        try {
            pc = new OC.Poly_Connect(myT);
        } catch(e) {
            pc = createInstance(OC, "Poly_Connect", myT);
        }

        let myNormal;
        try {
            // TColgp_Array1OfDir constructor takes (lower, upper)
            let lower = nodesLower;
            let upper = nodesLower + nodesLength - 1;
            myNormal = new OC.TColgp_Array1OfDir(lower, upper);
        } catch(e) {
            // Fallback
             let lower = nodesLower;
            let upper = nodesLower + nodesLength - 1;
            myNormal = createInstance(OC, "TColgp_Array1OfDir", lower, upper);
        }

        let SST;
        try {
            // StdPrs_ToolTriangulatedShape constructor is empty
            SST = new OC.StdPrs_ToolTriangulatedShape();
        } catch(e) {
            SST = createInstance(OC, "StdPrs_ToolTriangulatedShape");
        }

        // StdPrs_ToolTriangulatedShape::Normal(const TopoDS_Face& aFace, const Poly_Connect& PC, TColgp_Array1OfDir& Normals)
        // Check if Normal is static or instance
        if (SST.Normal) {
             SST.Normal(myFace, pc, myNormal);
        } else if (OC.StdPrs_ToolTriangulatedShape.Normal) {
             OC.StdPrs_ToolTriangulatedShape.Normal(myFace, pc, myNormal);
        } else if (OC.StdPrs_ToolTriangulatedShape_1 && OC.StdPrs_ToolTriangulatedShape_1.Normal) {
             OC.StdPrs_ToolTriangulatedShape_1.Normal(myFace, pc, myNormal);
        } else {
             console.warn("StdPrs_ToolTriangulatedShape.Normal not found, normals will be zero");
        }
        
        for(let i = 1; i <= myNormal.Length(); i++) {
            let d = myNormal.Value(i).Transformed(aLocation.Transformation());
            faceNormals.push(d.X(), d.Y(), d.Z());
        }

        // -- Triangles (Indices) --
        
        // Resolve TopAbs_FORWARD enum value
        let forwardEnum = OC.TopAbs_FORWARD;
        if (forwardEnum === undefined && OC.TopAbs_Orientation) {
            forwardEnum = OC.TopAbs_Orientation.TopAbs_FORWARD;
        }
        // Fallback to 0 (Standard OCCT value) if not found
        if (forwardEnum === undefined) forwardEnum = 0;

        let orient = forwardEnum;
        if (myFace.Orientation) orient = myFace.Orientation();
        else if (myFace.Orientation_1) orient = myFace.Orientation_1();
        
        for(let i = 0; i < trianglesLength; i++) {
            let idx = trianglesLower + i;
            let t;
            
            if (triangleAccessorType === "direct") {
                 // triangulation.Triangle(i)
                 if (triangulation.Triangle) t = triangulation.Triangle(idx);
                 else if (triangulation.Triangle_1) t = triangulation.Triangle_1(idx);
            } else {
                 t = TrianglesArray ? TrianglesArray.Value(idx) : null;
            }

            if (!t) continue;

            let n1 = 1, n2 = 2, n3 = 3;
            // Poly_Triangle usually has Value(i) or Get(i,j,k)
            try {
                if (t.Value) {
                    n1 = t.Value(1); n2 = t.Value(2); n3 = t.Value(3);
                } else if (t.Get) {
                     // Assume Get returns an object or array in JS binding if pointers involved
                     // Or maybe it's t.Get(n1, n2, n3) which won't work.
                     // Fallback to properties
                     n1 = t.n1 || t.N1 || 1;
                     n2 = t.n2 || t.N2 || 2;
                     n3 = t.n3 || t.N3 || 3;
                } else {
                     n1 = t.n1 || t.N1 || 1;
                     n2 = t.n2 || t.N2 || 2;
                     n3 = t.n3 || t.N3 || 3;
                }
            } catch(e) { continue; }

            if(orient !== forwardEnum) {
                let tmp = n1; n1 = n2; n2 = tmp;
            }

            faceIndices.push(
                (n1 - 1) + globalVertexOffset,
                (n2 - 1) + globalVertexOffset,
                (n3 - 1) + globalVertexOffset
            );
        }

        globalVertexOffset += nodesLength;
    });

    // console.log(`Worker: Processed ${processedFaces} faces. Extracted ${faceVertices.length / 3} vertices.`);

    // 5. Extract Edge Line Data
    let edgeVertices: number[] = [];
    let edgeIds: number[] = []; // Maps vertex -> Edge Index (for shader/picking)
    let globalEdgeIndices: number[] = []; // For the LineSegments geometry structure

    // This metadata helps look up which range of vertices belongs to which edge
    let edgeMetadata: {[key: number]: {start: number, count: number}} = {}; 

    ForEachEdge(OC, shape, (edgeIndex, myEdge) => {
        let aLocation;
        try {
            aLocation = new OC.TopLoc_Location();
        } catch(e) {
            aLocation = createInstance(OC, "TopLoc_Location");
        }

        let adaptorCurve;
        try {
            // BRepAdaptor_Curve constructor might not work with new
            // Sometimes it's a struct that needs arguments
            if (OC.BRepAdaptor_Curve) {
                 try {
                    adaptorCurve = new OC.BRepAdaptor_Curve(myEdge);
                 } catch(e) {
                    adaptorCurve = new OC.BRepAdaptor_Curve();
                    adaptorCurve.Initialize(myEdge);
                 }
            } else {
                 // Try numbered
                 for (let i = 1; i <= 5; i++) {
                    if (OC[`BRepAdaptor_Curve_${i}`]) {
                        try {
                            adaptorCurve = new OC[`BRepAdaptor_Curve_${i}`](myEdge);
                        } catch(e) {
                            adaptorCurve = new OC[`BRepAdaptor_Curve_${i}`]();
                            adaptorCurve.Initialize(myEdge);
                        }
                        break;
                    }
                 }
            }
            if (!adaptorCurve) {
                 // Fallback to createInstance helper which does the loop
                 // But createInstance might try constructor(args) and fail
                 // So let's try createInstance for empty, then Initialize
                 try {
                    adaptorCurve = createInstance(OC, "BRepAdaptor_Curve");
                    adaptorCurve.Initialize(myEdge);
                 } catch(e) {
                    // Try one last time with constructor args via createInstance
                    adaptorCurve = createInstance(OC, "BRepAdaptor_Curve", myEdge);
                 }
            }
        } catch(e) {
            // console.error("BRepAdaptor_Curve instantiation failed:", e); // Suppress log spam
            // SKIP EDGE PROCESSING instead of failing completely?
            // If we can't adapt the curve, we can't tessellate the edge line.
            // We can continue to the next edge.
            return; 
        }

        let tangDef;
        try {
            tangDef = new OC.GCPnts_TangentialDeflection(adaptorCurve, linearDeflection, 0.1);
        } catch(e) {
            // Try fallback
            try {
                tangDef = createInstance(OC, "GCPnts_TangentialDeflection", adaptorCurve, linearDeflection, 0.1);
            } catch (e2) {
                 // GCPnts_TangentialDeflection might also need Initialize pattern
                 // GCPnts_TangentialDeflection(const Adaptor3d_Curve& C, const Standard_Real AngularDeflection, const Standard_Real CurvatureDeflection, const Standard_Integer MinimumOfPoints = 2, const Standard_Real Utol = 1.0e-9, const Standard_Real MinLen = 1.0e-7)
                 console.error("GCPnts_TangentialDeflection failed", e2);
                 throw e2;
            }
        }
        
        const startVertexIndex = edgeVertices.length / 3;
        let vertexCount = 0;

        // Extract points along the curve
        // We create line segments: (P1, P2), (P2, P3), etc.
        const nbPoints = tangDef.NbPoints();
        if (nbPoints > 1) {
            for(let j = 1; j < nbPoints; j++) {
                let p1 = tangDef.Value(j).Transformed(aLocation.Transformation());
                let p2 = tangDef.Value(j+1).Transformed(aLocation.Transformation());

                edgeVertices.push(p1.X(), p1.Y(), p1.Z());
                edgeVertices.push(p2.X(), p2.Y(), p2.Z());
                
                // Both vertices of this segment belong to edgeIndex
                edgeIds.push(edgeIndex);
                edgeIds.push(edgeIndex);

                // For the "globalEdgeIndices" approach in the reference (optional but good for highlighting)
                // We just push the edge index twice
                globalEdgeIndices.push(edgeIndex);
                globalEdgeIndices.push(edgeIndex);
                
                vertexCount += 2;
            }
        }
        
        edgeMetadata[edgeIndex] = { start: startVertexIndex, count: vertexCount };
    });

    // Cleanup
    reader.delete();
    OC.FS.unlink(fileName);

    // Prepare Transferables
    const facePosArray = new Float32Array(faceVertices);
    const faceNormArray = new Float32Array(faceNormals);
    const faceIndArray = new Uint32Array(faceIndices);
    const faceIdArray = new Float32Array(faceIds); // Float for shader attribute compatibility

    const edgePosArray = new Float32Array(edgeVertices);
    const edgeIdArray = new Float32Array(edgeIds);

    return {
        faces: {
            positions: facePosArray,
            normals: faceNormArray,
            indices: faceIndArray,
            ids: faceIdArray
        },
        edges: {
            positions: edgePosArray,
            ids: edgeIdArray
        }
    };

  } catch (error) {
    throw error;
  }
};

// Worker Message Handler
ctx.onmessage = async (event: MessageEvent) => {
  const { type, payload, id } = event.data;

  if (type === 'CONVERT_STEP') {
    try {
      const { buffer, linearDeflection } = payload;
      const result = await convertStepToMesh(buffer, linearDeflection);
      
      // Transfer the massive arrays to main thread to avoid copy
      const transferables = [
        result.faces.positions.buffer,
        result.faces.normals.buffer,
        result.faces.indices.buffer,
        result.faces.ids.buffer,
        result.edges.positions.buffer,
        result.edges.ids.buffer
      ];

      ctx.postMessage({ type: 'SUCCESS', payload: result, id }, transferables);
    } catch (error: any) {
      ctx.postMessage({ type: 'ERROR', payload: error.message, id });
    }
  }
};
