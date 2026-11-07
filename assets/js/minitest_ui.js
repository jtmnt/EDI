import { ch2faff, ch2nato } from "./fonetic.js";
import { buildCabrillo, cabrilloFilename } from "./log_cabrillo.js";
import { isValidCallsign } from "./quick_entry.js";
import {
    CONTEST_NAME_DEFAULT,
    SLOT_KEYS,
    computeScore,
    defaultRst,
    formatTimeLeft,
    getPeriodAt,
    getPeriodInfo,
    getRecordPeriod,
    getSlotStatus,
    isDuplicateQso,
    markDuplicates,
    nextSentSerial,
    normalizeFreq,
    normalizeMode,
    normalizeSerial,
    parseMinitestQuickEntry,
    parseUtcDateTime,
    stripModeTokens
} from "./minitest.js";

const $ = function (id) {
    return document.getElementById(id);
};

const t = function (et, en) {
    return document.documentElement.lang === 'et' ? et : en;
};

const store = function (key) {
    return localStorage[key] || '';
};

const isMinitest = function () {
    return localStorage['contest'] === 'minitest';
};

const getRecords = function () {
    try {
        const records = JSON.parse(localStorage['QSORecords_minitest'] || '[]');
        return Array.isArray(records) ? records : [];
    } catch (e) {
        return [];
    }
};

const saveRecords = function (records) {
    localStorage['QSORecords_minitest'] = JSON.stringify(records);
};

const makeElement = function (tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
};

const utcDate = function (date) {
    return date.toISOString().substring(0, 10);
};

const utcTime = function (date) {
    return date.toISOString().substring(11, 16).replace(':', '');
};

let currentMode = localStorage['mt_mode'] === 'SSB' ? 'SSB' : 'CW';
let sentRstDirty = false;
let sentNrDirty = false;
let standardNrTouched = false;
let markNextEntryNew = false;
let lastPeriod = -1;
let lastScore = computeScore([]);

const readSettings = function () {
    return {
        callsign: store('PCall'),
        contest: store('MT_name').trim() || CONTEST_NAME_DEFAULT,
        category: store('MT_class') || 'MIXED',
        operator: store('MT_operator') || 'SINGLE-OP',
        power: store('MT_power') || 'LOW',
        youth: store('MT_youth') === '1',
        age: store('MT_age'),
        club: store('MT_club') === '1',
        name: store('RName'),
        address: store('MT_address'),
        email: store('MT_email'),
        soapbox: store('MT_soapbox')
    };
};

const spellOut = function (text) {
    const spell = localStorage['finnish_fonetics'] == 1 ? ch2faff : ch2nato;
    let result = '';
    for (let i = 0; i < text.length; i++) {
        result = result.concat(i === 0 ? '' : ' ', spell(text.toLowerCase().charAt(i)));
    }
    return result;
};

const updateIdentity = function () {
    const call = store('PCall').toUpperCase();
    const fonetic = spellOut(call);
    $('mt_my_callsign').textContent = call;
    $('mt_my_callsign_fonetic').textContent = fonetic;
    $('mt_live_my_callsign').textContent = call;
    $('mt_live_my_callsign_fonetic').textContent = fonetic;
};

const updateCabrillo = function () {
    $('finalCabrillo').value = buildCabrillo(readSettings(), getRecords());
};

/* Period, score */

const getPeriodText = function () {
    const info = getPeriodInfo(new Date());
    if (info.period === 0) {
        return { outside: true, text: t('Väljaspool võistlusaega', 'Outside contest time') };
    }
    const left = formatTimeLeft(info.secondsLeft);
    return {
        outside: false,
        text: t('Periood ' + info.period + ' · ' + left + ' jäänud', 'Period ' + info.period + ' · ' + left + ' left')
    };
};

const updateIndicators = function () {
    const period = getPeriodText();
    const scoreText = lastScore.qsos + ' QSO · ' + lastScore.points + ' ' + t('p', 'pts') +
        ' (CW ' + lastScore.cw + '×2 + SSB ' + lastScore.ssb + ')' +
        (lastScore.outside > 0 ? ' · ' + lastScore.outside + ' ' + t('väljaspool aega', 'outside time') : '');

    $('mt_live_period').textContent = period.text;
    $('mt_live_period').classList.toggle('mt_outside', period.outside);
    $('mt_live_clock').textContent = 'UTC ' + new Date().toISOString().substring(11, 16);
    $('mt_live_stats').textContent = scoreText;
    $('mt_summary').textContent = period.text + ' · ' + scoreText;
    $('mt_summary').classList.toggle('mt_outside', period.outside);
};

