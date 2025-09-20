// Import styles
import './styles.css';

// Import MediaPipe libraries
import { Camera } from '@mediapipe/camera_utils';
import { Hands } from '@mediapipe/hands';

// Make MediaPipe classes available globally for backward compatibility
window.Camera = Camera;
window.Hands = Hands;

// Import the main script
import './script.js';