// roulette.js
const canvas = document.getElementById('wheel');
const ctx = canvas.getContext('2d');
const entriesTextarea = document.getElementById('entries');
const winningBanner = document.getElementById('winning-banner');

// Canvasの中心座標とルーレットの半径、外枠の太さを定数化
const CANVAS_CENTER_X = canvas.width / 2; // 256
const CANVAS_CENTER_Y = canvas.height / 2; // 256
const WHEEL_RADIUS = 240; // 新しいルーレットの半径 (少し小さくして外枠のスペースを確保)
const OUTER_FRAME_THICKNESS = 15; // 外枠の太さ (調整可能)

const tickSound = new Audio('sound.mp3');

// 当選時SEのAudioオブジェクト
const tousenSound = new Audio('tousen.mp3');
let tousenSoundPlayed = false; // 当選SEが再生されたかどうかのフラグ

let entries = [];
let angle = 0; // 現在の回転角度。この値が前回の停止位置を保持します。

// ランダム表示する中心画像パスの配列
const centerImagePaths = [
    'usa_kaeru.png',
    'usa_toria.png',
    'usa_toria2.png',
    'usa_bakemono.png',
    'usa_tsuchi.png',
    'usa_tsuchinoko.png',
    // 必要に応じてさらに追加
];

// 画像オブジェクトをグローバルで宣言
const centerImage = new Image();
let currentImageIndex = 0; // 現在表示する画像のインデックス

// アニメーション関連の変数 (中心画像用)
let imageOpacity = 1; // 画像の現在の透明度 (0.0 から 1.0)
let imageFadePhase = 'stable'; // 'stable', 'fadeOut', 'fadeIn'
const FADE_DURATION = 300; // フェードアニメーションの時間 (ms)
let fadeStartTime = 0;

// phase2での中心画像切り替え関連の変数
const PHASE2_IMAGE_SWITCH_PROBABILITY = 0.5; // ★ここを0.5に変更★
let hasSwitchedInPhase2 = false; // 今回のスピンでPhase2中に切り替えたかどうかのフラグ

// === 新しい演出用の変数と定数 ===
let overlayImageActive = false;
let overlayImageOpacity = 0; // 初期は完全に透明
let overlayFadePhase = 'none'; // 'none', 'fadeIn', 'fadeOut'
let overlayFadeStartTime = 0;
const OVERLAY_FADE_DURATION = 1500; // オーバーレイのフェード時間 (ms) - 長めに設定
const OVERLAY_EFFECT_PROBABILITY_PER_FRAME = 0.5; // ★ここを0.5に変更★
const OVERLAY_MAX_OPACITY = 0.2; // オーバーレイの最大不透明度 (うっすらと)
let hasOverlayTriggeredInPhase3 = false; // Phase3でこの演出をトリガーしたかどうかのフラグ

let currentPhase = 0; // 現在のルーレットフェーズ (1, 2, 3, 4)
let animationComplete = false; // アニメーションが完了したかどうか

// 初期画像をランダムに設定
currentImageIndex = Math.floor(Math.random() * centerImagePaths.length);
centerImage.src = centerImagePaths[currentImageIndex];

centerImage.onload = () => {
    drawStatic();
};
centerImage.onerror = () => {
    console.error(`Failed to load ${centerImage.src}`);
    drawStatic();
};

const outerFrameImage = new Image();
const OUTER_FRAME_IMAGE_PATH = 'outer_frame.png'; // 例: 外枠の画像ファイル名

if (OUTER_FRAME_IMAGE_PATH) {
    outerFrameImage.src = OUTER_FRAME_IMAGE_PATH;
    outerFrameImage.onload = () => {
        drawStatic(); // 画像がロードされたら静的描画を更新
    };
    outerFrameImage.onerror = () => {
        console.error(`Failed to load outer frame image: ${OUTER_FRAME_IMAGE_PATH}. Falling back to default.`);
        drawStatic();
    };
}


const saved = localStorage.getItem('roulette_entries');
if (saved) {
  entriesTextarea.value = saved;
}
updateEntries();
drawStatic();

