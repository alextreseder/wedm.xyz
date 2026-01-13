import OcctWorker from '../workers/occtWorker.ts?worker';

// Worker instance singleton
let worker: Worker | null = null;

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
 * @returns Promise resolving to a Blob URL of the GLB model.
 */
export const convertStepToGlb = async (fileBuffer: ArrayBuffer): Promise<string> => {
  const worker = getWorker();
  const id = Math.random().toString(36).substr(2, 9);

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
    worker.postMessage({ type: 'CONVERT_STEP', payload: fileBuffer, id }, [fileBuffer]);
  });
};
