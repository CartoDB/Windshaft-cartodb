## MapConfig Aggregation Extension

### 1. Purpose

This specification describes an extension for
[MapConfig 1.7.0](https://github.com/CartoDB/Windshaft/blob/master/doc/MapConfig-1.7.0.md) version.


### 2. Changes over specification

This extension introduces a new layer options for aggregated data tile generation.

#### 2.1 Aggregation options

The layer options attribute is extended with a new optional `aggregation` attribute.
The value of this attribute can be `false` to explicitly disable aggregation for the layer.

```javascript
{
    aggregation: {

        // OPTIONAL
        // string, defines the placement of aggregated geometries. Can be one of:
        // * "point-sample", the default places geometries at a sample point (one of the aggregated geometries)
        // * "point-grid" places geometries at the center of the aggregation grid cells
        // * "centroid" places geometriea at the average position of the aggregated points
        // See https://github.com/CartoDB/Windshaft-cartodb/blob/master/docs/aggregation.md#placement for more details
        placement: "point-sample",

        // OPTIONAL
        // object, defines the columns of the aggregated datasets. Each property corresponds to a columns name and
        // should contain an object with two properties: "aggregate_function" (one of "sum", "max", "min", "avg", "mode" or "count"),
        // and "aggregated_column" (the name of a column of the original layer query or "*")
        // A column defined as `"_cdb_feature_count": {"aggregate_function": "count", aggregated_column: "*"}`
        // is always generated in addition to the defined columns.
        // The column names `cartodb_id`, `the_geom`, `the_geom_webmercator` and `_cdb_feature_count` cannot be used
        // for aggregated columns, as they correspond to columns always present in the result.
        // See https://github.com/CartoDB/Windshaft-cartodb/blob/master/docs/aggregation.md#columns for more details
        columns: {
            "aggregated_column_1": {
                "aggregate_function": "sum",
                "aggregated_column": "original_column_1"
            }
        },

        // OPTIONAL
        // Number, defines the cell-size of the spatial aggregation grid as a pixel resolution power of two (1/4, 1/2,... 2, 4, 16)
        // to scale from 256x256 pixels; the default is 1 corresponding to 256x256 cells per tile.
        // See https://github.com/CartoDB/Windshaft-cartodb/blob/master/docs/aggregation.md#resolution for more details
        resolution: 1,

        // OPTIONAL
        // Number, the minimum number of (estimated) rows in the dataset (query results) for aggregation to be applied.
        // See https://github.com/CartoDB/Windshaft-cartodb/blob/master/docs/aggregation.md#threshold for more details
        threshold: 500000
    }
}
```

### History

#### 1.0.0

 - Initial version