entriesTextarea.addEventListener('input', () => {
  updateEntries();
  localStorage.setItem('roulette_entries', entriesTextarea.value);
  winningBanner.style.display = 'none';
  drawStatic();
});

function updateEntries() {
  const input = entriesTextarea.value;
  entries = input.split('\n').map(e => e.trim()).filter(e => e);
}

function getEffectiveEntries() {
  return entries.length ? entries : ['10回', '20回', '30回', '100回', '0回', '100回'];
}

/**
 * ルーレット全体を現在の回転角度で描画する関数
 * @param {number} rotationAngle - ルーレットの回転角度 (度)
 */
function drawScene(rotationAngle) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawOuterFrame(); // 最も後ろに描画

    ctx.save();
    ctx.translate(CANVAS_CENTER_X, CANVAS_CENTER_Y);
    ctx.rotate(rotationAngle * Math.PI / 180); // ここで回転角度を適用
    ctx.translate(-CANVAS_CENTER_X, -CANVAS_CENTER_Y);
    drawWheel(); // drawWheel内で中心画像と背景円も描画される
    ctx.restore();
    drawPointer();

    // === オーバーレイ画像の描画 ===
    if (overlayImageActive && centerImage.complete && centerImage.naturalWidth > 0) {
        // console.log('emo: Drawing overlay now!', `opacity=${overlayImageOpacity.toFixed(2)}`); // デバッグ用ログ
        ctx.save();
        ctx.globalAlpha = overlayImageOpacity;
        ctx.filter = 'sepia(100%) saturate(150%) brightness(80%) hue-rotate(30deg)'; // エモい感じのフィルター
        ctx.drawImage(centerImage, 0, 0, canvas.width, canvas.height); // Canvas全体に描画
        ctx.restore();
    }
    // =============================
}

// 静止状態の描画 (回転なし)
function drawStatic() {
    drawScene(0); // 角度0で描画
}

