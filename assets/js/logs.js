import {ch2faff, ch2nato} from "./fonetic.js";
import { buildFinalEdi, hasPriorDuplicateCallsign } from "./log_helpers.js";
import { getQuickEntryState, isValidCallsign, parseQuickEntry } from "./quick_entry.js";

const getStoredValue = function (key) {
    return localStorage[key] || '';
};

let currentLogView = localStorage['log_view_mode'] || 'standard';
let markNextLiveEntryNew = false;

const updateLiveViewportOffset = function () {
    let offset = 0;
    if (currentLogView === 'live' && window.visualViewport) {
        offset = Math.max(0, window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop);
    }
    document.documentElement.style.setProperty('--live-keyboard-offset', offset + 'px');
    requestAnimationFrame(function () {
        adjustLiveLogScroll(true);
    });
};

const getQSORecords = function () {
    return JSON.parse(localStorage['QSORecords'] || "[]");
};

const getSelectedModeName = function () {
    const select = document.getElementById('log_mode');
    return select.options[select.selectedIndex].textContent;
};

const getLivePreviewFields = function () {
    return {
        callsign: document.getElementById('live_preview_callsign'),
        locator: document.getElementById('live_preview_locator'),
        rxRST: document.getElementById('live_preview_rxrst'),
        txRST: document.getElementById('live_preview_txrst')
    };
};

const getLiveDraft = function () {
    const fields = getLivePreviewFields();
    return {
        callsign: fields.callsign.value.trim().toUpperCase(),
        locator: fields.locator.value.trim().toUpperCase(),
        rxRST: fields.rxRST.value.trim() || '59',
        txRST: fields.txRST.value.trim() || '59'
    };
};

const updateLiveInputState = function () {
    const liveQso = document.querySelector('.live_qso');
    const quickInput = document.getElementById('live_quick');
    const preview = document.getElementById('live_preview');
    if (!liveQso || !quickInput || !preview) {
        return;
    }

    const isDirty = quickInput.value.trim().length > 0;
    const isActive = document.activeElement === quickInput || preview.contains(document.activeElement);
    liveQso.classList.toggle('live-draft-dirty', isDirty);
    liveQso.classList.toggle('live-input-active', isActive);
    requestAnimationFrame(function () {
        adjustLiveLogScroll(true);
    });
};

const getUtcTimeString = function () {
    return new Date().toISOString().substring(11, 16);
};

const confirmDuplicateQso = function (callsign) {
    const isDuplicate = getQSORecords().some(function (record) {
        return record[1] === callsign;
    });
    if (!isDuplicate) {
        return true;
    }

    const message = document.documentElement.lang === 'et'
        ? callsign + ' on juba logis. Kas lisada duplikaat?'
        : callsign + ' is already in the log. Add duplicate QSO?';
    return confirm(message);
};

const getModeNameByValue = function (modeValue) {
    const select = document.getElementById('log_mode');
    const options = Array.from(select.options);
    const match = options.find(function (option) {
        return option.value === modeValue;
    });
    return match ? match.textContent : modeValue;
};

