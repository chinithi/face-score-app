// --- State Variables ---
let appState = {
    currentSection: 'sectionHome',
    stream: null,
    imageSource: null, // 'camera' or 'file'
    uploadedImage: null, // HTMLImageElement
    isScanning: false,
    scanProgress: 0,
    scanTimer: null,
    radarChartInstance: null,
    facingMode: 'user', // 'user' (front) or 'environment' (back)
    
    // Landmark Coordinates (relative to viewport width/height)
    landmarks: {
        center: { x: 0.5, y: 0.48 },
        width: 0.55,
        height: 0.60,
        points: []
    },
    
    // Diagnostic Results
    results: {
        score: 0,
        symmetry: 0,
        goldenRatio: 0,
        eyes: 0,
        nose: 0,
        mouth: 0,
        contour: 0,
        faceType: '',
        grade: ''
    }
};

// --- DOM Elements ---
const sections = {
    home: document.getElementById('sectionHome'),
    scanner: document.getElementById('sectionScanner'),
    result: document.getElementById('sectionResult')
};

const systemStatus = document.getElementById('systemStatus');
const webcamVideo = document.getElementById('webcamVideo');
const scannerCanvas = document.getElementById('scannerCanvas');
const laserBar = document.getElementById('laserBar');
const terminalLogs = document.getElementById('terminalLogs');
const faceGuideOval = document.querySelector('.face-guide-oval');

// Inputs
const imageInput = document.getElementById('imageInput');

// Buttons
const btnStartCamera = document.getElementById('btnStartCamera');
const btnStartUpload = document.getElementById('btnStartUpload');
const btnTriggerScan = document.getElementById('btnTriggerScan');
const btnCancelScan = document.getElementById('btnCancelScan');
const btnSaveCard = document.getElementById('btnSaveCard');
const btnRestart = document.getElementById('btnRestart');
const btnSwitchCamera = document.getElementById('btnSwitchCamera');

// Results elements
const scoreNumber = document.getElementById('scoreNumber');
const faceTypeBadge = document.getElementById('faceTypeBadge');
const resultGrade = document.getElementById('resultGrade');
const snapshotCanvas = document.getElementById('snapshotCanvas');

// Progress bars
const barSymmetry = document.getElementById('barSymmetry');
const barGolden = document.getElementById('barGolden');
const barEyes = document.getElementById('barEyes');
const barNose = document.getElementById('barNose');
const barMouth = document.getElementById('barMouth');
const barContour = document.getElementById('barContour');

const valSymmetry = document.getElementById('valSymmetry');
const valGolden = document.getElementById('valGolden');
const valEyes = document.getElementById('valEyes');
const valNose = document.getElementById('valNose');
const valMouth = document.getElementById('valMouth');
const valContour = document.getElementById('valContour');

// Advice
const adviceSummaryTitle = document.getElementById('adviceSummaryTitle');
const adviceSummaryText = document.getElementById('adviceSummaryText');
const adviceHair = document.getElementById('adviceHair');
const adviceEyebrows = document.getElementById('adviceEyebrows');
const adviceAccessories = document.getElementById('adviceAccessories');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    setupCanvasResizing();
});

// --- Event Listeners Setup ---
function initEventListeners() {
    // Welcome actions
    btnStartCamera.addEventListener('click', startWebcamMode);
    btnStartUpload.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', handleFileUpload);
    
    // Scanner actions
    btnTriggerScan.addEventListener('click', startScanningProcess);
    btnCancelScan.addEventListener('click', cancelScannerMode);
    btnSwitchCamera.addEventListener('click', toggleCameraFacingMode);
    
    // Result actions
    btnRestart.addEventListener('click', resetToHome);
    btnSaveCard.addEventListener('click', generateCertificateCard);
    
    // Tabs Navigation
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetTab = e.currentTarget.getAttribute('data-tab');
            
            // Toggle active class on buttons
            tabButtons.forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            
            // Toggle active class on contents
            const tabContents = document.querySelectorAll('.tab-content');
            tabContents.forEach(content => {
                if (content.id === targetTab) {
                    content.classList.add('active');
                } else {
                    content.classList.remove('active');
                }
            });
        });
    });
}

// Ensure overlay canvas matches its container size on window resize
function setupCanvasResizing() {
    const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
            const width = entry.contentRect.width;
            const height = entry.contentRect.height;
            scannerCanvas.width = width;
            scannerCanvas.height = height;
        }
    });
    resizeObserver.observe(scannerCanvas.parentElement);
}