const tick = function () {
    if (!isMinitest() || document.visibilityState === 'hidden') {
        return;
    }
    updateIndicators();
    const period = getPeriodAt(new Date());
    if (period !== lastPeriod) {
        lastPeriod = period;
        updateLiveStatus();
    }
};

/* Mode */

const setMode = function (mode) {
    currentMode = mode === 'SSB' ? 'SSB' : 'CW';
    localStorage['mt_mode'] = currentMode;
    $('mt_mode_cw').classList.toggle('active', currentMode === 'CW');
    $('mt_mode_ssb').classList.toggle('active', currentMode === 'SSB');
    if ($('mt_edit').value == 0) {
        $('mt_mode').value = currentMode;
    }
};

/* Standard entry */

const stdOrder = ['mt_time', 'mt_callsign', 'mt_mode', 'mt_rst_sent', 'mt_nr_sent', 'mt_rst_rcvd', 'mt_nr_rcvd'];

const resetStandardForm = function () {
    $('mt_edit').value = 0;
    $('mt_time').value = '';
    $('mt_callsign').value = '';
    $('mt_mode').value = currentMode;
    $('mt_rst_sent').value = defaultRst(currentMode);
    $('mt_rst_rcvd').value = defaultRst(currentMode);
    $('mt_nr_sent').value = nextSentSerial(getRecords());
    $('mt_nr_rcvd').value = '';
    standardNrTouched = false;
    document.querySelectorAll('#mt_entry .missing').forEach(function (x) {
        x.classList.remove('missing');
    });
};

const addStandard = function () {
    const records = getRecords();
    const editIndex = parseInt($('mt_edit').value, 10) || 0;
    const now = new Date();
    const mode = normalizeMode($('mt_mode').value) || 'CW';

    let time = $('mt_time').value.replace(/[^0-9]/g, '').substring(0, 4);
    if (time === '') {
        time = utcTime(now);
    }
    const call = $('mt_callsign').value.trim().toUpperCase();
    const rstSent = $('mt_rst_sent').value.trim() || defaultRst(mode);
    const rstRcvd = $('mt_rst_rcvd').value.trim() || defaultRst(mode);
    const nrSent = normalizeSerial($('mt_nr_sent').value) || nextSentSerial(records);
    const nrRcvd = normalizeSerial($('mt_nr_rcvd').value);

    document.querySelectorAll('#mt_entry .missing').forEach(function (x) {
        x.classList.remove('missing');
    });
    const timeValid = parseUtcDateTime('2000-01-01', time) !== null;
    if (!timeValid) $('mt_time').classList.add('missing');
    if (call === '') $('mt_callsign').classList.add('missing');
    if (nrRcvd === '') $('mt_nr_rcvd').classList.add('missing');
    if (!timeValid || call === '' || nrRcvd === '') {
        return false;
    }

    const record = {
        date: utcDate(now),
        time: time,
        freq: normalizeFreq(store('MT_freq')),
        mode: mode,
        call: call,
        rstSent: rstSent,
        nrSent: nrSent,
        rstRcvd: rstRcvd,
        nrRcvd: nrRcvd
    };
    if (editIndex > 0 && records[editIndex - 1]) {
        record.date = records[editIndex - 1].date || record.date;
        record.freq = records[editIndex - 1].freq || record.freq;
        records[editIndex - 1] = record;
    } else {
        records.push(record);
    }
    saveRecords(records);
    resetStandardForm();
    refreshAll();
    $('mt_callsign').focus();
    return true;
};

const editRecord = function (index) {
    const record = getRecords()[index];
    if (!record) {
        return;
    }
    $('mt_edit').value = index + 1;
    $('mt_time').value = record.time;
    $('mt_callsign').value = record.call;
    $('mt_mode').value = normalizeMode(record.mode) || 'CW';
    $('mt_rst_sent').value = record.rstSent;
    $('mt_nr_sent').value = record.nrSent;
    $('mt_rst_rcvd').value = record.rstRcvd;
    $('mt_nr_rcvd').value = record.nrRcvd;
};

const deleteRecord = function (index) {
    const records = getRecords();
    records.splice(index, 1);
    saveRecords(records);
    if (parseInt($('mt_edit').value, 10) > 0) {
        resetStandardForm();
    }
    refreshAll();
};

