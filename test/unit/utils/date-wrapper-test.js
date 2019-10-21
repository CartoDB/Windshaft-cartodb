'use strict';

var assert = require('assert');
var dateWrapper = require('../../../lib/utils/date-wrapper');

describe('date-wrapper', function () {
    it('should wrap property fields with spaces', function () {
        const actual = dateWrapper.wrapDates(
            'select * from table',
            [{ name: 'a' }, { name: 'b c' }]
        );
        const expected = `
        SELECT
            "a","b c"
        FROM
            (select * from table) _cdb_epoch_transformation `;
        assert.strictEqual(actual, expected);
    });
});