// --- Navigation Controller ---
function switchSection(sectionId) {
    Object.keys(sections).forEach(key => {
        const sec = sections[key];
        if (sec.id === sectionId) {
            sec.classList.add('active');
        } else {
            sec.classList.remove('active');
        }
    });
    appState.currentSection = sectionId;
}

// --- Terminal Logs Utility ---
function addTerminalLog(message, type = '') {
    const time = new Date().toLocaleTimeString('ja-JP', { hour12: false });
    const line = document.createElement('div');
    line.className = 'log-line';
    
    if (type === 'muted') line.classList.add('text-muted');
    if (type === 'cyan') line.classList.add('text-cyan');
    if (type === 'pink') line.classList.add('text-pink');
    if (type === 'success') line.classList.add('text-success');
    
    line.innerHTML = `<span class="text-muted">[${time}]</span> ${message}`;
    terminalLogs.appendChild(line);
    terminalLogs.scrollTop = terminalLogs.scrollHeight;
}

// --- Webcam Mode Controller ---
async function startWebcamMode() {
    appState.imageSource = 'camera';
    appState.uploadedImage = null;
    switchSection('sectionScanner');
    
    // Show face guide oval and switch camera button
    faceGuideOval.style.display = 'flex';
    btnSwitchCamera.style.display = 'flex';
    
    terminalLogs.innerHTML = '';
    addTerminalLog('Initializing system components...', 'muted');
    addTerminalLog('Requesting webcam access...', 'cyan');
    systemStatus.textContent = 'SYSTEM: WEBCAM INIT';
    systemStatus.style.color = 'var(--accent-cyan)';
    document.querySelector('.status-indicator-dot').style.backgroundColor = 'var(--accent-cyan)';
    document.querySelector('.status-indicator-dot').style.boxShadow = 'var(--glow-cyan)';
    
    try {
        // Toggle video mirroring classes dynamically
        if (appState.facingMode === 'user') {
            webcamVideo.classList.add('mirror');
        } else {
            webcamVideo.classList.remove('mirror');
        }
        
        appState.stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: appState.facingMode
            },
            audio: false
        });
        
        webcamVideo.srcObject = appState.stream;
        webcamVideo.style.display = 'block';
        addTerminalLog(`Webcam stream active (${appState.facingMode === 'user' ? 'インカメラ' : 'アウトカメラ'}).`, 'success');
        addTerminalLog('Position your face inside the overlay guide.', 'cyan');
        
        btnTriggerScan.classList.remove('disabled');
        
        // Start drawing tracking overlays
        requestAnimationFrame(trackingLoop);
        
    } catch (err) {
        console.error("Camera access failed: ", err);
        addTerminalLog('ERROR: Webcam access denied or unavailable.', 'pink');
        addTerminalLog('Please allow camera permissions or try photo upload.', 'muted');
    }
}

// --- File Upload Controller ---
function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    appState.imageSource = 'file';
    
    // Stop camera stream if active
    stopCameraStream();
    
    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            appState.uploadedImage = img;
            switchSection('sectionScanner');
            
            // Hide camera, show custom image placeholder
            webcamVideo.style.display = 'none';
            faceGuideOval.style.display = 'flex';
            
            terminalLogs.innerHTML = '';
            addTerminalLog(`Image loaded: ${file.name} (${img.width}x${img.height})`, 'success');
            addTerminalLog('Facial structure ready for mapping.', 'cyan');
            
            btnTriggerScan.classList.remove('disabled');
            
            // Redraw image and static coordinates
            requestAnimationFrame(trackingLoop);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

// --- Stop Camera Stream ---
function stopCameraStream() {
    if (appState.stream) {
        appState.stream.getTracks().forEach(track => track.stop());
        appState.stream = null;
    }
    webcamVideo.srcObject = null;
}

// --- Cancel Scanner ---
function cancelScannerMode() {
    stopCameraStream();
    switchSection('sectionHome');
    
    // Hide controls
    btnSwitchCamera.style.display = 'none';
    
    // Reset indicators
    systemStatus.textContent = 'SYSTEM: ACTIVE';
    systemStatus.style.color = '#00ff66';
    document.querySelector('.status-indicator-dot').style.backgroundColor = '#00ff66';
    document.querySelector('.status-indicator-dot').style.boxShadow = '0 0 8px #00ff66';
    
    // Clear input
    imageInput.value = '';
}

