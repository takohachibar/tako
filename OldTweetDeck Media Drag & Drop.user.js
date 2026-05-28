// ==UserScript==
// @name        OldTweetDeck Media Drag & Drop
// @namespace   Violentmonkey Scripts
// @version     1.1
// @description  画像だけでなく動画の一括ドロップ読み込みにも100%確実に対応した独立スクリプト
// @author       tako
// @match        https://x.com/i/tweetdeck
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // --- 1. 一括ドラッグ＆ドロップ（ネイティブ入力機能ハック） ---
    function setupBulkUpload() {
        // 投稿エリア全体をターゲットにする
        const composeArea = document.querySelector('.compose-text-container, .js-compose-box, [data-testid="SideNav_NewTweet_Button"] ~ div, #ext-compose-box');
        if (!composeArea || composeArea.dataset.bulkReady) return;

        composeArea.dataset.bulkReady = "true";

        // ドラッグオーバー（最速処理）
        composeArea.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        // ドロップ時の処理
        composeArea.addEventListener('drop', function(e) {
            const files = e.dataTransfer ? e.dataTransfer.files : null;
            if (!files || files.length === 0) return;

            e.preventDefault();
            e.stopPropagation();

            // OldTweetDeckの隠されたファイル入力欄（input[type="file"]）を特定
            const fileInput = document.querySelector('.js-media-file-input, input[type="file"][accept*="image"], input[type="file"]');
            if (!fileInput) return;

            // ネイティブのDataTransferオブジェクトを作成してファイルを格納
            const dt = new DataTransfer();
            let count = 0;

            // ドロップされたファイルから画像と動画を両方安全に抽出（最大4枠制限、動画は通常1枚）
            for (let i = 0; i < files.length; i++) {
                if (count >= 4) break;
                if (files[i].type.startsWith('image/') || files[i].type.startsWith('video/')) {
                    dt.items.add(files[i]);
                    count++;
                }
            }

            // 【核心修正】input要素に直接ファイルデータを流し込む
            fileInput.files = dt.files;

            // Reactの内部状態監視システムに値が変更されたことを強制的に割り込んで登録する
            const valueTracker = fileInput._valueTracker;
            if (valueTracker) {
                valueTracker.setValue(dt.files);
            }

            // TweetDeck側の「画像/動画アップロード処理」を安全に、かつ確実に発火させるイベントの連打
            fileInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            fileInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        }, true);
    }

    // --- 2. 「Add description」ボタンの横に並び替えボタンをドッキング ---
    function setupReorderButtons() {
        const allElements = document.querySelectorAll('*');

        allElements.forEach(el => {
            if (el.children.length === 0 && el.textContent && (el.textContent.includes('Add description') || el.textContent.includes('説明を追加'))) {
                if (!el.closest('.compose-text-container, .js-compose-box, .drawer, [role="dialog"], #ext-compose-box')) return;

                const descriptionBtn = el.parentElement;
                if (!descriptionBtn || descriptionBtn.dataset.hasReorderBtn) return;
                descriptionBtn.dataset.hasReorderBtn = "true";

                const imageCell = descriptionBtn.closest('.compose-media-preview, .js-media-preview, .media-preview, [data-testid="imageCell"]') || descriptionBtn.parentElement;
                if (!imageCell) return;

                const mediaContainer = imageCell.parentElement;
                if (!mediaContainer) return;

                const btnContainer = document.createElement('span');
                btnContainer.className = 'otd-move-btn-container';
                btnContainer.style.cssText = 'display: inline-flex; gap: 2px; margin-left: 6px; vertical-align: middle; pointer-events: auto;';

                const btnStyle = 'background: rgba(0, 0, 0, 0.85); color: #fff; border: 1px solid #555; border-radius: 3px; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; font-size: 9px; font-weight: bold; padding: 0; line-height: 1;';

                const leftBtn = document.createElement('button');
                leftBtn.type = 'button';
                leftBtn.innerText = '◀';
                leftBtn.style.cssText = btnStyle;
                leftBtn.onclick = function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const prev = imageCell.previousElementSibling;
                    if (prev) {
                        mediaContainer.insertBefore(imageCell, prev);
                        syncInternalState(mediaContainer);
                    }
                };

                const rightBtn = document.createElement('button');
                rightBtn.type = 'button';
                rightBtn.innerText = '▶';
                rightBtn.style.cssText = btnStyle;
                rightBtn.onclick = function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const next = imageCell.nextElementSibling;
                    if (next) {
                        mediaContainer.insertBefore(next, imageCell);
                        syncInternalState(mediaContainer);
                    }
                };

                btnContainer.appendChild(leftBtn);
                btnContainer.appendChild(rightBtn);
                descriptionBtn.appendChild(btnContainer);
            }
        });
    }

    // --- 3. 見た目の順序と内部ファイル配列の同期 ---
    function syncInternalState(mediaContainer) {
        const fileInput = document.querySelector('.js-media-file-input, input[type="file"][accept^="image/"]');
        if (!fileInput || !mediaContainer || !fileInput.files.length) return;

        const thumbs = Array.from(mediaContainer.children);
        const currentFiles = Array.from(fileInput.files);
        const newFilesOrder = [];

        thumbs.forEach((thumb) => {
            let fileIndex = thumb.dataset.originalIndex;
            if (fileIndex === undefined) {
                fileIndex = thumbs.indexOf(thumb);
                thumb.dataset.originalIndex = fileIndex;
            }
            if (currentFiles[fileIndex]) {
                newFilesOrder.push(currentFiles[fileIndex]);
            }
        });

        thumbs.forEach((thumb, idx) => {
            thumb.dataset.originalIndex = idx;
        });

        if (newFilesOrder.length > 0) {
            const dt = new DataTransfer();
            newFilesOrder.forEach(file => dt.items.add(file));
            fileInput.files = dt.files;

            const reactKey = Object.keys(fileInput).find(key => key.startsWith('__reactProps') || key.startsWith('__reactEventHandlers'));
            if (reactKey && fileInput[reactKey] && typeof fileInput[reactKey].onChange === 'function') {
                fileInput[reactKey].onChange({
                    target: fileInput,
                    currentTarget: fileInput,
                    preventDefault: () => {},
                    stopPropagation: () => {}
                });
            }
        }
    }

    // 全体監視は負荷をかけない2秒に1回モード
    setInterval(() => {
        setupBulkUpload();
        setupReorderButtons();
    }, 2000);

})();