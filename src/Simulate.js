// Simulate.js

let gcodeCommands = [];
let currentIndex = 0;
let isPlaying = false;
let simulationFinished = false;
let simulationSpeed = 10; // lines per second
let lastUpdateTime = 0;
let updateCallback;
let topZ = 0, bottomZ = 0;

function parseGCode(gcodeText) {
    const lines = gcodeText.split('\n');
    gcodeCommands = lines.map(line => {
        const parts = line.split(' ');
        if (parts[0] !== 'G1') return null;
        
        const command = {};
        parts.forEach(part => {
            const letter = part.charAt(0).toLowerCase();
            const value = parseFloat(part.substring(1));
            if (['x', 'y', 'z', 'u', 'v', 'w'].includes(letter)) {
                command[letter] = value;
            }
        });
        return command;
    }).filter(cmd => cmd && 'x' in cmd && 'y' in cmd && 'u' in cmd && 'v' in cmd);
}

function simulationLoop(timestamp) {
    if (!isPlaying) return;

    if (!lastUpdateTime) lastUpdateTime = timestamp;

    const deltaTime = timestamp - lastUpdateTime;
    const interval = 1000 / simulationSpeed;

    if (deltaTime >= interval) {
        lastUpdateTime = timestamp;
        
        if (currentIndex < gcodeCommands.length) {
            const cmd = gcodeCommands[currentIndex];
            // Use Z and W coordinates from G-code if available, otherwise fall back to perimeter heights
            const topPos = { 
                x: cmd.x, 
                y: cmd.y, 
                z: cmd.z !== undefined ? cmd.z : topZ 
            };
            const bottomPos = { 
                x: cmd.u, 
                y: cmd.v, 
                z: cmd.w !== undefined ? cmd.w : bottomZ 
            };
            
            if (updateCallback) {
                updateCallback(topPos, bottomPos);
            }
            currentIndex++;
        } else {
            // End of simulation
            isPlaying = false;
            simulationFinished = true;
            if (updateCallback) updateCallback(null, null); // Hide guides
            console.log("Simulation finished.");
        }
    }
    
    requestAnimationFrame(simulationLoop);
}

function play() {
    if (isPlaying || gcodeCommands.length === 0) return;
    if (simulationFinished) {
        reset(); // If finished, reset before playing again
    }
    isPlaying = true;
    lastUpdateTime = 0; // Reset timer
    requestAnimationFrame(simulationLoop);
}

function pause() {
    isPlaying = false;
}

function reset() {
    pause();
    currentIndex = 0;
    simulationFinished = false;
    if (updateCallback) updateCallback(null, null); // Hide guides
}

export function setupSimulator(onUpdate) {
    updateCallback = onUpdate;
}

export function loadGCode(gcodeText, top_z, bottom_z) {
    reset();
    parseGCode(gcodeText);
    topZ = top_z;
    bottomZ = bottom_z;
}

export function togglePlayPause() {
    if (isPlaying) {
        pause();
    } else {
        play();
    }
    return { isPlaying, simulationFinished };
}

export function setSpeed(speed) {
    simulationSpeed = Math.max(1, speed);
} 