const renderTable = function (records, dupes) {
    const table = $('mt_log');
    table.innerHTML = '';
    records.forEach(function (record, index) {
        const row = makeElement('div', dupes[index] ? 'mtRow mtRowDuplicate' : 'mtRow');
        row.title = getRecordPeriod(record) > 0
            ? t('Periood ', 'Period ') + getRecordPeriod(record)
            : t('Väljaspool võistlusaega', 'Outside contest time');
        [index + 1, record.time, record.call, normalizeMode(record.mode), record.rstSent, record.nrSent, record.rstRcvd, record.nrRcvd].forEach(function (value) {
            row.appendChild(makeElement('div', '', String(value)));
        });

        const actions = makeElement('div');
        const editButton = makeElement('button', 'short green');
        editButton.innerHTML = '&#9998;';
        editButton.addEventListener('click', function () {
            editRecord(index);
        });
        const deleteButton = makeElement('button', 'short red');
        deleteButton.innerHTML = '&cross;';
        deleteButton.addEventListener('click', function () {
            deleteRecord(index);
        });
        actions.appendChild(editButton);
        actions.appendChild(deleteButton);
        row.appendChild(actions);
        table.appendChild(row);
    });
};

/* Live entry */

const getPreviewFields = function () {
    return {
        callsign: $('mt_preview_callsign'),
        rstRcvd: $('mt_preview_rst_rcvd'),
        nrRcvd: $('mt_preview_nr_rcvd'),
        rstSent: $('mt_preview_rst_sent'),
        nrSent: $('mt_preview_nr_sent')
    };
};

const getDraft = function () {
    const fields = getPreviewFields();
    return {
        callsign: fields.callsign.value.trim().toUpperCase(),
        rstRcvd: fields.rstRcvd.value.trim() || defaultRst(currentMode),
        nrRcvd: normalizeSerial(fields.nrRcvd.value),
        rstSent: fields.rstSent.value.trim() || defaultRst(currentMode),
        nrSent: normalizeSerial(fields.nrSent.value) || nextSentSerial(getRecords())
    };
};

const scrollLiveLog = function () {
    requestAnimationFrame(function () {
        const liveLog = $('mt_live_log');
        liveLog.scrollTop = liveLog.scrollHeight;
    });
};

const renderLiveLog = function (records, dupes) {
    const liveLog = $('mt_live_log');
    liveLog.innerHTML = '';
    if (records.length === 0) {
        liveLog.appendChild(makeElement('div', 'live_log_empty', t('QSO ridu veel ei ole.', 'No contacts logged yet.')));
        return;
    }

    const isNew = markNextEntryNew;
    markNextEntryNew = false;
    records.forEach(function (record, index) {
        const isLastNew = isNew && index === records.length - 1;
        const item = makeElement('div', 'live_log_item' + (dupes[index] ? ' live_log_item_duplicate' : '') + (isLastNew ? ' live_log_item_new' : ''));
        const main = makeElement('div', 'live_log_main');
        main.appendChild(makeElement('strong', '', record.call));
        main.appendChild(makeElement('span', '', record.rstRcvd + ' ' + record.nrRcvd));
        const meta = makeElement('div', 'live_log_meta');
        const period = getRecordPeriod(record);
        [record.time.substring(0, 2) + ':' + record.time.substring(2), normalizeMode(record.mode), period > 0 ? 'P' + period : '-', record.rstSent + ' ' + record.nrSent].forEach(function (value) {
            meta.appendChild(makeElement('span', '', value));
        });
        item.appendChild(main);
        item.appendChild(meta);
        liveLog.appendChild(item);
        if (isLastNew) {
            setTimeout(function () {
                item.classList.remove('live_log_item_new');
            }, 1200);
        }
    });
    scrollLiveLog();
};

const buildSlots = function () {
    const slots = $('mt_slots');
    SLOT_KEYS.forEach(function (key) {
        const chip = makeElement('span', '', key);
        chip.dataset.slot = key;
        slots.appendChild(chip);
    });
};

const updateInputState = function () {
    const liveQso = $('mt_live_qso');
    const isDirty = $('mt_quick').value.trim().length > 0;
    const isActive = document.activeElement === $('mt_quick') || $('mt_live_preview').contains(document.activeElement);
    liveQso.classList.toggle('live-draft-dirty', isDirty);
    liveQso.classList.toggle('live-input-active', isActive);
    scrollLiveLog();
};

