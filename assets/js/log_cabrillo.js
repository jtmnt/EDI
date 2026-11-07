import { CONTEST_NAME_DEFAULT, DEFAULT_FREQ, computeScore, normalizeMode, normalizeSerial } from "./minitest.js";

const splitLines = function (text) {
    return (text || '').split(/\r?\n/).map(function (line) {
        return line.trim();
    }).filter(Boolean);
};

const padRight = function (value, width) {
    return String(value).padEnd(width, ' ');
};

export const toCabrilloMode = function (mode) {
    return normalizeMode(mode) === 'SSB' ? 'PH' : 'CW';
};

export const buildCabrilloQsoLine = function (callsign, record) {
    const freq = String(record.freq || DEFAULT_FREQ).padStart(5, ' ');
    return ('QSO: ' + freq +
        ' ' + toCabrilloMode(record.mode) +
        ' ' + (record.date || '') +
        ' ' + (record.time || '') +
        ' ' + padRight((callsign || '').toUpperCase(), 13) +
        ' ' + padRight(record.rstSent || '', 3) +
        ' ' + padRight(normalizeSerial(record.nrSent), 6) +
        ' ' + padRight((record.call || '').toUpperCase(), 13) +
        ' ' + padRight(record.rstRcvd || '', 3) +
        ' ' + padRight(normalizeSerial(record.nrRcvd), 6)).trimEnd();
};

/**
 * settings: callsign, contest, category (MIXED|CW|SSB), operator (SINGLE-OP|MULTI-OP),
 * power (LOW|QRP), youth, age, club, name, address, email, soapbox
 */
export const buildCabrillo = function (settings, records) {
    const callsign = (settings.callsign || '').toUpperCase();
    const category = (settings.category || '').toUpperCase();
    const lines = [
        'START-OF-LOG: 3.0',
        'CONTEST: ' + (settings.contest || CONTEST_NAME_DEFAULT),
        'CALLSIGN: ' + callsign,
        'CATEGORY-OPERATOR: ' + ((settings.operator || '').toUpperCase() === 'MULTI-OP' ? 'MULTI-OP' : 'SINGLE-OP'),
        'CATEGORY-BAND: 80M',
        'CATEGORY-MODE: ' + (category === 'CW' || category === 'SSB' ? category : 'MIXED'),
        'CATEGORY-POWER: ' + ((settings.power || '').toUpperCase() === 'QRP' ? 'QRP' : 'LOW'),
        'CATEGORY-TRANSMITTER: ONE'
    ];
    if (settings.youth) {
        lines.push('CATEGORY-OVERLAY: YOUTH');
    }
    lines.push('CLAIMED-SCORE: ' + computeScore(records).points);
    if (settings.name) {
        lines.push('NAME: ' + settings.name);
    }
    splitLines(settings.address).forEach(function (line) {
        lines.push('ADDRESS: ' + line);
    });
    if (settings.email) {
        lines.push('EMAIL: ' + settings.email);
    }
    if (settings.youth && settings.age) {
        lines.push('SOAPBOX: Vanus: ' + settings.age);
    }
    if (settings.club) {
        lines.push('SOAPBOX: Klubijaam');
    }
    splitLines(settings.soapbox).forEach(function (line) {
        lines.push('SOAPBOX: ' + line);
    });
    lines.push('CREATED-BY: EDI/minitest (fork of ES1BBQ EDI)');
    (records || []).forEach(function (record) {
        lines.push(buildCabrilloQsoLine(callsign, record));
    });
    lines.push('END-OF-LOG:');
    return lines.join('\n');
};

export const cabrilloFilename = function (callsign, records, now = new Date()) {
    const first = (records || []).find(function (record) {
        return record && record.date;
    });
    const date = (first ? first.date : now.toISOString().substring(0, 10)).replace(/-/g, '');
    const call = (callsign || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '-');
    return 'minitest_' + (call ? call + '_' : '') + date + '.log';
};
