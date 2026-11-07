import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFinalEdi, buildQsoRecordLine, getBandFromSection, hasPriorDuplicateCallsign } from '../assets/js/log_helpers.js';

test('getBandFromSection maps known contest classes', function () {
    assert.equal(getBandFromSection('SIX-A'), '50 MHz');
    assert.equal(getBandFromSection('FOUR'), '70 MHz');
    assert.equal(getBandFromSection('A-144'), '144 MHz');
    assert.equal(getBandFromSection('A-432'), '432 MHz');
    assert.equal(getBandFromSection('A-1G3'), '1296 MHz');
});

test('getBandFromSection falls back to Checklog for unknown values', function () {
    assert.equal(getBandFromSection('X-999'), 'Checklog');
    assert.equal(getBandFromSection(''), '50 MHz');
});

test('hasPriorDuplicateCallsign only flags later duplicates', function () {
    const records = [
        ['1800', 'ES1ABC', 'KO29AA', '1', '59', '59'],
        ['1805', 'ES9ZZ', 'KO38AB', '1', '59', '59'],
        ['1810', 'ES1ABC', 'KO29DD', '1', '59', '59']
    ];

    assert.equal(hasPriorDuplicateCallsign(records, 0), false);
    assert.equal(hasPriorDuplicateCallsign(records, 1), false);
    assert.equal(hasPriorDuplicateCallsign(records, 2), true);
});

test('buildQsoRecordLine formats a REG1TEST QSO row', function () {
    const line = buildQsoRecordLine('2026-05-05', ['1800', 'ES9ZZ', 'KO29CC', '1', '59', '57']);
    assert.equal(line, '260505;1800;ES9ZZ;1;59;;57;;;KO29CC;0;;N;N;');
});

test('buildFinalEdi produces a full EDI payload', function () {
    const edi = buildFinalEdi({
        TDate: '2026-05-05',
        PCall: 'es1abc',
        PWWLo: 'ko29aa',
        PSect: 'A-144',
        RName: 'Test',
        RCoun: 'Estonia',
        STXEq: 'IC-9700',
        SPowe: '50W',
        SRXEq: 'IC-9700',
        SAnte: 'Yagi',
        SAntH: '12',
        remarks: 'Test remark',
        QSORecords: [
            ['1800', 'ES9ZZ', 'KO29CC', '1', '59', '57']
        ]
    });

    assert.match(edi, /^\[REG1TEST;1\]/);
    assert.match(edi, /TName=ULL kv 144 MHz/);
    assert.match(edi, /PCall=ES1ABC/);
    assert.match(edi, /PWWLo=KO29AA/);
    assert.match(edi, /RCoun=Estonia/);
    assert.match(edi, /\[Remarks\]\nTest remark/);
    assert.match(edi, /\[QSORecords;1\]\n260505;1800;ES9ZZ;1;59;;57;;;KO29CC;0;;N;N;/);
});

test('buildFinalEdi uses fallback values when storage is missing', function () {
    const edi = buildFinalEdi({
        QSORecords: []
    }, {
        PSect: 'FOUR',
        RCoun: 'Estonia'
    });

    assert.match(edi, /PSect=FOUR/);
    assert.match(edi, /PBand=70 MHz/);
    assert.match(edi, /RCoun=Estonia/);
    assert.match(edi, /\[QSORecords;0\]$/);
});