const adjustLiveLogScroll = function (target = true) {
    const liveLog = document.getElementById('live_log');
    if (!liveLog || target === false) {
        return;
    }

    const doScroll = function () {
        if (target === true) {
            liveLog.scrollTo({ top: liveLog.scrollHeight, behavior: 'smooth' });
        } else if (target instanceof HTMLElement) {
            target.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    };

    // Ensure the element is visible and layout is stable before scrolling
    requestAnimationFrame(function () {
        doScroll();
        // Multiple attempts to handle dynamic content height changes during animation
        setTimeout(doScroll, 50);
        setTimeout(doScroll, 150);
        setTimeout(doScroll, 350);
        setTimeout(doScroll, 600);
    });
};

const renderLiveLog = function (records) {
    const liveLog = document.getElementById('live_log');
    if (!liveLog) {
        return;
    }

    liveLog.innerHTML = '';

    if (records.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'live_log_empty';
        empty.textContent = document.documentElement.lang === 'et' ? 'QSO ridu veel ei ole.' : 'No contacts logged yet.';
        liveLog.appendChild(empty);
        return;
    }

    const isNew = markNextLiveEntryNew;
    markNextLiveEntryNew = false;
    let newItem = null;

    records.forEach(function (record, recordIndex) {
        const item = document.createElement('div');
        const isDuplicate = hasPriorDuplicateCallsign(records, recordIndex);
        const isLastNew = isNew && recordIndex === records.length - 1;
        item.className = (isDuplicate ? 'live_log_item live_log_item_duplicate' : 'live_log_item') + (isLastNew ? ' live_log_item_new' : '');
        item.innerHTML = '<div class="live_log_main"><strong>' + record[1] + '</strong><span>' + record[2] + '</span></div>' +
            '<div class="live_log_meta"><span>' + record[0] + '</span><span>' + getModeNameByValue(record[3]) + '</span><span>' + record[4] + '/' + record[5] + '</span></div>';
        liveLog.appendChild(item);

        if (isLastNew) {
            newItem = item;
            setTimeout(function () {
                item.classList.remove('live_log_item_new');
            }, 1200);
        }
    });

    adjustLiveLogScroll(newItem || true);
};

const updateLiveStatusFromDraft = function () {
    const draft = getLiveDraft();
    const records = getQSORecords();
    const duplicateCount = records.filter(function (record) {
        return record[1] === draft.callsign;
    }).length;
    const hasCallsign = draft.callsign.length > 0;
    const hasLocator = draft.locator.length > 0;
    const isComplete = hasCallsign && hasLocator;

    const callsignCard = document.querySelector('[data-preview-field="callsign"]');
    const locatorCard = document.querySelector('[data-preview-field="locator"]');
    const rxCard = document.querySelector('[data-preview-field="rxrst"]');
    const txCard = document.querySelector('[data-preview-field="txrst"]');
    
    if (!callsignCard || !locatorCard || !rxCard || !txCard) return;

    const callsignValid = isValidCallsign(draft.callsign);
    callsignCard.classList.toggle('ready', hasCallsign && callsignValid);
    callsignCard.classList.toggle('invalid', hasCallsign && !callsignValid);
    locatorCard.classList.toggle('ready', hasLocator);
    rxCard.classList.toggle('ready', draft.rxRST.length > 0);
    txCard.classList.toggle('ready', draft.txRST.length > 0);
    callsignCard.classList.toggle('duplicate', duplicateCount > 0);
    locatorCard.classList.toggle('missing', hasCallsign && !hasLocator);

    const liveQso = document.querySelector('.live_qso');
    if (liveQso) {
        liveQso.classList.toggle('live-draft-complete', isComplete);
        liveQso.classList.toggle('live-draft-duplicate', duplicateCount > 0);
    }

    const writeButton = document.getElementById('live_quick_write');
    if (writeButton) writeButton.disabled = !isComplete;
    updateLiveInputState();
};

const updateLivePreview = function (rawValue) {
    const state = getQuickEntryState(rawValue, getStoredValue('PWWLo'), getQSORecords());
    const fields = getLivePreviewFields();
    if (fields.callsign) fields.callsign.value = state.parsed.callsign || '';
    if (fields.locator) fields.locator.value = state.parsed.locator || '';
    if (fields.rxRST) fields.rxRST.value = state.parsed.rxRST || '59';
    if (fields.txRST) fields.txRST.value = state.parsed.txRST || '59';
    const modeNameEl = document.getElementById('live_mode_name');
    if (modeNameEl) modeNameEl.textContent = getSelectedModeName();
    updateLiveStatusFromDraft();
};

const setLogView = function (viewName, pushHistory = true) {
    currentLogView = viewName;
    localStorage['log_view_mode'] = viewName;
    document.body.classList.toggle('live-qso-active', viewName === 'live');
    
    document.querySelectorAll('[data-log-view]').forEach(function (button) {
        button.classList.toggle('active', button.getAttribute('data-log-view') === viewName);
    });
    document.querySelectorAll('[data-log-view-panel]').forEach(function (panel) {
        panel.classList.toggle('active', panel.getAttribute('data-log-view-panel') === viewName);
    });

    updateLiveViewportOffset();

    if (viewName === 'live') {
        if (pushHistory) {
            history.pushState({ logView: 'live' }, '');
        }
        requestAnimationFrame(function() {
            const quickInput = document.getElementById('live_quick');
            if (quickInput) quickInput.focus();
            adjustLiveLogScroll(true);
        });
    }
};


/** Method for updating log entries */
export const refreshLogsTable = function () {
    document.getElementById('log').innerHTML = '';

    let nr = 0;
    let _qsos = [];

    const genQSORecords = function (j) {
        let row = document.createElement('div');
        _qsos.push(j);

        if (hasPriorDuplicateCallsign(_qsos, _qsos.length - 1))
            row.className = "logRow logRowDuplicate"
        else
            row.className = "logRow"

        nr += 1;
        let nrc = document.createElement('div');
        nrc.innerHTML = nr;
        row.appendChild(nrc);

        for (let i = 0; i < j.length; i++) {
            let cell = document.createElement('div');
            cell.innerHTML = j[i];
            row.appendChild(cell);
        }
        let cell = document.createElement('div');

        let editBut = document.createElement('button');
        editBut.innerHTML = '&#9998;';
        editBut.classList.add("short", "green");
        editBut.addEventListener('click', editLog);
        cell.appendChild(editBut);

        let delBut = document.createElement('button');
        delBut.innerHTML = '&cross;';
        delBut.classList.add("short", "red");
        delBut.addEventListener('click', clearLog);
        cell.appendChild(delBut);

        row.appendChild(cell);
        document.getElementById('log').appendChild(row);
    };
    const QSORecords = getQSORecords();
    QSORecords.forEach(x => genQSORecords(x));
    renderLiveLog(QSORecords);
    document.getElementById('live_stat_count').textContent = String(QSORecords.length);
};

export const updatePage = function () {
    const myLocator = getStoredValue('PWWLo');
    const myCall = getStoredValue('PCall');
    const testDate = getStoredValue('TDate');

    let loc = '';
    for (let i = 0; i < myLocator.length; i++) {
        loc = loc.concat((i === 0) ? '' : ' ', (localStorage['finnish_fonetics'] == 1) ? ch2faff(myLocator.toLowerCase().charAt(i)) : ch2nato(myLocator.toLowerCase().charAt(i)));
    }
    document.getElementById('my_locator').innerHTML = myLocator.toUpperCase();
    document.getElementById('my_locator_fonetic').innerHTML = loc;
    if (document.getElementById('live_my_locator')) {
        document.getElementById('live_my_locator').innerHTML = myLocator.toUpperCase();
        document.getElementById('live_my_locator_fonetic').innerHTML = loc;
    }

    loc = '';
    for (let i = 0; i < myCall.length; i++) {
        loc = loc.concat((i === 0) ? '' : ' ', (localStorage['finnish_fonetics'] == 1) ? ch2faff(myCall.toLowerCase().charAt(i)) : ch2nato(myCall.toLowerCase().charAt(i)));
    }
    document.getElementById('my_callsign').innerHTML = myCall.toUpperCase();
    document.getElementById('my_callsign_fonetic').innerHTML = loc;
    if (document.getElementById('live_my_callsign')) {
        document.getElementById('live_my_callsign').innerHTML = myCall.toUpperCase();
        document.getElementById('live_my_callsign_fonetic').innerHTML = loc;
    }

    const QSORecords = getQSORecords();
    document.getElementById('finalEDI').value = buildFinalEdi({
        TDate: testDate,
        PCall: myCall,
        PWWLo: myLocator,
        PSect: localStorage['PSect'] || '',
        RName: localStorage['RName'] || '',
        RCoun: localStorage['RCoun'] || '',
        STXEq: localStorage['STXEq'] || '',
        SPowe: localStorage['SPowe'] || '',
        SRXEq: localStorage['SRXEq'] || '',
        SAnte: localStorage['SAnte'] || '',
        SAntH: localStorage['SAntH'] || '',
        remarks: localStorage['remarks'] || '',
        QSORecords: QSORecords
    }, {
        PSect: document.getElementById('PSect').value,
        RCoun: document.getElementById('RCoun').value
    });
    document.getElementById('live_stat_time').textContent = getUtcTimeString();
    updateLivePreview(document.getElementById('live_quick') ? document.getElementById('live_quick').value : '');
};

const markInputs = function () {
    document.querySelectorAll('.missing').forEach(x => x.classList.remove('missing'));
    if (0 < document.getElementById('log_time').value.length && document.getElementById('log_time').value.length < 4) document.getElementById('log_time').classList.add('missing');
    if (document.getElementById('log_callsign').value.length === 0) document.getElementById('log_callsign').classList.add('missing');
    if (document.getElementById('log_mode').value.length === 0) document.getElementById('log_mode').classList.add('missing');
    if (document.getElementById('log_tx_rst').value.length === 0) document.getElementById('log_tx_rst').classList.add('missing');
    if (document.getElementById('log_loc').value.length === 0) document.getElementById('log_loc').classList.add('missing');
    if (document.getElementById('log_rx_rst').value.length === 0) document.getElementById('log_rx_rst').classList.add('missing');
};

const resetLogForm = function () {
    document.getElementById('log_edit').value = 0;
    document.getElementById('log_time').value = '';
    document.getElementById('log_callsign').value = '';
    document.getElementById('log_loc').value = '';
    document.getElementById('log_tx_rst').value = '59';
    document.getElementById('log_rx_rst').value = '59';
};

const addLog = function () {
    const QSORecords = getQSORecords();

    if (document.getElementById('log_time').value.length <= 0) {
        let ct = new Date();
        document.getElementById('log_time').value = ct.toISOString().match(/\d\d:\d\d/).toString().replace(/[^0-9]/g, '');
    } else {
        document.getElementById('log_time').value = document.getElementById('log_time').value.replace(/[^0-9]/g, '').substring(0, 4);
    }

    markInputs();

    if (
        document.getElementById('log_time').value.length === 4 &&
        document.getElementById('log_callsign').value.length > 0 &&
        document.getElementById('log_mode').value.length > 0 &&
        document.getElementById('log_tx_rst').value.length > 0 &&
        document.getElementById('log_loc').value.length > 0 &&
        document.getElementById('log_rx_rst').value.length > 0
    ) {
        if (document.getElementById('log_edit').value != 0) {
            let e = document.getElementById('log_edit').value;
            QSORecords[e - 1] = [
                document.getElementById('log_time').value.replace(/[^0-9]/g, ''),
                document.getElementById('log_callsign').value.toUpperCase(),
                document.getElementById('log_loc').value.toUpperCase(),
                document.getElementById('log_mode').value,
                document.getElementById('log_tx_rst').value,
                document.getElementById('log_rx_rst').value
            ];
        } else {
            QSORecords.push([
                document.getElementById('log_time').value.replace(/[^0-9]/g, ''),
                document.getElementById('log_callsign').value.toUpperCase(),
                document.getElementById('log_loc').value.toUpperCase(),
                document.getElementById('log_mode').value,
                document.getElementById('log_tx_rst').value,
                document.getElementById('log_rx_rst').value
            ]);
        }
        localStorage['QSORecords'] = JSON.stringify(QSORecords);

        resetLogForm();
        document.getElementById('log_callsign').focus();
        refreshLogsTable();
        updatePage();
        return true;
    }

    refreshLogsTable();
    updatePage();
    return false;
};

const addQuickLog = function () {
    const quickInput = document.getElementById(currentLogView === 'live' ? 'live_quick' : 'log_quick');
    const parsed = currentLogView === 'live' ? getLiveDraft() : parseQuickEntry(quickInput.value, getStoredValue('PWWLo'));

    if (currentLogView === 'live' && parsed.callsign && !confirmDuplicateQso(parsed.callsign)) {
        quickInput.focus();
        return;
    }

    document.getElementById('log_callsign').value = parsed.callsign;
    document.getElementById('log_loc').value = parsed.locator;
    document.getElementById('log_tx_rst').value = parsed.txRST || '59';
    document.getElementById('log_rx_rst').value = parsed.rxRST || '59';

    if (currentLogView === 'live') markNextLiveEntryNew = true;
    if (addLog()) {
        quickInput.value = '';
        document.getElementById('log_quick').value = '';
        document.getElementById('live_quick').value = '';
        quickInput.focus();
        updateLivePreview('');
    }
};

const editLog = function (e) {
    let d = e.target.parentNode.parentNode.children;
    document.getElementById('log_edit').value = d[0].textContent;
    document.getElementById('log_time').value = d[1].textContent;
    document.getElementById('log_callsign').value = d[2].textContent;
    document.getElementById('log_loc').value = d[3].textContent;
    document.getElementById('log_tx_rst').value = d[5].textContent;
    document.getElementById('log_rx_rst').value = d[6].textContent;

    let s = document.getElementById('log_mode');
    let opts = s.options;
    for (let opt, j = 0; opt = opts[j]; j++) {
        if (opt.value === d[4].textContent) {
            s.selectedIndex = j;
            break;
        }
    }
};

const clearLog = function (e) {
    const QSORecords = getQSORecords();
    let d = e.target.parentNode.parentNode.firstChild.textContent;
    QSORecords.splice(d - 1, 1);
    localStorage['QSORecords'] = JSON.stringify(QSORecords);
    refreshLogsTable();
    updatePage();
};

const clearLogs = function () {
    let r = confirm("Do you really want to clear the log?");
    if (r === true) {
        localStorage['QSORecords'] = JSON.stringify([]);
        refreshLogsTable();
        updatePage();
    }
};

document.getElementById('log_time').addEventListener("keydown", function (event) {
    if ((event.key === 'Enter') || (event.key === 'Tab')) {
        event.preventDefault();
        if (this.value.length > 0) {
            this.classList.remove('missing');
        } else {
            let ct = new Date();
            document.getElementById('log_time').value = ct.toISOString().match(/\d\d:\d\d/).toString().replace(/:/g, '').replace(/\./g, '');
        }
        document.getElementById("log_callsign").focus();
    }
});

document.getElementById('log_callsign').addEventListener("keydown", function (event) {
    if (this.value.length > 0) this.classList.remove('missing');
    if (event.key === 'Enter') {
        event.preventDefault();
        if (this.value.length > 0) document.getElementById("log_loc").focus();
    }
});

document.getElementById('log_loc').addEventListener("keydown", function (event) {
    if (this.value.length > 0) this.classList.remove('missing');
    if (event.key === 'Enter') {
        event.preventDefault();
        if (this.value.length > 0) document.getElementById("log_mode").focus();
    }
});

document.getElementById('log_mode').addEventListener("keydown", function (event) {
    if (this.value.length > 0) this.classList.remove('missing');
    if (event.key === 'Enter') {
        event.preventDefault();
        if (this.value.length > 0) document.getElementById("log_tx_rst").focus();
    }
});

document.getElementById('log_tx_rst').addEventListener("keydown", function (event) {
    if ((event.key === 'Enter') || (event.key === 'Tab')) {
        event.preventDefault();
        if (this.value.length === 0) {
            this.value = '59';
            this.classList.remove('missing');
        }
        document.getElementById("log_rx_rst").focus();
    }
});

document.getElementById('log_rx_rst').addEventListener("keydown", function (event) {
    if ((event.key === 'Enter') || (event.key === 'Tab')) {
        event.preventDefault();
        if (this.value.length === 0) this.value = '59';
        addLog();
    }
});

document.getElementById('log_quick').addEventListener("keydown", function (event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        addQuickLog();
    }
});