// --- Reset to Home ---
function resetToHome() {
    cancelScannerMode();
}

// --- HUD Facial Tracking Loop ---
function trackingLoop() {
    if (appState.currentSection !== 'sectionScanner') return;
    
    const ctx = scannerCanvas.getContext('2d');
    const w = scannerCanvas.width;
    const h = scannerCanvas.height;
    
    ctx.clearRect(0, 0, w, h);
    
    // If upload mode, draw image centered and styled
    if (appState.imageSource === 'file' && appState.uploadedImage) {
        // Draw image keeping ratio inside canvas
        const img = appState.uploadedImage;
        const imgRatio = img.width / img.height;
        const canvasRatio = w / h;
        let drawW, drawH, drawX, drawY;
        
        if (imgRatio > canvasRatio) {
            drawW = w;
            drawH = w / imgRatio;
            drawX = 0;
            drawY = (h - drawH) / 2;
        } else {
            drawH = h;
            drawW = h * imgRatio;
            drawX = (w - drawW) / 2;
            drawY = 0;
        }
        
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
    }
    
    // Generate/Update tracking landmarks
    updateTrackingCoordinates(w, h);
    
    // Draw landmarks HUD
    drawFacialHUD(ctx, w, h);
    
    // Keep looping unless scanning is active and complete
    if (!appState.isScanning || appState.scanProgress < 100) {
        requestAnimationFrame(trackingLoop);
    }
}

// Calculate face landmark points (simulated to fit the face guide oval)
function updateTrackingCoordinates(w, h) {
    // Face box bounds based on guide oval relative offsets
    // Oval top is 15%, height 70%, left 20%, width 60%
    const cx = w * appState.landmarks.center.x;
    const cy = h * appState.landmarks.center.y;
    const fw = w * appState.landmarks.width;
    const fh = h * appState.landmarks.height;
    
    // Jitter coordinates slightly when NOT scanning to simulate live neural search
    const jitterMax = appState.isScanning ? 0 : 2;
    const jitter = () => (Math.random() - 0.5) * jitterMax;
    
    // Defining base positions
    const points = {
        leftEye:   { x: cx - fw * 0.28 + jitter(), y: cy - fh * 0.12 + jitter() },
        rightEye:  { x: cx + fw * 0.28 + jitter(), y: cy - fh * 0.12 + jitter() },
        noseTop:   { x: cx + jitter(),              y: cy - fh * 0.12 + jitter() },
        noseTip:   { x: cx + jitter(),              y: cy + fh * 0.05 + jitter() },
        noseLeft:  { x: cx - fw * 0.10 + jitter(),  y: cy + fh * 0.05 + jitter() },
        noseRight: { x: cx + fw * 0.10 + jitter(),  y: cy + fh * 0.05 + jitter() },
        mouthL:    { x: cx - fw * 0.22 + jitter(),  y: cy + fh * 0.22 + jitter() },
        mouthR:    { x: cx + fw * 0.22 + jitter(),  y: cy + fh * 0.22 + jitter() },
        lipTop:    { x: cx + jitter(),              y: cy + fh * 0.18 + jitter() },
        lipBot:    { x: cx + jitter(),              y: cy + fh * 0.26 + jitter() },
        jawTL:     { x: cx - fw * 0.44 + jitter(),  y: cy - fh * 0.10 + jitter() },
        jawL:      { x: cx - fw * 0.38 + jitter(),  y: cy + fh * 0.15 + jitter() },
        chin:      { x: cx + jitter(),              y: cy + fh * 0.42 + jitter() },
        jawR:      { x: cx + fw * 0.38 + jitter(),  y: cy + fh * 0.15 + jitter() },
        jawTR:     { x: cx + fw * 0.44 + jitter(),  y: cy - fh * 0.10 + jitter() }
    };
    
    appState.landmarks.points = points;
}

