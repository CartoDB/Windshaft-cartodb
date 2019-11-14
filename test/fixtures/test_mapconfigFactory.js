function getVectorMapConfig (opts) {
    return {
        buffersize: {
            mvt: 1
        },
        layers: _generateLayers(opts)
    };
}

function _generateLayers (opts) {
    const numberOfLayers = opts.numberOfLayers || 1;
    const layers = [];
    for (let index = 0; index < numberOfLayers; index++) {
        const layerOptions = (opts.layerOptions || {})[index] || {};
        layers.push(_generateLayerConfig(layerOptions));
    }
    return layers;
}

function _generateLayerConfig (opts) {
    const additionalColumns = opts.additionalColumns ? opts.additionalColumns.join(',') + ',' : '';
    return {
        type: 'mapnik',
        options: {
            sql: `
            SELECT
                ${additionalColumns}
                (DATE '2018-06-01' + x) as date,
                x as cartodb_id,
                st_makepoint(x * 10, x * 10) as the_geom,
                st_makepoint(x * 10, x * 10) as the_geom_webmercator
            FROM
                generate_series(0, 1) x`,
            aggregation: {
                columns: {},
                dimensions: {
                    date: 'date'
                },
                placement: 'centroid',
                resolution: 1,
                threshold: 1
            },
            dates_as_numbers: opts.dates_as_numbers,
            metadata: {
                geometryType: true,
                columnStats: {
                    topCategories: 32768,
                    includeNulls: true
                },
                sample: {
                    num_rows: 1000,
                    include_columns: [
                        'date'
                    ]
                }
            }
        }
    };
}

module.exports = { getVectorMapConfig };