document.getElementById('live_quick').addEventListener("keydown", function (event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        addQuickLog();
    }
});

document.getElementById('live_quick').addEventListener('input', function () {
    const quickInput = document.getElementById('log_quick');
    if (quickInput.value !== this.value) {
        quickInput.value = this.value;
    }
    updateLivePreview(this.value);
});

getLivePreviewFields().callsign.addEventListener('input', function () {
    this.value = this.value.toUpperCase();
    updateLiveStatusFromDraft();
});

getLivePreviewFields().locator.addEventListener('input', function () {
    this.value = this.value.toUpperCase();
    updateLiveStatusFromDraft();
});

getLivePreviewFields().rxRST.addEventListener('input', function () {
    this.value = this.value.replace(/[^0-9]/g, '').substring(0, 3);
    updateLiveStatusFromDraft();
});

getLivePreviewFields().txRST.addEventListener('input', function () {
    this.value = this.value.replace(/[^0-9]/g, '').substring(0, 3);
    updateLiveStatusFromDraft();
});

document.getElementById('log_mode').addEventListener('change', function () {
    document.getElementById('live_mode_name').textContent = getSelectedModeName();
});

document.querySelectorAll('[data-log-view]').forEach(function (button) {
    button.addEventListener('click', function () {
        setLogView(button.getAttribute('data-log-view'));
    });
});