// Draw futuristic vector lines and text overlays on landmarks
function drawFacialHUD(ctx, w, h) {
    const pts = appState.landmarks.points;
    if (!pts || Object.keys(pts).length === 0) return;
    
    // Choose styling color based on state
    const colorTheme = appState.isScanning ? 'rgba(255, 0, 127, 0.75)' : 'rgba(0, 242, 254, 0.6)';
    const colorDot = appState.isScanning ? '#ff007f' : '#00f2fe';
    const fillPoly = appState.isScanning ? 'rgba(255, 0, 127, 0.04)' : 'rgba(0, 242, 254, 0.02)';
    
    // 1. Draw connecting mesh lines
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = colorTheme;
    ctx.fillStyle = fillPoly;
    
    // Face contour polygon
    ctx.beginPath();
    ctx.moveTo(pts.jawTL.x, pts.jawTL.y);
    ctx.lineTo(pts.jawL.x, pts.jawL.y);
    ctx.quadraticCurveTo(pts.jawL.x + (pts.chin.x - pts.jawL.x)*0.3, pts.chin.y - 10, pts.chin.x, pts.chin.y);
    ctx.quadraticCurveTo(pts.jawR.x - (pts.jawR.x - pts.chin.x)*0.3, pts.chin.y - 10, pts.jawR.x, pts.jawR.y);
    ctx.lineTo(pts.jawTR.x, pts.jawTR.y);
    ctx.stroke();
    
    // Eye bridge triangle
    ctx.beginPath();
    ctx.moveTo(pts.leftEye.x, pts.leftEye.y);
    ctx.lineTo(pts.rightEye.x, pts.rightEye.y);
    ctx.lineTo(pts.noseTip.x, pts.noseTip.y);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    
    // Nose triangle
    ctx.beginPath();
    ctx.moveTo(pts.noseTop.x, pts.noseTop.y);
    ctx.lineTo(pts.noseLeft.x, pts.noseLeft.y);
    ctx.lineTo(pts.noseRight.x, pts.noseRight.y);
    ctx.closePath();
    ctx.stroke();
    
    // Mouth contour
    ctx.beginPath();
    ctx.moveTo(pts.mouthL.x, pts.mouthL.y);
    ctx.quadraticCurveTo(pts.lipTop.x, pts.lipTop.y - 2, pts.mouthR.x, pts.mouthR.y);
    ctx.quadraticCurveTo(pts.lipBot.x, pts.lipBot.y + 2, pts.mouthL.x, pts.mouthL.y);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    
    // Symmetry connecting lines
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = appState.isScanning ? 'rgba(255, 0, 127, 0.4)' : 'rgba(255, 255, 255, 0.2)';
    
    // Vertical center line
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.1);
    ctx.lineTo(w * 0.5, h * 0.9);
    ctx.stroke();
    
    // Horizontal alignment line (eyes)
    ctx.beginPath();
    ctx.moveTo(pts.leftEye.x - 30, pts.leftEye.y);
    ctx.lineTo(pts.rightEye.x + 30, pts.rightEye.y);
    ctx.stroke();
    ctx.setLineDash([]); // Reset
    
    // 2. Draw tracker boxes & coordinate indicators
    Object.keys(pts).forEach(key => {
        const pt = pts[key];
        
        // Draw coordinate dot
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = colorDot;
        ctx.fill();
        
        // Custom tracker visual for eyes
        if (key === 'leftEye' || key === 'rightEye') {
            ctx.strokeStyle = colorDot;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 9, 0, Math.PI * 2);
            ctx.stroke();
        }
    });
    
    // 3. UI/HUD Data labels
    if (appState.isScanning) {
        ctx.fillStyle = 'var(--accent-pink)';
        ctx.font = '8px "Orbitron", monospace';
        ctx.fillText(`L_EYE: [${Math.round(pts.leftEye.x)}, ${Math.round(pts.leftEye.y)}]`, pts.leftEye.x - 45, pts.leftEye.y - 15);
        ctx.fillText(`R_EYE: [${Math.round(pts.rightEye.x)}, ${Math.round(pts.rightEye.y)}]`, pts.rightEye.x - 45, pts.rightEye.y - 15);
        ctx.fillText(`NOSE_TIP: [${Math.round(pts.noseTip.x)}, ${Math.round(pts.noseTip.y)}]`, pts.noseTip.x + 10, pts.noseTip.y + 3);
        ctx.fillText(`CHIN: [${Math.round(pts.chin.x)}, ${Math.round(pts.chin.y)}]`, pts.chin.x - 25, pts.chin.y + 15);
    }
}

