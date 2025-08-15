const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const startScreen = document.getElementById('start-screen');
const startButton = document.getElementById('start-button');

let audioContext;
let backgroundMusicSource;
let footstepSoundBuffer;
let doorSoundBuffer;

const room = new WebsimSocket();

const PLAYER_SPEED = 3;
const PLAYER_SIZE = 40;
const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 2000;

const buildings = [
    { id: 'b1', x: 180, y: 150, width: 250, height: 180, entrance: { x: 280, y: 330, width: 50, height: 10 } },
    { id: 'b2', x: 750, y: 450, width: 300, height: 200, entrance: { x: 880, y: 650, width: 50, height: 10 } },
    { id: 'b3', x: 1400, y: 800, width: 200, height: 250, entrance: { x: 1475, y: 1050, width: 50, height: 10 } },
    { id: 'b4', x: 400, y: 1200, width: 220, height: 160, entrance: { x: 480, y: 1360, width: 50, height: 10 } },
];

const interiors = {
    'b1': { exit: { x: 500, y: 900, width: 100, height: 20 }, spawn: { x: 280 + 25, y: 330 - 30 } },
    'b2': { exit: { x: 500, y: 900, width: 100, height: 20 }, spawn: { x: 880 + 25, y: 650 - 30 } },
    'b3': { exit: { x: 500, y: 900, width: 100, height: 20 }, spawn: { x: 1475 + 25, y: 1050 - 30 } },
    'b4': { exit: { x: 500, y: 900, width: 100, height: 20 }, spawn: { x: 480 + 25, y: 1360 - 30 } },
};
const INTERIOR_WIDTH = 1000;
const INTERIOR_HEIGHT = 1000;

const assets = {
    player: new Image(),
    background: new Image(),
    interior: new Image(),
};

let assetsLoaded = 0;
const totalAssets = Object.keys(assets).length;

function onAssetLoad() {
    assetsLoaded++;
    if (assetsLoaded === totalAssets) {
        console.log("All assets loaded");
    }
}

assets.player.src = './player.png';
assets.player.onload = onAssetLoad;
assets.background.src = './background.png';
assets.background.onload = onAssetLoad;
assets.interior.src = './interior.png';
assets.interior.onload = onAssetLoad;

let input = { x: 0, y: 0 };
let lastFootstepTime = 0;
const FOOTSTEP_INTERVAL = 350; // ms

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function draw() {
    if (assetsLoaded < totalAssets) {
        requestAnimationFrame(draw);
        return;
    }
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const localPlayerPresence = room.presence[room.clientId];
    if (!localPlayerPresence) {
        requestAnimationFrame(draw);
        return;
    }

    // Center camera on local player
    const camX = -localPlayerPresence.x + canvas.width / 2;
    const camY = -localPlayerPresence.y + canvas.height / 2;

    ctx.save();
    ctx.translate(camX, camY);

    // Draw background
    if (localPlayerPresence.interiorId) {
        ctx.drawImage(assets.interior, 0, 0, INTERIOR_WIDTH, INTERIOR_HEIGHT);
        // Draw exit zone
        const exit = interiors[localPlayerPresence.interiorId].exit;
        ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
        ctx.fillRect(exit.x, exit.y, exit.width, exit.height);
        ctx.fillStyle = 'white';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Exit', exit.x + exit.width / 2, exit.y + exit.height / 2 + 6);
    } else {
        ctx.drawImage(assets.background, 0, 0, WORLD_WIDTH, WORLD_HEIGHT);
         // Draw building collision boxes for debugging and entrance indicators
        buildings.forEach(building => {
            ctx.fillStyle = 'rgba(255, 0, 0, 0.0)'; // Invisible collision box
            ctx.fillRect(building.x, building.y, building.width, building.height);
            ctx.fillStyle = 'rgba(0, 255, 0, 0.3)'; // Visible entrance
            ctx.fillRect(building.entrance.x, building.entrance.y, building.entrance.width, building.entrance.height);
        });
    }

    // Draw players
    for (const clientId in room.presence) {
        const p = room.presence[clientId];
        const peer = room.peers[clientId];
        if (p && peer && p.interiorId === localPlayerPresence.interiorId) {
            // Draw player character
            ctx.drawImage(assets.player, p.x - PLAYER_SIZE / 2, p.y - PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE);
            
            // Draw username
            ctx.fillStyle = 'white';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(peer.username, p.x, p.y + PLAYER_SIZE / 2 + 15);

            // Draw avatar bubble
            const avatarImg = new Image();
            avatarImg.src = peer.avatarUrl;
            const avatarSize = 20;
            ctx.beginPath();
            ctx.arc(p.x, p.y - PLAYER_SIZE / 2 - avatarSize / 2 - 5, avatarSize / 2, 0, Math.PI * 2, true);
            ctx.closePath();
            ctx.save();
            ctx.clip();
            try {
                 ctx.drawImage(avatarImg, p.x - avatarSize / 2, p.y - PLAYER_SIZE / 2 - avatarSize - 5, avatarSize, avatarSize);
            } catch(e) {
                // Sometimes fails to draw if image not loaded, ignore
            }
            ctx.restore();
        }
    }

    ctx.restore();
    requestAnimationFrame(draw);
}

function checkCollision(x, y, rects) {
    const playerRect = { x: x - PLAYER_SIZE / 2, y: y - PLAYER_SIZE / 2, width: PLAYER_SIZE, height: PLAYER_SIZE };
    for (const rect of rects) {
        if (playerRect.x < rect.x + rect.width &&
            playerRect.x + playerRect.width > rect.x &&
            playerRect.y < rect.y + rect.height &&
            playerRect.y + playerRect.height > rect.y) {
            return rect;
        }
    }
    return null;
}

