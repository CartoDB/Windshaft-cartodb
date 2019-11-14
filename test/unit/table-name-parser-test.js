'use strict';

require('../support/test-helper');

var assert = require('assert');
var TableNameParser = require('../../lib/utils/table-name-parser');

describe('TableNameParser', function () {
    it('parses table names with scheme and quotes', function (done) {
        var testCases = [
            ['xyz', { schema: null, table: 'xyz' }],
            ['"xyz"', { schema: null, table: 'xyz' }],
            ['"xy z"', { schema: null, table: 'xy z' }],
            ['"xy.z"', { schema: null, table: 'xy.z' }],
            ['"x.y.z"', { schema: null, table: 'x.y.z' }],
            ['abc.xyz', { schema: 'abc', table: 'xyz' }],
            ['"abc".xyz', { schema: 'abc', table: 'xyz' }],
            ['abc."xyz"', { schema: 'abc', table: 'xyz' }],
            ['"abc"."xyz"', { schema: 'abc', table: 'xyz' }],
            ['"a bc"."x yz"', { schema: 'a bc', table: 'x yz' }],
            ['"a bc".xyz', { schema: 'a bc', table: 'xyz' }],
            ['"a.bc".xyz', { schema: 'a.bc', table: 'xyz' }],
            ['"a.b.c".xyz', { schema: 'a.b.c', table: 'xyz' }],
            ['"a.b.c.".xyz', { schema: 'a.b.c.', table: 'xyz' }],
            ['"a""bc".xyz', { schema: 'a"bc', table: 'xyz' }],
            ['"a""bc"."x""yz"', { schema: 'a"bc', table: 'x"yz' }]
        ];

        testCases.forEach(function (testCase) {
            var tableName = testCase[0];
            var expectedResult = testCase[1];
            var result = TableNameParser.parse(tableName);
            assert.deepStrictEqual(result, expectedResult);
        });
        done();
    });

    it('quotes identifiers that need quoting', function (done) {
        assert.strictEqual(TableNameParser.quote('x yz'), '"x yz"');
        assert.strictEqual(TableNameParser.quote('x-yz'), '"x-yz"');
        assert.strictEqual(TableNameParser.quote('x.yz'), '"x.yz"');
        done();
    });

    it('doubles quotes', function (done) {
        assert.strictEqual(TableNameParser.quote('x"yz'), '"x""yz"');
        assert.strictEqual(TableNameParser.quote('x"y"z'), '"x""y""z"');
        assert.strictEqual(TableNameParser.quote('x""y"z'), '"x""""y""z"');
        assert.strictEqual(TableNameParser.quote('x "yz'), '"x ""yz"');
        assert.strictEqual(TableNameParser.quote('x"y-y"z'), '"x""y-y""z"');
        done();
    });

    it('does not quote identifiers that don\'t need to be quoted', function (done) {
        assert.strictEqual(TableNameParser.quote('xyz'), 'xyz');
        assert.strictEqual(TableNameParser.quote('x_z123'), 'x_z123');
        done();
    });
});
