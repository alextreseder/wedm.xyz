declare module 'opencascade.js/dist/opencascade.full.js' {
  const initOpenCascade: (options?: any) => Promise<any>;
  export default initOpenCascade;
}

declare module 'three/examples/jsm/controls/OrbitControls' {
  import { Camera, EventDispatcher, MOUSE, TOUCH, Vector3 } from 'three';
  export class OrbitControls extends EventDispatcher {
    constructor(object: Camera, domElement?: HTMLElement);
    object: Camera;
    domElement: HTMLElement | HTMLDocument;
    enabled: boolean;
    target: Vector3;
    enableDamping: boolean;
    dampingFactor: number;
    enableZoom: boolean;
    zoomSpeed: number;
    enableRotate: boolean;
    rotateSpeed: number;
    enablePan: boolean;
    panSpeed: number;
    screenSpacePanning: boolean;
    keyPanSpeed: number;
    autoRotate: boolean;
    autoRotateSpeed: number;
    enableKeys: boolean;
    keys: { LEFT: string; UP: string; RIGHT: string; BOTTOM: string };
    mouseButtons: { LEFT: MOUSE; MIDDLE: MOUSE; RIGHT: MOUSE };
    touches: { ONE: TOUCH; TWO: TOUCH };
    update(): boolean;
    saveState(): void;
    reset(): void;
    dispose(): void;
    getPolarAngle(): number;
    getAzimuthalAngle(): number;
    addEventListener(type: string, listener: (event: any) => void): void;
    hasEventListener(type: string, listener: (event: any) => void): boolean;
    removeEventListener(type: string, listener: (event: any) => void): void;
    dispatchEvent(event: { type: string; [attachment: string]: any }): void;
  }
}

declare module 'three/examples/jsm/loaders/GLTFLoader' {
  import { AnimationClip, Camera, Group, Loader, LoadingManager, Scene } from 'three';
  export interface GLTF {
    animations: AnimationClip[];
    scene: Group;
    scenes: Group[];
    cameras: Camera[];
    asset: {
      copyright?: string;
      generator?: string;
      version?: string;
      minVersion?: string;
      extensions?: any;
      extras?: any;
    };
    parser: any;
    userData: any;
  }
  export class GLTFLoader extends Loader {
    constructor(manager?: LoadingManager);
    dracoLoader: any | null;
    ktx2Loader: any | null;
    meshoptDecoder: any | null;
    pluginCallbacks: any[];
    register(callback: (parser: any) => any): this;
    unregister(callback: (parser: any) => any): this;
    setDRACOLoader(dracoLoader: any): this;
    setDDSLoader(ddsLoader: any): this;
    setKTX2Loader(ktx2Loader: any): this;
    setMeshoptDecoder(meshoptDecoder: any): this;
    load(
      url: string,
      onLoad: (gltf: GLTF) => void,
      onProgress?: (event: ProgressEvent) => void,
      onError?: (event: ErrorEvent) => void
    ): void;
    loadAsync(url: string, onProgress?: (event: ProgressEvent) => void): Promise<GLTF>;
    parse(
      data: ArrayBuffer | string,
      path: string,
      onLoad: (gltf: GLTF) => void,
      onError?: (event: ErrorEvent) => void
    ): void;
    parseAsync(data: ArrayBuffer | string, path: string): Promise<GLTF>;
  }
}