function update() {
    const localPlayerPresence = room.presence[room.clientId];
    if (!localPlayerPresence || (input.x === 0 && input.y === 0)) {
        return;
    }

    const currentX = localPlayerPresence.x;
    const currentY = localPlayerPresence.y;
    let newX = currentX + input.x * PLAYER_SPEED;
    let newY = currentY + input.y * PLAYER_SPEED;
    
    let moved = false;

    if (localPlayerPresence.interiorId) {
        // Inside a building
        newX = Math.max(PLAYER_SIZE / 2, Math.min(INTERIOR_WIDTH - PLAYER_SIZE / 2, newX));
        newY = Math.max(PLAYER_SIZE / 2, Math.min(INTERIOR_HEIGHT - PLAYER_SIZE / 2, newY));

        const exit = interiors[localPlayerPresence.interiorId].exit;
        if (checkCollision(newX, newY, [exit])) {
            const spawnPoint = interiors[localPlayerPresence.interiorId].spawn;
            playDoorSound();
            room.updatePresence({ x: spawnPoint.x, y: spawnPoint.y, interiorId: null });
            return;
        }
    } else {
        // Outside world
        newX = Math.max(PLAYER_SIZE / 2, Math.min(WORLD_WIDTH - PLAYER_SIZE / 2, newX));
        newY = Math.max(PLAYER_SIZE / 2, Math.min(WORLD_HEIGHT - PLAYER_SIZE / 2, newY));
        
        const collidingBuilding = checkCollision(newX, newY, buildings);
        if (collidingBuilding) {
            // Check if we are in the entrance zone
            const entrance = collidingBuilding.entrance;
            if (checkCollision(newX, newY, [entrance])) {
                playDoorSound();
                room.updatePresence({ x: INTERIOR_WIDTH / 2, y: INTERIOR_HEIGHT / 2, interiorId: collidingBuilding.id });
                return;
            }
            
            // Wall collision, try moving along one axis
            if (!checkCollision(newX, currentY, buildings)) {
                newY = currentY; // Allow x-axis movement
            } else if (!checkCollision(currentX, newY, buildings)) {
                newX = currentX; // Allow y-axis movement
            } else {
                newX = currentX;
                newY = currentY; // Block movement
            }
        }
    }

    if (newX !== currentX || newY !== currentY) {
        room.updatePresence({ x: newX, y: newY });
        playFootstepSound();
    }
}

function initAudio() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    loadSound('./background-music.mp3', (buffer) => {
        backgroundMusicSource = audioContext.createBufferSource();
        backgroundMusicSource.buffer = buffer;
        backgroundMusicSource.loop = true;
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0.3; // Lower volume
        backgroundMusicSource.connect(gainNode);
        gainNode.connect(audioContext.destination);
        backgroundMusicSource.start(0);
    });
    loadSound('./footstep.mp3', (buffer) => {
        footstepSoundBuffer = buffer;
    });
    loadSound('./door-open.mp3', (buffer) => {
        doorSoundBuffer = buffer;
    });
}

function loadSound(url, callback) {
    fetch(url)
        .then(response => response.arrayBuffer())
        .then(data => audioContext.decodeAudioData(data, callback))
        .catch(error => console.error(`Error loading sound: ${url}`, error));
}

function playFootstepSound() {
    if (!footstepSoundBuffer || !audioContext) return;
    const now = Date.now();
    if (now - lastFootstepTime < FOOTSTEP_INTERVAL) return;
    lastFootstepTime = now;

    const source = audioContext.createBufferSource();
    source.buffer = footstepSoundBuffer;
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 0.5;
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    source.start(0);
}

function playDoorSound() {
    if (!doorSoundBuffer || !audioContext) return;
    const source = audioContext.createBufferSource();
    source.buffer = doorSoundBuffer;
    source.connect(audioContext.destination);
    source.start(0);
}

async function init() {
    await room.initialize();
    
    room.updatePresence({
        x: Math.random() * 500 + 500,
        y: Math.random() * 500 + 500,
        interiorId: null,
    });
    
    // Keyboard controls
    window.addEventListener('keydown', (e) => {
        switch (e.key) {
            case 'w':
            case 'ArrowUp':
                input.y = -1;
                break;
            case 's':
            case 'ArrowDown':
                input.y = 1;
                break;
            case 'a':
            case 'ArrowLeft':
                input.x = -1;
                break;
            case 'd':
            case 'ArrowRight':
                input.x = 1;
                break;
        }
    });

    window.addEventListener('keyup', (e) => {
        switch (e.key) {
            case 'w':
            case 'ArrowUp':
            case 's':
            case 'ArrowDown':
                input.y = 0;
                break;
            case 'a':
            case 'ArrowLeft':
            case 'd':
            case 'ArrowRight':
                input.x = 0;
                break;
        }
    });

    // Mobile controls
    if ('ontouchstart' in window) {
        const joystickZone = document.getElementById('joystick-zone');
        const joystick = nipplejs.create({
            zone: joystickZone,
            mode: 'static',
            position: { left: '50%', top: '50%' },
            color: 'white',
            size: 150
        });

        joystick.on('move', (evt, data) => {
            if (data.angle) {
                input.x = Math.cos(data.angle.radian);
                input.y = -Math.sin(data.angle.radian);
            }
        });

        joystick.on('end', () => {
            input.x = 0;
            input.y = 0;
        });
    }

    setInterval(update, 1000 / 60); // 60fps update loop
    draw();
}

startButton.addEventListener('click', () => {
    startScreen.style.display = 'none';
    initAudio();
    init();
});