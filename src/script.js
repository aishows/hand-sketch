// Get DOM elements
const video = document.getElementById('webcam');
const drawingCanvas = document.getElementById('drawingCanvas');
const landmarkCanvas = document.getElementById('landmarkCanvas');
const drawingCtx = drawingCanvas.getContext('2d');
const landmarkCtx = landmarkCanvas.getContext('2d');
const startButton = document.getElementById('startCamera');
const stopButton = document.getElementById('stopCamera');
const clearButton = document.getElementById('clearCanvas');
const saveButton = document.getElementById('saveDrawing');
const penColor = document.getElementById('penColor');
const penSize = document.getElementById('penSize');
const penSizeValue = document.getElementById('penSizeValue');
const drawingMode = document.getElementById('drawingMode');
const shapeMode = document.getElementById('shapeMode');
const statusElement = document.getElementById('status');

// Set canvas dimensions to match window
function resizeCanvas() {
    drawingCanvas.width = window.innerWidth;
    drawingCanvas.height = window.innerHeight - document.querySelector('header').offsetHeight;
    landmarkCanvas.width = window.innerWidth;
    landmarkCanvas.height = window.innerHeight - document.querySelector('header').offsetHeight;
}

// Initialize canvas size
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Drawing state
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let currentColor = '#000000';
let currentSize = 5;
let currentDrawingMode = 'pen';
let currentShapeMode = 'free';

// Shape drawing state
let shapeStartX = 0;
let shapeStartY = 0;
let isShapeDrawing = false;

// Calibration offset for better alignment
let offsetX = 0;
let offsetY = 0;

// UI Control state
let selectedControl = null;
let isAdjusting = false;
let lastGestureTime = 0;

// Update pen size display
penSize.addEventListener('input', () => {
    currentSize = parseInt(penSize.value);
    penSizeValue.textContent = penSize.value;
});

// Update pen color
penColor.addEventListener('input', () => {
    currentColor = penColor.value;
});

// Update drawing mode
drawingMode.addEventListener('change', () => {
    currentDrawingMode = drawingMode.value;
});

// Update shape mode
shapeMode.addEventListener('change', () => {
    currentShapeMode = shapeMode.value;
});

// Clear canvas
clearButton.addEventListener('click', () => {
    drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
});

// Save drawing
saveButton.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'hand-drawing-' + new Date().getTime() + '.png';
    link.href = drawingCanvas.toDataURL('image/png');
    link.click();
});

// Camera stream variable
let cameraStream = null;

// Start camera
startButton.addEventListener('click', async () => {
    try {
        statusElement.textContent = 'Starting camera...';
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 1280, height: 720 } 
        });
        video.srcObject = stream;
        cameraStream = stream;
        statusElement.textContent = 'Camera active - Point at center of screen to calibrate';
        
        // Initialize hand tracking after camera starts
        initializeHandTracking();
    } catch (err) {
        console.error('Error accessing webcam:', err);
        statusElement.textContent = 'Camera error: ' + err.message;
    }
});

// Stop camera
stopButton.addEventListener('click', () => {
    if (cameraStream) {
        const tracks = cameraStream.getTracks();
        tracks.forEach(track => track.stop());
        video.srcObject = null;
        cameraStream = null;
        statusElement.textContent = 'Camera off';
    }
});

// Initialize hand tracking with MediaPipe
function initializeHandTracking() {
    // Create a MediaPipe Hands instance
    const hands = new Hands({
        // Use local assets for MediaPipe models
        locateFile: (file) => {
            return `./assets/${file}`;
        }
    });
    
    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7,
        selfieMode: true
    });
    
    hands.onResults(onHandResults);
    
    // Create a camera to send image data to MediaPipe
    const camera = new Camera(video, {
        onFrame: async () => {
            await hands.send({image: video});
        },
        width: 1280,
        height: 720
    });
    
    camera.start();
}

