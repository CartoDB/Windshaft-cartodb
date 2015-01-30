# STATUS: DRAFT

# 1. Purpose

This specification describes an extension for
[MapConfig 1.3.0](https://github.com/CartoDB/Windshaft/blob/master/doc/MapConfig-1.3.0.md) version.


# 2. Changes over specification

This extension introduces a new layer type so it's possible to use a named map by its name as a layer.

## 2.1 Named layers definition

```javascript
{
    // REQUIRED
    // string, `named` is the only supported value
    type: "named",

    // REQUIRED
    // object, set `named` map layers configuration
    options: {

        // REQUIRED
        // string, the name for the named map to use
        name: "world_borders",

        // OPTIONAL
        // object, the replacement values for the named map's template placeholders
        // See https://github.com/CartoDB/Windshaft-cartodb/blob/master/docs/Map-API.md#instantiate-1 for more details
        config: {
            "color": "#000"
        },

        // OPTIONAL
        // string array, the authorized tokens in case the named map has auth method set to `token`
        // See https://github.com/CartoDB/Windshaft-cartodb/blob/master/docs/Map-API.md#named-maps-1 for more details
        auth_tokens: [
            "token1",
            "token2"
        ]
    }
}
```

## 2.2 Limitations

1. A Named Map will not allow to have `named` type layers inside their templates layergroup's layers definition.
2. A `named` layer does not allow Named Maps form other accounts, it's only possible to use Named Maps from the very
same user account.


# History

## 1.0.0

 - Initial version
