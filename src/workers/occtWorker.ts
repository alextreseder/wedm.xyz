/* eslint-disable no-restricted-globals */
import initOpenCascade from 'opencascade.js/dist/opencascade.full.js';

// Define worker self type
const ctx: Worker = self as any;

let oc: any = null;

/**
 * Initializes the OpenCascade library.
 * Loads the WASM file from the public directory.
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
 * Handles Emscripten binding variations (e.g. suffixes like _1, _2).
 */
const createInstance = (OC: any, className: string, ...args: any[]) => {
  try {
    if (OC[className]) return new OC[className](...args);
  } catch (e) {
    // ignore
  }
  
  // Try numbered variants common in Emscripten bindings
  for (let i = 1; i <= 5; i++) {
     const name = `${className}_${i}`;
     if (OC[name]) {
       try {
         return new OC[name](...args);
       } catch(e) {
         // continue
       }
     }
  }
  throw new Error(`Could not instantiate ${className} or any of its numbered variants.`);
};

/**
 * Converts a STEP file buffer to GLB format.
 * 
 * @param fileBuffer - The ArrayBuffer of the STEP file.
 * @param linearDeflection - The mesh resolution (smaller is finer).
 * @returns ArrayBuffer containing the GLB data.
 */
const convertStepToGlb = async (fileBuffer: ArrayBuffer, linearDeflection: number = 1.0): Promise<ArrayBuffer> => {
  const OC = await initOCCT();
  
  const fileName = "import.step";
  const glbFileName = "output.glb";
  
  try {
    // Write input file to virtual filesystem
    OC.FS.createDataFile("/", fileName, new Uint8Array(fileBuffer), true, true, true);

    // Resolve static tool classes
    const XCAFDoc_DocumentTool = OC.XCAFDoc_DocumentTool || OC.XCAFDoc_DocumentTool_1;
    if (!XCAFDoc_DocumentTool) {
      throw new Error(`Missing OpenCascade classes: XCAFDoc_DocumentTool`);
    }

    // 1. Read STEP file
    const reader = createInstance(OC, "STEPControl_Reader");
    const readResult = reader.ReadFile(fileName);
    
    if (readResult !== OC.IFSelect_ReturnStatus.IFSelect_RetDone) {
      throw new Error(`Failed to read STEP file. Return status: ${readResult}`);
    }

    // 2. Transfer to Document
    const doc = createInstance(OC, "TDocStd_Document", createInstance(OC, "TCollection_ExtendedString", "MDTV-XCAF"));
    
    reader.TransferRoots(createInstance(OC, "Message_ProgressRange"));
    const shape = reader.OneShape();

    // 3. Add Shape to XCAF Document
    const shapeTool = XCAFDoc_DocumentTool.ShapeTool(doc.Main()).get();
    shapeTool.SetShape(shapeTool.NewShape(), shape);

    // 4. Mesh the Shape (Essential for visualization)
    // parameters: shape, linear deflection, relative, angular deflection, parallel
    // We use the provided linearDeflection
    createInstance(OC, "BRepMesh_IncrementalMesh", shape, linearDeflection, false, 0.5, false);

    // 5. Export to GLB
    const cafWriter = createInstance(OC, "RWGltf_CafWriter", createInstance(OC, "TCollection_AsciiString", glbFileName), true);
    
    cafWriter.Perform_2(
      createInstance(OC, "Handle_TDocStd_Document", doc), 
      createInstance(OC, "TColStd_IndexedDataMapOfStringString"), 
      createInstance(OC, "Message_ProgressRange")
    );

    // 6. Read resulting GLB file
    const glbFile = OC.FS.readFile(glbFileName, { encoding: "binary" });
    
    // Cleanup resources
    reader.delete();
    doc.delete();
    cafWriter.delete();
    OC.FS.unlink(fileName);
    OC.FS.unlink(glbFileName);

    // Return buffer (transferable)
    return glbFile.buffer;

  } catch (error) {
    // Attempt cleanup on error
    try {
        if (OC.FS.stat(fileName)) OC.FS.unlink(fileName);
        if (OC.FS.stat(glbFileName)) OC.FS.unlink(glbFileName);
    } catch(e) { /* ignore */ }
    throw error;
  }
};

// Worker Message Handler
ctx.onmessage = async (event: MessageEvent) => {
  const { type, payload, id } = event.data;

  if (type === 'CONVERT_STEP') {
    try {
      // payload now contains { buffer, linearDeflection }
      const { buffer, linearDeflection } = payload;
      const glbBuffer = await convertStepToGlb(buffer, linearDeflection);
      ctx.postMessage({ type: 'SUCCESS', payload: glbBuffer, id }, [glbBuffer]);
    } catch (error: any) {
      ctx.postMessage({ type: 'ERROR', payload: error.message, id });
    }
  }
};
