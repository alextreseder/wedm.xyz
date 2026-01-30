import OcctWorker from '../workers/occtWorker.ts?worker';
import { eventBus, EVENTS } from '../utils/eventBus';

// Worker instance singleton
let worker: Worker | null = null;

// State to hold the current file for reprocessing
let currentFileBuffer: ArrayBuffer | null = null;

// Map to store pending promise resolvers
const pendingRequests = new Map<string, { resolve: (val: any) => void, reject: (err: any) => void }>();

export interface MeshResult {
    faces: {
        positions: Float32Array;
        normals: Float32Array;
        indices: Uint32Array;
        ids: Float32Array;
    };
    edges: {
        positions: Float32Array;
        ids: Float32Array;
    };
    vertices: {
        positions: Float32Array;
    };
    adjacency: {
        faceCount: number;
        adjacencyCounts: number[];  // Adjacency count for each face
        landFaces: number[];        // Indices of top 2 most-connected faces
        landFacesData: Array<{
            index: number;
            area: number;
            normal: { x: number, y: number, z: number };
            centroid: { x: number, y: number, z: number };
            minZ: number;
        }>;
        wallFaces: number[];  // All faces that are not land faces (the shell to be cut)
    };
}

/**
 * Initializes the OCCT worker if not already running.
 */
const getWorker = () => {
  if (!worker) {
    worker = new OcctWorker();
    
    worker.onmessage = (event) => {
      const { type, payload, id } = event.data;
      
      const request = pendingRequests.get(id);
      if (request) {
        if (type === 'SUCCESS') {
          request.resolve(payload);
        } else {
          request.reject(new Error(payload));
        }
        pendingRequests.delete(id);
      }
    };

    worker.onerror = (error) => {
      console.error('OCCT Worker Error:', error);
    };
  }
  return worker;
};

/**
 * Sends a STEP file buffer to the worker for manual tessellation.
 * 
 * @param fileBuffer - The ArrayBuffer of the STEP file.
 * @param linearDeflection - Mesh resolution (default 1.0).
 * @returns Promise resolving to the Raw Mesh Data.
 */
export const convertStepToMesh = async (fileBuffer: ArrayBuffer, linearDeflection: number = 1.0): Promise<MeshResult> => {
  const worker = getWorker();
  const id = Math.random().toString(36).substr(2, 9);
  
  if (fileBuffer !== currentFileBuffer) {
      currentFileBuffer = fileBuffer.slice(0);
  }

  const bufferToSend = fileBuffer.slice(0);

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, {
      resolve: (data: MeshResult) => resolve(data),
      reject
    });

    worker.postMessage(
        { 
            type: 'CONVERT_STEP', 
            payload: { buffer: bufferToSend, linearDeflection }, 
            id 
        }, 
        [bufferToSend]
    );
  });
};

/**
 * Reprocesses the currently loaded file with a new mesh resolution.
 * Emits EVENTS.MODEL_LOADED with the new MeshResult.
 */
export const reprocessCurrentModel = async (linearDeflection: number) => {
    if (!currentFileBuffer) {
        console.warn("No file loaded to reprocess.");
        return;
    }

    try {
        console.log(`Reprocessing model with mesh resolution: ${linearDeflection}`);
        const result = await convertStepToMesh(currentFileBuffer, linearDeflection);
        
        // Broadcast the new mesh result object directly
        eventBus.emit(EVENTS.MODEL_LOADED, result);
        console.log("Model reprocessed and updated.");
    } catch (error) {
        console.error("Failed to reprocess model:", error);
    }
};
