document.addEventListener('DOMContentLoaded', () => {
    // --- Game State and Constants for Sound ---
    let isMuted = false;

    // --- Sound Effects ---
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    function unlockAudio() { if (audioCtx && audioCtx.state === 'suspended') { audioCtx.resume(); } }
    function playSound(type, volume = 0.3) {
        if (isMuted || !audioCtx) return;
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
        if (type === 'launch'){oscillator.type = 'sine';oscillator.frequency.setValueAtTime(100, audioCtx.currentTime);oscillator.frequency.exponentialRampToValueAtTime(1000, audioCtx.currentTime + 0.1);gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);}
        else if (type === 'bounce'){oscillator.type = 'triangle';oscillator.frequency.setValueAtTime(400 + Math.random() * 200, audioCtx.currentTime);gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);}
        else if (type === 'flipper'){oscillator.type = 'square';oscillator.frequency.setValueAtTime(150, audioCtx.currentTime);gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);}
        else if (type === 'lose_ball'){oscillator.type = 'sawtooth';oscillator.frequency.setValueAtTime(200, audioCtx.currentTime);oscillator.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.6);}
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.8);
    }

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

    // Physics world scale
    const SCALE = 30;
    const pxToM = (px) => px / SCALE;
    const mToPx = (m) => m * SCALE;

    // Brick properties
    const BRICK_WIDTH = 60, BRICK_HEIGHT = 20, BRICK_ROWS = 5, BRICK_COLS = 10;
    const BRICK_PADDING = 10, BRICK_OFFSET_TOP = 35, BRICK_OFFSET_LEFT = 35;

    // Colors
    const COLOR_BLACK = 'black', COLOR_WHITE = 'white', COLOR_RED = 'red', COLOR_BLUE = 'blue';

    // Default speeds
    const DEFAULT_BALL_SPEED = 7.0, MAX_BALL_SPEED = 50.0;
    const DEFAULT_PADDLE_SPEED = 9, PADDLE_SPEED_RATIO = DEFAULT_PADDLE_SPEED / DEFAULT_BALL_SPEED;
    
    // NEW: Higher value = faster, more responsive "following" for mouse and auto-mode.
    const PADDLE_RESPONSIVENESS = 30; 

    // Game Objects
    let paddle = { width: 100, height: 10, speed: DEFAULT_PADDLE_SPEED };
    let ball = { radius: 10, speed: DEFAULT_BALL_SPEED };
    let bricks = [];

    // Physics Objects
    let world, ballBody, paddleBody, bodiesToDestroy = [];

    // Game state variables
    let score = 0;
    let autoFollowMode = true;
    let running = true;
    let animationFrameId;
    let paddleMoveDirectionTouch = 0;
    let mouseTargetX = null;
    let mouseControlActive = false;
    let consecutiveMiddleHits = 0; // For "super bounce" feature

    // Countdown variables
    let countdownActive = false, countdownValue = 3, countdownIntervalId = null;

    // Touch Controls Visibility
    let touchControlsAreVisible = true, touchLeftEl, touchRightEl;

    // Time variables
    let global_start_time = Date.now(), new_game_timeout_id = null;
    let autoSpeedIncreaseIntervalId = null, initialAutoSpeedRampActive = false;
    let showInitialAutomodeMessage = false, initialMessageTimeoutId = null;

    // DOM Elements
    const autoFollowStatusElement = document.getElementById('autoFollowStatus');
    const muteButton = document.getElementById('mute-button'); // Get mute button

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
            mouseTargetX = null;
            mouseControlActive = false;
            if (paddleBody) paddleBody.setLinearVelocity(Vec2(0, 0));
        } else {
            initialAutoSpeedRampActive = false;
        }
        if (showInitialAutomodeMessage) {
            showInitialAutomodeMessage = false;
            if (initialMessageTimeoutId) clearTimeout(initialMessageTimeoutId);
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
    function drawPaddle() { if (!paddleBody) return; const pos = paddleBody.getPosition(); const x = mToPx(pos.x) - paddle.width / 2; const y = mToPx(pos.y) - paddle.height / 2; ctx.beginPath(); ctx.rect(x, y, paddle.width, paddle.height); ctx.fillStyle = COLOR_BLUE; ctx.fill(); ctx.closePath(); }
    function drawBall() { if (!ballBody) return; const pos = ballBody.getPosition(); ctx.beginPath(); ctx.arc(mToPx(pos.x), mToPx(pos.y), ball.radius, 0, Math.PI * 2); ctx.fillStyle = COLOR_WHITE; ctx.fill(); ctx.closePath(); }
    function drawBricks() { for (const brick of bricks) { if (brick.status === 1) { ctx.beginPath(); ctx.rect(brick.x, brick.y, BRICK_WIDTH, BRICK_HEIGHT); ctx.fillStyle = COLOR_RED; ctx.fill(); ctx.closePath(); } } }
    function drawScoreAndInfo() { ctx.font = '18px Arial'; ctx.fillStyle = COLOR_WHITE; ctx.textAlign = 'left'; ctx.fillText(`Speed: ${ball.speed.toFixed(1)}`, 10, 20); ctx.textAlign = 'right'; ctx.fillText(`Score: ${score}`, SCREEN_WIDTH - 10, 20); ctx.textAlign = 'left'; const global_elapsed_time = (Date.now() - global_start_time) / 1000; ctx.fillText(`Playtime: ${global_elapsed_time.toFixed(1)}s`, 10, SCREEN_HEIGHT - 10); if (showInitialAutomodeMessage) { ctx.font = '20px Arial'; ctx.fillStyle = 'yellow'; ctx.textAlign = 'center'; ctx.fillText("Automode enabled. Click screen to take control.", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 100); } }
    function drawCountdown() { ctx.font = "120px Arial"; ctx.fillStyle = "rgba(255, 255, 0, 0.9)"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(countdownValue, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 50); ctx.font = "24px Arial"; ctx.fillStyle = "orange"; ctx.fillText(`Final Score: ${score}`, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - 20); }

    // --- GAME LOGIC ---
    function resetGame(keepScore = false, retainSpeed = null) {
        if (countdownIntervalId) clearInterval(countdownIntervalId);
        if (new_game_timeout_id) clearTimeout(new_game_timeout_id);
        countdownIntervalId = null; new_game_timeout_id = null; countdownActive = false;

        world = pl.World({ gravity: Vec2(0, 0) });
        bodiesToDestroy = [];

        const wallThicknessM = pxToM(10), screenWidthM = pxToM(SCREEN_WIDTH), screenHeightM = pxToM(SCREEN_HEIGHT);
        const wallDefs = [
            { pos: Vec2(screenWidthM / 2, -wallThicknessM / 2), w: screenWidthM, h: wallThicknessM, side: 'top' },
            { pos: Vec2(-wallThicknessM / 2, screenHeightM / 2), w: wallThicknessM, h: screenHeightM, side: 'left' },
            { pos: Vec2(screenWidthM + wallThicknessM / 2, screenHeightM / 2), w: wallThicknessM, h: screenHeightM, side: 'right' },
        ];
        wallDefs.forEach(def => {
            const wallBody = world.createBody({ type: 'static', position: def.pos });
            wallBody.createFixture(pl.Box(def.w / 2, def.h / 2), { restitution: 1.0, friction: 0.0 }).setUserData({ type: 'wall', side: def.side });
        });

        paddleBody = world.createBody({ type: 'kinematic', position: Vec2(pxToM(SCREEN_WIDTH / 2), pxToM(SCREEN_HEIGHT - 50)) });
        paddleBody.createFixture(pl.Box(pxToM(paddle.width / 2), pxToM(paddle.height / 2)), {}).setUserData({ type: 'paddle' });
        
        ballBody = world.createBody({ type: 'dynamic', position: Vec2(pxToM(SCREEN_WIDTH / 2), pxToM(SCREEN_HEIGHT / 2)), bullet: true });
        ballBody.createFixture(pl.Circle(pxToM(ball.radius)), { density: 1.0, restitution: 1.0, friction: 0.0 }).setUserData({ type: 'ball' });

        updateBallSpeed(retainSpeed !== null ? retainSpeed : DEFAULT_BALL_SPEED);
        let initialAngle = (Math.random() * 60 + 240) * Math.PI / 180;
        if (Math.random() < 0.5) initialAngle = (Math.random() * 60 + 30) * Math.PI / 180;
        ballBody.setLinearVelocity(Vec2(ball.speed * Math.cos(initialAngle), ball.speed * Math.sin(initialAngle)));

        bricks = [];
        for (let r = 0; r < BRICK_ROWS; r++) { for (let c = 0; c < BRICK_COLS; c++) { const brickX = c * (BRICK_WIDTH + BRICK_PADDING) + BRICK_OFFSET_LEFT; const brickY = r * (BRICK_HEIGHT + BRICK_PADDING) + BRICK_OFFSET_TOP; const brickBody = world.createBody({ type: 'static', position: Vec2(pxToM(brickX + BRICK_WIDTH / 2), pxToM(brickY + BRICK_HEIGHT / 2)) }); const brickRenderInfo = { x: brickX, y: brickY, status: 1, body: brickBody }; brickBody.createFixture(pl.Box(pxToM(BRICK_WIDTH / 2), pxToM(BRICK_HEIGHT / 2)), {}).setUserData({ type: 'brick', renderInfo: brickRenderInfo }); bricks.push(brickRenderInfo); } }
        
        world.on('pre-solve', (contact) => {
            const dataA = (contact.getFixtureA().getUserData() || {}),
                dataB = (contact.getFixtureB().getUserData() || {});
            if ((dataA.type === 'ball' && dataB.type === 'paddle') || (dataA.type === 'paddle' && dataB.type === 'ball')) {
                playSound('flipper', 0.4); // Volume changed to half
                contact.setEnabled(false);
    
                const ballPos = ballBody.getPosition();
                const paddlePos = paddleBody.getPosition();
                const currentVel = ballBody.getLinearVelocity();
    
                let relativeIntersectX = (ballPos.x - paddlePos.x) / (pxToM(paddle.width) / 2);
                
                const middleThreshold = 0.1; // 10% of paddle half-width is "middle"
                if (currentVel.y > 0 && Math.abs(relativeIntersectX) < middleThreshold) {
                    consecutiveMiddleHits++;
                } else if (currentVel.y > 0) { // Only reset if it's a downward hit, not a graze
                    consecutiveMiddleHits = 0;
                }
    
                if (consecutiveMiddleHits >= 5) {
                    const randomOffsetPx = (Math.random() * 10 + 10) * (Math.random() < 0.5 ? 1 : -1);
                    const offsetM = pxToM(randomOffsetPx);
                    const newBallPos = Vec2(ballPos.x + offsetM, ballPos.y);
                    ballBody.setPosition(newBallPos);
                    relativeIntersectX = (newBallPos.x - paddlePos.x) / (pxToM(paddle.width) / 2);
                    consecutiveMiddleHits = 0; // Reset after triggering
                }
    
                relativeIntersectX = Math.max(-1, Math.min(1, relativeIntersectX));
                const angle = (relativeIntersectX * 75) * (Math.PI / 180);
                ballBody.setLinearVelocity(Vec2(ball.speed * Math.sin(angle), -ball.speed * Math.cos(angle)));
            }
        });

        world.on('begin-contact', (contact) => {
            const dataA = (contact.getFixtureA().getUserData() || {}), dataB = (contact.getFixtureB().getUserData() || {});
            const ballData = dataA.type === 'ball' ? dataA : (dataB.type === 'ball' ? dataB : null);
            const brickData = dataA.type === 'brick' ? dataA : (dataB.type === 'brick' ? dataB : null);
            if (ballData && brickData && brickData.renderInfo.status === 1) {
                playSound('bounce', 0.6);
                brickData.renderInfo.status = 0;
                bodiesToDestroy.push(brickData.renderInfo.body);
                score += 10;
                consecutiveMiddleHits = 0; // Reset counter on brick hit
                if (bricks.every(b => b.status === 0)) {
                    if (!new_game_timeout_id) {
                        new_game_timeout_id = setTimeout(() => { resetGame(true, ball.speed); }, 2500);
                    }
                }
            }
        });

        world.on('post-solve', (contact) => {
            const dataA = contact.getFixtureA().getUserData() || {}, dataB = contact.getFixtureB().getUserData() || {};
            const ballData = dataA.type === 'ball' ? dataA : (dataB.type === 'ball' ? dataB : null);
            const wallData = dataA.type === 'wall' ? dataA : (dataB.type === 'wall' ? dataB : null);
            if (ballData && wallData) {
                playSound('bounce', 0.3);

                if (wallData.side === 'left' || wallData.side === 'right') {
                    consecutiveMiddleHits = 0; // Reset counter on side wall hit
                }

                const vel = ballBody.getLinearVelocity(), speed = vel.length(), minComponent = speed * 0.2;
                let corrected = false;
                if ((wallData.side === 'left' || wallData.side === 'right') && Math.abs(vel.x) < minComponent) {
                    vel.x = (vel.x > 0 ? 1 : -1) * minComponent; corrected = true;
                } else if (wallData.side === 'top' && Math.abs(vel.y) < minComponent) {
                    vel.y = (vel.y > 0 ? 1 : -1) * minComponent; corrected = true;
                }
                if (corrected) { vel.normalize(); vel.mul(speed); ballBody.setLinearVelocity(vel); }
            }
        });

        if (!keepScore) { score = 0; global_start_time = Date.now(); showInitialAutomodeMessage = true; initialAutoSpeedRampActive = true; if (initialMessageTimeoutId) clearTimeout(initialMessageTimeoutId); initialMessageTimeoutId = setTimeout(() => { showInitialAutomodeMessage = false; }, 15000); playSound('launch'); } else { showInitialAutomodeMessage = false; initialAutoSpeedRampActive = false; if (initialMessageTimeoutId) clearTimeout(initialMessageTimeoutId); }

        if (autoFollowStatusElement) autoFollowStatusElement.textContent = `Auto-Follow: ${autoFollowMode ? 'ON' : 'OFF'}`;
        paddleMoveDirectionTouch = 0;
        mouseTargetX = null;
        mouseControlActive = false;
        consecutiveMiddleHits = 0; // Ensure reset on new level/game
        running = true;
        manageAutoSpeedIncrease();
        if (!animationFrameId) gameLoop();
    }
    
    // --- KEYBOARD & MOUSE CONTROLS ---
    let keysPressed = {};
    document.addEventListener('keydown', (e) => { unlockAudio(); const key = e.key.toLowerCase(); keysPressed[key] = true; if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) e.preventDefault(); if (key === 'a') toggleAutoFollow(); if (key === ' ') teleportBallToPaddle(); if (key === 'n') resetGame(true, ball.speed); if (key === 't') toggleTouchControls(); });
    document.addEventListener('keyup', (e) => { keysPressed[e.key.toLowerCase()] = false; });
    
    canvas.addEventListener('mousemove', (e) => {
        if (mouseControlActive && !autoFollowMode) {
            const rect = canvas.getBoundingClientRect();
            mouseTargetX = pxToM(e.clientX - rect.left);
        }
    });

    canvas.addEventListener('mouseleave', () => {
        if (mouseControlActive) {
            mouseTargetX = null;
        }
    });

    function handleManualSpeedChange() { if (initialAutoSpeedRampActive) { initialAutoSpeedRampActive = false; manageAutoSpeedIncrease(); } }

    // --- GAMEPAD CONTROLS ---
    const GAMEPAD_DEADZONE = 0.25; let gamepads = {}; window.addEventListener("gamepadconnected", (e) => gamepads[e.gamepad.index] = { controller: e.gamepad, prevButtonStates: e.gamepad.buttons.map(b => b.pressed) }); window.addEventListener("gampaddisconnected", (e) => delete gamepads[e.gamepad.index]);
    function handleGamepadInput() { const latestGamepads = navigator.getGamepads(); if (!latestGamepads) return; for (const gp of latestGamepads) { if (!gp || !gamepads[gp.index]) continue; const prevStates = gamepads[gp.index].prevButtonStates; const isButtonPressed = (i) => gp.buttons[i] && gp.buttons[i].pressed && !prevStates[i]; if (isButtonPressed(0)) toggleAutoFollow(); if (isButtonPressed(1)) teleportBallToPaddle(); if (isButtonPressed(9)) resetGame(true, ball.speed); if (isButtonPressed(5)) { updateBallSpeed(Math.min(ball.speed + 2.0, MAX_BALL_SPEED)); handleManualSpeedChange(); } if (isButtonPressed(4)) { updateBallSpeed(Math.max(ball.speed - 2.0, DEFAULT_BALL_SPEED * 0.5)); handleManualSpeedChange(); } gamepads[gp.index].prevButtonStates = gp.buttons.map(b => b.pressed); } }
    
    // --- MAIN UPDATE AND GAME LOOP --- (MODIFIED)
    function update() {
        if (!world || !ballBody || !paddleBody) return;
        handleGamepadInput();
        let speedChanged = false; if (keysPressed['arrowup']) { updateBallSpeed(Math.min(ball.speed + 0.2, MAX_BALL_SPEED)); speedChanged = true; } if (keysPressed['arrowdown']) { updateBallSpeed(Math.max(ball.speed - 0.2, DEFAULT_BALL_SPEED * 0.5)); speedChanged = true; } if (speedChanged) handleManualSpeedChange();
        
        if (!autoFollowMode) {
            let desiredVelX = 0;
            // MODIFIED: Increased multiplier for faster digital movement (keyboard/gamepad/touch).
            const paddleVel = paddle.speed * 3.0; 

            if (mouseTargetX !== null) { 
                const currentPos = paddleBody.getPosition();
                // MODIFIED: Use the new responsiveness factor for mouse control to make it "snap" to the cursor.
                desiredVelX = (mouseTargetX - currentPos.x) * PADDLE_RESPONSIVENESS; 
            } 
            else {
                let gpAnalogMove = 0; const latestGamepads = navigator.getGamepads(); if (latestGamepads) { for (const gp of latestGamepads) { if (gp && Math.abs(gp.axes[0]) > GAMEPAD_DEADZONE) { gpAnalogMove = gp.axes[0]; break; } } }
                if (gpAnalogMove !== 0) { desiredVelX = gpAnalogMove * paddleVel; } 
                else {
                    let digitalMove = 0, gpDPadMove = 0; if (latestGamepads) { for (const gp of latestGamepads) { if (!gp) continue; if (gp.buttons[14] && gp.buttons[14].pressed) { gpDPadMove = -1; break; } if (gp.buttons[15] && gp.buttons[15].pressed) { gpDPadMove = 1; break; } } }
                    if (gpDPadMove !== 0) digitalMove = gpDPadMove; else if (keysPressed['arrowleft']) digitalMove = -1; else if (keysPressed['arrowright']) digitalMove = 1; else if (paddleMoveDirectionTouch !== 0) digitalMove = paddleMoveDirectionTouch;
                    if (digitalMove !== 0) desiredVelX = digitalMove * paddleVel;
                }
            }
            paddleBody.setLinearVelocity(Vec2(desiredVelX, 0));
        } else { 
            const ballPos = ballBody.getPosition();
            const paddlePos = paddleBody.getPosition();
            // MODIFIED: Use the new responsiveness factor for auto-follow mode.
            const desiredVelX = (ballPos.x - paddlePos.x) * PADDLE_RESPONSIVENESS;
            paddleBody.setLinearVelocity(Vec2(desiredVelX, 0)); 
        }

        world.step(1 / 60);
        bodiesToDestroy.forEach(body => world.destroyBody(body)); bodiesToDestroy = []; ensureNonHorizontal();
        const ballPos = ballBody.getPosition();
        if (mToPx(ballPos.y) - ball.radius > SCREEN_HEIGHT && running) {
            playSound('lose_ball');
            running = false; initialAutoSpeedRampActive = false; manageAutoSpeedIncrease(); countdownActive = true; countdownValue = 3; if (countdownIntervalId) clearInterval(countdownIntervalId);
            countdownIntervalId = setInterval(() => { countdownValue--; if (countdownValue <= 0) { clearInterval(countdownIntervalId); resetGame(false); } }, 1000);
        }
    }

    function draw() { ctx.fillStyle = COLOR_BLACK; ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT); drawPaddle(); drawBricks(); drawBall(); drawScoreAndInfo(); if (countdownActive) drawCountdown(); }
    function gameLoop() { if (running) update(); draw(); animationFrameId = requestAnimationFrame(gameLoop); }
    
    // --- UI/BUTTON/TOUCH SETUP ---
    function manageAutoSpeedIncrease() { if (autoFollowMode && initialAutoSpeedRampActive && running) { if (!autoSpeedIncreaseIntervalId) { autoSpeedIncreaseIntervalId = setInterval(() => { if (autoFollowMode && initialAutoSpeedRampActive && running && ball.speed < MAX_BALL_SPEED) { updateBallSpeed(Math.min(ball.speed + 5, MAX_BALL_SPEED)); if (ball.speed >= MAX_BALL_SPEED) initialAutoSpeedRampActive = false; } else if(autoSpeedIncreaseIntervalId) { clearInterval(autoSpeedIncreaseIntervalId); autoSpeedIncreaseIntervalId = null; } }, 2500); } } else if (autoSpeedIncreaseIntervalId) { clearInterval(autoSpeedIncreaseIntervalId); autoSpeedIncreaseIntervalId = null; } }
    function setupButtonControls() { document.getElementById('btnIncreaseSpeed').addEventListener('click', () => { updateBallSpeed(Math.min(ball.speed + 0.5, MAX_BALL_SPEED)); handleManualSpeedChange(); }); document.getElementById('btnDecreaseSpeed').addEventListener('click', () => { updateBallSpeed(Math.max(ball.speed - 0.5, DEFAULT_BALL_SPEED * 0.5)); handleManualSpeedChange(); }); document.getElementById('btnToggleAutoFollow').addEventListener('click', toggleAutoFollow); document.getElementById('btnTeleportBall').addEventListener('click', teleportBallToPaddle); document.getElementById('btnNewGame').addEventListener('click', () => resetGame(true, ball.speed)); document.getElementById('btnToggleTouch').addEventListener('click', toggleTouchControls); document.getElementById('btnMoveLeft').addEventListener('click', () => { if (!autoFollowMode && paddleBody) paddleBody.setLinearVelocity(Vec2(-paddle.speed, 0)); }); document.getElementById('btnMoveRight').addEventListener('click', () => { if (!autoFollowMode && paddleBody) paddleBody.setLinearVelocity(Vec2(paddle.speed, 0)); }); muteButton.addEventListener('click', () => { unlockAudio(); isMuted = !isMuted; muteButton.textContent = isMuted ? 'Unmute' : 'Mute'; }); }
    function toggleTouchControls() { touchControlsAreVisible = !touchControlsAreVisible; if (touchLeftEl && touchRightEl) { touchLeftEl.classList.toggle('hidden', !touchControlsAreVisible); touchRightEl.classList.toggle('hidden', !touchControlsAreVisible); } }
    function setupTouchControls() { touchLeftEl = document.getElementById('touchControlLeft'); touchRightEl = document.getElementById('touchControlRight'); touchLeftEl.classList.toggle('hidden', !touchControlsAreVisible); touchRightEl.classList.toggle('hidden', !touchControlsAreVisible); const handleTouchStart = (direction) => { if (autoFollowMode) toggleAutoFollow(); paddleMoveDirectionTouch = direction; }; const handleTouchEnd = () => { paddleMoveDirectionTouch = 0; }; ['mousedown', 'touchstart'].forEach(evt => { touchLeftEl.addEventListener(evt, (e) => { e.preventDefault(); handleTouchStart(-1); }, { passive: false }); touchRightEl.addEventListener(evt, (e) => { e.preventDefault(); handleTouchStart(1); }, { passive: false }); }); ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(evt => { document.addEventListener(evt, () => { if (paddleMoveDirectionTouch !== 0) handleTouchEnd(); }); }); }

    // --- INITIALIZE AND START GAME ---
    setupButtonControls();
    setupTouchControls();

    const handleCanvasClick = (e) => {
        unlockAudio(); // Unlock audio on interaction
        if (autoFollowMode) {
            e.preventDefault();
            toggleAutoFollow();
        }
        mouseControlActive = true;
    };
    canvas.addEventListener('mousedown', handleCanvasClick);
    canvas.addEventListener('touchstart', handleCanvasClick, { passive: false });
    
    resetGame();
});
