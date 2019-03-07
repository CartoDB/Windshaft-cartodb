## Tile Aggregation

To be able to represent a large amount of data (say, hundred of thousands to millions of points) in a tile. This can be useful both for raster tiles (where the aggregation reduces the number of features to be rendered) and vector tiles (the tile contais less features).

Aggregation is available only for point geometries. During aggregation the points are grouped using a grid; all the points laying in the same cell of the grid are summarized in a single aggregated result point.
 - The position of the aggregated point is controlled by the `placement` parameter.
 - The aggregated rows always contain at least a column, named `_cdb_feature_count`, which contains the number of the original points that the aggregated point represents.

#### Special default aggregation

When no placement or columns are specified a special default aggregation is performed.

This special mode performs only spatial aggregation (using a grid defined by the requested tile and the resolution, parameter, as all the other cases), and returns a _random_ record from each group (grid cell) with all its columns and an additional `_cdb_feature_count` with the number of features in the group.

Regarding the randomness of the sample: currently we use the row with the minimum `cartodb_id` value in each group.

The rationale behind having this special aggregation with all the original columns is to provide a mostly transparent way to handle large datasets without having to provide special map configurations for those cases (i.e. preserving the logic used to produce the maps with smaller datasets). [Overviews have been used so far with this intent](https://carto.com/docs/tips-and-tricks/back-end-data-performance/), but they are inflexible.

#### User defined aggregations

When either a explicit placement or columns are requested we no longer use the special, query; we use one determined by the placement (which will default to "centroid"), and it will have as columns only the aggregated columns specified, in addition to `_cdb_feature_count`, which is always present.

We might decide in the future to allow sampling column values for any of the different placement modes.

#### Behaviour for raster and vector tiles

The vector tiles from a vector-only map will be aggregated by default.
However, Raster tiles (or vector tiles from a map which defines CartoCSS styles) will be aggregated only upon request.

Aggregation that would otherwise occur can be disabled by passing an `aggregation=false` parameter to the map instantiation HTTP call.

To control how aggregation is performed, an aggregation option can be added to the layer:

```json
{
    "layers": [
        {
            "options": {
                "sql": "SELECT * FROM data",
                "aggregation": {
                    "placement": "centroid",
                    "columns": {
                        "value": {
                            "aggregate_function": "sum",
                            "aggregated_column": "value"
                        }
                    }
                }
            }
        }
    ]
}
```

Even if aggregation is explicitly requested it may not be activated, e.g., if the geometries are not points
or the whole dataset is too small. The map instantiation response contains metadata that informs if any particular
layer will be aggregated when tiles are requested, both for vector (mvt) and raster (png) tiles.

```json
{
  "layergroupid": "7b97b6e76590fef889b63edd2efb1c79:1513608333045",
  "metadata": {
    "layers": [
      {
        "type": "mapnik",
        "id": "layer0",
        "meta": {
          "stats": {
            "estimatedFeatureCount": 6232136
          },
          "aggregation": {
            "png": true,
            "mvt": true
          }
        }
      }
    ]
  }
}
```

### Aggregation parameters

The aggregation parameters for a layer are defined inside an `aggregation` option of the layer:

```json
{
    "layers": [
        {
            "options": {
                "sql": "SELECT * FROM data",
                "aggregation": {"...": "..."}
            }
        }
    ]
}
```

#### `placement`

Determines the kind of aggregated geometry generated:

##### `point-sample`

This is the default placement. It will place the aggregated point at a random sample of the grouped points,
like the default aggregation does. No other attribute is sampled, though, the point will contain the aggregated attributes determined by the `columns` parameter.

##### `point-grid`

Generates points at the center of the aggregation grid cells (squares).

##### `centroid`

Generates points with the averaged coordinated of the grouped points (i.e. the points inside each grid cell).

#### `columns`

The aggregated attributes defined by `columns` are computed by a applying an _aggregate function_ to all the points in each group.
Valid aggregate functions are `sum`, `avg` (average), `min` (minimum), `max` (maximum) and `mode` (the most frequent value in the group).
The values to be aggregated are defined by the _aggregated column_ of the source data. The column keys define the name of the resulting column in the aggregated dataset.

For example here we define three aggregate attributes named `total`, `max_price` and `price` which are all computed with the same column, `price`,
of the original dataset applying three different aggregate functions.

```json
{
    "columns": {
        "total": { "aggregate_function": "sum", "aggregated_column": "price" },
        "max_price": { "aggregate_function": "max", "aggregated_column": "price" },
        "price": { "aggregate_function": "avg", "aggregated_column": "price" }
    }
}
```

> Note that you can use the original column names as names of the result, but all the result column names must be unique.  In particular, the names `cartodb_id`, `the_geom`, `the_geom_webmercator` and `_cdb_feature_count` cannot be used for aggregated columns, as they correspond to columns always present in the result.

#### `resolution`

Defines the cell-size of the spatial aggregation grid. This is equivalent to the [CartoCSS `-torque-resolution`]({{site.styling_cartocss}}/#-torque-resolution-float) property of Torque maps.

The aggregation cells are `resolution`×`resolution` pixels in size, where pixels here are defined to be 1/256 of the (linear) size of a tile.
The default value is 1, so that aggregation coincides with raster pixels. A value of 2 would make each cell to be 4 (2×2) pixels, and a value of
0.5 would yield 4 cells per pixel. In teneral values less than 1 produce sub-pixel precision.

> Note that is independent of the number of pixels for raster tile or the coordinate resolution (mvt_extent) of vector tiles.


#### `threshold`

This is the minimum number of (estimated) rows in the dataset (query results) for aggregation to be applied. If the number of rows estimate is less than the threshold aggregation will be disabled for the layer; the instantiation response will reflect that and tiles will be generated without aggregation.

#### Example

```json
{
    "version": "1.7.0",
    "extent": [-20037508.5, -20037508.5, 20037508.5, 20037508.5],
    "srid": 3857,
    "maxzoom": 18,
    "minzoom": 3,
    "layers": [
        {
            "type": "mapnik",
            "options": {
                "sql": "select * from table",
                "cartocss": "#table { marker-width: [total]; marker-fill: ramp(value, (red, green, blue), jenks); }",
                "cartocss_version": "2.3.0",
                "aggregation": {
                    "placement": "centroid",
                    "columns": {
                        "value": {
                            "aggregate_function": "avg",
                            "aggregated_column": "value"
                        },
                        "total": {
                            "aggregate_function": "sum",
                            "aggregated_column": "value"
                        }
                    },
                    "resolution": 2,
                    "threshold": 500000
                }
            }
        }
    ]
}
```

### `filters`

Aggregated data can be filtered by imposing filtering conditions on the aggregated columns.

Each condition is represented by one or more parameters:

* `{ "equal": V }` selects an specific value of the aggregated column.
* `{ "not_equal": V }` selects values different from the one specified.
* `{ "in": [v1, v2, v3] }` selects any value from a list.
* `{ "not_in": [v1, v2, v3] }` selects any value not in a list.
* `{ "less_than": v }` selects values strictly less than the one given.
* `{ "less_than_or_equal_to": v }` selects values less than or equal to the one given.
* `{ "greater_than": v }` selects values strictly greater than the one given.
* `{ "greater_than_or_equal_to": v }` selects values  greater than or equal to the one given.

One of the *less* conditions can be combined with one of the *greater* conditions to select a range of values, for example:
* `{ "greater_than": v1, "less_than": v2 }`
* `{ "greater_than_or_equal_to": v1, "less_than": v2 }`
* `{ "greater_than": v1, "less_than_or_equal_to": v2 }`
* `{ "greater_than_or_equal_to": v1, "less_than_or_equal_to": v2 }`

For a given column, multiple conditions can be passed in an array; the conditions will logically ORed (any of the conditions have to be verifid for the value to be selected):

* `"myvalue": [ { "equal": 10 }, { "less_than": 0 }]` will select values of the column `myvalue` which are equal to 10 **or** less than 0.

In addition, the filters applied to different columns are logically combined with AND (all the conditions have to be satisfied for an element to be selected); for example with the following `filters` parameter we'll select aggregated records which have a `total_value` > 100 **and** a category equal to "a".

```json
{
    "total_value": { "greater_than": 100 },
    "category":    { "equal": "a" }
}
```

Note that the filtered columns have to be defined with the `columns` parameter, except for `_cdb_feature_count`, which is always implicitly defined and can be filtered too.

#### Example

```json
{
    "version": "1.7.0",
    "extent": [-20037508.5, -20037508.5, 20037508.5, 20037508.5],
    "srid": 3857,
    "maxzoom": 18,
    "minzoom": 3,
    "layers": [
        {
            "type": "mapnik",
            "options": {
                "sql": "select * from table",
                "cartocss": "#table { marker-width: [total]; marker-fill: ramp(value, (red, green, blue), jenks); }",
                "cartocss_version": "2.3.0",
                "aggregation": {
                    "placement": "centroid",
                    "columns": {
                        "total_value": {
                            "aggregate_function": "sum",
                            "aggregated_column": "value"
                        },
                        "category": {
                            "aggregate_function": "mode",
                            "aggregated_column": "category"
                        }
                    },
                    "filters" : {
                        "total_value": { "greater_than": 100 },
                        "category":   { "equal": "a" }
                    },
                    "resolution": 2,
                    "threshold": 500000
                }
            }
        }
    ]
}
```