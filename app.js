// ==========================================
// --- アプリケーションの状態管理 (State) ---
// ==========================================
let appState = {
    currentSection: 'sectionHome', // 現在表示中の画面ID ('sectionHome', 'sectionScanner', 'sectionResult')
    stream: null,                 // カメラのMediaStreamオブジェクト (停止用)
    imageSource: null,            // 画像のソースタイプ ('camera' または 'file')
    uploadedImage: null,          // アップロードされた画像オブジェクト (HTMLImageElement)
    isScanning: false,            // 現在スキャン（解析）演出が実行中かどうか
    scanProgress: 0,              // スキャンの進捗率 (0〜100)
    scanTimer: null,              // スキャンアニメーション用のタイマーオブジェクト
    radarChartInstance: null,      // Chart.js のレーダーチャートインスタンス
    facingMode: 'user',           // カメラの向き ('user':インカメラ, 'environment':アウトカメラ)
    
    // 顔のガイド枠（楕円）を基準とした、特徴点の相対的な描画範囲
    landmarks: {
        center: { x: 0.5, y: 0.48 }, // 画面中央に対する中心点
        width: 0.55,                  // 横幅の倍率
        height: 0.60,                 // 縦幅の倍率
        points: []                    // 計算された特徴点座標の格納先
    },
    
    // 解析結果（偏差値スコア、パーツ別スコア、顔タイプ、グレード）
    results: {
        score: 0,        // 総合顔偏差値 (通常 48.0 〜 76.5)
        symmetry: 0,     // 左右対称性 (%)
        goldenRatio: 0,  // 黄金比率の合致度 (%)
        eyes: 0,         // 目元の印象・バランス (%)
        nose: 0,         // 鼻筋・角度の美しさ (%)
        mouth: 0,        // 口元のバランス (%)
        contour: 0,      // フェイスラインの整い度 (%)
        faceType: '',    // 診断された顔タイプ
        grade: ''        // 総合評価グレード (S+, A+, B など)
    }
};

// ===================================
// --- DOM要素の取得 (selectors) ---
// ===================================
const sections = {
    home: document.getElementById('sectionHome'),       // 初期画面
    scanner: document.getElementById('sectionScanner'), // スキャン実行画面
    result: document.getElementById('sectionResult')    // 結果表示画面
};

// システム状態表示用インジケーター
const systemStatus = document.getElementById('systemStatus');
// ビデオ・キャンバス要素
const webcamVideo = document.getElementById('webcamVideo');
const scannerCanvas = document.getElementById('scannerCanvas');
// スキャン時に上下に動く緑・ピンクのレーザーバー
const laserBar = document.getElementById('laserBar');
// コンソール風のダミーログ表示エリア
const terminalLogs = document.getElementById('terminalLogs');
// 顔を合わせるガイド枠（楕円）
const faceGuideOval = document.querySelector('.face-guide-oval');

// ファイルアップロード用の隠しinput
const imageInput = document.getElementById('imageInput');

// 各種操作ボタン
const btnStartCamera = document.getElementById('btnStartCamera');
const btnStartUpload = document.getElementById('btnStartUpload');
const btnTriggerScan = document.getElementById('btnTriggerScan');
const btnCancelScan = document.getElementById('btnCancelScan');
const btnSaveCard = document.getElementById('btnSaveCard');
const btnRestart = document.getElementById('btnRestart');
const btnSwitchCamera = document.getElementById('btnSwitchCamera');

// 結果表示パーツ
const scoreNumber = document.getElementById('scoreNumber');
const faceTypeBadge = document.getElementById('faceTypeBadge');
const resultGrade = document.getElementById('resultGrade');
const snapshotCanvas = document.getElementById('snapshotCanvas');

// パーツ別結果メーター (プログレスバー)
const barSymmetry = document.getElementById('barSymmetry');
const barGolden = document.getElementById('barGolden');
const barEyes = document.getElementById('barEyes');
const barNose = document.getElementById('barNose');
const barMouth = document.getElementById('barMouth');
const barContour = document.getElementById('barContour');

// メーター数値テキスト
const valSymmetry = document.getElementById('valSymmetry');
const valGolden = document.getElementById('valGolden');
const valEyes = document.getElementById('valEyes');
const valNose = document.getElementById('valNose');
const valMouth = document.getElementById('valMouth');
const valContour = document.getElementById('valContour');

// スタイリストからのアドバイス表示パーツ
const adviceSummaryTitle = document.getElementById('adviceSummaryTitle');
const adviceSummaryText = document.getElementById('adviceSummaryText');
const adviceHair = document.getElementById('adviceHair');
const adviceEyebrows = document.getElementById('adviceEyebrows');
const adviceAccessories = document.getElementById('adviceAccessories');

// ==========================================
// --- アプリケーションの初期起動処理 ---
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();    // イベントリスナーの登録
    setupCanvasResizing();   // 描画キャンバスの自動サイズ追従を設定
});

