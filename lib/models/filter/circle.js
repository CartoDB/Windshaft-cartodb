'use strict';

const debug = require('debug')('windshaft:filter:circle');
function filterQueryTpl ({ sql, column, srid, lng, lat, radiusInMeters } = {}) {
    return `
        SELECT
            *
        FROM (${sql}) _cdb_circle_filter
        WHERE
            ST_DWithin(
                ${srid === 4326 ? `${column}::geography` : `ST_Transform(${column}, 4326)::geography`},
                ST_SetSRID(ST_Point(${lng}, ${lat}), 4326)::geography,
                ${radiusInMeters}
            )
    `;
}

module.exports = class CircleFilter {
    constructor (filterDefinition, filterParams) {
        const { circle } = filterParams;

        if (!circle) {
            throw new Error('Circle filter expects to have a "circle" param');
        }

        const { lng, lat, radius } = JSON.parse(circle);

        if (!Number.isFinite(lng) || !Number.isFinite(lat) || !Number.isFinite(radius)) {
            throw new Error('Missing parameter for Circle Filter, expected: "lng", "lat", and "radius"');
        }

        this.column = filterDefinition.column || 'the_geom_webmercator';
        this.srid = filterDefinition.srid || 3857;
        this.lng = lng;
        this.lat = lat;
        this.radius = radius;
    }

    sql (rawSql) {
        const circleSql = filterQueryTpl({
            sql: rawSql,
            column: this.column,
            srid: this.srid,
            lng: this.lng,
            lat: this.lat,
            radiusInMeters: this.radius
        });

        debug(circleSql);

        return circleSql;
    }
};