// --- Start Scanning Simulation ---
function startScanningProcess() {
    if (appState.isScanning) return;
    
    appState.isScanning = true;
    appState.scanProgress = 0;
    
    // Disable scan buttons, adjust system status
    btnTriggerScan.classList.add('disabled');
    btnCancelScan.classList.add('disabled');
    
    faceGuideOval.classList.add('scanning');
    faceGuideOval.querySelector('.guide-text').textContent = 'ANALYZE IN PROGRESS...';
    
    laserBar.classList.add('active');
    if (appState.imageSource === 'camera') {
        laserBar.classList.add('pink');
    }
    
    systemStatus.textContent = 'SYSTEM: SCANNING';
    systemStatus.style.color = 'var(--accent-pink)';
    document.querySelector('.status-indicator-dot').style.backgroundColor = 'var(--accent-pink)';
    document.querySelector('.status-indicator-dot').style.boxShadow = 'var(--glow-pink)';
    
    // Start step-by-step logs and ticker
    runScanningAnimationSequence();
}

// Sequence timeline for futuristic scanning experience
function runScanningAnimationSequence() {
    const totalDuration = 3200; // 3.2 seconds
    const intervalTime = 100;
    const steps = totalDuration / intervalTime;
    let currentStep = 0;
    
    const logsSequence = [
        { time: 100, text: 'Initializing Neural Mesh Engine v2.4...', type: 'muted' },
        { time: 400, text: 'Locating face box boundaries...', type: 'cyan' },
        { time: 800, text: 'Mapping facial asymmetry index (X-plane)...', type: 'cyan' },
        { time: 1200, text: 'Applying Golden Ratio filter masks...', type: 'cyan' },
        { time: 1600, text: 'Extracting landmark coordinates for eyes, nose, lips...', type: 'cyan' },
        { time: 2000, text: 'Evaluating jawline contours & angles...', type: 'cyan' },
        { time: 2400, text: 'Generating statistical deviation score metrics...', type: 'pink' },
        { time: 2800, text: 'Finalizing diagnosis certificates...', type: 'success' }
    ];
    
    appState.scanTimer = setInterval(() => {
        currentStep++;
        appState.scanProgress = (currentStep / steps) * 100;
        
        // Output log triggers
        const elapsed = currentStep * intervalTime;
        logsSequence.forEach(log => {
            if (elapsed === log.time) {
                addTerminalLog(log.text, log.type);
            }
        });
        
        // Scan completes
        if (currentStep >= steps) {
            clearInterval(appState.scanTimer);
            finalizeScanResults();
        }
    }, intervalTime);
}

// --- Finalize Scan and Compute Scores ---
function finalizeScanResults() {
    // Generate deterministic values based on image pixel details if uploaded, or standard randomized seed
    let seed = Math.random();
    
    if (appState.imageSource === 'file' && appState.uploadedImage) {
        // Calculate stable seed from image characteristics (width, height)
        const img = appState.uploadedImage;
        const simpleHash = (img.width * img.height) % 1000;
        seed = simpleHash / 1000;
    }
    
    // Deterministic ranges
    // Score (顔偏差値): normally distributed around 55 - 75 for attractive UI. Let's make it range from 48.0 to 76.5
    const baseScore = 48 + (seed * 26.5);
    appState.results.score = Math.round(baseScore * 10) / 10;
    
    // Metrics 50 - 98
    appState.results.symmetry = Math.round(65 + (seed * 31));
    appState.results.goldenRatio = Math.round(62 + ((1 - seed) * 35));
    appState.results.eyes = Math.round(58 + (Math.sin(seed * Math.PI) * 38));
    appState.results.nose = Math.round(55 + (Math.cos(seed * Math.PI/2) * 40));
    const mouthSeed = (seed * 7) % 1;
    appState.results.mouth = Math.round(60 + (mouthSeed * 35));
    const contourSeed = (seed * 13) % 1;
    appState.results.contour = Math.round(58 + (contourSeed * 37));
    
    // Grade based on score
    if (appState.results.score >= 72) {
        appState.results.grade = 'GRADE: S+';
        appState.results.faceType = '黄金比率ロイヤル美形タイプ';
    } else if (appState.results.score >= 66) {
        appState.results.grade = 'GRADE: S';
        appState.results.faceType = '知的エレガントクールタイプ';
    } else if (appState.results.score >= 60) {
        appState.results.grade = 'GRADE: A+';
        appState.results.faceType = '王道バランス美形タイプ';
    } else if (appState.results.score >= 54) {
        appState.results.grade = 'GRADE: A';
        appState.results.faceType = '爽やかフレッシュタイプ';
    } else if (appState.results.score >= 48) {
        appState.results.grade = 'GRADE: B+';
        appState.results.faceType = '愛され親しみタイプ';
    } else {
        appState.results.grade = 'GRADE: B';
        appState.results.faceType = '個性派ユニークタイプ';
    }
    
    // Generate Advice recommendations based on scores
    generateAdviceText();
    
    // Copy scan state on snapshot canvas
    captureScanSnapshot();
    
    // Clean states
    stopCameraStream();
    appState.isScanning = false;
    btnSwitchCamera.style.display = 'none';
    laserBar.classList.remove('active', 'pink');
    faceGuideOval.classList.remove('scanning');
    btnTriggerScan.classList.remove('disabled');
    btnCancelScan.classList.remove('disabled');
    
    // Reset header status
    systemStatus.textContent = 'SYSTEM: ACTIVE';
    systemStatus.style.color = '#00ff66';
    document.querySelector('.status-indicator-dot').style.backgroundColor = '#00ff66';
    document.querySelector('.status-indicator-dot').style.boxShadow = '0 0 8px #00ff66';
    
    // Move to results section
    switchSection('sectionResult');
    
    // Trigger result screen visual animations (counting scores and loading charts)
    animateResultPage();
}