// =====================================
// --- イベントリスナーの登録処理 ---
// =====================================
function initEventListeners() {
    // 1. トップ画面のアクション
    btnStartCamera.addEventListener('click', startWebcamMode);
    btnStartUpload.addEventListener('click', () => imageInput.click()); // ファイル選択のダミークリック
    imageInput.addEventListener('change', handleFileUpload);
    
    // 2. スキャナー画面のアクション
    btnTriggerScan.addEventListener('click', startScanningProcess);
    btnCancelScan.addEventListener('click', cancelScannerMode);
    btnSwitchCamera.addEventListener('click', toggleCameraFacingMode);
    
    // 3. 結果表示画面のアクション
    btnRestart.addEventListener('click', resetToHome);
    btnSaveCard.addEventListener('click', generateCertificateCard);
    
    // 4. 結果画面の詳細情報タブ切り替え処理
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetTab = e.currentTarget.getAttribute('data-tab');
            
            // すべてのタブボタンのactiveクラスを解除し、押されたボタンのみに適用
            tabButtons.forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            
            // すべてのタブコンテンツを非表示にし、対象のタブコンテンツのみをアクティブ化
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

// 画面のリサイズに合わせて、描画用キャンバスのサイズを自動追従させる処理
function setupCanvasResizing() {
    const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
            const width = entry.contentRect.width;
            const height = entry.contentRect.height;
            // HTML上のサイズとキャンバスの描画バッファサイズを一致させる
            scannerCanvas.width = width;
            scannerCanvas.height = height;
        }
    });
    resizeObserver.observe(scannerCanvas.parentElement);
}

// 画面のセクション（ページ）を切り替えるコントローラー
function switchSection(sectionId) {
    Object.keys(sections).forEach(key => {
        const sec = sections[key];
        if (sec.id === sectionId) {
            sec.classList.add('active'); // activeクラスを付与してCSSで表示
        } else {
            sec.classList.remove('active'); // 非表示にする
        }
    });
    appState.currentSection = sectionId;
}

// 右側のログ画面（スキャンコンソール）にメッセージを出力する関数
function addTerminalLog(message, type = '') {
    const time = new Date().toLocaleTimeString('ja-JP', { hour12: false });
    const line = document.createElement('div');
    line.className = 'log-line';
    
    // ログの種別ごとにテキストの色を変更するクラスを付与
    if (type === 'muted') line.classList.add('text-muted');
    if (type === 'cyan') line.classList.add('text-cyan');
    if (type === 'pink') line.classList.add('text-pink');
    if (type === 'success') line.classList.add('text-success');
    
    line.innerHTML = `<span class="text-muted">[${time}]</span> ${message}`;
    terminalLogs.appendChild(line);
    // 常に最新のログが見えるように一番下までスクロールさせる
    terminalLogs.scrollTop = terminalLogs.scrollHeight;
}

// カメラを起動してリアルタイムスキャンモードを開始する処理
async function startWebcamMode() {
    appState.imageSource = 'camera';
    appState.uploadedImage = null;
    switchSection('sectionScanner');
    
    // 顔位置合わせガイドとカメラ切り替えボタンを表示
    faceGuideOval.style.display = 'flex';
    btnSwitchCamera.style.display = 'flex';
    
    terminalLogs.innerHTML = '';
    addTerminalLog('システムコンポーネントを初期化中...', 'muted');
    addTerminalLog('カメラへのアクセスを要求しています...', 'cyan');
    systemStatus.textContent = 'SYSTEM: WEBCAM INIT';
    systemStatus.style.color = 'var(--accent-cyan)';
    document.querySelector('.status-indicator-dot').style.backgroundColor = 'var(--accent-cyan)';
    document.querySelector('.status-indicator-dot').style.boxShadow = 'var(--glow-cyan)';
    
    try {
        // 自撮り用インカメラ（user）の場合は画面を反転させ、アウトカメラの場合はそのまま映す
        if (appState.facingMode === 'user') {
            webcamVideo.classList.add('mirror');
        } else {
            webcamVideo.classList.remove('mirror');
        }
        
        // メディアデバイスからカメラ映像を取得 (音声は不要なので false)
        appState.stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: appState.facingMode
            },
            audio: false
        });
        
        // ビデオ要素にストリームを割り当てて再生開始
        webcamVideo.srcObject = appState.stream;
        webcamVideo.style.display = 'block';
        addTerminalLog(`カメラ接続成功: ${appState.facingMode === 'user' ? 'インカメラ' : 'アウトカメラ'}を有効化`, 'success');
        addTerminalLog('ガイド枠内に顔を合わせてスキャンを開始してください。', 'cyan');
        
        // スキャン開始ボタンの無効化を解除
        btnTriggerScan.classList.remove('disabled');
        
        // 特徴点（ランドマーク）のリアルタイム描画ループを開始
        requestAnimationFrame(trackingLoop);
        
    } catch (err) {
        console.error("Camera access failed: ", err);
        addTerminalLog('エラー: カメラの起動に失敗しました。', 'pink');
        addTerminalLog('アクセス許可を確認するか、写真アップロードをお試しください。', 'muted');
    }
}

