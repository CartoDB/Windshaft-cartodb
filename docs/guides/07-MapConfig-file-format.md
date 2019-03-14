{% comment %}
The original resource for this was:
https://github.com/CartoDB/Windshaft/blob/master/doc/MapConfig-1.4.0.md. However this is internal documenation only. This file (07-mapconfig.md) contains select content from the Windshaft internal doc. *I instructed @rochoa to add new Doc issues if/when they make a change to this content - so that the public docs can also be updated.
{% endcomment %}

## MapConfig File Format

CARTO uses Windshaft as the map tiler library to render multilayer maps with the [Maps API]({{ site.mapsapi_docs }}/). The MapConfig file is where these Windshaft layers are stored and applied. You can configure tiles and use the MapConfig document to request different resources for your map.

This section describes the MapConfig specifications, and required formats, when using the Maps API.

### Layergroup Configurations

The following MapConfig Layergroup configurations are applied using the [RFC 4627](http://www.ietf.org/rfc/rfc4627.txt) JSON format.

Layergroup Configuration | Description | Optional or Required?
--- | ---
`version` | Spec version to use for validation.<br /><br />**Note:** The default value is `"1.0.0"`. | Optional
`extent` | The default map extent for the map projection.<br /><br />**Note:** Currently, only webmercator is supported. | Optional
`srid` | The spatial reference identifier for the map. The default is `3857`. | Optional
`maxzoom` | The maximum zoom level for your map. A request beyond the defined maxzoom returns a 404 error.<br /><br />**Note:** The default value is undefined (infinite). | Optional
`minzoom` | The minimum zoom level for your map. A request beyond the defined minzoom returns a 404 error.<br /><br />**Note:** The default value is `0`. | Optional
`layers` | Defines the layer type, and the layers, in rendering order.<br /><br />**Note:** The following layers options are available: |
--- | ---
<i class="Icon Icon--s5 Icon--cGrey Icon--mAlign Icon--indent"></i> type | A string value that defines the layer type. You can define up to four values:<br /><br />`mapnik`, rasterized tiles<br /><br />`cartodb`, an alias for mapnik (for backward compatibility)<br /><br />`torque`, render vector tiles in torque format<br /><br />`http`, load tiles over HTTP<br /><br />`plain`, color or background image url<br /><br />`named`, use a Named Map as a layer | Required
<i class="Icon Icon--s5 Icon--cGrey Icon--mAlign Icon--indent"></i> options | An object value that sets different options for each layer type.<br /><br />**Note:** Options that are not defined in different layers will be discarded. | Required

#### Example of MapConfig

{% highlight json %}
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
                "cartocss": "#table { marker-placement: point; }",
                "cartocss_version": "2.3.0"
            }
        }
    ]
}
{% endhighlight %}

---

### Mapnik Layer Options

If you are using Mapnik as a layer resource, the following configurations are required in your MapConfig file.