// Generate styled diagnostic descriptions
function generateAdviceText() {
    const res = appState.results;
    
    // Detailed analysis paragraph
    let summaryText = `顔パーツの配置を精密測定した結果、総合評価【顔偏差値 ${res.score}】の【${res.faceType}】に分類されます。`;
    
    if (res.symmetry > 80 && res.goldenRatio > 80) {
        summaryText += " 左右の対称性が極めて高く、全体のパーツ配置が黄金比率とほぼ一致しています。これはどの角度から見ても立体感があり、写真映えしやすい骨格であることを表しています。";
    } else if (res.symmetry > 75) {
        summaryText += " 左右対称性に優れたバランスが特徴的です。目元の比率と口元のラインが水平に揃っており、他者に安心感と知的な印象を同時に与える美しい骨格バランスです。";
    } else {
        summaryText += " 個性的でパーツそれぞれの独立した特徴が際立つ顔立ちです。パーツの大きさやラインに動きがあるため、ヘアスタイルやアイウェアの工夫次第で様々な表情を引き出せる魅力を持っています。";
    }
    
    adviceSummaryText.textContent = summaryText;
    
    // Haircut tips
    let hairTip = "";
    if (res.contour > 80) {
        hairTip = "フェイスラインが非常に整っているため、額を出したアップバングや、マッシュヘアで輪郭をシャープに見せるスタイルが非常に似合います。耳周りをすっきり出すことで清潔感が倍増します。";
    } else {
        hairTip = "少しサイドや前髪にボリューム感や毛流れを持たせることで、輪郭の個性をカバーしつつ、知的な雰囲気を出すスタイリング（センターパートやニュアンスパーマ等）がおすすめです。";
    }
    adviceHair.textContent = hairTip;
    
    // Eyebrow tips
    let eyebrowTip = "";
    if (res.eyes > 75) {
        eyebrowTip = "綺麗な目の比率に合わせて、眉は角度を付けすぎず、眉山をなだらかにした直線〜並行眉がベスト。眉尻を少しシャープに描くことで、目元の印象がさらにキリッと引き締まります。";
    } else {
        eyebrowTip = "目元の個性を引き立たせるため、自眉を活かしたやや太めの眉カットがおすすめ。眉間を少し広めに取ることで、優しく温かみのあるフレンドリーな表情を演出できます。";
    }
    adviceEyebrows.textContent = eyebrowTip;
    
    // Accessory tips
    let accTip = "";
    if (res.nose > 80) {
        accTip = "鼻筋が非常にすっきり通っているため、メタルフレームや細身のウェリントン型メガネが綺麗に収まります。シルバー系のアクセサリーがシャープさを際立たせます。";
    } else {
        accTip = "丸みを帯びたボストン型やクラウンパント型のメガネを掛けることで、目元の優しさとバランス良く調和し、ハイセンスで知的なファッション感度を表現できます。";
    }
    adviceAccessories.textContent = accTip;
}

// Copy the viewport view with active drawing overlays onto the preview snapshot canvas
function captureScanSnapshot() {
    const snapCtx = snapshotCanvas.getContext('2d');
    snapshotCanvas.width = scannerCanvas.width;
    snapshotCanvas.height = scannerCanvas.height;
    
    // Draw what is on scanner canvas
    snapCtx.drawImage(scannerCanvas, 0, 0);
}