// ユーザーが写真ファイルを選択した時の処理
function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    appState.imageSource = 'file';
    
    // カメラが既に起動している場合はストリームを止める
    stopCameraStream();
    
    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            appState.uploadedImage = img;
            switchSection('sectionScanner');
            
            // ビデオ要素を非表示にして、アップロード画像を描画対象にする
            webcamVideo.style.display = 'none';
            faceGuideOval.style.display = 'flex';
            
            terminalLogs.innerHTML = '';
            addTerminalLog(`画像読み込み完了: ${file.name} (${img.width}x${img.height})`, 'success');
            addTerminalLog('骨格分析座標のマッピング準備が整いました。', 'cyan');
            
            btnTriggerScan.classList.remove('disabled');
            
            // 画像の描画とランドマーク座標の計算ループを一度呼び出す
            requestAnimationFrame(trackingLoop);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

// カメラストリームの停止処理 (メモリ解放とインジケータ消去用)
function stopCameraStream() {
    if (appState.stream) {
        appState.stream.getTracks().forEach(track => track.stop());
        appState.stream = null;
    }
    webcamVideo.srcObject = null;
}

// スキャナー画面を閉じる（キャンセルする）処理
function cancelScannerMode() {
    stopCameraStream(); // カメラを停止
    switchSection('sectionHome'); // ホーム画面へ戻る
    
    // カメラ切り替えボタンを非表示
    btnSwitchCamera.style.display = 'none';
    
    // システムステータスを標準状態に戻す
    systemStatus.textContent = 'SYSTEM: ACTIVE';
    systemStatus.style.color = '#00ff66';
    document.querySelector('.status-indicator-dot').style.backgroundColor = '#00ff66';
    document.querySelector('.status-indicator-dot').style.boxShadow = '0 0 8px #00ff66';
    
    // ファイルアップロードの選択ファイルを初期化
    imageInput.value = '';
}

// 最初からやり直す処理
function resetToHome() {
    cancelScannerMode();
}

