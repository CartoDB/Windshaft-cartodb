'use strict';

var assert = require('assert');
var SubstitutionTokens = require('../../lib/utils/substitution-tokens');

describe('SubstitutionTokens', function () {
    var sql = [
        'WITH hgrid AS (',
        '  SELECT CDB_HexagonGrid(',
        '    ST_Expand(!bbox!, greatest(!pixel_width!,!pixel_height!) * 100),',
        '    greatest(!pixel_width!,!pixel_height!) * 100',
        '  ) as cell',
        ')',
        'SELECT',
        '  hgrid.cell as the_geom_webmercator,',
        '  count(1) as points_count,',
        '  count(1)/power(100 * CDB_XYZ_Resolution(CDB_ZoomFromScale(!scale_denominator!)), 2) as points_density,',
        '  1 as cartodb_id',
        'FROM hgrid, (select * from table) i',
        'where ST_Intersects(i.the_geom_webmercator, hgrid.cell)',
        'GROUP BY hgrid.cell'
    ].join('\n');

    it('should return tokens present in sql', function () {
        assert.deepStrictEqual(SubstitutionTokens.tokens(sql), ['bbox', 'scale_denominator', 'pixel_width', 'pixel_height']);
    });

    it('should return just one token', function () {
        assert.deepStrictEqual(SubstitutionTokens.tokens('select !bbox! from wadus'), ['bbox']);
    });

    it('should not return other tokens', function () {
        assert.deepStrictEqual(SubstitutionTokens.tokens('select !wadus! from wadus'), []);
    });

    it('should report sql has tokens', function () {
        assert.strictEqual(SubstitutionTokens.hasTokens(sql), true);
        assert.strictEqual(SubstitutionTokens.hasTokens('select !bbox! from wadus'), true);
        assert.strictEqual(SubstitutionTokens.hasTokens('select !wadus! from wadus'), false);
    });
});
