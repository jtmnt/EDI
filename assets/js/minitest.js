import { isNumericToken, tokenizeQuickEntry } from "./quick_entry.js";

export const CONTEST_NAME_DEFAULT = 'ES-LL-KV';
export const DEFAULT_FREQ = '3500';
export const SLOT_KEYS = ['1CW', '1SSB', '2CW', '2SSB', '3CW', '3SSB', '4CW', '4SSB'];

const MODE_TOKENS = {
    cw: 'CW',
    ssb: 'SSB',
    ph: 'SSB'
};

const tallinnFormat = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Tallinn',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
});

export const normalizeMode = function (mode) {
    const value = (mode || '').toString().trim().toUpperCase();
    if (value === 'CW') {
        return 'CW';
    }
    if (value === 'SSB' || value === 'PH' || value === 'PHONE' || value === 'USB' || value === 'LSB') {
        return 'SSB';
    }
    return '';
};

export const defaultRst = function (mode) {
    return normalizeMode(mode) === 'SSB' ? '59' : '599';
};

export const normalizeSerial = function (value) {
    const digits = (value || '').toString().replace(/[^0-9]/g, '');
    return digits === '' ? '' : digits.padStart(3, '0');
};

export const normalizeFreq = function (value) {
    const number = parseFloat((value || '').toString().replace(',', '.'));
    if (!isFinite(number) || number <= 0) {
        return DEFAULT_FREQ;
    }
    return String(Math.round(number));
};

export const getTallinnParts = function (date) {
    const parts = {};
    tallinnFormat.formatToParts(date).forEach(function (part) {
        if (part.type !== 'literal') {
            parts[part.type] = parseInt(part.value, 10);
        }
    });
    return parts;
};

const periodFromHourMinute = function (hour, minute) {
    return hour === 10 ? Math.floor(minute / 15) + 1 : 0;
};

/** Returns 1-4 inside the contest hour (Europe/Tallinn), 0 outside. */
export const getPeriodAt = function (date) {
    const parts = getTallinnParts(date);
    return periodFromHourMinute(parts.hour, parts.minute);
};

export const getPeriodInfo = function (date) {
    const parts = getTallinnParts(date);
    const period = periodFromHourMinute(parts.hour, parts.minute);
    return {
        period: period,
        secondsLeft: period > 0 ? (15 - (parts.minute % 15)) * 60 - parts.second : null
    };
};

export const parseUtcDateTime = function (dateString, timeString) {
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec((dateString || '').trim());
    const timeDigits = (timeString || '').toString().replace(/[^0-9]/g, '');
    if (!dateMatch || timeDigits.length !== 4) {
        return null;
    }
    const hour = parseInt(timeDigits.substring(0, 2), 10);
    const minute = parseInt(timeDigits.substring(2), 10);
    if (hour > 23 || minute > 59) {
        return null;
    }
    const date = new Date(Date.UTC(parseInt(dateMatch[1], 10), parseInt(dateMatch[2], 10) - 1, parseInt(dateMatch[3], 10), hour, minute));
    return isNaN(date.getTime()) ? null : date;
};

export const getPeriodForUtc = function (dateString, timeString) {
    const date = parseUtcDateTime(dateString, timeString);
    return date ? getPeriodAt(date) : 0;
};

export const formatTimeLeft = function (seconds) {
    const total = Math.max(0, seconds || 0);
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return String(minutes).padStart(2, '0') + ':' + String(rest).padStart(2, '0');
};

export const parseMinitestQuickEntry = function (raw, defaultMode = 'CW') {
    let callsign = '';
    let explicitMode = '';
    const numbers = [];

    tokenizeQuickEntry(raw).forEach(function (token) {
        const modeToken = MODE_TOKENS[token.toLowerCase()];
        if (modeToken) {
            explicitMode = modeToken;
        } else if (isNumericToken(token)) {
            numbers.push(token);
        } else if (!callsign) {
            callsign = token.toUpperCase();
        }
    });

    const mode = explicitMode || normalizeMode(defaultMode) || 'CW';
    let rstRcvd = defaultRst(mode);
    let nrRcvd = '';
    if (numbers.length === 1) {
        nrRcvd = numbers[0];
    } else if (numbers.length >= 2) {
        rstRcvd = numbers[0];
        nrRcvd = numbers[1];
    }

    return {
        callsign: callsign,
        mode: mode,
        modeExplicit: explicitMode !== '',
        rstRcvd: rstRcvd,
        nrRcvd: normalizeSerial(nrRcvd)
    };
};

export const stripModeTokens = function (raw) {
    const text = raw || '';
    const kept = tokenizeQuickEntry(text).filter(function (token) {
        return !MODE_TOKENS[token.toLowerCase()];
    });
    const joined = kept.join(' ');
    return joined !== '' && /\s$/.test(text) ? joined + ' ' : joined;
};

export const nextSentSerial = function (records) {
    let max = 0;
    (records || []).forEach(function (record) {
        const value = parseInt(record && record.nrSent, 10);
        if (!isNaN(value) && value > max) {
            max = value;
        }
    });
    return normalizeSerial(String(max + 1));
};

export const getRecordPeriod = function (record) {
    return getPeriodForUtc(record.date, record.time);
};

const qsoKey = function (record) {
    return [
        (record.call || '').toUpperCase(),
        normalizeMode(record.mode),
        getRecordPeriod(record)
    ].join('|');
};

export const isDuplicateQso = function (records, candidate) {
    const key = qsoKey(candidate);
    return (records || []).some(function (record) {
        return qsoKey(record) === key;
    });
};

/** Marks every record that repeats an earlier call + mode + period. */
export const markDuplicates = function (records) {
    const seen = new Set();
    return (records || []).map(function (record) {
        const key = qsoKey(record);
        if (seen.has(key)) {
            return true;
        }
        seen.add(key);
        return false;
    });
};

/** Counts non-dupe QSOs inside the contest hour; others are reported, not scored. */
export const computeScore = function (records) {
    const dupes = markDuplicates(records);
    let cw = 0;
    let ssb = 0;
    let dupeCount = 0;
    let outside = 0;
    (records || []).forEach(function (record, index) {
        if (dupes[index]) {
            dupeCount += 1;
            return;
        }
        if (getRecordPeriod(record) === 0) {
            outside += 1;
            return;
        }
        const mode = normalizeMode(record.mode);
        if (mode === 'CW') {
            cw += 1;
        } else if (mode === 'SSB') {
            ssb += 1;
        }
    });
    return {
        qsos: cw + ssb,
        dupes: dupeCount,
        outside: outside,
        cw: cw,
        ssb: ssb,
        cwPoints: cw * 2,
        ssbPoints: ssb,
        points: cw * 2 + ssb
    };
};

/** Which of the eight period/mode slots are already worked with this call. */
export const getSlotStatus = function (records, callsign) {
    const status = {};
    SLOT_KEYS.forEach(function (key) {
        status[key] = false;
    });
    const call = (callsign || '').trim().toUpperCase();
    if (!call) {
        return status;
    }
    (records || []).forEach(function (record) {
        if ((record.call || '').toUpperCase() !== call) {
            return;
        }
        const period = getRecordPeriod(record);
        const mode = normalizeMode(record.mode);
        if (period > 0 && mode) {
            status[period + mode] = true;
        }
    });
    return status;
};