// スキャナー画面の描画更新ループ (ビデオ・画像の描画とHUD表示を毎フレーム実行)
function trackingLoop() {
    // スキャナー画面がアクティブでない場合はループを抜ける
    if (appState.currentSection !== 'sectionScanner') return;
    
    const ctx = scannerCanvas.getContext('2d');
    const w = scannerCanvas.width;
    const h = scannerCanvas.height;
    
    // 前のフレームの描画をクリア
    ctx.clearRect(0, 0, w, h);
    
    // 写真ファイル選択モードの場合は、アップロードされた画像をアスペクト比を保ってキャンバスに中央配置描画
    if (appState.imageSource === 'file' && appState.uploadedImage) {
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
    
    // 現在のキャンバスサイズに基づいて、顔の特徴点（ダミー座標）を生成・更新
    updateTrackingCoordinates(w, h);
    
    // 特徴点座標を結ぶワイヤーフレームやグリッドをキャンバス上に描画
    drawFacialHUD(ctx, w, h);
    
    // スキャン中でないか、もしくはスキャンがまだ100%になっていない場合はループを継続
    if (!appState.isScanning || appState.scanProgress < 100) {
        requestAnimationFrame(trackingLoop);
    }
}

// 画面中央のガイド枠に合うように顔の各パーツ（目、鼻、口、輪郭）の座標を計算する関数
function updateTrackingCoordinates(w, h) {
    const cx = w * appState.landmarks.center.x; // ガイド枠の中心X
    const cy = h * appState.landmarks.center.y; // ガイド枠の中心Y
    const fw = w * appState.landmarks.width;     // ガイド枠の横幅
    const fh = h * appState.landmarks.height;    // ガイド枠の縦幅
    
    // スキャン待機中はトラッキング感を演出するため座標に微小なランダムノイズ（ジッター）を加える。
    // スキャン開始後は座標を完全に固定（ロック）して計測を行う。
    const jitterMax = appState.isScanning ? 0 : 2;
    const jitter = () => (Math.random() - 0.5) * jitterMax;
    
    // 顔の標準的なパーツ配置比率を計算し、15点の特徴点をマッピング
    const points = {
        leftEye:   { x: cx - fw * 0.28 + jitter(), y: cy - fh * 0.12 + jitter() }, // 左目中心
        rightEye:  { x: cx + fw * 0.28 + jitter(), y: cy - fh * 0.12 + jitter() }, // 右目中心
        noseTop:   { x: cx + jitter(),              y: cy - fh * 0.12 + jitter() }, // 鼻根
        noseTip:   { x: cx + jitter(),              y: cy + fh * 0.05 + jitter() }, // 鼻先
        noseLeft:  { x: cx - fw * 0.10 + jitter(),  y: cy + fh * 0.05 + jitter() }, // 鼻左小鼻
        noseRight: { x: cx + fw * 0.10 + jitter(),  y: cy + fh * 0.05 + jitter() }, // 鼻右小鼻
        mouthL:    { x: cx - fw * 0.22 + jitter(),  y: cy + fh * 0.22 + jitter() }, // 左口角
        mouthR:    { x: cx + fw * 0.22 + jitter(),  y: cy + fh * 0.22 + jitter() }, // 右口角
        lipTop:    { x: cx + jitter(),              y: cy + fh * 0.18 + jitter() }, // 上唇中央
        lipBot:    { x: cx + jitter(),              y: cy + fh * 0.26 + jitter() }, // 下唇中央
        jawTL:     { x: cx - fw * 0.44 + jitter(),  y: cy - fh * 0.10 + jitter() }, // 左頬骨付近
        jawL:      { x: cx - fw * 0.38 + jitter(),  y: cy + fh * 0.15 + jitter() }, // 左顎角
        chin:      { x: cx + jitter(),              y: cy + fh * 0.42 + jitter() }, // 顎先
        jawR:      { x: cx + fw * 0.38 + jitter(),  y: cy + fh * 0.15 + jitter() }, // 右顎角
        jawTR:     { x: cx + fw * 0.44 + jitter(),  y: cy - fh * 0.10 + jitter() }  // 右頬骨付近
    };
    
    appState.landmarks.points = points;
}

// 顔特徴点を結ぶサイバー調 of ワイヤーフレームを描画する関数
function drawFacialHUD(ctx, w, h) {
    const pts = appState.landmarks.points;
    if (!pts || Object.keys(pts).length === 0) return;
    
    // スキャン中（ピンク）と通常待機中（シアン）で色調・塗りを変更
    const colorTheme = appState.isScanning ? 'rgba(255, 0, 127, 0.75)' : 'rgba(0, 242, 254, 0.6)';
    const colorDot = appState.isScanning ? '#ff007f' : '#00f2fe';
    const fillPoly = appState.isScanning ? 'rgba(255, 0, 127, 0.04)' : 'rgba(0, 242, 254, 0.02)';
    
    // 1. 各パーツの結線（メッシュ）の描画
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = colorTheme;
    ctx.fillStyle = fillPoly;
    
    // 輪郭線の描画 (曲線補間)
    ctx.beginPath();
    ctx.moveTo(pts.jawTL.x, pts.jawTL.y);
    ctx.lineTo(pts.jawL.x, pts.jawL.y);
    ctx.quadraticCurveTo(pts.jawL.x + (pts.chin.x - pts.jawL.x)*0.3, pts.chin.y - 10, pts.chin.x, pts.chin.y);
    ctx.quadraticCurveTo(pts.jawR.x - (pts.jawR.x - pts.chin.x)*0.3, pts.chin.y - 10, pts.jawR.x, pts.jawR.y);
    ctx.lineTo(pts.jawTR.x, pts.jawTR.y);
    ctx.stroke();
    
    // 目・鼻根の三角形
    ctx.beginPath();
    ctx.moveTo(pts.leftEye.x, pts.leftEye.y);
    ctx.lineTo(pts.rightEye.x, pts.rightEye.y);
    ctx.lineTo(pts.noseTip.x, pts.noseTip.y);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    
    // 鼻筋の三角形
    ctx.beginPath();
    ctx.moveTo(pts.noseTop.x, pts.noseTop.y);
    ctx.lineTo(pts.noseLeft.x, pts.noseLeft.y);
    ctx.lineTo(pts.noseRight.x, pts.noseRight.y);
    ctx.closePath();
    ctx.stroke();
    
    // 口元の輪郭
    ctx.beginPath();
    ctx.moveTo(pts.mouthL.x, pts.mouthL.y);
    ctx.quadraticCurveTo(pts.lipTop.x, pts.lipTop.y - 2, pts.mouthR.x, pts.mouthR.y);
    ctx.quadraticCurveTo(pts.lipBot.x, pts.lipBot.y + 2, pts.mouthL.x, pts.mouthL.y);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    
    // 対称性測定用の補助点線グリッド
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = appState.isScanning ? 'rgba(255, 0, 127, 0.4)' : 'rgba(255, 255, 255, 0.2)';
    
    // 垂直中心線 (Y軸)
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.1);
    ctx.lineTo(w * 0.5, h * 0.9);
    ctx.stroke();
    
    // 左右の目のアライメントライン (X軸)
    ctx.beginPath();
    ctx.moveTo(pts.leftEye.x - 30, pts.leftEye.y);
    ctx.lineTo(pts.rightEye.x + 30, pts.rightEye.y);
    ctx.stroke();
    ctx.setLineDash([]); // 点線リセット
    
    // 2. 特徴点そのもののマーカー（●ドット）を描画
    Object.keys(pts).forEach(key => {
        const pt = pts[key];
        
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = colorDot;
        ctx.fill();
        
        // 目の中心にはさらにスコープ円を描画
        if (key === 'leftEye' || key === 'rightEye') {
            ctx.strokeStyle = colorDot;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 9, 0, Math.PI * 2);
            ctx.stroke();
        }
    });
    
    // 3. スキャン中のみ、特徴点座標の数値をリアルタイム描画 (サイバーHUD感を強調)
    if (appState.isScanning) {
        ctx.fillStyle = 'var(--accent-pink)';
        ctx.font = '8px "Orbitron", monospace';
        ctx.fillText(`L_EYE: [${Math.round(pts.leftEye.x)}, ${Math.round(pts.leftEye.y)}]`, pts.leftEye.x - 45, pts.leftEye.y - 15);
        ctx.fillText(`R_EYE: [${Math.round(pts.rightEye.x)}, ${Math.round(pts.rightEye.y)}]`, pts.rightEye.x - 45, pts.rightEye.y - 15);
        ctx.fillText(`NOSE_TIP: [${Math.round(pts.noseTip.x)}, ${Math.round(pts.noseTip.y)}]`, pts.noseTip.x + 10, pts.noseTip.y + 3);
        ctx.fillText(`CHIN: [${Math.round(pts.chin.x)}, ${Math.round(pts.chin.y)}]`, pts.chin.x - 25, pts.chin.y + 15);
    }
}

