# 1. Purpose

This specification describes an extension for
[MapConfig 1.4.0](https://github.com/CartoDB/Windshaft/blob/master/doc/MapConfig-1.4.0.md) version.


# 2. Changes over specification

This extension targets layers with `sql` option, including layer types: `cartodb`, `mapnik`, and `torque`.

It extends MapConfig with a new attribute: `analyses`.

## 2.1 Analyses attribute

The new analyses attribute must be an array of analyses as per [camshaft](https://github.com/CartoDB/camshaft). Each
analysis must adhere to the [camshaft-reference](https://github.com/CartoDB/camshaft/blob/0.8.0/reference/versions/0.7.0/reference.json) specification.

Each node can have an id that can be later references to consume the query from MapConfig's layers.

Basic analyses example:

```javascript
[
    {
        // REQUIRED
        // string, `id` free identifier that can be reference from any layer
        "id": "HEAD",
        // REQUIRED
        // string, `type` camshaft's analysis type
        "type": "source",
        // REQUIRED
        // object, `params` will depend on `type`, check camshaft-reference for more information
        "params": {
            "query": "select * from your_table"
        }
    }
]
```

# 2.2. Integration with layers

As pointed before an analysis node id can be referenced from layers to consume its output query.

The layer consuming the output must reference it with the following option:

```
{
    "options": {
        // REQUIRED
        // object, `source` as in the future we might want to have other source options
        "source": {
            // REQUIRED
            // string, `id` the analysis node identifier
            "id": "HEAD"
        }
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

# History

## 1.0.0

 - Initial version