if (window.visualViewport) {
    const liveQuick = document.getElementById('live_quick');
    let keyboardHeight = 0;
    let minHeightAfterFocus = Infinity;

    const onFocus = function () {
        minHeightAfterFocus = window.visualViewport.height;
        keyboardHeight = 0;
        
        // Push a temporary history state so the first 'back' gesture blurs instead of navigating
        if (!history.state || !history.state.isLiveFocused) {
            history.pushState({ ...history.state, isLiveFocused: true }, '');
        }
    };

    liveQuick.addEventListener('focus', onFocus);
    Object.values(getLivePreviewFields()).forEach(function (field) {
        field.addEventListener('focus', onFocus);
    });

    window.visualViewport.addEventListener('resize', function () {
        const active = document.activeElement;
        const preview = document.getElementById('live_preview');
        const isLiveInput = active === liveQuick || (preview && preview.contains(active));
        
        if (!isLiveInput) return;

        const h = window.visualViewport.height;
        if (h < minHeightAfterFocus) {
            minHeightAfterFocus = h;
            keyboardHeight = window.visualViewport.height;
        }
        if (keyboardHeight > 0 && h > keyboardHeight + 50) {
            active.blur();
        }
    });
}

window.addEventListener('popstate', function (e) {
    // Always blur on back gesture to ensure UI resets
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
    }

    if (e.state && e.state.isLiveFocused) {
        // We just popped the 'focused' state, so the blur above is all we need
        return;
    }

    if (currentLogView === 'live') {
        setLogView('standard', false);
    }
});