// ユーザーが「スキャン開始」ボタンを押した時のトリガー処理
function startScanningProcess() {
    if (appState.isScanning) return; // 既にスキャン中の場合は二重起動防止
    
    appState.isScanning = true;
    appState.scanProgress = 0;
    
    // スキャン中はボタン操作を無効化
    btnTriggerScan.classList.add('disabled');
    btnCancelScan.classList.add('disabled');
    
    // ガイド枠を「スキャン中（ピンク）」状態に切り替え
    faceGuideOval.classList.add('scanning');
    faceGuideOval.querySelector('.guide-text').textContent = 'ANALYZE IN PROGRESS...';
    
    // レーザーバーアニメーションを発動
    laserBar.classList.add('active');
    if (appState.imageSource === 'camera') {
        laserBar.classList.add('pink');
    }
    
    // ヘッダーのステータス表示をスキャン中に変更
    systemStatus.textContent = 'SYSTEM: SCANNING';
    systemStatus.style.color = 'var(--accent-pink)';
    document.querySelector('.status-indicator-dot').style.backgroundColor = 'var(--accent-pink)';
    document.querySelector('.status-indicator-dot').style.boxShadow = 'var(--glow-pink)';
    
    // タイムラインに沿ったログの出力アニメーションシーケンスを開始
    runScanningAnimationSequence();
}

// スキャン演出の進行状況（3.2秒間）に合わせて、コンソールログを順番に流す処理
function runScanningAnimationSequence() {
    const totalDuration = 3200; // 演出の総時間 (3.2秒)
    const intervalTime = 100;    // 進捗更新の間隔 (0.1秒ごと)
    const steps = totalDuration / intervalTime;
    let currentStep = 0;
    
    // 経過時間(ms)に応じたログ表示内容の定義リスト
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
        
        // 設定された時間に一致したログメッセージをコンソールに出力
        const elapsed = currentStep * intervalTime;
        logsSequence.forEach(log => {
            if (elapsed === log.time) {
                addTerminalLog(log.text, log.type);
            }
        });
        
        // スキャン時間が終了したらタイマーを破棄し、解析スコア算出へ移行
        if (currentStep >= steps) {
            clearInterval(appState.scanTimer);
            finalizeScanResults();
        }
    }, intervalTime);
}

