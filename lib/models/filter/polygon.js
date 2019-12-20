'use strict';

const assert = require('assert');
const debug = require('debug')('windshaft:filter:polygon');
function filterQueryTpl ({ sql, column, srid, geojson } = {}) {
    return `
        SELECT
            *
        FROM (${sql}) _cdb_polygon_filter
        WHERE
            ST_Intersects(
                ${column},
                ST_Transform(
                    ST_SetSRID(ST_GeomFromGeoJSON('${JSON.stringify(geojson)}'), 4326),
                    ${srid}
                )
            )
    `;
}

module.exports = class PolygonFilter {
    constructor (filterDefinition, filterParams) {
        const { polygon } = filterParams;

        if (!polygon) {
            const error = new Error('Polygon filter expects to have a "polygon" param');
            error.type = 'filter';
            throw error;
        }

        let geojson;

        try {
            geojson = JSON.parse(polygon);
        } catch (err) {
            const error = new Error('Invalid polygon parameter. Expected a valid GeoJSON');
            error.type = 'filter';
            throw error;
        }

        if (geojson.type !== 'Polygon') {
            const error = new Error('Invalid type of geometry. Valid ones: "Polygon"');
            error.type = 'filter';
            throw error;
        }

        try {
            const length = geojson.coordinates.length;
            assert.deepStrictEqual(geojson.coordinates[0], geojson.coordinates[length - 1]);
        } catch (error) {
            throw new Error('Invalid geometry, it must be a closed polygon');
        }

        this.column = filterDefinition.column || 'the_geom_webmercator';
        this.srid = filterDefinition.srid || 3857;
        this.geojson = geojson;
    }

    sql (rawSql) {
        const polygonSql = filterQueryTpl({
            sql: rawSql,
            column: this.column,
            srid: this.srid,
            geojson: this.geojson
        });

        debug(polygonSql);

        return polygonSql;
    }
};
