'use strict';

import { refreshLogsTable, updatePage } from "./logs.js";
import './tabify.js';
import './localstorage.js';
import './minitest_ui.js';
import './locate_me.js';
import './download.js';
import './post.js';

(function () {

    /** Method to generate/update EDI log and page */
    refreshLogsTable();
    updatePage();

})();