// スキャン終了時に全体の診断数値を確定・算出する処理
function finalizeScanResults() {
    // デフォルトでは完全ランダムなシード値を使用
    let seed = Math.random();
    
    // 写真ファイルアップロードの場合、同じ写真からは必ず「全く同じスコア」が算出されるように、
    // 画像ファイルの縦横ピクセル寸法をもとに擬似決定的なシード値を算出する
    if (appState.imageSource === 'file' && appState.uploadedImage) {
        const img = appState.uploadedImage;
        const simpleHash = (img.width * img.height) % 1000;
        seed = simpleHash / 1000;
    }

    // --- 各パーツのスコア計算 (48〜98点前後の範囲でアトラクティブに算出) ---
    
    // 総合顔偏差値: 48.0 〜 74.5 の間で正規分布に近い配分にする
    const baseScore = 48 + (seed * 26.5);
    appState.results.score = Math.round(baseScore * 10) / 10;
    
    // 各特徴別の合致率スコアを、シード値をもとに相関関係を持たせながら算出
    appState.results.symmetry = Math.round(65 + (seed * 31)); // 左右対称性
    appState.results.goldenRatio = Math.round(62 + ((1 - seed) * 35)); // 黄金比率合致度
    appState.results.eyes = Math.round(58 + (Math.sin(seed * Math.PI) * 38)); // 目元のバランス
    appState.results.nose = Math.round(55 + (Math.cos(seed * Math.PI/2) * 40)); // 鼻筋の通り具合
    const mouthSeed = (seed * 7) % 1;
    appState.results.mouth = Math.round(60 + (mouthSeed * 35)); // 口元のバランス
    const contourSeed = (seed * 13) % 1;
    appState.results.contour = Math.round(58 + (contourSeed * 37)); // 輪郭ラインのシャープさ
    
    // スコアに基づく総合判定グレードと顔タイプの割り当て
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
    
    // 各スコア結果に基づいた美容・スタイリングアドバイステキストを生成
    generateAdviceText();
    
    // スキャンキャンバスに描かれている内容（特徴点と顔写真）のスクリーンショットを一時保存用キャンバスにコピー
    captureScanSnapshot();
    
    // カメラストリームの終了とUIの状態リセット
    stopCameraStream();
    appState.isScanning = false;
    btnSwitchCamera.style.display = 'none';
    laserBar.classList.remove('active', 'pink');
    faceGuideOval.classList.remove('scanning');
    btnTriggerScan.classList.remove('disabled');
    btnCancelScan.classList.remove('disabled');
    
    // ヘッダーシステム状態表示を待機中に戻す
    systemStatus.textContent = 'SYSTEM: ACTIVE';
    systemStatus.style.color = '#00ff66';
    document.querySelector('.status-indicator-dot').style.backgroundColor = '#00ff66';
    document.querySelector('.status-indicator-dot').style.boxShadow = '0 0 8px #00ff66';
    
    // 結果画面セクションを表示
    switchSection('sectionResult');
    
    // 結果画面のカウントアップ演出、レーダーチャート描画アニメーションをトリガー
    animateResultPage();
}

// 算出されたパーツごとのスコアに応じて、パーソナルなアドバイス文面を切り替える処理
function generateAdviceText() {
    const res = appState.results;
    
    // 1. 総合解説テキストの動的組み立て
    let summaryText = `顔パーツの配置を精密測定した結果、総合評価【顔偏差値 ${res.score}】の【${res.faceType}】に分類されます。`;
    
    if (res.symmetry > 80 && res.goldenRatio > 80) {
        summaryText += " 左右の対称性が極めて高く、全体のパーツ配置が黄金比率とほぼ一致しています。これはどの角度から見ても立体感があり、写真映えしやすい骨格であることを表しています。";
    } else if (res.symmetry > 75) {
        summaryText += " 左右対称性に優れたバランスが特徴的です。目元の比率と口元のラインが水平に揃っており、他者に安心感と知的な印象を同時に与える美しい骨格バランスです。";
    } else {
        summaryText += " 個性的でパーツそれぞれの独立した特徴が際立つ顔立ちです。パーツの大きさやラインに動きがあるため、ヘアスタイルやアイウェアの工夫次第で様々な表情を引き出せる魅力を持っています。";
    }
    
    adviceSummaryText.textContent = summaryText;
    
    // 2. フェイスラインスコアに応じた髪型アドバイス
    let hairTip = "";
    if (res.contour > 80) {
        hairTip = "フェイスラインが非常に整っているため、額を出したアップバングや、マッシュヘアで輪郭をシャープに見せるスタイルが非常に似合います。耳周りをすっきり出すことで清潔感が倍増します。";
    } else {
        hairTip = "少しサイドや前髪にボリューム感や毛流れを持たせることで、輪郭の個性をカバーしつつ、知的な雰囲気を出すスタイリング（センターパートやニュアンスパーマ等）がおすすめです。";
    }
    adviceHair.textContent = hairTip;
    
    // 3. 目元スコアに応じた眉毛・メイクアドバイス
    let eyebrowTip = "";
    if (res.eyes > 75) {
        eyebrowTip = "綺麗な目の比率に合わせて、眉は角度を付けすぎず、眉山をなだらかにした直線〜並行眉がベスト。眉尻を少しシャープに描くことで、目元の印象がさらにキリッと引き締まります。";
    } else {
        eyebrowTip = "目元の個性を引き立たせるため、自眉を活かしたやや太めの眉カットがおすすめ。眉間を少し広めに取ることで、優しく温かみのあるフレンドリーな表情を演出できます。";
    }
    adviceEyebrows.textContent = eyebrowTip;
    
    // 4. 鼻筋スコアに応じた眼鏡・アクセサリーアドバイス
    let accTip = "";
    if (res.nose > 80) {
        accTip = "鼻筋が非常にすっきり通っているため、メタルフレームや細身のウェリントン型メガネが綺麗に収まります。シルバー系のアクセサリーがシャープさを際立たせます。";
    } else {
        accTip = "丸みを帯びたボストン型やクラウンパント型のメガネを掛けることで、目元の優しさとバランス良く調和し、ハイセンスで知的なファッション感度を表現できます。";
    }
    adviceAccessories.textContent = accTip;
}

