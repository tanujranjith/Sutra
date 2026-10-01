/* Foreground backup presentation. Builders and providers remain core-owned;
 * only explicitly started operations publish this transient lifecycle. */
(function () {
    'use strict';
    var operations = new Map();
    var overlay = null;
    var stageLabels = {
        saving: 'Saving your latest changes…',
        attachments: 'Checking and gathering required files…',
        packaging: 'Preparing your complete workspace…',
        encrypting: 'Encrypting your backup on this device…',
        downloading: 'Sending the file to your browser or backup folder…',
        uploading: 'Saving the encrypted file to your backup destination…',
        retention: 'Finishing backup storage…'
    };

    function ensureOverlay() {
        if (overlay) return overlay;
        overlay = document.createElement('div');
        overlay.id = 'sutraBackupProgress';
        overlay.className = 'modal sutra-backup-progress';
        overlay.hidden = true;
        overlay.setAttribute('data-sutra-no-escape', 'true');
        var dialog = document.createElement('section');
        dialog.className = 'sutra-backup-progress__dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'sutraBackupProgressTitle');
        dialog.setAttribute('aria-describedby', 'sutraBackupProgressStage sutraBackupProgressHelp');
        dialog.tabIndex = -1;
        var heading = document.createElement('h2');
        heading.id = 'sutraBackupProgressTitle';
        heading.textContent = 'Backing up…';
        var progress = document.createElement('progress');
        progress.className = 'sutra-backup-progress__indicator';
        progress.setAttribute('aria-label', 'Backup in progress');
        var stage = document.createElement('p');
        stage.id = 'sutraBackupProgressStage';
        stage.setAttribute('role', 'status');
        stage.setAttribute('aria-live', 'polite');
        stage.setAttribute('aria-atomic', 'true');
        var help = document.createElement('p');
        help.id = 'sutraBackupProgressHelp';
        help.className = 'sutra-backup-progress__help';
        help.textContent = 'Keep Sutra open until this finishes. Large files can take a moment.';
        dialog.append(heading, progress, stage, help);
        overlay.appendChild(dialog);
        overlay.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
            }
        });
        document.body.appendChild(overlay);
        return overlay;
    }

    document.addEventListener('sutra:backup-progress', function (event) {
        var detail = event && event.detail;
        if (!detail || typeof detail.id !== 'string') return;
        if (detail.phase === 'start') operations.set(detail.id, 'saving');
        else if (detail.phase === 'end') operations.delete(detail.id);
        else if (detail.phase === 'stage' && operations.has(detail.id) && stageLabels[detail.stage]) {
            operations.set(detail.id, detail.stage);
        } else return;
        if (!overlay && !operations.size) return;
        var root = ensureOverlay();
        var visible = operations.size > 0;
        root.hidden = !visible;
        root.classList.toggle('active', visible);
        if (visible) {
            var stages = Array.from(operations.values());
            var label = stageLabels[stages[stages.length - 1]];
            var status = root.querySelector('#sutraBackupProgressStage');
            if (status.textContent !== label) status.textContent = label;
        }
        if (window.SutraModalManager && typeof window.SutraModalManager.sync === 'function') {
            window.SutraModalManager.sync();
        }
    });
}());
