import test from 'node:test';
import assert from 'node:assert/strict';

import {
    expandPartialLocator,
    getQuickEntryState,
    isValidCallsign,
    isValidLocator,
    looksLikePartialLocator,
    parseQuickEntry,
    tokenizeQuickEntry
} from '../assets/js/quick_entry.js';

test('isValidCallsign accepts valid callsigns and rejects partials', function () {
    assert.equal(isValidCallsign('ES9ZZ'), true);
    assert.equal(isValidCallsign('OH0XX'), true);
    assert.equal(isValidCallsign('G3XYZ'), true);
    assert.equal(isValidCallsign('4X1AB'), true);
    assert.equal(isValidCallsign('ES1ABC/P'), true);
    assert.equal(isValidCallsign('ES'), false);
    assert.equal(isValidCallsign('ES5'), false);
    assert.equal(isValidCallsign(''), false);
});

test('tokenizeQuickEntry splits spaces and punctuation', function () {
    assert.deepEqual(tokenizeQuickEntry('ES9ZZ, KO29cc; 55 57'), ['ES9ZZ', 'KO29cc', '55', '57']);
});

test('isValidLocator accepts standard Maidenhead locators', function () {
    assert.equal(isValidLocator('KO29'), true);
    assert.equal(isValidLocator('KO29cc'), true);
    assert.equal(isValidLocator('KO29cc55'), true);
    assert.equal(isValidLocator('ES9ZZ'), false);
});

test('looksLikePartialLocator detects shorthand values', function () {
    assert.equal(looksLikePartialLocator('bb'), true);
    assert.equal(looksLikePartialLocator('29bb'), true);
    assert.equal(looksLikePartialLocator('ii02'), true);
    assert.equal(looksLikePartialLocator('KO29'), false);
});

test('expandPartialLocator uses own locator prefix', function () {
    assert.equal(expandPartialLocator('bb', 'KO29aa'), 'KO29bb');
    assert.equal(expandPartialLocator('29bb', 'KO29aa'), 'KO29bb');
});

test('parseQuickEntry reads callsign locator and one RST', function () {
    const parsed = parseQuickEntry('ES9ZZ KO29cc 55');
    assert.deepEqual(parsed, {
        callsign: 'ES9ZZ',
        locator: 'KO29CC',
        txRST: '59',
        rxRST: '55'
    });
});

test('parseQuickEntry reads two RST values regardless of order', function () {
    const parsed = parseQuickEntry('ES9ZZ 55 KO29cc 57');
    assert.deepEqual(parsed, {
        callsign: 'ES9ZZ',
        locator: 'KO29CC',
        txRST: '57',
        rxRST: '55'
    });
});

test('parseQuickEntry expands shorthand locator', function () {
    const parsed = parseQuickEntry('ES1ABC bb 57', 'KO29aa');
    assert.deepEqual(parsed, {
        callsign: 'ES1ABC',
        locator: 'KO29BB',
        txRST: '59',
        rxRST: '57'
    });
});

test('parseQuickEntry keeps defaults when only callsign is present', function () {
    const parsed = parseQuickEntry('ES1ABC');
    assert.deepEqual(parsed, {
        callsign: 'ES1ABC',
        locator: '',
        txRST: '59',
        rxRST: '59'
    });
});

test('getQuickEntryState reports readiness and duplicates', function () {
    const state = getQuickEntryState('ES9ZZ KO29cc 55', '', [
        ['1714', 'ES9ZZ', 'KO29CC', '6', '59', '55']
    ]);

    assert.equal(state.hasCallsign, true);
    assert.equal(state.hasLocator, true);
    assert.equal(state.isComplete, true);
    assert.equal(state.isDuplicate, true);
    assert.equal(state.duplicateCount, 1);
});
