import OcctWorker from '../workers/occtWorker.ts?worker';
import { eventBus, EVENTS } from '../utils/eventBus';

// Worker instance singleton
let worker: Worker | null = null;

// State to hold the current file for reprocessing
let currentFileBuffer: ArrayBuffer | null = null;

// Map to store pending promise resolvers
const pendingRequests = new Map<string, { resolve: (val: any) => void, reject: (err: any) => void }>();

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
 * Sends a STEP file buffer to the worker for conversion to GLB.
 * This runs off the main thread to prevent UI freezing.
 * 
 * @param fileBuffer - The ArrayBuffer of the STEP file.
 * @param linearDeflection - Mesh resolution (default 1.0).
 * @returns Promise resolving to a Blob URL of the GLB model.
 */
export const convertStepToGlb = async (fileBuffer: ArrayBuffer, linearDeflection: number = 1.0): Promise<string> => {
  const worker = getWorker();
  const id = Math.random().toString(36).substr(2, 9);
  
  // Cache the file buffer for potential reprocessing (e.g. changing mesh resolution)
  // We MUST slice it because the original might be transferred or detached.
  // Actually, we should store a copy BEFORE we transfer it to the worker.
  if (fileBuffer !== currentFileBuffer) {
      currentFileBuffer = fileBuffer.slice(0);
  }

  // We also need to send a copy to the worker because it will be transferred
  const bufferToSend = fileBuffer.slice(0);

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, {
      resolve: (glbBuffer: ArrayBuffer) => {
        const blob = new Blob([glbBuffer], { type: 'model/gltf-binary' });
        const url = URL.createObjectURL(blob);
        resolve(url);
      },
      reject
    });

    // Post message to worker, transferring buffer ownership for performance
    // Payload includes buffer and options
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
 * Emits EVENTS.MODEL_LOADED when complete.
 * 
 * @param linearDeflection - The new mesh resolution.
 */
export const reprocessCurrentModel = async (linearDeflection: number) => {
    if (!currentFileBuffer) {
        console.warn("No file loaded to reprocess.");
        return;
    }

    try {
        console.log(`Reprocessing model with mesh resolution: ${linearDeflection}`);
        // We use the cached buffer. We must slice it again to keep our cache intact
        // while sending a transferable copy to the worker.
        const url = await convertStepToGlb(currentFileBuffer, linearDeflection);
        
        // Broadcast the new model URL so the SceneWindow updates
        eventBus.emit(EVENTS.MODEL_LOADED, url);
        console.log("Model reprocessed and updated.");
    } catch (error) {
        console.error("Failed to reprocess model:", error);
    }
};
