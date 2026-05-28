// ==UserScript==
// @name        OldTweetDeck Media Reorder Buttons (Description Docking)
// @namespace   http://tampermonkey.net
// @version     3.2
// @description  画像のレイアウトを100%崩さず、説明欄の横に確実に並び替えボタンを合体
// @author       tako
// @match        https://x.com/i/tweetdeck
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // --- 1. 一括ドラッグ＆ドロップ（軽量ペーストハック） ---
    function setupBulkUpload() {
        const composeArea = document.querySelector('textarea.js-compose-text, textarea[data-testid="tweetTextarea"], .compose-text textarea');
        if (!composeArea || composeArea.dataset.bulkReady) return;

        composeArea.dataset.bulkReady = "true";

        composeArea.addEventListener('dragover', (e) => e.preventDefault());
        composeArea.addEventListener('drop', function(e) {
            const files = e.dataTransfer ? e.dataTransfer.files : null;
            if (!files || files.length === 0) return;

            e.preventDefault();
            e.stopPropagation();

            const dt = new DataTransfer();
            let count = 0;
            for (let i = 0; i < files.length; i++) {
                if (count >= 4) break;
                if (files[i].type.startsWith('image/') || files[i].type.startsWith('video/')) {
                    dt.items.add(files[i]);
                    count++;
                }
            }

            const pasteEvent = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: dt
            });
            composeArea.dispatchEvent(pasteEvent);
        }, true);
    }

    // --- 2. 「Add description」ボタンの横に並び替えボタンをドッキング ---
    function setupReorderButtons() {
        // 投稿欄の中にある「Add description（説明を追加）」のボタン・テキスト枠をすべて探す
        const allElements = document.querySelectorAll('*');

        allElements.forEach(el => {
            // 末端のテキスト要素で、「Add description」または「説明を追加」という文字を含んでいる場合
            if (el.children.length === 0 && el.textContent && (el.textContent.includes('Add description') || el.textContent.includes('説明を追加'))) {

                // タイムラインの画像を完全に除外するため、投稿エリアの中にあるものだけに対象を限定
                if (!el.closest('.compose-text-container, .js-compose-box, .drawer, [role="dialog"], #ext-compose-box')) return;

                // 通常、el は <a> や <span>。その「親要素（ボタン全体の枠）」を取得
                const descriptionBtn = el.parentElement;
                if (!descriptionBtn || descriptionBtn.dataset.hasReorderBtn) return;
                descriptionBtn.dataset.hasReorderBtn = "true"; // 二重設置を防止

                // この画像1枚全体を包んでいるカード枠（DOM並び替えの対象）を特定
                const imageCell = descriptionBtn.closest('.compose-media-preview, .js-media-preview, .media-preview, [data-testid="imageCell"]') || descriptionBtn.parentElement;
                if (!imageCell) return;

                const mediaContainer = imageCell.parentElement;
                if (!mediaContainer) return;

                // ボタンを入れる小さなコンテナを作成（説明ボタンの右側にくっつける）
                const btnContainer = document.createElement('span');
                btnContainer.className = 'otd-move-btn-container';
                btnContainer.style.cssText = 'display: inline-flex; gap: 2px; margin-left: 6px; vertical-align: middle; pointer-events: auto;';

                // デザインに馴染む黒半透明のミニボタンスタイル
                const btnStyle = 'background: rgba(0, 0, 0, 0.85); color: #fff; border: 1px solid #555; border-radius: 3px; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; font-size: 9px; font-weight: bold; padding: 0; line-height: 1;';

                // 左（前）へ移動ボタン ◀
                const leftBtn = document.createElement('button');
                leftBtn.type = 'button';
                leftBtn.innerText = '◀';
                leftBtn.style.cssText = btnStyle;
                leftBtn.onclick = function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const prev = imageCell.previousElementSibling;
                    if (prev) {
                        mediaContainer.insertBefore(imageCell, prev); // 画像の順番を入れ替え
                        syncInternalState(mediaContainer);
                    }
                };

                // 右（後）へ移動ボタン ▶
                const rightBtn = document.createElement('button');
                rightBtn.type = 'button';
                rightBtn.innerText = '▶';
                rightBtn.style.cssText = btnStyle;
                rightBtn.onclick = function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const next = imageCell.nextElementSibling;
                    if (next) {
                        mediaContainer.insertBefore(next, imageCell); // 画像の順番を入れ替え
                        syncInternalState(mediaContainer);
                    }
                };

                btnContainer.appendChild(leftBtn);
                btnContainer.appendChild(rightBtn);

                // 「Add description」ボタンの文字列のすぐ後ろ（右側）に合体させる
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

    // 1秒周期で安全にスキャン
    setInterval(() => {
        setupBulkUpload();
        setupReorderButtons();
    }, 1000);

})();