// Process hand tracking results
function onHandResults(results) {
    // Clear landmark canvas for new frame
    landmarkCtx.clearRect(0, 0, landmarkCanvas.width, landmarkCanvas.height);
    
    // Draw hand landmarks if detected
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        // Get the first hand
        const landmarks = results.multiHandLandmarks[0];
        
        // Get key landmarks
        const indexFinger = landmarks[8];  // Index finger tip
        const middleFinger = landmarks[12]; // Middle finger tip
        const ringFinger = landmarks[16];   // Ring finger tip
        const thumb = landmarks[4];         // Thumb tip
        const palm = landmarks[0];          // Wrist/palm
        
        // Convert normalized coordinates to canvas coordinates with calibration
        const x = indexFinger.x * drawingCanvas.width + offsetX;
        const y = indexFinger.y * drawingCanvas.height + offsetY;
        
        // Detect hand gesture
        const gesture = detectGesture(landmarks);
        
        // Handle UI controls with hand gestures
        handleUIControls(x, y, gesture);
        
        // Handle drawing based on pointing gesture
        if (gesture === 'point') {
            // Auto-calibration: When user points at center of screen for 2 seconds, adjust offset
            const centerX = drawingCanvas.width / 2;
            const centerY = drawingCanvas.height / 2;
            
            // If finger is near center of screen, start calibration
            if (Math.abs(x - centerX) < 50 && Math.abs(y - centerY) < 50) {
                if (!calibrationStarted) {
                    calibrationStarted = Date.now();
                    statusElement.textContent = 'Calibrating... Hold position';
                } else if (Date.now() - calibrationStarted > 2000) {
                    // After 2 seconds, adjust offset
                    offsetX = centerX - (indexFinger.x * drawingCanvas.width);
                    offsetY = centerY - (indexFinger.y * drawingCanvas.height);
                    calibrationStarted = null;
                    statusElement.textContent = 'Calibration complete - Drawing mode: ON';
                }
            } else {
                calibrationStarted = null;
            }
            
            // Handle drawing based on current mode
            handleDrawing(x, y);
        } else {
            // Stop drawing if not pointing
            isDrawing = false;
            isShapeDrawing = false;
            calibrationStarted = null;
            if (gesture !== 'adjust') {
                statusElement.textContent = `Gesture: ${gesture}`;
            }
        }
        
        // Draw landmarks for visualization (on separate canvas)
        drawLandmarks(landmarks, gesture, x, y);
    } else {
        // No hand detected
        isDrawing = false;
        isShapeDrawing = false;
        calibrationStarted = null;
        selectedControl = null;
        isAdjusting = false;
        statusElement.textContent = 'No hand detected';
    }
}

// Detect hand gesture based on finger positions
function detectGesture(landmarks) {
    const indexFinger = landmarks[8];
    const middleFinger = landmarks[12];
    const ringFinger = landmarks[16];
    const pinkyFinger = landmarks[20];
    const thumb = landmarks[4];
    const palm = landmarks[0];
    
    // Calculate distances between fingertips and palm
    const indexDistance = Math.sqrt(Math.pow(indexFinger.x - palm.x, 2) + Math.pow(indexFinger.y - palm.y, 2));
    const middleDistance = Math.sqrt(Math.pow(middleFinger.x - palm.x, 2) + Math.pow(middleFinger.y - palm.y, 2));
    const ringDistance = Math.sqrt(Math.pow(ringFinger.x - palm.x, 2) + Math.pow(ringFinger.y - palm.y, 2));
    const pinkyDistance = Math.sqrt(Math.pow(pinkyFinger.x - palm.x, 2) + Math.pow(pinkyFinger.y - palm.y, 2));
    
    // Check if fingers are extended
    const indexExtended = indexDistance > 0.3;
    const middleExtended = middleDistance > 0.3;
    const ringExtended = ringDistance > 0.3;
    const pinkyExtended = pinkyDistance > 0.3;
    const thumbExtended = Math.sqrt(Math.pow(thumb.x - palm.x, 2) + Math.pow(thumb.y - palm.y, 2)) > 0.3;
    
    // Detect specific gestures
    // Pointing (only index finger extended)
    if (indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
        return 'point';
    }
    
    // Palm open (all fingers extended)
    if (indexExtended && middleExtended && ringExtended && pinkyExtended) {
        return 'palm';
    }
    
    // Two fingers (index and middle extended)
    if (indexExtended && middleExtended && !ringExtended && !pinkyExtended) {
        return 'two_fingers';
    }
    
    // Pinch (index and thumb close together)
    const pinchDistance = Math.sqrt(Math.pow(indexFinger.x - thumb.x, 2) + Math.pow(indexFinger.y - thumb.y, 2));
    if (pinchDistance < 0.1 && indexExtended && thumbExtended) {
        return 'pinch';
    }
    
    // Fist (no fingers extended)
    if (!indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
        return 'fist';
    }
    
    return 'unknown';
}

