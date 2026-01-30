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
      callback(edgeIndex++, edgeCasted); // Pass the casted edge, not the raw shape
    }
  }
  anExplorer.delete();
}

function ForEachVertex(OC: any, shape: any, callback: (index: number, vertex: any) => void) {
  let vertexHashes: {[key: number]: number} = {};
  let vertexIndex = 0;
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

      let vertexEnum = OC.TopAbs_VERTEX;
      if (vertexEnum === undefined && OC.TopAbs_ShapeEnum) {
          vertexEnum = OC.TopAbs_ShapeEnum.TopAbs_VERTEX;
      }

      let shapeEnum = OC.TopAbs_SHAPE;
      if (shapeEnum === undefined && OC.TopAbs_ShapeEnum) {
          shapeEnum = OC.TopAbs_ShapeEnum.TopAbs_SHAPE;
      }

      anExplorer.Init(shape, vertexEnum, shapeEnum);

  } catch(e) {
      console.error("ForEachVertex init failed:", e);
      throw e;
  }

  for (; anExplorer.More(); anExplorer.Next()) {
    let vertex = anExplorer.Current();
    let vertexCasted;
    
    if (OC.TopoDS.Vertex) {
        vertexCasted = OC.TopoDS.Vertex(vertex);
    } else if (OC.TopoDS.Vertex_1) {
        vertexCasted = OC.TopoDS.Vertex_1(vertex);
    } else if (OC.TopoDS.prototype && OC.TopoDS.prototype.Vertex) {
        vertexCasted = OC.TopoDS.prototype.Vertex(vertex);
    } else {
        vertexCasted = vertex;
    }

    let vertexHash = vertexCasted.HashCode(100000000);
    if(!vertexHashes.hasOwnProperty(vertexHash)){
      vertexHashes[vertexHash] = vertexIndex;
      callback(vertexIndex++, vertexCasted);
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
    
    // Store triangulation data for edge extraction (Method 2: PolygonOnTriangulation)
    interface FaceTriData {
        face: any;
        triangulationHandle: any;  // The Handle<Poly_Triangulation>
        triangulation: any;        // The dereferenced Poly_Triangulation
        location: any;
        nodeAccessorType: string;
        nodesLower: number;
        NodesArray: any;
    }
    const faceTriangulations: FaceTriData[] = [];

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

        // Store triangulation data for edge extraction
        faceTriangulations.push({
            face: myFace,
            triangulationHandle: myT,
            triangulation: triangulation,
            location: aLocation,
            nodeAccessorType,
            nodesLower,
            NodesArray
        });

        globalVertexOffset += nodesLength;
    });

    // =========================================================================
    // 5. EDGE EXTRACTION using PolygonOnTriangulation
    // =========================================================================
    // 
    // Strategy: Extract edge line vertices from the face triangulations using
    // BRep_Tool::PolygonOnTriangulation. This returns indices into the face's
    // triangulation node array, giving us the EXACT same vertices used by the
    // mesh faces - ensuring perfect visual alignment with no gaps.
    //
    // Fallback: If an edge doesn't have PolygonOnTriangulation data (rare),
    // we sample points along the BRep curve directly.
    // =========================================================================

    let edgeVertices: number[] = [];
    let edgeIds: number[] = [];  // Maps each vertex to its BRep edge index
    let edgeProcessingErrors: string[] = [];
    let edgesUsingPolyOnTri = 0;
    let edgesUsingFallback = 0;

    /**
     * Gets a node position from a face's triangulation by index.
     * Handles both modern OCCT API (Node(i)) and legacy API (Nodes().Value(i)).
     */
    const getNodeFromTriangulation = (triData: FaceTriData, nodeIndex: number): any => {
        if (triData.nodeAccessorType === "direct") {
            return triData.triangulation.Node?.(nodeIndex) 
                || triData.triangulation.Node_1?.(nodeIndex);
        }
        return triData.NodesArray?.Value(nodeIndex);
    };

    /**
     * Attempts to get PolygonOnTriangulation using numbered OCCT binding variants.
     * The JS bindings expose these as _1, _2, _3 instead of overloaded functions.
     */
    const tryGetPolygonOnTriangulation = (edge: any, triHandle: any, location: any): any => {
        const variants = [
            () => OC.BRep_Tool.PolygonOnTriangulation_1?.(edge, triHandle, location),
            () => OC.BRep_Tool.PolygonOnTriangulation_2?.(edge, triHandle),
            () => OC.BRep_Tool.PolygonOnTriangulation_3?.(edge, triHandle, location)
        ];
        
        for (const tryVariant of variants) {
            try {
                const result = tryVariant();
                if (result && (!result.IsNull || !result.IsNull())) return result;
            } catch { /* Try next variant */ }
        }
        return null;
    };

    /**
     * Fallback edge extraction: samples points along the BRep curve.
     * Used when PolygonOnTriangulation is unavailable (shouldn't happen often).
     * Note: This won't align perfectly with mesh faces.
     */
    const extractEdgeByFallback = (edge: any): number[] => {
        const vertices: number[] = [];
        
        let aLocation;
        try { aLocation = new OC.TopLoc_Location(); }
        catch { aLocation = createInstance(OC, "TopLoc_Location"); }

        // Create curve adaptor (handles different OCCT binding patterns)
        let curve = null;
        if (OC.BRepAdaptor_Curve_2) {
            curve = new OC.BRepAdaptor_Curve_2(edge);
        } else if (OC.BRepAdaptor_Curve_1) {
            curve = new OC.BRepAdaptor_Curve_1();
            curve.Initialize_1?.(edge) || curve.Initialize?.(edge);
        } else if (OC.BRepAdaptor_Curve) {
            try { curve = new OC.BRepAdaptor_Curve(edge); }
            catch {
                curve = new OC.BRepAdaptor_Curve();
                curve.Initialize_1?.(edge) || curve.Initialize?.(edge);
            }
        }

        if (!curve) throw new Error('Could not create BRepAdaptor_Curve');

        // Get parameter range and estimate arc length
        const first = curve.FirstParameter();
        const last = curve.LastParameter();
        const range = Math.abs(last - first);
        
        let length = 0;
        for (let s = 0; s < 10; s++) {
            const pt1 = curve.Value(first + (s / 10) * range);
            const pt2 = curve.Value(first + ((s + 1) / 10) * range);
            length += Math.sqrt(
                (pt2.X() - pt1.X()) ** 2 +
                (pt2.Y() - pt1.Y()) ** 2 +
                (pt2.Z() - pt1.Z()) ** 2
            );
        }

        // Sample based on arc length and deflection tolerance
        const numSegs = Math.max(2, Math.ceil(length / linearDeflection));
        const step = range / numSegs;
        const transform = aLocation.Transformation();

        for (let j = 0; j < numSegs; j++) {
            const p1 = curve.Value(first + j * step).Transformed(transform);
            const p2 = curve.Value(first + (j + 1) * step).Transformed(transform);
            vertices.push(p1.X(), p1.Y(), p1.Z(), p2.X(), p2.Y(), p2.Z());
        }

        return vertices;
    };

    // Process each unique BRep edge
    ForEachEdge(OC, shape, (edgeIndex, myEdge) => {
        let foundPolygon = false;

        // Search face triangulations for this edge's polygon data
        for (const triData of faceTriangulations) {
            try {
                let edgeLocation;
                try { edgeLocation = new OC.TopLoc_Location(); }
                catch { edgeLocation = createInstance(OC, "TopLoc_Location"); }

                // Get polygon indices for this edge on this face
                const polyOnTri = tryGetPolygonOnTriangulation(
                    myEdge, triData.triangulationHandle, edgeLocation
                );
                
                if (!polyOnTri || polyOnTri.IsNull?.()) continue;

                // Unwrap handle and get node indices array
                const polygon = polyOnTri.get?.() || polyOnTri;
                if (!polygon) continue;

                let nodes = polygon.Nodes?.();
                if (nodes?.get) nodes = nodes.get();
                if (!nodes) continue;

                const nbNodes = nodes.Length?.() || (nodes.Upper() - nodes.Lower() + 1);
                const lower = nodes.Lower?.() || 1;
                if (nbNodes < 2) continue;

                // Extract vertex positions from face triangulation using indices
                const transform = triData.location.Transformation();

                for (let j = 0; j < nbNodes - 1; j++) {
                    const idx1 = nodes.Value(lower + j);
                    const idx2 = nodes.Value(lower + j + 1);

                    const p1 = getNodeFromTriangulation(triData, idx1);
                    const p2 = getNodeFromTriangulation(triData, idx2);
                    if (!p1 || !p2) continue;

                    const pt1 = p1.Transformed(transform);
                    const pt2 = p2.Transformed(transform);

                    edgeVertices.push(pt1.X(), pt1.Y(), pt1.Z());
                    edgeVertices.push(pt2.X(), pt2.Y(), pt2.Z());
                    edgeIds.push(edgeIndex, edgeIndex);
                }

                foundPolygon = true;
                edgesUsingPolyOnTri++;
                break; // Found polygon for this edge

            } catch { continue; }
        }

        // Fallback to curve sampling if PolygonOnTriangulation unavailable
        if (!foundPolygon) {
            try {
                const verts = extractEdgeByFallback(myEdge);
                for (const v of verts) edgeVertices.push(v);
                for (let i = 0; i < verts.length / 3; i++) edgeIds.push(edgeIndex);
                edgesUsingFallback++;
            } catch (e: any) {
                edgeProcessingErrors.push(`Edge ${edgeIndex}: ${e.message || e}`);
            }
        }
    });

    // Log summary
    console.log(`Edges: ${edgesUsingPolyOnTri} aligned, ${edgesUsingFallback} fallback, ${edgeProcessingErrors.length} errors`);
    if (edgeProcessingErrors.length > 0) {
        console.warn('Edge extraction errors:', edgeProcessingErrors.slice(0, 3));
    }

    // =========================================================================
    // 6. VERTEX EXTRACTION
    // =========================================================================
    // Extract BRep vertex positions using BRep_Tool::Pnt
    // =========================================================================

    const vertexPositions: number[] = [];
    let vertexCount = 0;

    ForEachVertex(OC, shape, (_vertexIndex, myVertex) => {
        try {
            // Get the 3D point for this vertex using BRep_Tool::Pnt
            let pnt = null;
            
            if (OC.BRep_Tool.Pnt) {
                pnt = OC.BRep_Tool.Pnt(myVertex);
            } else if (OC.BRep_Tool.Pnt_1) {
                pnt = OC.BRep_Tool.Pnt_1(myVertex);
            } else if (OC.BRep_Tool_1?.Pnt) {
                pnt = OC.BRep_Tool_1.Pnt(myVertex);
            }

            if (pnt) {
                vertexPositions.push(pnt.X(), pnt.Y(), pnt.Z());
                vertexCount++;
            }
        } catch (e) {
            // Skip vertices that fail to extract
        }
    });

    console.log(`Vertices: ${vertexCount} extracted`);

    // =========================================================================
    // 7. FACE ADJACENCY GRAPH (AAG) EXTRACTION
    // =========================================================================
    // Build adjacency by finding which faces share edges.
    // Faces with highest adjacency are typically "land" faces (top/bottom).
    // =========================================================================

    console.log('Building face adjacency graph...');

    // Map: edgeHash -> array of face indices that share this edge
    const edgeToFaces: Map<number, number[]> = new Map();

    // For each face, find its edges and record the relationship
    ForEachFace(OC, shape, (faceIndex, myFace) => {
        // Explore edges of this face
        let edgeExplorer;
        try {
            edgeExplorer = new OC.TopExp_Explorer();
        } catch(e) {
            if (OC.TopExp_Explorer_1) edgeExplorer = new OC.TopExp_Explorer_1();
            else if (OC.TopExp_Explorer_2) edgeExplorer = new OC.TopExp_Explorer_2();
        }
        
        if (!edgeExplorer) return;

        let edgeEnum = OC.TopAbs_EDGE;
        if (edgeEnum === undefined && OC.TopAbs_ShapeEnum) {
            edgeEnum = OC.TopAbs_ShapeEnum.TopAbs_EDGE;
        }

        let shapeEnum = OC.TopAbs_SHAPE;
        if (shapeEnum === undefined && OC.TopAbs_ShapeEnum) {
            shapeEnum = OC.TopAbs_ShapeEnum.TopAbs_SHAPE;
        }

        edgeExplorer.Init(myFace, edgeEnum, shapeEnum);

        for (; edgeExplorer.More(); edgeExplorer.Next()) {
            let edge = edgeExplorer.Current();
            let edgeCasted;
            
            if (OC.TopoDS.Edge) {
                edgeCasted = OC.TopoDS.Edge(edge);
            } else if (OC.TopoDS.Edge_1) {
                edgeCasted = OC.TopoDS.Edge_1(edge);
            } else {
                edgeCasted = edge;
            }

            const edgeHash = edgeCasted.HashCode(100000000);
            
            if (!edgeToFaces.has(edgeHash)) {
                edgeToFaces.set(edgeHash, []);
            }
            const faces = edgeToFaces.get(edgeHash)!;
            if (!faces.includes(faceIndex)) {
                faces.push(faceIndex);
            }
        }
        
        edgeExplorer.delete();
    });

    // Build face adjacency count: how many unique faces is each face connected to
    const faceAdjacencyCount: number[] = [];
    let totalFaces = 0;
    
    ForEachFace(OC, shape, (faceIndex) => {
        faceAdjacencyCount[faceIndex] = 0;
        totalFaces = Math.max(totalFaces, faceIndex + 1);
    });

    // For each edge shared by 2 faces, those faces are adjacent
    const faceAdjacencySet: Set<number>[] = Array.from({ length: totalFaces }, () => new Set());
    
    edgeToFaces.forEach((faces) => {
        if (faces.length === 2) {
            // Edge shared by exactly 2 faces - they are adjacent
            faceAdjacencySet[faces[0]].add(faces[1]);
            faceAdjacencySet[faces[1]].add(faces[0]);
        }
    });

    // Convert sets to counts
    for (let i = 0; i < totalFaces; i++) {
        faceAdjacencyCount[i] = faceAdjacencySet[i].size;
    }

    // Find the 2 faces with highest adjacency (land faces)
    const sortedByAdjacency = faceAdjacencyCount
        .map((count, index) => ({ index, count }))
        .sort((a, b) => b.count - a.count);

    const landFaceIndices = sortedByAdjacency.slice(0, 2).map(f => f.index);
    
    console.log(`Adjacency analysis: ${totalFaces} faces, land faces: [${landFaceIndices.join(', ')}] with adjacencies [${sortedByAdjacency.slice(0, 2).map(f => f.count).join(', ')}]`);

    // =========================================================================
    // 8. LAND FACE PROPERTIES (Normal, Area, Centroid)
    // =========================================================================
    // Calculate surface area, normal, and centroid for each land face
    // using the triangulation data (more reliable than OCCT API in JS bindings).
    // =========================================================================

    interface LandFaceData {
        index: number;
        area: number;
        normal: { x: number, y: number, z: number };
        centroid: { x: number, y: number, z: number };
        minZ: number;  // Minimum Z coordinate of the face
    }

    const landFacesData: LandFaceData[] = [];

    // Compute properties from triangulation data for each land face
    for (const landFaceIndex of landFaceIndices) {
        // Collect all vertices and normals for this face from triangulation
        const faceVerts: { x: number, y: number, z: number }[] = [];
        const faceNorms: { x: number, y: number, z: number }[] = [];
        
        for (let i = 0; i < faceIds.length; i++) {
            if (faceIds[i] === landFaceIndex) {
                faceVerts.push({
                    x: faceVertices[i * 3],
                    y: faceVertices[i * 3 + 1],
                    z: faceVertices[i * 3 + 2]
                });
                faceNorms.push({
                    x: faceNormals[i * 3],
                    y: faceNormals[i * 3 + 1],
                    z: faceNormals[i * 3 + 2]
                });
            }
        }

        if (faceVerts.length < 3) {
            console.warn(`Land face ${landFaceIndex}: insufficient vertices (${faceVerts.length})`);
            continue;
        }

        // Compute centroid (average of all vertices)
        let sumX = 0, sumY = 0, sumZ = 0;
        let minZ = Infinity;
        for (const v of faceVerts) {
            sumX += v.x;
            sumY += v.y;
            sumZ += v.z;
            if (v.z < minZ) minZ = v.z;
        }
        const centroid = {
            x: sumX / faceVerts.length,
            y: sumY / faceVerts.length,
            z: sumZ / faceVerts.length
        };

        // Compute average normal
        let sumNx = 0, sumNy = 0, sumNz = 0;
        for (const n of faceNorms) {
            sumNx += n.x;
            sumNy += n.y;
            sumNz += n.z;
        }
        const normLen = Math.sqrt(sumNx*sumNx + sumNy*sumNy + sumNz*sumNz);
        const normal = normLen > 0.001 
            ? { x: sumNx/normLen, y: sumNy/normLen, z: sumNz/normLen }
            : { x: 0, y: 0, z: 1 };

        // Compute area from triangles
        // faceIndices contains triangle indices, we need to find triangles for this face
        let area = 0;
        // The vertices for this face are contiguous in faceVertices based on faceIds
        // We need to use the index buffer to find triangles
        // For simplicity, estimate area from the bounding box or use triangle area sum
        
        // Find triangles that belong to this face by checking if all 3 vertices have this faceId
        for (let t = 0; t < faceIndices.length; t += 3) {
            const i0 = faceIndices[t];
            const i1 = faceIndices[t + 1];
            const i2 = faceIndices[t + 2];
            
            // Check if this triangle belongs to the land face
            if (faceIds[i0] === landFaceIndex && faceIds[i1] === landFaceIndex && faceIds[i2] === landFaceIndex) {
                // Get triangle vertices
                const v0 = { x: faceVertices[i0*3], y: faceVertices[i0*3+1], z: faceVertices[i0*3+2] };
                const v1 = { x: faceVertices[i1*3], y: faceVertices[i1*3+1], z: faceVertices[i1*3+2] };
                const v2 = { x: faceVertices[i2*3], y: faceVertices[i2*3+1], z: faceVertices[i2*3+2] };
                
                // Triangle area = 0.5 * |cross product of two edges|
                const e1 = { x: v1.x - v0.x, y: v1.y - v0.y, z: v1.z - v0.z };
                const e2 = { x: v2.x - v0.x, y: v2.y - v0.y, z: v2.z - v0.z };
                const cross = {
                    x: e1.y * e2.z - e1.z * e2.y,
                    y: e1.z * e2.x - e1.x * e2.z,
                    z: e1.x * e2.y - e1.y * e2.x
                };
                const triArea = 0.5 * Math.sqrt(cross.x*cross.x + cross.y*cross.y + cross.z*cross.z);
                area += triArea;
            }
        }

        landFacesData.push({
            index: landFaceIndex,
            area: area,
            normal: normal,
            centroid: centroid,
            minZ: minZ
        });

        console.log(`Land face ${landFaceIndex}: area=${area.toFixed(2)}, normal=(${normal.x.toFixed(3)}, ${normal.y.toFixed(3)}, ${normal.z.toFixed(3)}), centroid=(${centroid.x.toFixed(2)}, ${centroid.y.toFixed(2)}, ${centroid.z.toFixed(2)})`);
    }

    // Sort land faces by area (largest first), then by index (lower first) as tie-breaker
    landFacesData.sort((a, b) => {
        if (Math.abs(b.area - a.area) > 0.001) {
            return b.area - a.area;  // Larger area first
        }
        return a.index - b.index;  // Lower index first as tie-breaker
    });

    // =========================================================================
    // 9. WALL FACES (Shell)
    // =========================================================================
    // Wall faces are all faces that are NOT land faces.
    // These are the faces that will be cut in the wire EDM process.
    // =========================================================================

    const wallFaces: number[] = [];
    for (let i = 0; i < totalFaces; i++) {
        if (!landFaceIndices.includes(i)) {
            wallFaces.push(i);
        }
    }
    
    console.log(`Wall faces (shell): ${wallFaces.length} faces [${wallFaces.slice(0, 5).join(', ')}${wallFaces.length > 5 ? '...' : ''}]`);

    // Cleanup
    reader.delete();
    OC.FS.unlink(fileName);

    // Prepare Transferables
    const facePosArray = new Float32Array(faceVertices);
    const faceNormArray = new Float32Array(faceNormals);
    const faceIndArray = new Uint32Array(faceIndices);
    const faceIdArray = new Float32Array(faceIds);

    const edgePosArray = new Float32Array(edgeVertices);
    const edgeIdArray = new Float32Array(edgeIds);

    const vertexPosArray = new Float32Array(vertexPositions);

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
        },
        vertices: {
            positions: vertexPosArray
        },
        adjacency: {
            faceCount: totalFaces,
            adjacencyCounts: faceAdjacencyCount,
            landFaces: landFaceIndices,  // Top 2 faces with highest adjacency
            landFacesData: landFacesData, // Detailed data for orientation
            wallFaces: wallFaces          // All faces that are not land faces (the shell)
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
        result.edges.ids.buffer,
        result.vertices.positions.buffer
      ];

      ctx.postMessage({ type: 'SUCCESS', payload: result, id }, transferables);
    } catch (error: any) {
      ctx.postMessage({ type: 'ERROR', payload: error.message, id });
    }
  }
};
