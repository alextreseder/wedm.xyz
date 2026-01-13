import * as THREE from 'three';

interface GizmoOptions {
  size: number;
  padding: number;
  bubbleSizePrimary: number;
  bubbleSizeSecondary: number;
  showSecondary: boolean;
  lineWidth: number;
  fontSize: string;
  fontFamily: string;
  fontWeight: string;
  fontColor: string;
  fontYAdjust: number;
  colors: {
    x: [string, string];
    y: [string, string];
    z: [string, string];
  };
}

interface Bubble {
  axis: string;
  direction: THREE.Vector3;
  size: number;
  color: [string, string];
  line?: number;
  label?: string;
  position?: THREE.Vector3;
}

export class OrientationGizmo {
  private camera: THREE.Camera;
  private options: GizmoOptions;
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private bubbles: Bubble[];
  private center: THREE.Vector3;
  private selectedAxis: Bubble | null = null;
  private mouse: THREE.Vector3 | null = null;
  public onAxisSelected: ((axis: { axis: string; direction: THREE.Vector3 }) => void) | null = null;

  constructor(camera: THREE.Camera, options: Partial<GizmoOptions> = {}) {
    this.camera = camera;
    this.options = {
      size: 90,
      padding: 8,
      bubbleSizePrimary: 8,
      bubbleSizeSecondary: 6,
      showSecondary: true,
      lineWidth: 2,
      fontSize: "11px",
      fontFamily: "arial",
      fontWeight: "bold",
      fontColor: "#151515",
      fontYAdjust: 0,
      colors: {
        x: ["#f73c3c", "#942424"],
        y: ["#6ccb26", "#417a17"],
        z: ["#178cf0", "#0e5490"],
      },
      ...options
    };

    this.bubbles = [
      { axis: "x", direction: new THREE.Vector3(1, 0, 0), size: this.options.bubbleSizePrimary, color: this.options.colors.x, line: this.options.lineWidth, label: "X" },
      { axis: "y", direction: new THREE.Vector3(0, 1, 0), size: this.options.bubbleSizePrimary, color: this.options.colors.y, line: this.options.lineWidth, label: "Y" },
      { axis: "z", direction: new THREE.Vector3(0, 0, 1), size: this.options.bubbleSizePrimary, color: this.options.colors.z, line: this.options.lineWidth, label: "Z" },
      { axis: "-x", direction: new THREE.Vector3(-1, 0, 0), size: this.options.bubbleSizeSecondary, color: this.options.colors.x },
      { axis: "-y", direction: new THREE.Vector3(0, -1, 0), size: this.options.bubbleSizeSecondary, color: this.options.colors.y },
      { axis: "-z", direction: new THREE.Vector3(0, 0, -1), size: this.options.bubbleSizeSecondary, color: this.options.colors.z },
    ];

    this.center = new THREE.Vector3(this.options.size / 2, this.options.size / 2, 0);

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.options.size;
    this.canvas.height = this.options.size;
    this.context = this.canvas.getContext("2d")!;

    // Bind event listeners
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this), false);
    this.canvas.addEventListener('mouseout', this.onMouseOut.bind(this), false);
    this.canvas.addEventListener('click', this.onMouseClick.bind(this), false);
  }

  public getElement(): HTMLCanvasElement {
    return this.canvas;
  }

  public dispose() {
    this.canvas.removeEventListener('mousemove', this.onMouseMove.bind(this), false);
    this.canvas.removeEventListener('mouseout', this.onMouseOut.bind(this), false);
    this.canvas.removeEventListener('click', this.onMouseClick.bind(this), false);
  }

  private onMouseMove(evt: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse = new THREE.Vector3(evt.clientX - rect.left, evt.clientY - rect.top, 0);
  }

  private onMouseOut() {
    this.mouse = null;
  }

  private onMouseClick() {
    if (this.selectedAxis && this.onAxisSelected) {
      this.onAxisSelected({ axis: this.selectedAxis.axis, direction: this.selectedAxis.direction.clone() });
    }
  }

  private clear() {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private drawCircle(p: THREE.Vector3, radius: number, color: string) {
    this.context.beginPath();
    this.context.arc(p.x, p.y, radius, 0, 2 * Math.PI, false);
    this.context.fillStyle = color;
    this.context.fill();
    this.context.closePath();
  }

  private drawLine(p1: THREE.Vector3, p2: THREE.Vector3, width: number, color: string) {
    this.context.beginPath();
    this.context.moveTo(p1.x, p1.y);
    this.context.lineTo(p2.x, p2.y);
    this.context.lineWidth = width;
    this.context.strokeStyle = color;
    this.context.stroke();
    this.context.closePath();
  }

  private getBubblePosition(position: THREE.Vector3): THREE.Vector3 {
    return new THREE.Vector3(
      (position.x * (this.center.x - (this.options.bubbleSizePrimary / 2) - this.options.padding)) + this.center.x,
      this.center.y - (position.y * (this.center.y - (this.options.bubbleSizePrimary / 2) - this.options.padding)),
      position.z
    );
  }

  public update() {
    this.clear();

    const rotMat = new THREE.Matrix4().makeRotationFromEuler(this.camera.rotation);
    const invRotMat = rotMat.clone().invert();

    for (const bubble of this.bubbles) {
      bubble.position = this.getBubblePosition(bubble.direction.clone().applyMatrix4(invRotMat));
    }

    const layers: Bubble[] = [];
    for (const bubble of this.bubbles) {
      if (this.options.showSecondary || !bubble.axis.startsWith("-")) {
        layers.push(bubble);
      }
    }

    layers.sort((a, b) => (a.position!.z > b.position!.z ? 1 : -1));

    this.selectedAxis = null;
    if (this.mouse) {
      let closestDist = Infinity;
      for (const bubble of layers) {
        if (!bubble.position) continue;
        const distance = this.mouse.distanceTo(bubble.position);
        if (distance < closestDist && distance < 20) { // Check radius
          closestDist = distance;
          this.selectedAxis = bubble;
        }
      }
    }

    this.drawLayers(layers);
  }

  private drawLayers(layers: Bubble[]) {
    for (const bubble of layers) {
      if (!bubble.position) continue;
      
      let color = "";
      if (this.selectedAxis === bubble) {
        color = "#FFFFFF";
      } else if (bubble.position.z >= -0.01) {
        color = bubble.color[0];
      } else {
        color = bubble.color[1];
      }

      // Draw connecting line first so bubble is on top
      if (bubble.line) {
        this.drawLine(this.center, bubble.position, bubble.line, color);
      }
      
      this.drawCircle(bubble.position, bubble.size, color);

      if (bubble.label) {
        this.context.font = `${this.options.fontWeight} ${this.options.fontSize} ${this.options.fontFamily}`;
        this.context.fillStyle = this.options.fontColor;
        this.context.textBaseline = 'middle';
        this.context.textAlign = 'center';
        this.context.fillText(bubble.label, bubble.position.x, bubble.position.y + this.options.fontYAdjust);
      }
    }
  }
}
