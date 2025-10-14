document.addEventListener('DOMContentLoaded', () => {
    // Planck.js alias
    const pl = planck, Vec2 = pl.Vec2;

    // Initialize canvas and context
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const gameArea = document.getElementById('gameArea');

    // Screen dimensions
    const SCREEN_WIDTH = 800;
    const SCREEN_HEIGHT = 600;
    canvas.width = SCREEN_WIDTH;
    canvas.height = SCREEN_HEIGHT;
    if (gameArea) {
        gameArea.style.width = SCREEN_WIDTH + 'px';
        gameArea.style.height = SCREEN_HEIGHT + 'px';
    }

    // Physics world scale (30 pixels = 1 meter)
    const SCALE = 30;
    const pxToM = (px) => px / SCALE;
    const mToPx = (m) => m * SCALE;

    // Brick properties
    const BRICK_WIDTH = 60;
    const BRICK_HEIGHT = 20;
    const BRICK_ROWS = 5;
    const BRICK_COLS = 10;
    const BRICK_PADDING = 10;
    const BRICK_OFFSET_TOP = 35;
    const BRICK_OFFSET_LEFT = 35;

    // Colors
    const COLOR_BLACK = 'black';
    const COLOR_WHITE = 'white';
    const COLOR_RED = 'red';
    const COLOR_BLUE = 'blue';

    // Default speeds
    const DEFAULT_BALL_SPEED = 7.0; // This is now a "speed unit", not pixels/frame
    const MAX_BALL_SPEED = 50.0;
    const DEFAULT_PADDLE_SPEED = 9;
    const PADDLE_SPEED_RATIO = DEFAULT_PADDLE_SPEED / DEFAULT_BALL_SPEED;

    // Game Objects (Render Info)
    let paddle = { width: 100, height: 10, speed: DEFAULT_PADDLE_SPEED };
    let ball = { radius: 10, speed: DEFAULT_BALL_SPEED };
    let bricks = []; // Will store rendering info

    // Physics Objects
    let world;
    let ballBody, paddleBody;
    let brickBodies = [];
    let bodiesToDestroy = [];

    // Game state variables
    let score = 0;
    let autoFollowMode = true;
    let running = true;
    let animationFrameId;
    let paddleMoveDirectionTouch = 0;

    // Countdown variables
    let countdownActive = false;
    let countdownValue = 3;
    let countdownIntervalId = null;

    // Touch Controls Visibility
    let touchControlsAreVisible = true;
    let touchLeftEl, touchRightEl;

    // Time variables
    let global_start_time = Date.now();
    let new_game_timeout_id = null;
    let autoSpeedIncreaseIntervalId = null;
    let initialAutoSpeedRampActive = false;
    let showInitialAutomodeMessage = false;
    let initialMessageTimeoutId = null;

    // DOM Elements
    const autoFollowStatusElement = document.getElementById('autoFollowStatus');

    // --- HELPER FUNCTIONS ---
    function updateBallSpeed(newSpeed) {
        ball.speed = newSpeed;
        if (ballBody) {
            const currentVelocity = ballBody.getLinearVelocity();
            if (currentVelocity.length() > 0) {
                currentVelocity.normalize();
                ballBody.setLinearVelocity(currentVelocity.mul(ball.speed));
            }
        }
        paddle.speed = PADDLE_SPEED_RATIO * ball.speed;
        if (paddle.speed < 3) paddle.speed = 3;
    }

    function toggleAutoFollow() {
        autoFollowMode = !autoFollowMode;
        if (autoFollowStatusElement) {
            autoFollowStatusElement.textContent = `Auto-Follow: ${autoFollowMode ? 'ON' : 'OFF'}`;
        }
        if (autoFollowMode) {
            paddleMoveDirectionTouch = 0;
            if (paddleBody) paddleBody.setLinearVelocity(Vec2(0, 0));
        } else {
            initialAutoSpeedRampActive = false;
            console.log("Player took control: Initial auto speed ramp disabled.");
        }

        if (showInitialAutomodeMessage) {
            showInitialAutomodeMessage = false;
            if (initialMessageTimeoutId) {
                clearTimeout(initialMessageTimeoutId);
                initialMessageTimeoutId = null;
            }
        }
        manageAutoSpeedIncrease();
    }

    function teleportBallToPaddle() {
        if (!paddleBody || !ballBody) return;
        const paddlePos = paddleBody.getPosition();
        ballBody.setPosition(Vec2(paddlePos.x, paddlePos.y - pxToM(ball.radius + 5)));
        ballBody.setLinearVelocity(Vec2(0, -ball.speed));
    }

    function ensureNonHorizontal() {
        if (!ballBody) return;
        const vel = ballBody.getLinearVelocity();
        const speed = vel.length();
        if (speed === 0) return;

        const minVerticalRatio = 0.15;
        if (Math.abs(vel.y / speed) < minVerticalRatio) {
            vel.y = (vel.y >= 0 ? 1 : -1) * speed * minVerticalRatio;
            
            let newVelX = Math.sqrt(Math.max(0, speed * speed - vel.y * vel.y));
            vel.x = (vel.x >= 0 ? 1 : -1) * newVelX;
            
            ballBody.setLinearVelocity(vel);
        }
    }
    
    // --- DRAW FUNCTIONS ---
    function drawPaddle() {
        if (!paddleBody) return;
        const pos = paddleBody.getPosition();
        const x = mToPx(pos.x) - paddle.width / 2;
        const y = mToPx(pos.y) - paddle.height / 2;
        ctx.beginPath();
        ctx.rect(x, y, paddle.width, paddle.height);
        ctx.fillStyle = COLOR_BLUE;
        ctx.fill();
        ctx.closePath();
    }

    function drawBall() {
        if (!ballBody) return;
        const pos = ballBody.getPosition();
        ctx.beginPath();
        ctx.arc(mToPx(pos.x), mToPx(pos.y), ball.radius, 0, Math.PI * 2);
        ctx.fillStyle = COLOR_WHITE;
        ctx.fill();
        ctx.closePath();
    }

    function drawBricks() {
        for (const brick of bricks) {
            if (brick.status === 1) {
                ctx.beginPath();
                ctx.rect(brick.x, brick.y, BRICK_WIDTH, BRICK_HEIGHT);
                ctx.fillStyle = COLOR_RED;
                ctx.fill();
                ctx.closePath();
            }
        }
    }

    function drawScoreAndInfo() {
        ctx.font = '18px Arial';
        ctx.fillStyle = COLOR_WHITE;
        ctx.textAlign = 'left';
        ctx.fillText(`Speed: ${ball.speed.toFixed(1)}`, 10, 20);
        ctx.textAlign = 'right';
        ctx.fillText(`Score: ${score}`, SCREEN_WIDTH - 10, 20);
        ctx.textAlign = 'left';
        const global_elapsed_time = (Date.now() - global_start_time) / 1000;
        ctx.fillText(`Playtime: ${global_elapsed_time.toFixed(1)}s`, 10, SCREEN_HEIGHT - 10);
        if (showInitialAutomodeMessage) {
            ctx.font = '20px Arial';
            ctx.fillStyle = 'yellow';
            ctx.textAlign = 'center';
            ctx.fillText("Automode enabled. Click screen to take control.", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 100);
        }
    }

    function drawCountdown() {
        ctx.font = "120px Arial";
        ctx.fillStyle = "rgba(255, 255, 0, 0.9)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(countdownValue, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 50);
        ctx.font = "24px Arial";
        ctx.fillStyle = "orange";
        ctx.fillText(`Final Score: ${score}`, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - 20);
    }

    // --- GAME LOGIC ---
    function resetGame(keepScore = false, retainSpeed = null) {
        // Clear timers
        if (countdownIntervalId) clearInterval(countdownIntervalId);
        if (new_game_timeout_id) clearTimeout(new_game_timeout_id);
        countdownIntervalId = null;
        new_game_timeout_id = null;
        countdownActive = false;

        // Reset Physics World
        world = pl.World({ gravity: Vec2(0, 0) });
        brickBodies = [];
        bodiesToDestroy = [];

        // Create Walls
        const wallThickness = pxToM(10);
        const walls = [
            { x: pxToM(SCREEN_WIDTH / 2), y: -wallThickness, w: pxToM(SCREEN_WIDTH), h: wallThickness }, // Top
            { x: -wallThickness, y: pxToM(SCREEN_HEIGHT / 2), w: wallThickness, h: pxToM(SCREEN_HEIGHT) }, // Left
            { x: pxToM(SCREEN_WIDTH) + wallThickness, y: pxToM(SCREEN_HEIGHT / 2), w: wallThickness, h: pxToM(SCREEN_HEIGHT) }, // Right
        ];
        walls.forEach(wall => {
            const ground = world.createBody({ type: 'static', position: Vec2(wall.x, wall.y) });
            ground.createFixture(pl.Box(wall.w / 2, wall.h / 2), {restitution: 1.0, friction: 0.0});
        });

        // Create Paddle
        paddleBody = world.createBody({
            type: 'kinematic',
            position: Vec2(pxToM(SCREEN_WIDTH / 2), pxToM(SCREEN_HEIGHT - 50)),
        });
        const paddleFixture = paddleBody.createFixture(pl.Box(pxToM(paddle.width / 2), pxToM(paddle.height / 2)), {});
        paddleFixture.setUserData({ type: 'paddle' });
        
        // Create Ball
        ballBody = world.createBody({
            type: 'dynamic',
            position: Vec2(pxToM(SCREEN_WIDTH / 2), pxToM(SCREEN_HEIGHT / 2)),
            bullet: true // Prevents tunneling at high speeds
        });
        const ballFixture = ballBody.createFixture(pl.Circle(pxToM(ball.radius)), {
            density: 1.0,
            restitution: 1.0, // Perfect bounce
            friction: 0.0
        });
        ballFixture.setUserData({ type: 'ball' });

        // Set Ball Speed and Initial Velocity
        updateBallSpeed(retainSpeed !== null ? retainSpeed : DEFAULT_BALL_SPEED);
        let initialAngle = (Math.random() * 60 + 240) * Math.PI / 180;
        if (Math.random() < 0.5) initialAngle = (Math.random() * 60 + 30) * Math.PI / 180;
        const initialVelocity = Vec2(ball.speed * Math.cos(initialAngle), ball.speed * Math.sin(initialAngle));
        ballBody.setLinearVelocity(initialVelocity);

        // Create Bricks
        bricks = [];
        for (let r = 0; r < BRICK_ROWS; r++) {
            for (let c = 0; c < BRICK_COLS; c++) {
                const brickX = c * (BRICK_WIDTH + BRICK_PADDING) + BRICK_OFFSET_LEFT;
                const brickY = r * (BRICK_HEIGHT + BRICK_PADDING) + BRICK_OFFSET_TOP;
                const brickBody = world.createBody({
                    type: 'static',
                    position: Vec2(pxToM(brickX + BRICK_WIDTH / 2), pxToM(brickY + BRICK_HEIGHT / 2))
                });
                const brickFixture = brickBody.createFixture(pl.Box(pxToM(BRICK_WIDTH / 2), pxToM(BRICK_HEIGHT / 2)), {});
                
                const brickRenderInfo = { x: brickX, y: brickY, status: 1, body: brickBody };
                brickFixture.setUserData({ type: 'brick', renderInfo: brickRenderInfo });
                bricks.push(brickRenderInfo);
                brickBodies.push(brickBody);
            }
        }
        
        // Setup Collision Listener
        world.on('pre-solve', (contact) => {
            const fixtureA = contact.getFixtureA();
            const fixtureB = contact.getFixtureB();
            const dataA = fixtureA.getUserData();
            const dataB = fixtureB.getUserData();

            const ballData = dataA.type === 'ball' ? dataA : (dataB.type === 'ball' ? dataB : null);
            const paddleData = dataA.type === 'paddle' ? dataA : (dataB.type === 'paddle' ? dataB : null);

            if (ballData && paddleData) {
                // Custom paddle bounce logic
                contact.setEnabled(false); // Disable default physics response
                
                const ballPos = ballBody.getPosition();
                const paddlePos = paddleBody.getPosition();
                const paddleWidthM = pxToM(paddle.width);

                let relativeIntersectX = (ballPos.x - paddlePos.x) / (paddleWidthM / 2);
                relativeIntersectX = Math.max(-1, Math.min(1, relativeIntersectX));

                const maxAngle = 75; // Angle in degrees from vertical
                const angle = (relativeIntersectX * maxAngle) * (Math.PI / 180);

                const newVel = Vec2(ball.speed * Math.sin(angle), -ball.speed * Math.cos(angle));
                ballBody.setLinearVelocity(newVel);
            }
        });

        world.on('begin-contact', (contact) => {
            const fixtureA = contact.getFixtureA();
            const fixtureB = contact.getFixtureB();
            const dataA = fixtureA.getUserData();
            const dataB = fixtureB.getUserData();
            
            const ballData = dataA.type === 'ball' ? dataA : (dataB.type === 'ball' ? dataB : null);
            const brickData = dataA.type === 'brick' ? dataA : (dataB.type === 'brick' ? dataB : null);
            
            if (ballData && brickData && brickData.renderInfo.status === 1) {
                brickData.renderInfo.status = 0;
                bodiesToDestroy.push(brickData.renderInfo.body);
                score += 10;

                // Check for win condition
                if (bricks.every(b => b.status === 0)) {
                    if (!new_game_timeout_id) {
                        console.log("All bricks destroyed! New game in 2.5s.");
                        new_game_timeout_id = setTimeout(() => {
                            resetGame(true, ball.speed);
                            new_game_timeout_id = null;
                        }, 2500);
                    }
                }
            }
        });

        // Reset game state
        if (!keepScore) {
            score = 0;
            global_start_time = Date.now();
            showInitialAutomodeMessage = true;
            initialAutoSpeedRampActive = true;
            if (initialMessageTimeoutId) clearTimeout(initialMessageTimeoutId);
            initialMessageTimeoutId = setTimeout(() => { showInitialAutomodeMessage = false; initialMessageTimeoutId = null; }, 15000);
        } else {
            showInitialAutomodeMessage = false;
            initialAutoSpeedRampActive = false;
            if (initialMessageTimeoutId) clearTimeout(initialMessageTimeoutId);
        }

        if (autoFollowStatusElement) autoFollowStatusElement.textContent = `Auto-Follow: ${autoFollowMode ? 'ON' : 'OFF'}`;
        paddleMoveDirectionTouch = 0;
        running = true;
        manageAutoSpeedIncrease();
        if (!animationFrameId) gameLoop();
    }
    
    // --- KEYBOARD & MOUSE CONTROLS ---
    let keysPressed = {};
    document.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        keysPressed[key] = true;
        if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) e.preventDefault();
        if (key === 'a') toggleAutoFollow();
        if (key === ' ') teleportBallToPaddle();
        if (key === 'n') resetGame(true, ball.speed);
        if (key === 't') toggleTouchControls();
    });
    document.addEventListener('keyup', (e) => { keysPressed[e.key.toLowerCase()] = false; });
    
    canvas.addEventListener('mousemove', (e) => {
        if (!autoFollowMode) {
            const rect = canvas.getBoundingClientRect();
            let mouseX = e.clientX - rect.left;
            let targetX = pxToM(mouseX);
            // Instead of setting position, we set velocity to move towards the target
            const currentPos = paddleBody.getPosition();
            const desiredVelX = (targetX - currentPos.x) * 10; // *10 is a factor to make it responsive
            paddleBody.setLinearVelocity(Vec2(desiredVelX, 0));
        }
    });

    function handleManualSpeedChange() {
        if (initialAutoSpeedRampActive) {
            console.log("Manual speed change: Initial auto speed ramp disabled.");
            initialAutoSpeedRampActive = false;
            manageAutoSpeedIncrease();
        }
    }

    // --- GAMEPAD CONTROLS ---
    const GAMEPAD_DEADZONE = 0.25;
    let gamepads = {};
    window.addEventListener("gamepadconnected", (e) => gamepads[e.gamepad.index] = { controller: e.gamepad, prevButtonStates: e.gamepad.buttons.map(b => b.pressed) });
    window.addEventListener("gamepaddisconnected", (e) => delete gamepads[e.gamepad.index]);

    function handleGamepadInput() {
        const latestGamepads = navigator.getGamepads();
        if (!latestGamepads) return;

        for (const gp of latestGamepads) {
            if (!gp || !gamepads[gp.index]) continue;
            const prevStates = gamepads[gp.index].prevButtonStates;
            const isButtonPressed = (i) => gp.buttons[i] && gp.buttons[i].pressed && !prevStates[i];

            if (isButtonPressed(0)) toggleAutoFollow();
            if (isButtonPressed(1)) teleportBallToPaddle();
            if (isButtonPressed(9)) resetGame(true, ball.speed);

            if (isButtonPressed(5)) { updateBallSpeed(Math.min(ball.speed + 2.0, MAX_BALL_SPEED)); handleManualSpeedChange(); }
            if (isButtonPressed(4)) { updateBallSpeed(Math.max(ball.speed - 2.0, DEFAULT_BALL_SPEED * 0.5)); handleManualSpeedChange(); }
            
            gamepads[gp.index].prevButtonStates = gp.buttons.map(b => b.pressed);
        }
    }
    
    // --- MAIN UPDATE AND GAME LOOP ---
    function update() {
        if (!world || !ballBody || !paddleBody) return;

        handleGamepadInput();

        // Keyboard Speed Control
        let speedChanged = false;
        if (keysPressed['arrowup']) { updateBallSpeed(Math.min(ball.speed + 0.2, MAX_BALL_SPEED)); speedChanged = true; }
        if (keysPressed['arrowdown']) { updateBallSpeed(Math.max(ball.speed - 0.2, DEFAULT_BALL_SPEED * 0.5)); speedChanged = true; }
        if (speedChanged) handleManualSpeedChange();

        // Paddle Movement
        if (!autoFollowMode) {
            let moveVelX = 0;
            const paddleVel = paddle.speed * 1.5; // Scale speed for physics world

             // Gamepad analog/d-pad movement
            let gpMove = 0;
            const latestGamepads = navigator.getGamepads();
            if (latestGamepads) {
                for (const gp of latestGamepads) {
                    if (!gp) continue;
                    if (Math.abs(gp.axes[0]) > GAMEPAD_DEADZONE) { gpMove = gp.axes[0] * paddleVel; break; }
                    if (gp.buttons[14] && gp.buttons[14].pressed) { gpMove = -paddleVel; break; }
                    if (gp.buttons[15] && gp.buttons[15].pressed) { gpMove = paddleVel; break; }
                }
            }

            if (gpMove !== 0) {
                moveVelX = gpMove;
            } else if (keysPressed['arrowleft']) {
                moveVelX = -paddleVel;
            } else if (keysPressed['arrowright']) {
                moveVelX = paddleVel;
            } else if (paddleMoveDirectionTouch !== 0) {
                moveVelX = paddleMoveDirectionTouch * paddleVel;
            }
            
            // Mouse movement is handled in its own listener, so we only set velocity if other inputs are used
            // This prevents keyboard/touch from overriding mouse
            if (moveVelX !== 0) {
                 paddleBody.setLinearVelocity(Vec2(moveVelX, 0));
            } else if (gpMove === 0) {
                 // Stop moving if no digital input is pressed (mouse will keep providing velocity)
                 const currentVel = paddleBody.getLinearVelocity();
                 if(Math.abs(currentVel.x) > 0.1) paddleBody.setLinearVelocity(Vec2(0, 0));
            }
        } else { // Auto-follow Mode
            const ballPos = ballBody.getPosition();
            const paddlePos = paddleBody.getPosition();
            const desiredVelX = (ballPos.x - paddlePos.x) * 10; // Proportional controller
            paddleBody.setLinearVelocity(Vec2(desiredVelX, 0));
        }

        // Advance physics simulation
        world.step(1 / 60);

        // Clean up destroyed bodies
        bodiesToDestroy.forEach(body => world.destroyBody(body));
        bodiesToDestroy = [];

        // Ensure ball doesn't get stuck horizontally
        ensureNonHorizontal();

        // Game Over Check
        const ballPos = ballBody.getPosition();
        if (mToPx(ballPos.y) - ball.radius > SCREEN_HEIGHT && running) {
            console.log("Game Over - Starting countdown...");
            running = false;
            initialAutoSpeedRampActive = false;
            manageAutoSpeedIncrease();
            countdownActive = true;
            countdownValue = 3;
            if (countdownIntervalId) clearInterval(countdownIntervalId);
            countdownIntervalId = setInterval(() => {
                countdownValue--;
                if (countdownValue <= 0) {
                    clearInterval(countdownIntervalId);
                    countdownIntervalId = null;
                    resetGame(false);
                }
            }, 1000);
        }
    }

    function draw() {
        ctx.fillStyle = COLOR_BLACK;
        ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
        drawPaddle();
        drawBricks();
        drawBall();
        drawScoreAndInfo();
        if (countdownActive) {
            drawCountdown();
        }
    }

    function gameLoop() {
        if (running) {
            update();
        }
        draw();
        animationFrameId = requestAnimationFrame(gameLoop);
    }
    
    // --- UI/BUTTON/TOUCH SETUP (Mostly Unchanged Logic) ---

    // This function can now be removed or simplified as it was for manual speed updates
    function manageAutoSpeedIncrease() {
        if (autoFollowMode && initialAutoSpeedRampActive && running) {
            if (!autoSpeedIncreaseIntervalId) {
                autoSpeedIncreaseIntervalId = setInterval(() => {
                    if (autoFollowMode && initialAutoSpeedRampActive && running) {
                        if (ball.speed < MAX_BALL_SPEED) {
                            console.log(`Auto mode (initial ramp): Speed increased...`);
                            updateBallSpeed(Math.min(ball.speed + 5, MAX_BALL_SPEED));
                            if (ball.speed >= MAX_BALL_SPEED) {
                                initialAutoSpeedRampActive = false;
                                console.log(`Auto mode (initial ramp): Reached MAX speed. Ramp finished.`);
                            }
                        } else {
                            initialAutoSpeedRampActive = false;
                        }
                    } else {
                        if (autoSpeedIncreaseIntervalId) {
                            clearInterval(autoSpeedIncreaseIntervalId);
                            autoSpeedIncreaseIntervalId = null;
                        }
                    }
                }, 2500);
            }
        } else {
            if (autoSpeedIncreaseIntervalId) {
                clearInterval(autoSpeedIncreaseIntervalId);
                autoSpeedIncreaseIntervalId = null;
            }
        }
    }

    function setupButtonControls() {
        document.getElementById('btnIncreaseSpeed').addEventListener('click', () => { updateBallSpeed(Math.min(ball.speed + 0.5, MAX_BALL_SPEED)); handleManualSpeedChange(); });
        document.getElementById('btnDecreaseSpeed').addEventListener('click', () => { updateBallSpeed(Math.max(ball.speed - 0.5, DEFAULT_BALL_SPEED * 0.5)); handleManualSpeedChange(); });
        document.getElementById('btnToggleAutoFollow').addEventListener('click', toggleAutoFollow);
        document.getElementById('btnTeleportBall').addEventListener('click', teleportBallToPaddle);
        document.getElementById('btnNewGame').addEventListener('click', () => resetGame(true, ball.speed));
        document.getElementById('btnToggleTouch').addEventListener('click', toggleTouchControls);
        
        // Manual move buttons (less effective with physics, but kept for parity)
        document.getElementById('btnMoveLeft').addEventListener('click', () => { if (!autoFollowMode && paddleBody) paddleBody.setLinearVelocity(Vec2(-paddle.speed, 0)); });
        document.getElementById('btnMoveRight').addEventListener('click', () => { if (!autoFollowMode && paddleBody) paddleBody.setLinearVelocity(Vec2(paddle.speed, 0)); });
    }
    
    function toggleTouchControls() {
        touchControlsAreVisible = !touchControlsAreVisible;
        if (touchLeftEl && touchRightEl) {
            touchLeftEl.classList.toggle('hidden', !touchControlsAreVisible);
            touchRightEl.classList.toggle('hidden', !touchControlsAreVisible);
        }
    }

    function setupTouchControls() {
        touchLeftEl = document.getElementById('touchControlLeft');
        touchRightEl = document.getElementById('touchControlRight');
        touchLeftEl.classList.toggle('hidden', !touchControlsAreVisible);
        touchRightEl.classList.toggle('hidden', !touchControlsAreVisible);

        const handleTouchStart = (direction) => { 
            if (autoFollowMode) toggleAutoFollow();
            paddleMoveDirectionTouch = direction; 
        };
        const handleTouchEnd = () => { paddleMoveDirectionTouch = 0; };

        ['mousedown', 'touchstart'].forEach(evt => {
            touchLeftEl.addEventListener(evt, (e) => { e.preventDefault(); handleTouchStart(-1); }, { passive: false });
            touchRightEl.addEventListener(evt, (e) => { e.preventDefault(); handleTouchStart(1); }, { passive: false });
        });
        ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(evt => {
            document.addEventListener(evt, () => { if (paddleMoveDirectionTouch !== 0) handleTouchEnd(); });
        });
    }

    // --- INITIALIZE AND START GAME ---
    setupButtonControls();
    setupTouchControls();

    const activateManualControl = (e) => {
        if (autoFollowMode) {
            e.preventDefault();
            toggleAutoFollow();
        }
    };
    canvas.addEventListener('mousedown', activateManualControl);
    canvas.addEventListener('touchstart', activateManualControl, { passive: false });
    
    resetGame();
});
