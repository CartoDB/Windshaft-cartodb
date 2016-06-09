# 1. Purpose

This specification describes an extension for
[MapConfig 1.4.0](https://github.com/CartoDB/Windshaft/blob/master/doc/MapConfig-1.4.0.md) version.


# 2. Changes over specification

This extension depends on Analyses extension. It extends MapConfig with a new attribute: `dataviews`.

It makes possible to get tabular data from analysis nodes: lists, aggregated lists, aggregations, and histograms.

## 2.1. Dataview types

### List

A list is a simple result set per row where is possible to retrieve several columns from the original layer query.

Definition
```
{
    // REQUIRED
    // string, `type` the list type
    “type”: “list”,
    // REQUIRED
    // object, `options` dataview params
    “options”: {
        // REQUIRED
        // array, `columns` to select for the list
        “columns”: [“name”, “description”]
    }
}
```

Expected output
```
{
  "type": "list",
  "rows": [
    {
      "{columnName1}": "val1",
      "{columnName2}": 100
    },
    {
      "{columnName1}": "val2",
      "{columnName2}": 200
    }
  ]
}
```

### Aggregation

An aggregation is very similar to a list but results are aggregated by a column and a given aggregation function.

Definition
```
{
    // REQUIRED
    // string, `type` the aggregation type
    “type”: “aggregation”,
    // REQUIRED
    // object, `options` dataview params
    “options”: {
        // REQUIRED
        // string, `column` column name to aggregate by
        “column”: “country”,
        // REQUIRED
        // string, `aggregation` operation to perform
        “aggregation”: “count”
        // OPTIONAL
        // string, `aggregationColumn` column value to aggregate
        // This param is required when `aggregation` is different than "count"
        “aggregationColumn”: “population”
    }
}
```

Expected output
```
{
  "type": "aggregation",
  "categories": [
    {
      "category": "foo",
      "value": 100
    },
    {
      "category": "bar",
      "value": 200
    }
  ]
}
```

### Histograms

Histograms represent the data distribution for a column.

Definition
```
{
    // REQUIRED
    // string, `type` the histogram type
    “type”: “histogram”,
    // REQUIRED
    // object, `options` dataview params
    “options”: {
        // REQUIRED
        // string, `column` column name to aggregate by
        “column”: “name”,
        // OPTIONAL
        // number, `bins` how many buckets the histogram should use
        “bins”: 10
    }
}
```

Expected output
```
{
  "type": "histogram",
  "bins": [{"bin": 0, "start": 2, "end": 2, "min": 2, "max": 2, "freq": 1}, null, null, {"bin": 3, "min": 40, "max": 44, "freq": 2}, null],
  "width": 10
}
```

### Formula

Formulas given a final value representing the whole dataset.

Definition
```
{
    // REQUIRED
    // string, `type` the formula type
    “type”: “formula”,
    // REQUIRED
    // object, `options` dataview params
    “options”: {
        // REQUIRED
        // string, `column` column name to aggregate by
        “column”: “name”,
        // REQUIRED
        // string, `aggregation` operation to perform
        “operation”: “count”
    }
}
```

Operation must be: “min”, “max”, “count”, “avg”, or “sum”.

Result
```
{
  "type": "formula",
  "operation": "count",
  "result": 1000,
  "nulls": 0
}
```


## 2.2 Dataviews attribute

The new dataviews attribute must be a dictionary of dataviews.

An analysis node id can be referenced from dataviews to consume its output query.


The layer consuming the output must reference it with the following option:

```
{
    // REQUIRED
    // object, `source` as in the future we might want to have other source options
    "source": {
        // REQUIRED
        // string, `id` the analysis node identifier
        "id": "HEAD"
    }
}
```

## 2.3. Complete example

```
{
    "version": "1.4.0",
    "layers": [
        {
            "type": "cartodb",
            "options": {
                "source": {
                    "id": "HEAD"
                },
                "cartocss": "...",
                "cartocss_version": "2.3.0"
            }
        }
    ],
    "dataviews" {
        "basic_histogram": {
            "source": {
                "id": "HEAD"
            },
            "type": "histogram",
            "options": {
                "column": "pop_max"
            }
        }
    },
    "analyses": [
        {
            "id": "HEAD",
            "type": "source",
            "params": {
                "query": "select * from your_table"
            }
        }
    ]
}
```

## 3. Filters

Camshaft's analyses expose a filtering capability and `aggregation` and `histogram` dataviews get them for free with
 this extension. Filters are available with the very dataview id, so if you have a "basic_histogram" histogram dataview
 you can filter with a range filter with "basic_histogram" name.


## 3.1 Filter types

### Category

Allows to remove results that are not contained within a set of elements.
Initially this filter can be applied to a `numeric` or `text` columns.

Params

```
{
    “accept”: [“Spain”, “Germany”]
    “reject”: [“Japan”]
}
```

### Range filter

Allows to remove results that don’t satisfy numeric min and max values.
Filter is applied to a numeric column.

Params

```
{
    “min”: 0,
    “max”: 1000
}
```

## 3.2. How to apply filters

Filters must be applied at map instantiation time.

With :mapconfig as a valid MapConfig and with :filters (a valid JSON) as:

### Anonymous map

`GET /api/v1/map?config=:mapconfig&filters=:filters`

`POST /api/v1/map?filters=:filters`
with `BODY=:mapconfig`

If in the future we need to support a bigger filters param and it doesn’t fit in the query string,
 we might solve it by accepting:

`POST /api/v1/map`
with `BODY={“config”: :mapconfig, “filters”: :filters}`

### Named map

Assume :params (a valid JSON) as named maps params, like in: `{“color”: “red”}`

`GET /api/v1/named/:name/jsonp?config=:params&filters=:filters&callback=cb`

`POST /api/v1/named/:name?filters=:filters`
with `BODY=:params`

If, again, in the future we need to support a bigger filters param that doesn’t fit in the query string,
 we might solve it by accepting:

`POST /api/v1/named/:name`
with `BODY={“config”: :params, “filters”: :filters}`


## 3.3 Bounding box special filter

A bounding box filter allows to remove results that don’t satisfy a geospatial range.

The bounding box special filter is available per dataview and there is no need to create a bounding box definition as
it’s always possible to apply a bbox filter per dataview.

A dataview can get its result filtered by bounding box by sending a bbox param in the query string,
param must be in the form `west,south,east,north`.

So applying a bbox filter to a dataview looks like:
GET /api/v1/map/:layergroupid/dataview/:dataview_name?bbox=-90,-45,90,45

# History

## 1.0.0-alpha

 - WIP document