// スキャナー画面の最終的なCanvas描画内容（自撮り画像＋HUD枠線）を、結果表示カード用のプレビューCanvasに丸ごとコピーする関数
function captureScanSnapshot() {
    const snapCtx = snapshotCanvas.getContext('2d');
    snapshotCanvas.width = scannerCanvas.width;
    snapshotCanvas.height = scannerCanvas.height;
    
    // スキャナーの描画結果をそのまま画像として転写
    snapCtx.drawImage(scannerCanvas, 0, 0);
}

// 結果画面が表示された時のカウンター・プログレスバーの演出を制御
function animateResultPage() {
    // 1. スコアテキストを最低数値で初期化
    scoreNumber.textContent = '30.0';
    
    // 2. 顔偏差値の数字が 30.0 から結果の数値までなめらかに増加するアニメーション
    const targetScore = appState.results.score;
    const duration = 1200; // カウントアップにかける時間 (1.2秒)
    const startTime = performance.now();
    
    function updateScore(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // easeOutQuad（後半減速するカーブ）を適用して自然な動きに
        const easeProgress = progress * (2 - progress);
        const currentVal = 30 + easeProgress * (targetScore - 30);
        
        scoreNumber.textContent = (Math.round(currentVal * 10) / 10).toFixed(1);
        
        if (progress < 1) {
            requestAnimationFrame(updateScore);
        } else {
            scoreNumber.textContent = targetScore.toFixed(1); // 最後に端数をぴったり合わせる
        }
    }
    requestAnimationFrame(updateScore);
    
    // 3. 顔タイプと評価グレードバッジのテキストを反映
    faceTypeBadge.textContent = appState.results.faceType;
    resultGrade.textContent = appState.results.grade;
    
    // 4. パーツ別のメーター(進捗バー)を0%から診断結果のパーセントへ伸ばすアニメーションを発動
    const res = appState.results;
    
    animateSingleProgressBar(barSymmetry, valSymmetry, res.symmetry);
    animateSingleProgressBar(barGolden, valGolden, res.goldenRatio);
    animateSingleProgressBar(barEyes, valEyes, res.eyes);
    animateSingleProgressBar(barNose, valNose, res.nose);
    animateSingleProgressBar(barMouth, valMouth, res.mouth);
    animateSingleProgressBar(barContour, valContour, res.contour);
    
    // 5. Chart.js レーダーチャートを新規生成・フェードイン表示
    drawRadarChart();
}

// 個別のパーツ別メーターを0%から指定数値まで伸ばすアニメーション
function animateSingleProgressBar(barEl, valEl, targetVal) {
    barEl.style.width = '0%';
    valEl.textContent = '0%';
    
    setTimeout(() => {
        barEl.style.width = `${targetVal}%`; // CSS Transitionで伸びる
        
        // 数値テキストも0から目標値まで高速でカウントアップ
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

// Chart.js を利用して詳細スコアのレーダーチャートを描画する関数
function drawRadarChart() {
    // 既にチャートが存在する場合は破棄（再描画時のバグ防止）
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
                backgroundColor: 'rgba(0, 242, 254, 0.15)', // 半透明のシアン
                borderColor: 'rgba(0, 242, 254, 0.85)',
                borderWidth: 1.5,
                pointBackgroundColor: 'var(--accent-pink)', // 特徴点はピンク
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
                    display: false // 凡例は非表示
                }
            },
            scales: {
                r: {
                    angleLines: {
                        color: 'rgba(255, 255, 255, 0.08)' // 軸の放射線の色
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.08)' // 同心円の網目の色
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
                        display: false, // 目盛り数値は非表示
                        maxTicksLimit: 5
                    },
                    suggestedMin: 30,
                    suggestedMax: 100
                }
            }
        }
    });
}