// Handle UI controls with hand gestures
function handleUIControls(x, y, gesture) {
    // Cooldown to prevent rapid repeated actions
    const now = Date.now();
    if (now - lastGestureTime < 500) return;
    
    // Only handle UI when hand is in the top area (control panel zone)
    const controlPanelHeight = document.querySelector('header').offsetHeight;
    if (y > controlPanelHeight) return;
    
    if (gesture === 'palm') {
        // Select control based on x position
        const controlWidth = window.innerWidth / 6; // Divide screen into 6 sections
        const section = Math.floor(x / controlWidth);
        
        const controls = [
            startButton, stopButton, clearButton, 
            penColor, drawingMode, shapeMode
        ];
        
        if (section < controls.length) {
            selectedControl = controls[section];
            highlightControl(selectedControl);
            statusElement.textContent = `Selected: ${selectedControl.tagName === 'SELECT' ? selectedControl.id : selectedControl.textContent}`;
            lastGestureTime = now;
        }
    } else if (gesture === 'two_fingers' && selectedControl) {
        // Adjust selected control
        adjustControl(selectedControl, x);
        isAdjusting = true;
        statusElement.textContent = `Adjusting: ${selectedControl.id || selectedControl.textContent}`;
        lastGestureTime = now;
    } else if (gesture === 'pinch' && selectedControl) {
        // Activate selected control
        activateControl(selectedControl);
        statusElement.textContent = `Activated: ${selectedControl.id || selectedControl.textContent}`;
        lastGestureTime = now;
    }
}

// Highlight selected control
function highlightControl(control) {
    // Remove highlight from all controls
    document.querySelectorAll('.controls button, .controls select, .controls input').forEach(el => {
        el.style.boxShadow = 'none';
    });
    
    // Highlight selected control
    if (control) {
        control.style.boxShadow = '0 0 10px 3px yellow';
    }
}