const updateLiveStatus = function () {
    const draft = getDraft();
    const records = getRecords();
    const now = new Date();
    const period = getPeriodAt(now);
    const status = getSlotStatus(records, draft.callsign);
    const currentSlot = period > 0 ? period + currentMode : '';

    document.querySelectorAll('#mt_slots span').forEach(function (chip) {
        chip.classList.toggle('worked', status[chip.dataset.slot] === true);
        chip.classList.toggle('current', chip.dataset.slot === currentSlot);
    });

    const hasCallsign = draft.callsign.length > 0;
    const callsignValid = isValidCallsign(draft.callsign);
    const isDuplicate = hasCallsign && isDuplicateQso(records, {
        call: draft.callsign, mode: currentMode, date: utcDate(now), time: utcTime(now)
    });
    const isComplete = hasCallsign && draft.nrRcvd.length > 0;

    const card = function (name) {
        return document.querySelector('#mt_live_preview [data-preview-field="' + name + '"]');
    };
    card('callsign').classList.toggle('ready', hasCallsign && callsignValid);
    card('callsign').classList.toggle('invalid', hasCallsign && !callsignValid);
    card('callsign').classList.toggle('duplicate', isDuplicate);
    card('nrrcvd').classList.toggle('ready', draft.nrRcvd.length > 0);
    card('nrrcvd').classList.toggle('missing', hasCallsign && draft.nrRcvd.length === 0);
    card('rstrcvd').classList.toggle('ready', true);
    card('rstsent').classList.toggle('ready', true);
    card('nrsent').classList.toggle('ready', true);

    const liveQso = $('mt_live_qso');
    liveQso.classList.toggle('live-draft-complete', isComplete);
    liveQso.classList.toggle('live-draft-duplicate', isDuplicate);
    $('mt_quick_write').disabled = !isComplete;
    updateInputState();
};

const updateLivePreview = function (raw) {
    const parsed = parseMinitestQuickEntry(raw, currentMode);
    if (parsed.modeExplicit && parsed.mode !== currentMode) {
        setMode(parsed.mode);
    }
    const fields = getPreviewFields();
    fields.callsign.value = parsed.callsign;
    fields.rstRcvd.value = parsed.rstRcvd;
    fields.nrRcvd.value = parsed.nrRcvd;
    if (!sentRstDirty) fields.rstSent.value = defaultRst(currentMode);
    if (!sentNrDirty) fields.nrSent.value = nextSentSerial(getRecords());
    updateLiveStatus();
};

const resetLiveDraft = function () {
    sentRstDirty = false;
    sentNrDirty = false;
    $('mt_quick').value = '';
    updateLivePreview('');
};

const addLiveQso = function () {
    const draft = getDraft();
    if (!draft.callsign || !draft.nrRcvd) {
        return;
    }
    const records = getRecords();
    const now = new Date();
    const record = {
        date: utcDate(now),
        time: utcTime(now),
        freq: normalizeFreq(store('MT_freq')),
        mode: currentMode,
        call: draft.callsign,
        rstSent: draft.rstSent,
        nrSent: draft.nrSent,
        rstRcvd: draft.rstRcvd,
        nrRcvd: draft.nrRcvd
    };

    if (isDuplicateQso(records, record)) {
        const period = getPeriodAt(now);
        const where = period > 0 ? t('periood ' + period, 'period ' + period) : t('väljaspool võistlusaega', 'outside contest time');
        const message = t(
            draft.callsign + ' on juba logis (' + currentMode + ', ' + where + '). Kas lisada duplikaat?',
            draft.callsign + ' is already in the log (' + currentMode + ', ' + where + '). Add duplicate QSO?'
        );
        if (!confirm(message)) {
            $('mt_quick').focus();
            return;
        }
    }

    records.push(record);
    saveRecords(records);
    markNextEntryNew = true;
    resetLiveDraft();
    refreshAll();
    $('mt_quick').focus();
};

/* Refresh */

const refreshAll = function () {
    const records = getRecords();
    const dupes = markDuplicates(records);
    lastScore = computeScore(records);
    renderTable(records, dupes);
    renderLiveLog(records, dupes);
    updateIdentity();
    updateCabrillo();
    updateIndicators();
    if ($('mt_edit').value == 0 && !standardNrTouched) {
        $('mt_nr_sent').value = nextSentSerial(records);
    }
    const fields = getPreviewFields();
    if (!sentNrDirty) fields.nrSent.value = nextSentSerial(records);
    updateLiveStatus();
};

const applyContest = function () {
    const minitest = isMinitest();
    document.body.classList.toggle('contest-minitest', minitest);
    document.body.classList.toggle('live-qso-active', localStorage['log_view_mode'] === 'live');
    if (minitest) {
        setMode(currentMode);
        if ($('mt_edit').value == 0) resetStandardForm();
        refreshAll();
    }
};

/* Wiring */

stdOrder.forEach(function (id, index) {
    $(id).addEventListener('keydown', function (event) {
        if (event.key !== 'Enter') {
            return;
        }
        event.preventDefault();
        if (index === stdOrder.length - 1) {
            addStandard();
        } else {
            $(stdOrder[index + 1]).focus();
        }
    });
});