// 診断結果を1枚の認定証画像 (PNG) として生成・ダウンロード出力する関数 (Canvas操作)
function generateCertificateCard() {
    // 高解像度のオフスクリーンキャンバスを生成 (幅800px × 高さ1000px)
    const cardCanvas = document.createElement('canvas');
    cardCanvas.width = 800;
    cardCanvas.height = 1000;
    const ctx = cardCanvas.getContext('2d');
    
    // 背景を描画 (深宇宙のネイビーブラック)
    ctx.fillStyle = '#07080d';
    ctx.fillRect(0, 0, cardCanvas.width, cardCanvas.height);
    
    // バックグラウンドに薄いサイバー調のグリッド線を描画
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
    
    // 装飾用の外枠二重線を描画 (シアンとパープル)
    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 30, cardCanvas.width - 60, cardCanvas.height - 60);
    
    ctx.strokeStyle = 'rgba(157, 78, 221, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(40, 40, cardCanvas.width - 80, cardCanvas.height - 80);
    
    // ヘッダーテキスト (認定証のタイトル)
    ctx.font = 'bold 24px "Orbitron"';
    ctx.fillStyle = 'rgba(0, 242, 254, 0.85)';
    ctx.textAlign = 'center';
    ctx.fillText('AI FACIAL DIAGNOSTIC CERTIFICATE', cardCanvas.width / 2, 90);
    
    ctx.font = 'bold 12px "Orbitron"';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillText('NEURAL SPECTRUM FACIAL GEOMETRY MAP', cardCanvas.width / 2, 115);
    
    // 仕切り用の境界線
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.moveTo(80, 140);
    ctx.lineTo(cardCanvas.width - 80, 140);
    ctx.stroke();
    
    // 中央枠線内にユーザーの顔のスナップショットを描画
    const userImg = snapshotCanvas;
    const frameW = 440;
    const frameH = 330;
    const frameX = (cardCanvas.width - frameW) / 2;
    const frameY = 170;
    
    ctx.fillStyle = '#000';
    ctx.fillRect(frameX, frameY, frameW, frameH);
    ctx.drawImage(userImg, frameX, frameY, frameW, frameH);
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.strokeRect(frameX, frameY, frameW, frameH);
    
    // 顔タイプバッジ枠線の描画
    ctx.fillStyle = 'rgba(0, 242, 254, 0.08)';
    ctx.fillRect(cardCanvas.width/2 - 150, 530, 300, 38);
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cardCanvas.width/2 - 150, 530, 300, 38);
    
    // 顔タイプ名
    ctx.font = 'bold 15px "Noto Sans JP"';
    ctx.fillStyle = '#00f2fe';
    ctx.fillText(appState.results.faceType, cardCanvas.width/2, 554);
    
    // 総合顔偏差値の描画 (ネオングロウ効果を付与)
    ctx.font = 'bold 14px "Noto Sans JP"';
    ctx.fillStyle = '#909bb0';
    ctx.fillText('顔 偏 差 値 (SCORE)', cardCanvas.width/2, 620);
    
    ctx.font = 'bold 96px "Orbitron"';
    ctx.shadowColor = 'rgba(0, 242, 254, 0.6)';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(appState.results.score.toFixed(1), cardCanvas.width/2, 715);
    ctx.shadowBlur = 0; // ネオン効果を他パーツに影響させないためリセット
    
    // 評価グレード
    ctx.font = 'bold 18px "Orbitron"';
    ctx.fillStyle = '#ff007f';
    ctx.fillText(appState.results.grade, cardCanvas.width/2, 755);
    
    // 下部の左右2列に分けて、各パーツ別の詳細数値一覧を描画
    const statsXLeft = 100;
    const statsXRight = 450;
    const statsYStart = 800;
    const rowH = 45;
    
    ctx.textAlign = 'left';
    ctx.font = 'bold 13px "Noto Sans JP"';
    ctx.fillStyle = '#909bb0';
    
    const res = appState.results;
    
    // 1列目 (左側)
    ctx.fillText(`左右対称性:  ${res.symmetry}%`, statsXLeft, statsYStart);
    ctx.fillText(`黄金比率:    ${res.goldenRatio}%`, statsXLeft, statsYStart + rowH);
    ctx.fillText(`目元比率:    ${res.eyes}%`, statsXLeft, statsYStart + rowH * 2);
    
    // 2列目 (右側)
    ctx.fillText(`鼻すじ角度:  ${res.nose}%`, statsXRight, statsYStart);
    ctx.fillText(`口元バランス: ${res.mouth}%`, statsXRight, statsYStart + rowH);
    ctx.fillText(`輪郭ライン:  ${res.contour}%`, statsXRight, statsYStart + rowH * 2);
    
    // フッターのクレジット免責事項
    ctx.textAlign = 'center';
    ctx.font = '9px "Orbitron"';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillText('ALL FACIAL SCAN PROTOCOLS COMPLETED LOCALLY ON DEVICE // NO DATA EXPORTED', cardCanvas.width/2, 955);
    
    // キャンバスをPNG形式のデータURLに変換し、aタグを作ってダウンロード発火
    const dataUrl = cardCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `AI-Facial-Analysis-Score-${res.score}.png`;
    link.href = dataUrl;
    link.click();
    
    addTerminalLog('診断結果の認定証画像が生成され、ダウンロードされました。', 'success');
}

// スマホ対応：インカメラ ⇄ アウトカメラの映像入力を切り替える処理
function toggleCameraFacingMode() {
    if (appState.isScanning) return; // スキャン解析の進行中は切り替えをロック
    
    // 現在のカメラの反対側の向きを設定
    appState.facingMode = (appState.facingMode === 'user') ? 'environment' : 'user';
    addTerminalLog(`カメラを切替中 (${appState.facingMode === 'user' ? 'インカメラ' : 'アウトカメラ'})...`, 'cyan');
    
    // 既存のカメラ入力を切って、新しいカメラ設定で再起動
    stopCameraStream();
    startWebcamMode();
}