Mapnik Layer Option | Description | Optional or Required?
--- | ---
`sql` | A string value, the SQL request to the user database that will fetch the rendered data.<br /><br />**Tip:** The SQL request should include the following Mapnik layer configurations: `geom_column`, `interactivity`, and `attributes`, as described in this section.<br /><br />**Note:** The SQL request may contain substitutions tokens, such as `!bbox!`, `!pixel_width!`, and `!pixel_height!`. It is suggested to define the layergroup `minzoom` and `extent` variables to prevent errors. | Required
`cartocss` | A string value, specifying the CartoCSS style to render the tiles. If this is not present, only vector tiles can be requested for this layer. For a map to be valid either all the layers or none of them must have CartoCSS style.<br /><br />**Note:** The CartoCSS specification is dependent on the layer type. For details, see [mapnik-reference.json](https://github.com/mapnik/mapnik-reference). | Optional
`cartocss_version` | A string value, specifying the CartoCSS style version of the CartoCSS attribute.<br /><br />**Note:** The CartoCSS version is specific to the layer type. | Optional
`geom_column` | The name of the column containing the geometry. The default is `the_geom_webmercator`.<br /><br />*You must specify this value as part of the Mapnik layer `SQL`configuration. | *Optional
`geom_type` | Defines the type of column as either `geometry` (the default) or `raster`.<br /><br />**Note:** `geom_type` is not compatible with the Mapnik layer `interactivity` option. | Optional
`raster_band` | Defines the raster band (this option is only applicable when the `geom_type=raster`. The default value is `0`.<br /><br />**Note:** If the default, or no value is specified, raster bands are interpreted as either: grayscale (for single bands), RGB (for 3 bands), or RGBA (for 4 bands). | Optional
`srid` | The spatial reference identifier for the geometry column. The default is `3857`. | Optional
`affected_tables` | A string of values containing the tables that the Mapnik layer `SQL` configuration is using. This value is used if there is a problem guessing what the affected tables are from the SQL configuration (i.e. when using PL/SQL functions). | Optional
`interactivity` | A string of values that contains the fields rendered inside grid.json. All the parameters should be exposed as a result of executing the Mapnik layer `SQL` query.<br /><br />**Note:** `interactivity` is not compatible with the Mapnik layer `geom_type` option. For example, you cannot create a layergroup instance with a raster layer by defining the `geom_type=raster`.<br /><br />*You must specify this value as part of the Mapnik layer `SQL` configuration. | *Optional
`attributes`<a name="attributes"></a> | The id and column values returned by the Mapnik attributes service. (This option is disabled if no configuration is defined).<br /><br />*You must specify this value as part of the Mapnik layer `SQL`configuration.| *Optional
--- | ---
<i class="Icon Icon--s5 Icon--cGrey Icon--mAlign Icon--indent"></i> id | The key value used to fetch columns. | Required
<i class="Icon Icon--s5 Icon--cGrey Icon--mAlign Icon--indent"></i> columns | A string of values (columns) returned by the Mapnik attribute service. | Required

#### Example of Mapnik MapConfig

{% highlight json %}
{
    "type": "mapnik",
    "options": {
        "sql": "select * from table",
        "cartocss": "#layer { marker-placement: point; }",
        "cartocss_version": "2.3.0",
        "geom_column": "the_geom_webmercator",
        "geom_type": "geometry",
        "interactivity": [ "column1", "column2", "..."],
        "attributes": {
            "id": "cartodb_id",
            "columns": ["column1", "column2"]
        }
    }
}
{% endhighlight %}

### Torque Layer Options

If you are using Torque as a layer resource, the following configurations are required in your MapConfig file. For more details about Torque layers in general, see the [Torque API]({{ site.torque_docs}}/reference/) documentation.

Torque Layer Option | Description | Optional or Required?
--- | ---
`sql` | A string value, the SQL request to the user database that will fetch the rendered data.<br /><br />**Tip:** The SQL request should include the following Torque layer configurations: `geom_column`, `interactivity`, and `attributes`, as described in this section. | Required
`cartocss` | A string value, specifying the CartoCSS style to render the tiles.<br /><br />**Note:** The CartoCSS specification is dependent on the layer type. For details, see [Torque cartocss-reference.js](https://github.com/CartoDB/torque/blob/master/lib/torque/cartocss_reference.js).| Required
`cartocss_version` | A string value, specifying the CartoCSS style version of the CartoCSS attribute.<br /><br />**Note:** The CartoCSS version is specific to the layer type. | Required
`step` | The number of [animation steps]({{site.styling_cartocss}}/-#torque-frame-count-number) to render when requesting a torque.png tile. The default value is `0`. | Optional
`geom_column` | The name of the column containing the geometry. The default is `the_geom_webmercator`.<br /><br />*You must specify this value as part of the Torque layer `SQL`configuration. | *Optional
`srid` | The spatial reference identifier for the geometry column. The default is `3857`. | Optional
`affected_tables` | A string of values containing the tables that the Mapnik layer `SQL` configuration is using. This value is used if there is a problem guessing what the affected tables are from the SQL configuration (i.e. when using PL/SQL functions). | Optional
`attributes` | The id and column values returned by the Torque attributes service. (This option is disabled if no configuration is defined).<br /><br />*You must specify this value as part of the Torque layer `SQL`configuration.| *Optional
--- | ---
<i class="Icon Icon--s5 Icon--cGrey Icon--mAlign Icon--indent"></i> id | The key value used to fetch columns. | Required
<i class="Icon Icon--s5 Icon--cGrey Icon--mAlign Icon--indent"></i> columns | A string of values (columns) returned by the Torque attribute service. | Required

#### Example of Torque MapConfig

{% highlight json %}
{
    "type": "torque",
    "options": {
        "sql": "select * from table",
        "cartocss": "#layer { ... }",
        "cartocss_version": "1.0.0",
        "geom_column": "the_geom_webmercator"
    }
}
{% endhighlight %}

### HTTP Layer Options

If you are using an HTTP destination as the resource for a map layer, the following configurations are required in your MapConfig file.

HTTP Layer Option | Description | Optional or Required?
--- | ---
`urlTemplate` | A string value, end URL, from where the tile data is retrieved. _URLs must be included in the configuration whitelist to be valid._ <br /><br />**Note:** The {String} value includes:<br /><br />`{z}` as the zoom level<br /><br />`{x} and {y}` as the tile coordinates<br /><br />Optionally, the subdomain `{s}` may be included as part of the `urlTemplate` configuration. Otherwise, you can define the `subdomains` separately, as shown below. | Required
`subdomains` | A string of values used to retrieve tiles from different subdomains. The default value is [`a`, `b`, `c`] when `{s}` is defined in the `urlTemplate` configuration. Otherwise, the default value is `[ ]`.<br /><br />**Note:** The subdomains value will consistently replace the `{s}` value defined in the `urlTemplate`.| Optional
`tms` | A boolean value that specifies whether the tile is using Tile Map Service format. The default value is `false`.<br /><br />**Note:** If the value is `true`, the TMS inverses the Y axis numbering for tiles. | Optional

#### Example of HTTP MapConfig

{% highlight json %}
{
    "type": "http",
    "options": {
        "urlTemplate": "http://{s}.example.com/{z}/{x}/{y}.png",
        "subdomains": ["a", "b", "c"],
        "tms": false
    }
}
{% endhighlight %}

### Plain Layer Options

If you are using plain layer options as your map resource, the following configurations are required in your MapConfig file.

_**Note:** At least one of the plain layer options (either `color` or `imageUrl`) must be defined. If both options are defined, only `color` is used as part of the plain layer configuration._

Plain Layer Option | Description | Optional or Required?
--- | ---
`color` | A string value of numbers that defines the valid colors to include. The default value is `null`. Valid colors include:<br /><br />- A string value that includes CSS colors (i.e. `blue`) or a hex color string (i.e. `#0000ff`)<br /><br />- An integer array of r,g,b values (i.e. `[255,0,0]`)<br /><br />- An integer array of r,g,b,a values (i.e. `[255,0,0,128]`)<br /><br />* If **only** the `color` value is used for a plain layer, this value is Required.<br /><br />* If **both** `color` and `imageUrl` are defined, only the `color` value is used for the plain layer configuration.| *Both
`imageUrl` | A string value, end URL, from where the image is retrieved. The default value is `null`.<br /><br />* If **only** the `imageUrl` value is used for a plain layer, this value is Required.<br /><br />* If `color` is defined, this `imageUrl` value is ignored. | *Both

#### Example of Plain MapConfig

{% highlight json %}
{
    "type": "plain",
    "options": {
        "color": "blue",
        "imageUrl": "http://example.com/background.png"
    }
}
{% endhighlight %}

### Named Map Layer Options

You can use a [Named Map]({{site.mapsapi_docs}}/guides/named-maps/) as a map layer. Note the following limitations before referencing the MapConfig options for a Named Map layer.

_**Limitations:**_

- A Named Map will not allow you to have `named` type layers inside of your template layergroup's layers definition
- A `named` layer does not allow Named Maps from other accounts. You can only use Named Maps from the _same_ user account

If you are using `named` layer options as your map resource, the following configurations are required in your MapConfig file.

Named Layer Option | Description | Optional or Required?
--- | ---
`name` | A string value, the name for the Named Map to use. | Required
`config` | An object, the replacement values for the Named Map's template placeholders. | Optional
`auth_tokens` | Strings array, the authorized tokens in case the Named Map has auth method set to `token`. | Optional

#### Example of Named MapConfig

{% highlight json %}
{
    "type": "named",
    "options": {
        "name": "world_borders",
        "config": {
            "color": "#000"
        },
        "auth_tokens": ["token1", "token2"]
    }
}
{% endhighlight %}

### Aggregation Options

The data used to render tiles, or contained in the tiles (for the case of vector tiles), can be spatially [aggregated]({{site.mapsapi_docs}}/guides/named-maps/) under some circumstances.

An `aggregation` attribute can be used in the layer `options` to control the aggregation. A value of `false` will disable aggregation for the layer. Otherwise, an object can be passed with the following aggregation parameters:

Parameter|Description|Default value
`placement`|Determines the kind of aggregated geometry generated ("point-sample", "point-grind" or "centroid").|"centroid"
`columns`|Defines aggregated columns; each one by an "aggregate_function" ("sum", "avg", "min, "max", "mode", "count") and "aggregated_column" name.|
`resolution`|Defines the cell-size of the spatial aggregation grid.|1 (for 256x256 cells per tile)
`threshold`|Minimum rows in the dataset to apply aggregation.

#### Example of Aggregation MapConfig

{% highlight json %}
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
                    "placement": "centroid",s
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
                    "resolution": 2, // Aggregation cell is 2x2 pixels
                    "threshold": 500000
                }
            }
        }
    ]
}
{% endhighlight %}

### MapConfig Requirements

All of these are MapConfig requirements for [Anonymous Maps]({{site.mapsapi_docs}}/guides/anonymous-maps/#retrieve-resources-from-the-layergroup).

- Identified by `{z}/{x}/{y}` path

- If applicable, additionally identified by `LAYER_NUMBER`

- Can be of different formats:
	- png
	- grid.json
	- torque.json

- Static images/previews
	- With a center or a bounding box

- Attributes
	-Identified by LAYER_NUMBER and FEATURE_ID

**Tip:** The MapConfig file may be extended for specific uses. For example, [Windshaft-CartoDB](https://github.com/CartoDB/Windshaft-cartodb/blob/master/docs/MultiLayer-API.md) defines the addition of a `stat_tag` element in the config. This extension is also covered as part of the [Named Map Layer Options](#named-map-layer-options).