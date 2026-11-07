import test from 'node:test';
import assert from 'node:assert/strict';

import {
    computeScore,
    defaultRst,
    formatTimeLeft,
    getPeriodAt,
    getPeriodForUtc,
    getPeriodInfo,
    getSlotStatus,
    isDuplicateQso,
    markDuplicates,
    nextSentSerial,
    normalizeFreq,
    normalizeMode,
    normalizeSerial,
    parseMinitestQuickEntry,
    stripModeTokens
} from '../assets/js/minitest.js';

const qso = function (call, mode, time, extra = {}) {
    return Object.assign({
        date: '2026-11-07', time: time, freq: '3500', mode: mode, call: call,
        rstSent: '599', nrSent: '001', rstRcvd: '599', nrRcvd: '001'
    }, extra);
};

test('period boundaries in winter time (UTC+2)', function () {
    assert.equal(getPeriodForUtc('2026-11-07', '0759'), 0);
    assert.equal(getPeriodForUtc('2026-11-07', '0800'), 1);
    assert.equal(getPeriodForUtc('2026-11-07', '0814'), 1);
    assert.equal(getPeriodForUtc('2026-11-07', '0815'), 2);
    assert.equal(getPeriodForUtc('2026-11-07', '0829'), 2);
    assert.equal(getPeriodForUtc('2026-11-07', '0830'), 3);
    assert.equal(getPeriodForUtc('2026-11-07', '0845'), 4);
    assert.equal(getPeriodForUtc('2026-11-07', '0859'), 4);
    assert.equal(getPeriodForUtc('2026-11-07', '0900'), 0);
});

test('period handles daylight saving time', function () {
    assert.equal(getPeriodForUtc('2026-07-04', '0720'), 2);
    assert.equal(getPeriodForUtc('2026-07-04', '0659'), 0);
    assert.equal(getPeriodForUtc('2026-07-04', '0700'), 1);
    assert.equal(getPeriodForUtc('2026-11-07', '0850'), 4);
    assert.equal(getPeriodForUtc('2026-07-04', '0850'), 0);
});

test('period accepts HH:MM and rejects bad input', function () {
    assert.equal(getPeriodForUtc('2026-11-07', '08:20'), 2);
    assert.equal(getPeriodForUtc('', '0820'), 0);
    assert.equal(getPeriodForUtc('2026-11-07', '25'), 0);
    assert.equal(getPeriodForUtc('2026-11-07', '2561'), 0);
});

test('getPeriodInfo reports seconds left in the period', function () {
    const info = getPeriodInfo(new Date('2026-11-07T08:21:30Z'));
    assert.equal(info.period, 2);
    assert.equal(info.secondsLeft, 8 * 60 + 30);
    assert.equal(formatTimeLeft(info.secondsLeft), '08:30');
    assert.equal(getPeriodInfo(new Date('2026-11-07T08:00:00Z')).secondsLeft, 900);
    assert.equal(getPeriodInfo(new Date('2026-11-07T09:30:00Z')).period, 0);
    assert.equal(getPeriodInfo(new Date('2026-11-07T09:30:00Z')).secondsLeft, null);
    assert.equal(getPeriodAt(new Date('2026-07-04T07:20:00Z')), 2);
});

test('normalizers', function () {
    assert.equal(normalizeMode('ph'), 'SSB');
    assert.equal(normalizeMode('cw'), 'CW');
    assert.equal(normalizeMode('fm'), '');
    assert.equal(defaultRst('CW'), '599');
    assert.equal(defaultRst('SSB'), '59');
    assert.equal(normalizeSerial('12'), '012');
    assert.equal(normalizeSerial('1234'), '1234');
    assert.equal(normalizeSerial(''), '');
    assert.equal(normalizeFreq(''), '3500');
    assert.equal(normalizeFreq('3535.4'), '3535');
    assert.equal(normalizeFreq('abc'), '3500');
});

test('quick entry: one number is the received serial', function () {
    const parsed = parseMinitestQuickEntry('es1xx 12', 'CW');
    assert.equal(parsed.callsign, 'ES1XX');
    assert.equal(parsed.nrRcvd, '012');
    assert.equal(parsed.rstRcvd, '599');
    assert.equal(parsed.mode, 'CW');
    assert.equal(parsed.modeExplicit, false);
});

test('quick entry: two numbers are RST and serial', function () {
    const parsed = parseMinitestQuickEntry('es1xx 579 12', 'CW');
    assert.equal(parsed.rstRcvd, '579');
    assert.equal(parsed.nrRcvd, '012');
});

