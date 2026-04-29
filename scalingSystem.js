// Scaling System for TEVE
// Uses CSS zoom instead of transform: scale() so the browser rasterizes
// text and UI at the target size (crisp) rather than scaling a
// pre-rendered bitmap (blurry).
class ScalingSystem {
    constructor() {
        // Fixed game dimensions
        this.GAME_WIDTH = 1920;
        this.GAME_HEIGHT = 1080;

        // Get elements
        this.scaleWrapper = null;
        this.gameContainer = null;

        // Current scale
        this.currentScale = 1;

        // Initialize when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        // Get elements
        this.scaleWrapper = document.getElementById('scaleWrapper');
        this.gameContainer = document.getElementById('gameContainer');

        if (!this.scaleWrapper || !this.gameContainer) {
            console.error('ScalingSystem: Required elements not found');
            return;
        }

        // Set initial scale
        this.updateScale();

        // Add resize listener
        window.addEventListener('resize', () => this.updateScale());

        // Also update on orientation change for mobile
        window.addEventListener('orientationchange', () => {
            setTimeout(() => this.updateScale(), 100);
        });
    }

    updateScale() {
        if (!this.scaleWrapper) return;

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Calculate scale to fit within viewport while maintaining aspect ratio
        const scaleX = viewportWidth / this.GAME_WIDTH;
        const scaleY = viewportHeight / this.GAME_HEIGHT;
        this.currentScale = Math.min(scaleX, scaleY);

        // Apply zoom instead of transform: scale()
        // Zoom re-rasterizes text at the target size for crisp rendering
        this.scaleWrapper.style.zoom = this.currentScale;

        // Optional: Log scale info for debugging
        if (window.DEV_MODE) {
            console.log(`Viewport: ${viewportWidth}x${viewportHeight}, Scale: ${this.currentScale.toFixed(3)}`);
        }
    }

    // Get current scale for other systems that might need it
    getScale() {
        return this.currentScale;
    }

    // Convert viewport coordinates to game coordinates (useful for mouse/touch events)
    // With CSS zoom, getBoundingClientRect() returns zoom-adjusted values,
    // so we divide the offset by zoom to get back to game-space coordinates.
    viewportToGame(x, y) {
        const rect = this.scaleWrapper.getBoundingClientRect();
        const gameX = (x - rect.left) / this.currentScale;
        const gameY = (y - rect.top) / this.currentScale;
        return { x: gameX, y: gameY };
    }

    // Convert game coordinates to viewport coordinates
    gameToViewport(x, y) {
        const rect = this.scaleWrapper.getBoundingClientRect();
        const viewportX = (x * this.currentScale) + rect.left;
        const viewportY = (y * this.currentScale) + rect.top;
        return { x: viewportX, y: viewportY };
    }
}

// Create global instance
window.scalingSystem = new ScalingSystem();