document.getElementById('log_reset').addEventListener('click', clearLogs);
document.getElementById('log_write').addEventListener('click', addLog);
document.getElementById('live_quick_write').addEventListener('click', addQuickLog);
document.getElementById('live_quick_clear').addEventListener('click', function() {
    const value = document.getElementById('live_quick').value.trim();
    if (value.length > 0) {
        const message = document.documentElement.lang === 'et'
            ? 'Kas soovid kindlasti sisestuse tühistada?'
            : 'Are you sure you want to clear the entry?';
        if (!confirm(message)) return;
    }
    document.getElementById('live_quick').value = '';
    updateLivePreview('');
    document.getElementById('live_quick').blur();
    updateLiveInputState();
});
setLogView(currentLogView);
updateLivePreview('');
document.getElementById('live_stat_time').textContent = getUtcTimeString();
setInterval(function () {
    document.getElementById('live_stat_time').textContent = getUtcTimeString();
}, 30000);
document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
        document.getElementById('live_stat_time').textContent = getUtcTimeString();
    }
});

if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateLiveViewportOffset);
    window.visualViewport.addEventListener('scroll', updateLiveViewportOffset);
}
window.addEventListener('resize', updateLiveViewportOffset);
document.getElementById('live_quick').addEventListener('focus', updateLiveViewportOffset);
document.getElementById('live_quick').addEventListener('blur', function () {
    setTimeout(updateLiveViewportOffset, 120);
});

document.getElementById('live_quick').addEventListener('focus', updateLiveInputState);
document.getElementById('live_quick').addEventListener('blur', function () {
    setTimeout(updateLiveInputState, 120);
});

Object.values(getLivePreviewFields()).forEach(function (field) {
    field.addEventListener('focus', updateLiveInputState);
    field.addEventListener('blur', function () {
        setTimeout(updateLiveInputState, 120);
    });
});

document.querySelector('.live_qso').addEventListener('focusin', updateLiveInputState);
document.querySelector('.live_qso').addEventListener('focusout', function () {
    setTimeout(updateLiveInputState, 120);
});