$('mt_nr_sent').addEventListener('input', function () {
    standardNrTouched = true;
});

$('mt_mode').addEventListener('change', function () {
    const mode = normalizeMode(this.value) || 'CW';
    const other = mode === 'CW' ? 'SSB' : 'CW';
    ['mt_rst_sent', 'mt_rst_rcvd'].forEach(function (id) {
        const field = $(id);
        if (field.value === '' || field.value === defaultRst(other)) {
            field.value = defaultRst(mode);
        }
    });
    if ($('mt_edit').value == 0) {
        setMode(mode);
        updateLiveStatus();
    }
});

$('mt_write').addEventListener('click', addStandard);

$('mt_reset').addEventListener('click', function () {
    if (confirm(t('Kas soovid kindlasti logi tühjendada?', 'Do you really want to clear the log?'))) {
        saveRecords([]);
        resetStandardForm();
        refreshAll();
    }
});

const onModeButton = function (mode) {
    const previous = currentMode;
    setMode(mode);
    const quick = $('mt_quick');
    quick.value = stripModeTokens(quick.value);
    if (quick.value.trim()) {
        updateLivePreview(quick.value);
        return;
    }
    const fields = getPreviewFields();
    if (!sentRstDirty) fields.rstSent.value = defaultRst(currentMode);
    if (fields.rstRcvd.value === defaultRst(previous)) fields.rstRcvd.value = defaultRst(currentMode);
    updateLiveStatus();
};

$('mt_mode_cw').addEventListener('click', function () {
    onModeButton('CW');
});
$('mt_mode_ssb').addEventListener('click', function () {
    onModeButton('SSB');
});

$('mt_quick').addEventListener('input', function () {
    updateLivePreview(this.value);
});
$('mt_quick').addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        addLiveQso();
    }
});
$('mt_quick_write').addEventListener('click', addLiveQso);
$('mt_quick_clear').addEventListener('click', function () {
    if ($('mt_quick').value.trim().length > 0 &&
        !confirm(t('Kas soovid kindlasti sisestuse tühistada?', 'Are you sure you want to clear the entry?'))) {
        return;
    }
    resetLiveDraft();
    $('mt_quick').blur();
});

const previewFields = getPreviewFields();
previewFields.callsign.addEventListener('input', function () {
    this.value = this.value.toUpperCase();
    updateLiveStatus();
});
[previewFields.rstRcvd, previewFields.nrRcvd, previewFields.rstSent, previewFields.nrSent].forEach(function (field) {
    field.addEventListener('input', function () {
        this.value = this.value.replace(/[^0-9]/g, '').substring(0, this.maxLength);
        if (field === previewFields.rstSent) sentRstDirty = true;
        if (field === previewFields.nrSent) sentNrDirty = true;
        updateLiveStatus();
    });
});

$('mt_live_qso').addEventListener('focusin', updateInputState);
$('mt_live_qso').addEventListener('focusout', function () {
    setTimeout(updateInputState, 120);
});

document.querySelectorAll('[data-log-view]').forEach(function (button) {
    button.addEventListener('click', function () {
        if (isMinitest() && button.getAttribute('data-log-view') === 'live') {
            requestAnimationFrame(function () {
                $('mt_quick').focus();
                scrollLiveLog();
            });
        }
    });
});

if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function () {
        if (isMinitest()) scrollLiveLog();
    });
}

const onSettingsChange = function (event) {
    if (event.target.id === 'contest') {
        applyContest();
    } else if (isMinitest()) {
        updateIdentity();
        updateCabrillo();
    }
};
$('edi_header').addEventListener('input', onSettingsChange);
$('edi_header').addEventListener('change', onSettingsChange);
$('finnish_fonetics').addEventListener('change', function () {
    if (isMinitest()) updateIdentity();
});

$('downloadCabrillo').addEventListener('click', function () {
    this.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent($('finalCabrillo').value));
    this.setAttribute('download', cabrilloFilename(store('PCall'), getRecords()));
});

$('mt_standard_view').querySelectorAll('input[type="text"]').forEach(function (field) {
    field.autocomplete = 'off';
});
$('mt_time').placeholder = 'HHMM';
$('mt_nr_sent').placeholder = '001';

buildSlots();
applyContest();
if (isMinitest() && localStorage['log_view_mode'] === 'live') {
    requestAnimationFrame(function () {
        $('mt_quick').focus();
    });
}
setInterval(tick, 1000);
document.addEventListener('visibilitychange', tick);
