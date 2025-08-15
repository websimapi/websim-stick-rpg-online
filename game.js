const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const startScreen = document.getElementById('start-screen');
const startButton = document.getElementById('start-button');

let audioContext;
let backgroundMusicSource;
let footstepSoundBuffer;

const room = new WebsimSocket();

const PLAYER_SPEED = 3;
const PLAYER_SIZE = 40;

const assets = {
    player: new Image(),
    background: new Image(),
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
    ctx.drawImage(assets.background, 0, 0, 2000, 2000);

    // Draw players
    for (const clientId in room.presence) {
        const p = room.presence[clientId];
        const peer = room.peers[clientId];
        if (p && peer) {
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

function update() {
    const localPlayerPresence = room.presence[room.clientId];
    if (!localPlayerPresence || (input.x === 0 && input.y === 0)) {
        return;
    }
    
    const newX = Math.max(0, Math.min(2000, localPlayerPresence.x + input.x * PLAYER_SPEED));
    const newY = Math.max(0, Math.min(2000, localPlayerPresence.y + input.y * PLAYER_SPEED));
    
    if (newX !== localPlayerPresence.x || newY !== localPlayerPresence.y) {
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

async function init() {
    await room.initialize();
    
    room.updatePresence({
        x: Math.random() * 500 + 500,
        y: Math.random() * 500 + 500,
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

