export const getBandFromSection = function (section) {
    if (!section || section === 'SIX-A' || section === 'SIX-B') {
        return '50 MHz';
    }
    if (section === 'FOUR') {
        return '70 MHz';
    }
    if (section === 'A-144' || section === 'B-144') {
        return '144 MHz';
    }
    if (section === 'A-432' || section === 'B-432') {
        return '432 MHz';
    }
    if (section === 'A-1G3') {
        return '1296 MHz';
    }
    return 'Checklog';
};

export const hasPriorDuplicateCallsign = function (records, index) {
    const current = records[index];
    if (!current || !current[1]) {
        return false;
    }

    for (let i = 0; i < index; i++) {
        if (records[i] && records[i][1] === current[1]) {
            return true;
        }
    }
    return false;
};

export const buildQsoRecordLine = function (testDate, record) {
    const datePart = (testDate || '').substring(2).replace(/-/g, '');
    return datePart + ";" + record[0] + ";" + record[1] + ";" + record[3] + ";" + record[4] + ";;" + record[5] + ";;;" + record[2] + ";0;;N;N;";
};

export const buildFinalEdi = function (storageValues, fallbackValues = {}) {
    const section = storageValues.PSect || fallbackValues.PSect || '';
    const band = getBandFromSection(section);
    const testDate = storageValues.TDate || '';
    const call = storageValues.PCall ? storageValues.PCall.toUpperCase() : '';
    const locator = storageValues.PWWLo ? storageValues.PWWLo.toUpperCase() : '';
    const remarks = storageValues.remarks || '';
    const qsoRecords = storageValues.QSORecords || [];

    let finalEDI = "[REG1TEST;1]\n";
    finalEDI = finalEDI.concat("TName=ULL kv ", band, "\n");
    finalEDI = finalEDI.concat("TDate=", testDate ? testDate.replace(/-/g, '') : '', ";", testDate ? testDate.replace(/-/g, '') : '', "\n");
    finalEDI = finalEDI.concat("PCall=", call, "\n");
    finalEDI = finalEDI.concat("PWWLo=", locator, "\n");
    finalEDI = finalEDI.concat("PSect=", section, "\n");
    finalEDI = finalEDI.concat("PBand=", band, "\n");
    finalEDI = finalEDI.concat("RName=", storageValues.RName || '', "\n");
    finalEDI = finalEDI.concat("RCall=", call, "\n");
    finalEDI = finalEDI.concat("RCoun=", storageValues.RCoun || fallbackValues.RCoun || '', "\n");
    finalEDI = finalEDI.concat("ROpe1=", call, "\n");
    finalEDI = finalEDI.concat("STXEq=", storageValues.STXEq || '', "\n");
    finalEDI = finalEDI.concat("SPowe=", storageValues.SPowe || '', "\n");
    finalEDI = finalEDI.concat("SRXEq=", storageValues.SRXEq || '', "\n");
    finalEDI = finalEDI.concat("SAnte=", storageValues.SAnte || '', "\n");
    finalEDI = finalEDI.concat("SAntH=", storageValues.SAntH || '', "\n");
    finalEDI = finalEDI.concat("[Remarks]\n", remarks.length > 1 ? remarks + "\n" : "");
    finalEDI = finalEDI.concat("[QSORecords;", qsoRecords.length, "]");
    qsoRecords.forEach(function (record) {
        finalEDI = finalEDI.concat("\n", buildQsoRecordLine(testDate, record));
    });
    return finalEDI;
};