// --- Animate Result Page ---
function animateResultPage() {
    // 1. Reset numbers
    scoreNumber.textContent = '30.0';
    
    // 2. Count up score
    const targetScore = appState.results.score;
    const duration = 1200; // 1.2s countup
    const startTime = performance.now();
    
    function updateScore(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing out easeOutQuad
        const easeProgress = progress * (2 - progress);
        const currentVal = 30 + easeProgress * (targetScore - 30);
        
        scoreNumber.textContent = (Math.round(currentVal * 10) / 10).toFixed(1);
        
        if (progress < 1) {
            requestAnimationFrame(updateScore);
        } else {
            scoreNumber.textContent = targetScore.toFixed(1);
        }
    }
    requestAnimationFrame(updateScore);
    
    // 3. Set badging
    faceTypeBadge.textContent = appState.results.faceType;
    resultGrade.textContent = appState.results.grade;
    
    // 4. Animate side stats progress bars
    const res = appState.results;
    
    animateSingleProgressBar(barSymmetry, valSymmetry, res.symmetry);
    animateSingleProgressBar(barGolden, valGolden, res.goldenRatio);
    animateSingleProgressBar(barEyes, valEyes, res.eyes);
    animateSingleProgressBar(barNose, valNose, res.nose);
    animateSingleProgressBar(barMouth, valMouth, res.mouth);
    animateSingleProgressBar(barContour, valContour, res.contour);
    
    // 5. Draw radar chart
    drawRadarChart();
}

function animateSingleProgressBar(barEl, valEl, targetVal) {
    barEl.style.width = '0%';
    valEl.textContent = '0%';
    
    setTimeout(() => {
        barEl.style.width = `${targetVal}%`;
        
        // Ticker for progress bar value label
        let current = 0;
        const interval = setInterval(() => {
            current += 2;
            if (current >= targetVal) {
                current = targetVal;
                clearInterval(interval);
            }
            valEl.textContent = `${current}%`;
        }, 15);
    }, 100);
}

// --- Draw Radar Chart with Chart.js ---
function drawRadarChart() {
    // Destroy previous chart if exists
    if (appState.radarChartInstance) {
        appState.radarChartInstance.destroy();
    }
    
    const ctx = document.getElementById('radarChart').getContext('2d');
    const res = appState.results;
    
    appState.radarChartInstance = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['対称性', '黄金比率', '目元', '鼻筋', '口元', '輪郭'],
            datasets: [{
                label: '顔パーツ骨格スコア',
                data: [res.symmetry, res.goldenRatio, res.eyes, res.nose, res.mouth, res.contour],
                backgroundColor: 'rgba(0, 242, 254, 0.15)',
                borderColor: 'rgba(0, 242, 254, 0.85)',
                borderWidth: 1.5,
                pointBackgroundColor: 'var(--accent-pink)',
                pointBorderColor: '#fff',
                pointBorderWidth: 1.5,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false // Hide legend
                }
            },
            scales: {
                r: {
                    angleLines: {
                        color: 'rgba(255, 255, 255, 0.08)'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.08)'
                    },
                    pointLabels: {
                        color: 'var(--text-secondary)',
                        font: {
                            family: 'Noto Sans JP',
                            size: 10,
                            weight: 'bold'
                        }
                    },
                    ticks: {
                        display: false,
                        maxTicksLimit: 5
                    },
                    suggestedMin: 30,
                    suggestedMax: 100
                }
            }
        }
    });
}

