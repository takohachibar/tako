// ==UserScript==
// @name        OldTweetDeck Template Saver (Click Sync & Clear Feature)
// @namespace   Violentmonkey Scripts
// @version     2.3
// @description  投稿欄の上にドロップダウン形式でテンプレート機能を追加
// @author       tako
// @match        https://x.com/i/tweetdeck
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    var STORAGE_KEY = 'otd_text_templates';
    var cachedHashtags = ''; // ハッシュタグの一時記憶メモリ

    function getTemplates() {
        var saved = localStorage.getItem(STORAGE_KEY);
        return saved ? JSON.parse(saved) : [];
    }

    function saveTemplates(templates) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    }

    // 安全に入力欄の文字を書き換える関数
    function updateFormValue(form, newValue) {
        var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
        nativeInputValueSetter.call(form, newValue);
        form.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // 文字を上書きした後、入力欄にフォーカスを当てて確実に先頭へジャンプさせる
    function insertTextToForm(form, text) {
        updateFormValue(form, text);
        form.focus(); // 入力欄をアクティブにする
        form.setSelectionRange(0, 0); // カーソルを先頭（0文字目）に移動

        var tags = text.match(/(?:^|\s)#\S+/g);
        cachedHashtags = tags ? tags.map(function(s){ return s.trim(); }).join(' ') : '';
    }

    function updateTemplateUI(container, form) {
        container.innerHTML = '';
        container.style.cssText = 'margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #38444d; display: flex; gap: 6px; align-items: center; width: 100%;';

        var templates = getTemplates();

        var select = document.createElement('select');
        select.style.cssText = 'flex: 1; min-width: 0; background: #2f3336; color: #e7e9ea; border: 1px solid #38444d; padding: 4px; border-radius: 4px; font-size: 11px; cursor: pointer;';

        var defaultOpt = document.createElement('option');
        defaultOpt.text = templates.length > 0 ? '▼ テンプレートを選択 (' + templates.length + ')' : '▼ 登録がありません';
        defaultOpt.value = ''; // 空文字をセット
        select.appendChild(defaultOpt);

        templates.forEach(function(text, index) {
            var opt = document.createElement('option');
            opt.value = text;
            opt.text = text.length > 25 ? text.substring(0, 25) + '...' : text;
            select.appendChild(opt);
        });

        // 【修正点】選択が変更されたときの処理
        select.onchange = function() {
            if (select.value) {
                // 通常のテンプレートを選択した場合（上書き）
                insertTextToForm(form, select.value);
            } else {
                // 「▼ テンプレートを選択」を選び直した場合（完全クリア＋フォーカス）
                updateFormValue(form, '');
                form.focus();
                form.setSelectionRange(0, 0);
                cachedHashtags = ''; // メモリもクリア
            }
        };
        container.appendChild(select);

        var delBtn = document.createElement('button');
        delBtn.innerText = '🗑️';
        delBtn.type = 'button';
        delBtn.title = '選択中のテンプレートを削除';
        delBtn.style.cssText = 'background: transparent; border: 1px solid #38444d; padding: 4px 6px; border-radius: 4px; cursor: pointer; font-size: 11px;';
        delBtn.onclick = function() {
            var selectedIndex = select.selectedIndex;
            if (selectedIndex > 0) {
                var targetText = templates[selectedIndex - 1];
                if (confirm('このテンプレートを削除しますか？\n\n' + targetText)) {
                    var currentFormValue = form.value;
                    if (currentFormValue.includes(targetText)) {
                        var cleanedValue = currentFormValue.replace(targetText, '').replace(/\s+/g, ' ').trim();
                        updateFormValue(form, cleanedValue);
                        form.focus();
                        form.setSelectionRange(0, 0);
                    }
                    templates.splice(selectedIndex - 1, 1);
                    saveTemplates(templates);
                    updateTemplateUI(container, form);
                }
            } else {
                alert('削除したいテンプレートをドロップダウンリストから選択した状態で、ゴミ箱ボタンを押してください。');
            }
        };
        container.appendChild(delBtn);

        var saveBtn = document.createElement('button');
        saveBtn.innerText = '＋ 保存';
        saveBtn.type = 'button';
        saveBtn.style.cssText = 'background: #1d9bf0; color: #fff; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold; white-space: nowrap;';
        saveBtn.onclick = function() {
            var text = form.value.trim();
            if (!text) {
                alert('投稿欄に文字を入力してから保存してください。');
                return;
            }
            if (templates.includes(text)) {
                alert('このテンプレートは既に登録されています。');
                return;
            }
            if (templates.length >= 50) {
                alert('保存できるテンプレートは最大50個までです。');
                return;
            }
            templates.push(text);
            saveTemplates(templates);
            updateTemplateUI(container, form);
        };
        container.appendChild(saveBtn);
    }

    // リプライボタンのクリックイベントとの同期処理
    document.addEventListener('click', function(e) {
        const replyBtn = e.target.closest('.js-reply-action, [data-action="reply"], .tweet-action[class*="reply" i]');
        if (!replyBtn) return;

        const form = document.querySelector('textarea.js-compose-text, textarea[data-testid="tweetTextarea"], .compose-text textarea, .inline-reply-textarea, textarea.js-reply-tweet-text');
        if (!form) return;

        const currentTags = form.value.match(/(?:^|\s)#\S+/g);
        if (currentTags) {
            cachedHashtags = currentTags.map(function(s){ return s.trim(); }).join(' ');
        }

        setTimeout(function() {
            const newForm = document.querySelector('textarea.js-compose-text, textarea[data-testid="tweetTextarea"], .compose-text textarea, .inline-reply-textarea, textarea.js-reply-tweet-text');
            if (newForm && cachedHashtags && !newForm.value.includes('#')) {
                updateFormValue(newForm, cachedHashtags);
                newForm.focus();
                newForm.setSelectionRange(0, 0);
            }
        }, 200);
    }, true);

    // ドロップダウンメニューの設置（1秒に1回の軽量ループ）
    setInterval(function() {
        var form = document.querySelector('textarea.js-compose-text, textarea[data-testid="tweetTextarea"], .compose-text textarea, .inline-reply-textarea, textarea.js-reply-tweet-text');
        if (!form) return;

        if (!document.getElementById('otd-template-container')) {
            var container = document.createElement('div');
            container.id = 'otd-template-container';
            var parent = form.closest('.compose-text-container') || form.closest('.reply-text-container') || form.parentElement;
            if (parent) {
                parent.insertBefore(container, form);
                updateTemplateUI(container, form);
            }
        }
    }, 1000);
})();