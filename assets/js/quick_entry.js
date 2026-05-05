export const isNumericToken = function (token) {
    return /^\d+$/.test((token || '').trim());
};

export const isValidCallsign = function (token) {
    return /^[A-Z0-9]{1,3}\d[A-Z]{1,3}(\/[A-Z0-9]+)?$/.test((token || '').trim().toUpperCase());
};

export const isValidLocator = function (token) {
    return /^[A-Ra-r]{2}[0-9]{2}([A-Xa-x]{2}([0-9]{2})?)?$/.test((token || '').trim());
};

export const looksLikePartialLocator = function (token) {
    const value = (token || '').trim();
    return /^[a-x]{2}$/.test(value) ||
        /^[0-9]{2}[a-x]{2}$/.test(value) ||
        /^[a-r]{2}[a-x]{2}$/.test(value) ||
        /^[a-x]{2}[0-9]{2}$/.test(value);
};

export const expandPartialLocator = function (token, myLocator) {
    const value = (token || '').trim().toLowerCase();
    if (!myLocator || myLocator.length < 4) {
        return token;
    }

    if (/^[a-x]{2}$/.test(value)) {
        return myLocator.substring(0, 4).toUpperCase() + value;
    }
    if (/^[0-9]{2}[a-x]{2}$/.test(value)) {
        return myLocator.substring(0, 2).toUpperCase() + value;
    }
    if (/^[a-r]{2}[a-x]{2}$/.test(value)) {
        return value.substring(0, 2).toUpperCase() + myLocator.substring(2, 4) + value.substring(2, 4);
    }
    if (/^[a-x]{2}[0-9]{2}$/.test(value) && !/^[a-r]{2}[0-9]{2}$/.test(value)) {
        return myLocator.substring(0, 4).toUpperCase() + value;
    }
    return token;
};

export const tokenizeQuickEntry = function (raw) {
    if (!raw || !raw.trim()) {
        return [];
    }
    return raw
        .trim()
        .split(/[\s,;]+/)
        .map(function (token) {
            return token.trim();
        })
        .filter(Boolean);
};

export const parseQuickEntry = function (raw, myLocator = '') {
    const result = {
        callsign: '',
        locator: '',
        txRST: '59',
        rxRST: '59'
    };

    const tokens = tokenizeQuickEntry(raw);
    if (tokens.length === 0) {
        return result;
    }

    result.callsign = tokens[0].toUpperCase();

    const numberTokens = [];
    for (let i = 1; i < tokens.length; i++) {
        const token = tokens[i];
        if (isNumericToken(token)) {
            numberTokens.push(token);
            continue;
        }

        if (!result.locator) {
            if (isValidLocator(token)) {
                result.locator = token.toUpperCase();
                continue;
            }
            if (looksLikePartialLocator(token)) {
                const expanded = expandPartialLocator(token, myLocator);
                if (isValidLocator(expanded)) {
                    result.locator = expanded.toUpperCase();
                }
            }
        }
    }

    if (numberTokens.length >= 1) {
        result.rxRST = numberTokens[0];
    }
    if (numberTokens.length >= 2) {
        result.txRST = numberTokens[1];
    }

    return result;
};

export const getQuickEntryState = function (raw, myLocator = '', existingRecords = []) {
    const parsed = parseQuickEntry(raw, myLocator);
    const hasCallsign = parsed.callsign.length > 0;
    const hasLocator = parsed.locator.length > 0;
    const duplicateCount = existingRecords.filter(function (record) {
        return record[1] === parsed.callsign;
    }).length;

    return {
        raw: raw || '',
        parsed: parsed,
        hasCallsign: hasCallsign,
        hasLocator: hasLocator,
        isComplete: hasCallsign && hasLocator,
        duplicateCount: duplicateCount,
        isDuplicate: duplicateCount > 0
    };
};
