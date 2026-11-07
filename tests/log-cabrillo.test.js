import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCabrillo, buildCabrilloQsoLine, cabrilloFilename, toCabrilloMode } from '../assets/js/log_cabrillo.js';

const records = [
    { date: '2026-11-07', time: '0812', freq: '3500', mode: 'CW', call: 'ES1XX', rstSent: '599', nrSent: '001', rstRcvd: '599', nrRcvd: '012' },
    { date: '2026-11-07', time: '0820', freq: '3620', mode: 'SSB', call: 'ES3ZZ', rstSent: '59', nrSent: '002', rstRcvd: '57', nrRcvd: '104' }
];

const settings = {
    callsign: 'es1abc',
    contest: 'ES-LL-KV',
    category: 'MIXED',
    operator: 'SINGLE-OP',
    power: 'LOW',
    youth: false,
    club: false,
    name: 'Test',
    address: 'Tanav 1\nTallinn',
    email: 'a@b.ee',
    soapbox: ''
};

test('QSO line follows the fixed-width Cabrillo layout', function () {
    assert.equal(
        buildCabrilloQsoLine('ES1ABC', records[0]),
        'QSO:  3500 CW 2026-11-07 0812 ES1ABC        599 001    ES1XX         599 012'
    );
});

test('SSB is written as PH and freq defaults to 3500', function () {
    assert.equal(toCabrilloMode('SSB'), 'PH');
    assert.equal(toCabrilloMode('CW'), 'CW');
    const line = buildCabrilloQsoLine('ES1ABC', Object.assign({}, records[1], { freq: '' }));
    assert.match(line, /^QSO:  3500 PH 2026-11-07 0820 /);
});

test('header, QSO lines and score', function () {
    const lines = buildCabrillo(settings, records).split('\n');
    assert.equal(lines[0], 'START-OF-LOG: 3.0');
    assert.equal(lines[1], 'CONTEST: ES-LL-KV');
    assert.equal(lines[2], 'CALLSIGN: ES1ABC');
    assert.ok(lines.includes('CATEGORY-OPERATOR: SINGLE-OP'));
    assert.ok(lines.includes('CATEGORY-BAND: 80M'));
    assert.ok(lines.includes('CATEGORY-MODE: MIXED'));
    assert.ok(lines.includes('CATEGORY-POWER: LOW'));
    assert.ok(lines.includes('CATEGORY-TRANSMITTER: ONE'));
    assert.ok(lines.includes('CLAIMED-SCORE: 3'));
    assert.ok(lines.includes('NAME: Test'));
    assert.ok(lines.includes('ADDRESS: Tanav 1'));
    assert.ok(lines.includes('ADDRESS: Tallinn'));
    assert.ok(lines.includes('EMAIL: a@b.ee'));
    assert.ok(lines.includes('CREATED-BY: EDI/minitest (fork of ES1BBQ EDI)'));
    assert.equal(lines.filter(l => l.startsWith('CATEGORY-OVERLAY')).length, 0);
    assert.equal(lines.filter(l => l.startsWith('SOAPBOX')).length, 0);
    assert.equal(lines.filter(l => l.startsWith('QSO:')).length, 2);
    assert.equal(lines[lines.length - 1], 'END-OF-LOG:');
});

test('youth, club, QRP and multi-op categories', function () {
    const text = buildCabrillo(Object.assign({}, settings, {
        youth: true, age: '15', club: true, power: 'QRP', operator: 'MULTI-OP', category: 'CW', soapbox: 'Hello'
    }), records);
    const lines = text.split('\n');
    assert.ok(lines.includes('CATEGORY-OVERLAY: YOUTH'));
    assert.ok(lines.includes('SOAPBOX: Vanus: 15'));
    assert.ok(lines.includes('SOAPBOX: Klubijaam'));
    assert.ok(lines.includes('SOAPBOX: Hello'));
    assert.ok(lines.includes('CATEGORY-POWER: QRP'));
    assert.ok(lines.includes('CATEGORY-OPERATOR: MULTI-OP'));
    assert.ok(lines.includes('CATEGORY-MODE: CW'));
});

test('claimed score excludes duplicates; empty log still valid', function () {
    const dupe = Object.assign({}, records[0], { time: '0813', nrSent: '003' });
    assert.ok(buildCabrillo(settings, records.concat([dupe])).includes('CLAIMED-SCORE: 3'));
    const empty = buildCabrillo(settings, []).split('\n');
    assert.ok(empty.includes('CLAIMED-SCORE: 0'));
    assert.equal(empty[empty.length - 1], 'END-OF-LOG:');
});

test('contest name falls back to ES-LL-KV', function () {
    assert.ok(buildCabrillo(Object.assign({}, settings, { contest: '' }), []).includes('CONTEST: ES-LL-KV'));
});

test('filename uses call and first QSO date', function () {
    assert.equal(cabrilloFilename('ES1ABC', records), 'minitest_es1abc_20261107.log');
    assert.equal(cabrilloFilename('es1abc/p', [], new Date('2026-11-14T08:00:00Z')), 'minitest_es1abc-p_20261114.log');
    assert.equal(cabrilloFilename('', [], new Date('2026-11-14T08:00:00Z')), 'minitest_20261114.log');
});