test('quick entry: mode token and SSB default RST', function () {
    let parsed = parseMinitestQuickEntry('es1xx ssb 7', 'CW');
    assert.equal(parsed.mode, 'SSB');
    assert.equal(parsed.modeExplicit, true);
    assert.equal(parsed.rstRcvd, '59');
    assert.equal(parsed.nrRcvd, '007');

    parsed = parseMinitestQuickEntry('ph es1xx 57 7', 'CW');
    assert.equal(parsed.callsign, 'ES1XX');
    assert.equal(parsed.mode, 'SSB');
    assert.equal(parsed.rstRcvd, '57');

    parsed = parseMinitestQuickEntry('es1xx 7', 'SSB');
    assert.equal(parsed.mode, 'SSB');
    assert.equal(parsed.rstRcvd, '59');
    assert.equal(parsed.modeExplicit, false);
});

test('quick entry: empty and partial input', function () {
    const empty = parseMinitestQuickEntry('', 'CW');
    assert.equal(empty.callsign, '');
    assert.equal(empty.nrRcvd, '');
    const partial = parseMinitestQuickEntry('es1xx', 'CW');
    assert.equal(partial.callsign, 'ES1XX');
    assert.equal(partial.nrRcvd, '');
    assert.equal(parseMinitestQuickEntry('12', 'CW').callsign, '');
});

test('stripModeTokens removes only mode words', function () {
    assert.equal(stripModeTokens('es1xx cw 12'), 'es1xx 12');
    assert.equal(stripModeTokens('es1xx ph '), 'es1xx ');
    assert.equal(stripModeTokens('es1xx 12'), 'es1xx 12');
    assert.equal(stripModeTokens(''), '');
});

test('nextSentSerial is max + 1 and ignores gaps', function () {
    assert.equal(nextSentSerial([]), '001');
    assert.equal(nextSentSerial([{ nrSent: '001' }, { nrSent: '002' }]), '003');
    assert.equal(nextSentSerial([{ nrSent: '001' }, { nrSent: '007' }]), '008');
    assert.equal(nextSentSerial([{ nrSent: '099' }]), '100');
    assert.equal(nextSentSerial([{ nrSent: 'x' }]), '001');
});

test('duplicate = same call, mode and period', function () {
    const records = [qso('ES1XX', 'CW', '0801')];
    assert.equal(isDuplicateQso(records, qso('ES1XX', 'CW', '0812')), true);
    assert.equal(isDuplicateQso(records, qso('es1xx', 'CW', '0812')), true);
    assert.equal(isDuplicateQso(records, qso('ES1XX', 'SSB', '0812')), false);
    assert.equal(isDuplicateQso(records, qso('ES1XX', 'CW', '0816')), false);
    assert.equal(isDuplicateQso(records, qso('ES2YY', 'CW', '0812')), false);
});

test('markDuplicates flags only the repeats', function () {
    const records = [
        qso('ES1XX', 'CW', '0801'),
        qso('ES1XX', 'SSB', '0802'),
        qso('ES1XX', 'CW', '0803'),
        qso('ES1XX', 'CW', '0816')
    ];
    assert.deepEqual(markDuplicates(records), [false, false, true, false]);
});

test('score: CW 2, SSB 1, duplicates excluded', function () {
    const records = [
        qso('ES1XX', 'CW', '0801'),
        qso('ES1XX', 'SSB', '0802'),
        qso('ES1XX', 'CW', '0803'),
        qso('ES2YY', 'SSB', '0804'),
        qso('ES3ZZ', 'CW', '0820')
    ];
    const score = computeScore(records);
    assert.equal(score.qsos, 4);
    assert.equal(score.dupes, 1);
    assert.equal(score.cw, 2);
    assert.equal(score.ssb, 2);
    assert.equal(score.points, 6);
    assert.equal(computeScore([]).points, 0);
});

test('score: QSOs outside the contest hour are not scored', function () {
    const records = [
        qso('ES1XX', 'CW', '0759'),
        qso('ES2YY', 'CW', '0801'),
        qso('ES3ZZ', 'SSB', '0900')
    ];
    const score = computeScore(records);
    assert.equal(score.outside, 2);
    assert.equal(score.qsos, 1);
    assert.equal(score.points, 2);
});

test('slot status covers the eight period/mode slots', function () {
    const records = [
        qso('ES1XX', 'CW', '0801'),
        qso('ES1XX', 'SSB', '0850'),
        qso('ES2YY', 'CW', '0820'),
        qso('ES1XX', 'CW', '0700')
    ];
    const status = getSlotStatus(records, 'es1xx');
    assert.equal(Object.keys(status).length, 8);
    assert.equal(status['1CW'], true);
    assert.equal(status['4SSB'], true);
    assert.equal(status['2CW'], false);
    assert.equal(status['1SSB'], false);
    assert.equal(Object.values(getSlotStatus(records, '')).some(Boolean), false);
});