// --- Generate Downloadable Certificate Card (Canvas Export) ---
function generateCertificateCard() {
    // Create temporary offscreen canvas
    const cardCanvas = document.createElement('canvas');
    cardCanvas.width = 800;
    cardCanvas.height = 1000;
    const ctx = cardCanvas.getContext('2d');
    
    // Draw background
    ctx.fillStyle = '#07080d';
    ctx.fillRect(0, 0, cardCanvas.width, cardCanvas.height);
    
    // Draw futuristic neon background grid patterns
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.015)';
    ctx.lineWidth = 1;
    for (let x = 0; x < cardCanvas.width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, cardCanvas.height);
        ctx.stroke();
    }
    for (let y = 0; y < cardCanvas.height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(cardCanvas.width, y);
        ctx.stroke();
    }
    
    // Draw decorative border frame
    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 30, cardCanvas.width - 60, cardCanvas.height - 60);
    
    // Outer secondary border
    ctx.strokeStyle = 'rgba(157, 78, 221, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(40, 40, cardCanvas.width - 80, cardCanvas.height - 80);
    
    // Title text
    ctx.font = 'bold 24px "Orbitron"';
    ctx.fillStyle = 'rgba(0, 242, 254, 0.85)';
    ctx.textAlign = 'center';
    ctx.fillText('AI FACIAL DIAGNOSTIC CERTIFICATE', cardCanvas.width / 2, 90);
    
    ctx.font = 'bold 12px "Orbitron"';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillText('NEURAL SPECTRUM FACIAL GEOMETRY MAP', cardCanvas.width / 2, 115);
    
    // Divider line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.moveTo(80, 140);
    ctx.lineTo(cardCanvas.width - 80, 140);
    ctx.stroke();
    
    // Draw User Image Snapshot in frame
    const userImg = snapshotCanvas; // Holds user snapshot
    const frameW = 440;
    const frameH = 330;
    const frameX = (cardCanvas.width - frameW) / 2;
    const frameY = 170;
    
    ctx.fillStyle = '#000';
    ctx.fillRect(frameX, frameY, frameW, frameH);
    ctx.drawImage(userImg, frameX, frameY, frameW, frameH);
    
    // Draw snapshot frame border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.strokeRect(frameX, frameY, frameW, frameH);
    
    // Draw Face Type Badge
    ctx.fillStyle = 'rgba(0, 242, 254, 0.08)';
    ctx.fillRect(cardCanvas.width/2 - 150, 530, 300, 38);
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cardCanvas.width/2 - 150, 530, 300, 38);
    
    ctx.font = 'bold 15px "Noto Sans JP"';
    ctx.fillStyle = '#00f2fe';
    ctx.fillText(appState.results.faceType, cardCanvas.width/2, 554);
    
    // Draw Large Score Block
    ctx.font = 'bold 14px "Noto Sans JP"';
    ctx.fillStyle = '#909bb0';
    ctx.fillText('顔 偏 差 値 (SCORE)', cardCanvas.width/2, 620);
    
    ctx.font = 'bold 96px "Orbitron"';
    // Draw neon score glow
    ctx.shadowColor = 'rgba(0, 242, 254, 0.6)';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(appState.results.score.toFixed(1), cardCanvas.width/2, 715);
    ctx.shadowBlur = 0; // Reset shadow
    
    // Draw Grade
    ctx.font = 'bold 18px "Orbitron"';
    ctx.fillStyle = '#ff007f';
    ctx.fillText(appState.results.grade, cardCanvas.width/2, 755);
    
    // Draw sub stats boxes
    const statsXLeft = 100;
    const statsXRight = 450;
    const statsYStart = 800;
    const rowH = 45;
    
    ctx.textAlign = 'left';
    ctx.font = 'bold 13px "Noto Sans JP"';
    ctx.fillStyle = '#909bb0';
    
    const res = appState.results;
    
    // Col 1
    ctx.fillText(`左右対称性:  ${res.symmetry}%`, statsXLeft, statsYStart);
    ctx.fillText(`黄金比率:    ${res.goldenRatio}%`, statsXLeft, statsYStart + rowH);
    ctx.fillText(`目元比率:    ${res.eyes}%`, statsXLeft, statsYStart + rowH * 2);
    
    // Col 2
    ctx.fillText(`鼻すじ角度:  ${res.nose}%`, statsXRight, statsYStart);
    ctx.fillText(`口元バランス: ${res.mouth}%`, statsXRight, statsYStart + rowH);
    ctx.fillText(`輪郭ライン:  ${res.contour}%`, statsXRight, statsYStart + rowH * 2);
    
    // Draw watermark info footer
    ctx.textAlign = 'center';
    ctx.font = '9px "Orbitron"';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillText('ALL FACIAL SCAN PROTOCOLS COMPLETED LOCALLY ON DEVICE // NO DATA EXPORTED', cardCanvas.width/2, 955);
    
    // Trigger download
    const dataUrl = cardCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `AI-Facial-Analysis-Score-${res.score}.png`;
    link.href = dataUrl;
    link.click();
    
    addTerminalLog('Report certificate card successfully exported and downloaded.', 'success');
}

// --- Toggle Camera Orientation ---
function toggleCameraFacingMode() {
    if (appState.isScanning) return; // Prevent switching mid-scan
    
    appState.facingMode = (appState.facingMode === 'user') ? 'environment' : 'user';
    addTerminalLog(`カメラを切替中 (${appState.facingMode === 'user' ? 'インカメラ' : 'アウトカメラ'})...`, 'cyan');
    
    stopCameraStream();
    startWebcamMode();
}