// Adjust control based on x position
function adjustControl(control, x) {
    if (control === penSize) {
        // Adjust pen size based on x position
        const min = parseInt(control.min);
        const max = parseInt(control.max);
        const value = Math.round((x / window.innerWidth) * (max - min) + min);
        control.value = Math.max(min, Math.min(max, value));
        penSizeValue.textContent = control.value;
        currentSize = parseInt(control.value);
    } else if (control === penColor) {
        // Cycle through some predefined colors based on x position
        const colors = ['#000000', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff'];
        const index = Math.floor((x / window.innerWidth) * colors.length);
        control.value = colors[Math.min(index, colors.length - 1)];
        currentColor = control.value;
    } else if (control.tagName === 'SELECT') {
        // Cycle through select options
        const options = control.querySelectorAll('option');
        const index = Math.floor((x / window.innerWidth) * options.length);
        control.selectedIndex = Math.min(index, options.length - 1);
        control.dispatchEvent(new Event('change'));
    }
}

// Activate control (click equivalent)
function activateControl(control) {
    if (control.tagName === 'BUTTON') {
        control.click();
    }
    // For other controls, we just adjust them
}

// Handle drawing based on current mode
function handleDrawing(x, y) {
    // Rainbow mode color cycling
    if (currentDrawingMode === 'rainbow') {
        const time = Date.now() / 1000;
        const r = Math.floor(Math.sin(time) * 127 + 128);
        const g = Math.floor(Math.sin(time * 1.1) * 127 + 128);
        const b = Math.floor(Math.sin(time * 1.2) * 127 + 128);
        currentColor = `rgb(${r}, ${g}, ${b})`;
    }
    
    switch (currentShapeMode) {
        case 'free':
            freeDraw(x, y);
            break;
        case 'line':
            shapeDraw(x, y, drawLine);
            break;
        case 'circle':
            shapeDraw(x, y, drawCircle);
            break;
        case 'rectangle':
            shapeDraw(x, y, drawRectangle);
            break;
    }
}

// Free drawing (pen mode)
function freeDraw(x, y) {
    if (!isDrawing) {
        isDrawing = true;
        lastX = x;
        lastY = y;
        statusElement.textContent = 'Drawing mode: ON (Free draw)';
    } else {
        // Draw based on current drawing mode
        switch (currentDrawingMode) {
            case 'pen':
                drawPen(lastX, lastY, x, y);
                break;
            case 'spray':
                drawSpray(x, y);
                break;
            case 'eraser':
                drawEraser(x, y);
                break;
            case 'rainbow':
                drawPen(lastX, lastY, x, y);
                break;
        }
        
        // Update last position
        lastX = x;
        lastY = y;
    }
}

// Shape drawing
function shapeDraw(x, y, drawFunction) {
    if (!isShapeDrawing) {
        isShapeDrawing = true;
        shapeStartX = x;
        shapeStartY = y;
        statusElement.textContent = `Drawing mode: ON (${currentShapeMode})`;
    } else {
        // Clear the temporary drawing
        drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
        // Redraw the permanent canvas content (not implemented in this simple version)
        // Then draw the current shape
        drawFunction(shapeStartX, shapeStartY, x, y);
    }
}

// Draw with pen
function drawPen(x1, y1, x2, y2) {
    drawingCtx.beginPath();
    drawingCtx.moveTo(x1, y1);
    drawingCtx.lineTo(x2, y2);
    drawingCtx.strokeStyle = currentColor;
    drawingCtx.lineWidth = currentSize;
    drawingCtx.lineCap = 'round';
    drawingCtx.lineJoin = 'round';
    drawingCtx.stroke();
}

// Draw with spray effect
function drawSpray(x, y) {
    const density = currentSize * 2;
    const radius = currentSize * 2;
    
    for (let i = 0; i < density; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * radius;
        const sprayX = x + Math.cos(angle) * distance;
        const sprayY = y + Math.sin(angle) * distance;
        
        drawingCtx.beginPath();
        drawingCtx.arc(sprayX, sprayY, currentSize / 4, 0, Math.PI * 2);
        drawingCtx.fillStyle = currentColor;
        drawingCtx.fill();
    }
}

// Draw with eraser
function drawEraser(x, y) {
    drawingCtx.beginPath();
    drawingCtx.arc(x, y, currentSize, 0, Math.PI * 2);
    drawingCtx.fillStyle = '#ffffff';
    drawingCtx.fill();
}

// Draw line
function drawLine(x1, y1, x2, y2) {
    drawingCtx.beginPath();
    drawingCtx.moveTo(x1, y1);
    drawingCtx.lineTo(x2, y2);
    drawingCtx.strokeStyle = currentColor;
    drawingCtx.lineWidth = currentSize;
    drawingCtx.lineCap = 'round';
    drawingCtx.stroke();
}

// Draw circle
function drawCircle(x1, y1, x2, y2) {
    const radius = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    drawingCtx.beginPath();
    drawingCtx.arc(x1, y1, radius, 0, Math.PI * 2);
    drawingCtx.strokeStyle = currentColor;
    drawingCtx.lineWidth = currentSize;
    drawingCtx.stroke();
}

// Draw rectangle
function drawRectangle(x1, y1, x2, y2) {
    drawingCtx.beginPath();
    drawingCtx.rect(x1, y1, x2 - x1, y2 - y1);
    drawingCtx.strokeStyle = currentColor;
    drawingCtx.lineWidth = currentSize;
    drawingCtx.stroke();
}

// Calibration state
let calibrationStarted = null;

// Draw hand landmarks for visualization
function drawLandmarks(landmarks, gesture, fingerX, fingerY) {
    // Draw connections between landmarks
    for (const landmark of landmarks) {
        const x = landmark.x * landmarkCanvas.width;
        const y = landmark.y * landmarkCanvas.height;
        
        landmarkCtx.beginPath();
        landmarkCtx.arc(x, y, 3, 0, 2 * Math.PI);
        
        // Color code based on gesture
        switch (gesture) {
            case 'point':
                landmarkCtx.fillStyle = 'rgba(0, 255, 0, 0.7)'; // Green for drawing
                break;
            case 'palm':
                landmarkCtx.fillStyle = 'rgba(0, 0, 255, 0.7)'; // Blue for selection
                break;
            case 'two_fingers':
                landmarkCtx.fillStyle = 'rgba(255, 255, 0, 0.7)'; // Yellow for adjustment
                break;
            case 'pinch':
                landmarkCtx.fillStyle = 'rgba(255, 0, 255, 0.7)'; // Magenta for activation
                break;
            default:
                landmarkCtx.fillStyle = 'rgba(255, 0, 0, 0.7)'; // Red for other
        }
        landmarkCtx.fill();
    }
    
    // Draw a special marker at the actual drawing point
    if (gesture === 'point') {
        landmarkCtx.beginPath();
        landmarkCtx.arc(fingerX, fingerY, 8, 0, 2 * Math.PI);
        landmarkCtx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
        landmarkCtx.lineWidth = 2;
        landmarkCtx.stroke();
    }
}

// Initial setup
penSizeValue.textContent = penSize.value;
statusElement.textContent = 'Click "Start Camera" to begin';