function drawOuterFrame() {
    // 外枠の外側の半径 (ルーレット本体の半径 + 外枠の太さ)
    const outerRadius = WHEEL_RADIUS + OUTER_FRAME_THICKNESS;

    if (OUTER_FRAME_IMAGE_PATH && outerFrameImage.complete && outerFrameImage.naturalWidth > 0) {
        ctx.save(); // 現在の描画状態を保存

        // 1. 円形のクリッピングパスを作成
        ctx.beginPath();
        ctx.arc(CANVAS_CENTER_X, CANVAS_CENTER_Y, outerRadius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip(); // これ以降の描画はこのパス内のみになる

        // 2. 画像を描画
        // 画像を外枠の円のサイズに合わせて描画する
        const imageDrawSize = outerRadius * 2; // 円の直径
        const imageDrawX = CANVAS_CENTER_X - imageDrawSize / 2;
        const imageDrawY = CANVAS_CENTER_Y - imageDrawSize / 2;
        ctx.drawImage(outerFrameImage, imageDrawX, imageDrawY, imageDrawSize, imageDrawSize);

        ctx.restore(); // 描画状態を復元 (クリッピングを解除)

    } else {
        // 外枠画像がない場合のデフォルトの描画 (白塗りのドーナツ型)
        ctx.save();
        ctx.translate(CANVAS_CENTER_X, CANVAS_CENTER_Y); // 中心に移動

        ctx.beginPath();
        ctx.arc(0, 0, outerRadius, 0, Math.PI * 2); // 外円
        ctx.arc(0, 0, WHEEL_RADIUS, 0, Math.PI * 2, true); // 内円 (反時計回りにすることでドーナツ型)
        ctx.fillStyle = 'white';
        ctx.fill();
        ctx.restore();
    }
}


function drawWheel() {
  const currentEntries = getEffectiveEntries();
  const num = currentEntries.length;
  const arc = 2 * Math.PI / num;

  currentEntries.forEach((entry, i) => {
    const start = i * arc;
    // HSLカラー文字列を生成するヘルパー関数
    const segmentColor = `hsl(${i * 360 / num}, 80%, 70%)`;

    ctx.beginPath();
    ctx.moveTo(CANVAS_CENTER_X, CANVAS_CENTER_Y);
    ctx.arc(CANVAS_CENTER_X, CANVAS_CENTER_Y, WHEEL_RADIUS, start, start + arc); // ルーレットの背景円
    ctx.fillStyle = segmentColor; // ここで生成した色を使用
    ctx.fill();
    if (num > 1) {
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(CANVAS_CENTER_X, CANVAS_CENTER_Y);
    ctx.rotate(start + arc / 2);
    ctx.fillStyle = 'black';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(entry, WHEEL_RADIUS - 20, 0); // 半径 - 余白
    ctx.restore();
  });

  // 中心画像の背後に白い円を描画
  ctx.save();
  ctx.translate(CANVAS_CENTER_X, CANVAS_CENTER_Y);
  ctx.beginPath();
  const centerCircleRadius = 40; // 直径80px
  ctx.arc(0, 0, centerCircleRadius, 0, 2 * Math.PI);
  ctx.fillStyle = 'white';
  ctx.fill();
  ctx.restore();

  // ルーレットの中心に画像を描画
  if (centerImage.complete && centerImage.naturalWidth > 0) {
      const imageSize = 80;
      const x = CANVAS_CENTER_X - imageSize / 2;
      const y = CANVAS_CENTER_Y - imageSize / 2;
      
      ctx.save();
      ctx.globalAlpha = imageOpacity;
      ctx.drawImage(centerImage, x, y, imageSize, imageSize);
      ctx.restore();
  }
}

function drawPointer() {
  ctx.fillStyle = 'red';
  ctx.beginPath();
  
  // ポインターの底辺の上端Y座標
  const POINTER_BASE_TOP_Y = 20; 
  // ポインターの頂点の下端Y座標 (ポインターの高さ30px)
  const POINTER_TIP_BOTTOM_Y = POINTER_BASE_TOP_Y + 30; 

  // 底辺の左側の点
  ctx.moveTo(CANVAS_CENTER_X - 10, POINTER_BASE_TOP_Y); 
  // 底辺の右側の点
  ctx.lineTo(CANVAS_CENTER_X + 10, POINTER_BASE_TOP_Y); 
  // 頂点
  ctx.lineTo(CANVAS_CENTER_X, POINTER_TIP_BOTTOM_Y); 
  
  ctx.closePath(); // これで三角形が閉じられる
  ctx.fill();
}

// スピンアニメーションを開始する関数
function startSpinAnimationInternal(spinButtonElement) {
    const currentEntries = getEffectiveEntries();
    const num = currentEntries.length;
    const sliceAngle = 360 / num;

    const fps = 60;

    // スピン開始時の角度を記憶
    let initialAngleForThisSpin = angle; 
    let startTime = null;
    let lastPlayedIndex = -1;
    animationComplete = false; // アニメーション開始時にリセット
    currentPhase = 0; // アニメーション開始時にリセット
    hasSwitchedInPhase2 = false; // 新しいスピン開始時にリセット
    hasOverlayTriggeredInPhase3 = false; // 新しいスピン開始時にリセット

    // オーバーレイ演出の状態をリセット
    overlayImageActive = false;
    overlayImageOpacity = 0;
    overlayFadePhase = 'none';
    overlayFadeStartTime = 0;
    tousenSoundPlayed = false; // 当選SE再生フラグをリセット

    const MIN_DECELERATION_TIME = 1000;
    const MAX_DECELERATION_TIME = 5000;
    const DECELERATION_TIME = MIN_DECELERATION_TIME + Math.random() * (MAX_DECELERATION_TIME - MIN_DECELERATION_TIME);

    const PHASE_1_END_TIME = 3000;
    const PHASE_2_END_TIME = 6000;
    const PHASE_3_END_TIME = 11000;

    function getPhaseSpeed(time) {
        let speed = 0;
        let newPhase = 0;

        if (time < PHASE_1_END_TIME) {
            newPhase = 1;
            speed = 1000 * Math.pow(time / PHASE_1_END_TIME, 2);
        } else if (time < PHASE_2_END_TIME) {
            newPhase = 2;
            speed = 1000;
        } else if (time < PHASE_3_END_TIME) {
            newPhase = 3;
            const t = (time - PHASE_2_END_TIME) / (PHASE_3_END_TIME - PHASE_2_END_TIME);
            speed = 1000 - (950 * t);
        } else {
            newPhase = 4;
            const t = (time - PHASE_3_END_TIME) / DECELERATION_TIME;
            speed = 50 - (50 * t);

            if (speed <= 0) {
                animationComplete = true;
            }
        }

        speed = Math.max(0, speed);

        // === Phase 2 での中心画像切り替えロジック ===
        if (newPhase === 2 && currentPhase !== 2 && !hasSwitchedInPhase2) {
            console.log("!!! Initiating mid-spin image switch in Phase 2 !!!");
            hasSwitchedInPhase2 = true;

            // PHASE2_IMAGE_SWITCH_PROBABILITY の確率判定を追加
            if (Math.random() < PHASE2_IMAGE_SWITCH_PROBABILITY) {
                const tempNewImageIndex = Math.floor(Math.random() * centerImagePaths.length);
                let nextImageIndex = tempNewImageIndex;
                if (tempNewImageIndex === currentImageIndex && centerImagePaths.length > 1) {
                    nextImageIndex = (tempNewImageIndex + 1) % centerImagePaths.length;
                }

                imageFadePhase = 'fadeOut';
                fadeStartTime = performance.now();
                
                function animateMidSpinFadeOut(timestampFade) {
                    const elapsed = timestampFade - fadeStartTime;
                    imageOpacity = 1 - Math.min(1, elapsed / FADE_DURATION);
                    
                    if (imageOpacity > 0) {
                        requestAnimationFrame(animateMidSpinFadeOut);
                    } else {
                        currentImageIndex = nextImageIndex;
                        centerImage.src = centerImagePaths[currentImageIndex];
                        
                        centerImage.onload = () => {
                            centerImage.onload = null;
                            imageFadePhase = 'fadeIn';
                            fadeStartTime = performance.now();
                            
                            function animateMidSpinFadeIn(timestampFadeIn) {
                                const elapsedFadeIn = timestampFadeIn - fadeStartTime;
                                imageOpacity = Math.min(1, elapsedFadeIn / FADE_DURATION);
                                
                                if (imageOpacity < 1) {
                                    requestAnimationFrame(animateMidSpinFadeIn);
                                } else {
                                    imageFadePhase = 'stable';
                                }
                            }
                            requestAnimationFrame(animateMidSpinFadeIn);
                        };
                        centerImage.onerror = () => {
                            console.error(`Failed to load ${centerImage.src} during mid-spin fade in.`);
                            imageOpacity = 1;
                            imageFadePhase = 'stable';
                        };
                    }
                }
                requestAnimationFrame(animateMidSpinFadeOut);
            } else {
                console.log("Phase 2 image switch skipped (probability not met).");
            }
        }

        // === Phase 3 でのオーバーレイ演出ロジック ===
        if (newPhase === 3) {
            // フェードインがまだ開始されていない、かつ今回この演出をトリガーしていない場合
            if (overlayFadePhase === 'none' && !hasOverlayTriggeredInPhase3) {
                if (Math.random() < OVERLAY_EFFECT_PROBABILITY_PER_FRAME) {
                    console.log("!!! Initiating emo overlay effect in Phase 3 !!!");
                    overlayImageActive = true;
                    // console.log("getPhaseSpeed: overlayImageActive set to TRUE"); // デバッグログ
                    overlayFadePhase = 'fadeIn';
                    overlayFadeStartTime = performance.now();
                    hasOverlayTriggeredInPhase3 = true; // 今回のスピンでトリガーしたことを記録
                }
            }

            if (overlayImageActive) {
                const elapsedOverlay = performance.now() - overlayFadeStartTime;
                if (overlayFadePhase === 'fadeIn') {
                    overlayImageOpacity = Math.min(OVERLAY_MAX_OPACITY, elapsedOverlay / OVERLAY_FADE_DURATION * OVERLAY_MAX_OPACITY);
                    if (overlayImageOpacity >= OVERLAY_MAX_OPACITY) {
                        overlayFadePhase = 'fadeOut'; // フェードイン完了後、すぐにフェードアウトへ
                        overlayFadeStartTime = performance.now(); // フェードアウト開始時刻を更新
                        // console.log("getPhaseSpeed: Overlay fade IN complete, starting fade OUT."); // デバッグログ
                    }
                } else if (overlayFadePhase === 'fadeOut') {
                    // フェードアウトの計算では、elapsedOverlayがフェードアウト開始からの時間になるようにする
                    const elapsedFadeOut = performance.now() - overlayFadeStartTime;
                    overlayImageOpacity = OVERLAY_MAX_OPACITY * (1 - Math.min(1, elapsedFadeOut / OVERLAY_FADE_DURATION));
                    if (overlayImageOpacity <= 0) {
                        overlayImageActive = false;
                        // console.log("getPhaseSpeed: overlayImageActive set to FALSE (fade out complete)."); // デバッグログ
                        overlayFadePhase = 'none';
                        // hasOverlayTriggeredInPhase3 はここではリセットしない！
                        // console.log("getPhaseSpeed: Overlay effect finished."); // デバッグログ
                    }
                }
            }
        } else {
            // Phase 3 以外ではオーバーレイを非アクティブ化し、状態をリセット
            if (overlayImageActive && overlayFadePhase !== 'none') {
                overlayImageActive = false;
                // console.log("getPhaseSpeed: overlayImageActive set to FALSE (Exiting Phase 3)."); // デバッグログ
                overlayImageOpacity = 0;
                overlayFadePhase = 'none';
            }
            // hasOverlayTriggeredInPhase3 のリセットは spin() と animate() の終了時のみ行う
            // ここでは行わないことで、フェーズ3を抜けても一度トリガーされたフラグを維持
        }
        // ===========================================


        if (newPhase !== currentPhase) {
            console.log(`--- Phase Changed: ${currentPhase} -> ${newPhase} ---`);
            currentPhase = newPhase;
        }
        // console.log(`Phase: ${currentPhase}, Time: ${time.toFixed(0)}ms, Speed: ${speed.toFixed(2)}, AngleProgress: ${angle.toFixed(2)}`); // デバッグ用

        return speed;
    }

    function animate(timestamp) {
        if (!startTime) startTime = timestamp;

        const deltaTime = timestamp - startTime;
        const speed = getPhaseSpeed(deltaTime); // ここでoverlayImageOpacityが更新される可能性あり

        angle += speed * (1000 / fps) / 1000;

        // ルーレットの回転中も常に drawScene を呼び出すように修正
        drawScene(angle); 

        const effectivePointerAngle = (270 - (angle % 360) + 360) % 360;
        const currentHoveredIndex = Math.floor(effectivePointerAngle / sliceAngle);

        if (currentHoveredIndex !== lastPlayedIndex) {
            tickSound.currentTime = 0;
            tickSound.play();
            lastPlayedIndex = currentHoveredIndex;
        }

        if (!animationComplete) {
            requestAnimationFrame(animate);
        } else {
            // アニメーション終了時の最終描画も drawScene を使用
            drawScene(angle); 

            // 当選内容表示前に当選SEを再生
            if (!tousenSoundPlayed) {
                tousenSound.currentTime = 0; // 再生位置を先頭に戻す
                tousenSound.play().catch(e => console.error("Error playing tousen.mp3:", e)); // エラーハンドリングを追加
                tousenSoundPlayed = true; // 再生フラグを立てる
            }

            const finalEffectivePointerAngle = (270 - (angle % 360) + 360) % 360;
            const winningIndex = Math.floor(finalEffectivePointerAngle / sliceAngle);
            const actualWinningIndex = (winningIndex + num) % num;

            const result = currentEntries[actualWinningIndex];
            winningBanner.textContent = result;
            winningBanner.style.display = 'block';
            winningBanner.style.animation = 'popup 0.5s ease-out';
            setTimeout(() => {
                winningBanner.style.animation = '';
            }, 500);

            const winningHue = actualWinningIndex * 360 / num;
            const winningColor = `hsl(${winningHue}, 80%, 70%)`;
            winningBanner.style.color = winningColor;

            // text-shadow を動的に生成
            const shadowLayers = [
                `0 0 10px hsl(${winningHue}, 90%, 75%)`, // 少し明るく彩度高め
                `0 0 20px hsl(${winningHue}, 80%, 80%)`,
                `0 0 30px hsl(${winningHue}, 70%, 85%)`,
                `0 0 40px hsl(${winningHue}, 60%, 90%)`,
                `0 0 50px hsl(${winningHue}, 40%, 95%)`,
                `0 0 60px hsl(${winningHue}, 20%, 98%)`,
                `0 0 70px hsl(${winningHue}, 0%, 100%)`  // ほぼ白
            ];
            winningBanner.style.textShadow = shadowLayers.join(', ');

            entriesTextarea.disabled = false;
            if (spinButtonElement) spinButtonElement.disabled = false;

            // アニメーション終了時にフラグをリセット
            hasOverlayTriggeredInPhase3 = false;
            hasSwitchedInPhase2 = false;
        }
    }

    requestAnimationFrame(animate);
}

// spin() 関数は画像の初期切り替えとアニメーション開始を管理
function spin() {
    updateEntries();
    
    entriesTextarea.disabled = true;
    const spinButton = document.getElementById('spin-btn');
    if (spinButton) spinButton.disabled = true;
    winningBanner.style.display = 'none'; // 新しいスピン開始時にバナーを非表示に

    // オーバーレイ演出の状態を初期化（新しいスピンのたびにリセット）
    overlayImageActive = false;
    overlayImageOpacity = 0;
    overlayFadePhase = 'none';
    overlayFadeStartTime = 0;
    hasOverlayTriggeredInPhase3 = false; // スピン開始時にリセット
    hasSwitchedInPhase2 = false; // スピン開始時にリセット
    tousenSoundPlayed = false; // 当選SE再生フラグをリセット

    const newImageIndex = Math.floor(Math.random() * centerImagePaths.length);
    if (newImageIndex !== currentImageIndex && centerImagePaths.length > 1) {
        imageFadePhase = 'fadeOut';
        fadeStartTime = performance.now();
        
        function animateInitialFadeOut(timestamp) {
            const elapsed = timestamp - fadeStartTime;
            imageOpacity = 1 - Math.min(1, elapsed / FADE_DURATION);
            
            drawScene(angle); // 初期フェードアウト中も描画を続ける
            
            if (imageOpacity > 0) {
                requestAnimationFrame(animateInitialFadeOut);
            } else {
                currentImageIndex = newImageIndex;
                centerImage.src = centerImagePaths[currentImageIndex];
                
                centerImage.onload = () => {
                    centerImage.onload = null;
                    imageFadePhase = 'fadeIn';
                    fadeStartTime = performance.now();
                    
                    function animateInitialFadeIn(timestampFadeIn) {
                        const elapsedFadeIn = timestampFadeIn - fadeStartTime;
                        imageOpacity = Math.min(1, elapsedFadeIn / FADE_DURATION);
                        
                        drawScene(angle); // 初期フェードイン中も描画を続ける
                        
                        if (imageOpacity < 1) {
                            requestAnimationFrame(animateInitialFadeIn);
                        } else {
                            imageFadePhase = 'stable';
                            startSpinAnimationInternal(spinButton);
                        }
                    }
                    requestAnimationFrame(animateInitialFadeIn);
                };
                centerImage.onerror = () => {
                    console.error(`Failed to load ${centerImage.src} for initial fade in.`);
                    imageOpacity = 1;
                    imageFadePhase = 'stable';
                    drawScene(angle); 
                    startSpinAnimationInternal(spinButton);
                };
            }
        }
        requestAnimationFrame(animateInitialFadeOut);

    } else {
        imageOpacity = 1;
        imageFadePhase = 'stable';
        startSpinAnimationInternal(spinButton);
    }
}