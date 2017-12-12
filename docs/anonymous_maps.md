# Anonymous Maps

Anonymous Maps allows you to instantiate a map given SQL and CartoCSS. It also allows you to add interaction capabilities using [UTF Grid.](https://github.com/mapbox/utfgrid-spec)


## Instantiate

#### Definition

```html
POST /api/v1/map
```

#### Params

```javascript
{
  "version": "1.3.0",
  "layers": [{
    "type": "mapnik",
    "options": {
      "cartocss_version": "2.1.1",
      "cartocss": "#layer { polygon-fill: #FFF; }",
      "sql": "select * from european_countries_e",
      "interactivity": ["cartodb_id", "iso3"]
    }
  }]
}
```

See [MapConfig File Formats](http://docs.carto.com/carto-engine/maps-api/mapconfig/) for details.

#### Response

The response includes:

Attributes | Description
--- | ---
layergroupid | The ID for that map, used to compose the URL for the tiles. The final URL is: `https://{username}.carto.com/api/v1/map/{layergroupid}/{z}/{x}/{y}.png`
updated_at | The ISO date of the last time the data involved in the query was updated.
metadata | Includes information about the layers.
cdn_url | URLs to fetch the data using the best CDN for your zone.

### Example

#### Call

```bash
curl 'https://{username}.carto.com/api/v1/map' -H 'Content-Type: application/json' -d @mapconfig.json
```

#### Response

```javascript
{
  "layergroupid": "c01a54877c62831bb51720263f91fb33:0",
  "last_updated": "1970-01-01T00:00:00.000Z",
  "metadata": {
    "layers": [
      {
        "type": "mapnik",
        "meta": {}
      }
    ]
  },
  "cdn_url": {
    "http": "http://cdb.com",
    "https": "https://cdb.com"
  }
}
```

## Map Tile Rendering

Map tiles create the graphical representation of your map in a web browser. The performance rendering of map tiles is dependent on the type of geospatial data model (raster or vector) that you are using.

- **Raster**: Generates map tiles based on a grid of pixels to represent your data. Each cell is a fixed size and contains values for particular map features. On the server-side, each request queries a dataset to retrieve data for each map tile. The grid size of map tiles can often lead to graphic quality issues.

- **Vector**: Generates map tiles based on pre-defined coordinates to represent your data, similar to how basemap image tiles are rendered. On the client-side, map tiles represent real-world geometries of a map. Depending on the coordinates, vertices are used to connect the data and display points, lines, or polygons for the map tiles.

## Retrieve resources from the layergroup

When you have a layergroup, there are several resources for retrieving layergoup details such as, accessing Mapnik tiles, getting individual layers, accessing defined Attributes, and blending and layer selection.

### Mapnik tiles

These raster tiles retrieve just the Mapnik layers. See [individual layers](#individual-layers) for details about how to retrieve other layers.

```bash
https://{username}.carto.com/api/v1/map/{layergroupid}/{z}/{x}/{y}.png
```

### Mapbox Vector Tiles (MVT)

[Mapbox Vector Tiles (MVT)](https://www.mapbox.com/vector-tiles/specification/) are map tiles that store geographic vector data on the client-side. Browser performance is fast since you can pan and zoom without having to query the server.

CARTO uses a Web Graphics Library (WebGL) to process MVT files. This is useful since WebGL's are compatible with most web browsers, include support for multiple client-side mapping engines, and do not require additional information from the server; which makes it more efficient for rendering map tiles. However, you can use any implementation tool for processing MVT files.

The following examples describe how to fetch MVT tiles with a cURL request.

#### MVT and Windshaft

CARTO uses Windshaft as the map tiler library to render multilayer maps with the Maps API. You can use Windshaft to request MVT using the same layer type that is used for requesting raster tiles (Mapnik layer). Simply change the file format `.mvt` in the URL.


```bash
https://{username}.cartodb.com/api/v1/map/HASH/:layer/{z}/{x}/{y}.mvt
```

The following example instantiates an anonymous map with layer options:

```bash
{
  user_name: 'mycartodbuser',
  sublayers: [{
    sql: "SELECT * FROM table_name";
    cartocss: '#layer { marker-fill: #F0F0F0; }'
  }],
  maps_api_template: 'https://{user}.cartodb.com' // Optional
}
```

**Note**: If no layer type is specified, Mapnik tiles are used by default. To access MVT tiles, specify `https://{username}.cartodb.com/api/v1/map/HASH/{z}/{x}/{y}.mvt` as the `maps_api_template` variable.

**Tip:** If you are using [Named Maps](https://carto.com/docs/carto-engine/maps-api/named-maps/) to instantiate a layer, indicate the MVT file format and layer in the response:

```bash
https://{username}.cartodb.com/api/v1/map/named/:templateId/:layer/{z}/{x}/{y}.mvt
```

For all layers in a Named Map, you must indicate Mapnik as the layer filter:

```bash
https://{username}.cartodb.com/api/v1/map/named/:templateId/mapnik/{z}/{x}/{y}.mvt
```

#### Layergroup Filter for MVT Tiles

To filter layers using Windshaft, use the following request where layers are numbered:

```bash
https://{username}.cartodb.com/api/v1/map/HASH/0,1,2/{z}/{x}/{y}.mvt
```

To request all layers, remove the layergroup filter parameter:

```bash
https://{username}.cartodb.com/api/v1/map/HASH/{z}/{x}/{y}.mvt
```

To filter a specific layer:

```bash
https://{username}.cartodb.com/api/v1/map/HASH/2/{z}/{x}/{y}.mvt
```

#### Example 1: MVT Tiles with Windshaft, CARTO.js, and MapboxGL

1) Import the required libraries:

```bash
<script src='https://api.tiles.mapbox.com/mapbox-gl-js/v0.9.0/mapbox-gl.js'></script>
<link href='https://api.tiles.mapbox.com/mapbox-gl-js/v0.9.0/mapbox-gl.css' rel='stylesheet' />
<script src="http://libs.cartocdn.com/cartodb.js/v3/3.15/cartodb.core.js"></script>
```

2) Configure Map Client:

```bash
mapboxgl.accessToken = '{yourMapboxToken}';
```

3) Create Map Object (Mapbox):

```bash
var map = new mapboxgl.Map({
container: 'map',
zoom: 1,
minZoom: 0,
maxZoom: 18,
center: [30, 0]
});
```

4) Define Layer Options (CARTO):

```bash
var layerOptions = {
user_name: "{username}",
sublayers: [{
sql: "SELECT * FROM {table_name}",
cartocss: "...",
     }]
};
```

5) Request Tiles (from CARTO) and Set to Map Object (Mapbox):

**Note:** By default, [CARTO core functions](https://carto.com/docs/carto-engine/carto-js/core-api/) retrieve URLs for fully rendered tiles. You must replace the default format (.png) with the MVT format (.mvt).


```bash
cartodb.Tiles.getTiles(layerOptions, function(result, err) {
var tiles = result.tiles.map(function(tileUrl) {
return tileUrl
.replace('{s}', 'a')
.replace(/\.png/, '.mvt');
});
map.setStyle(simpleStyle(tiles));
});
```

#### Example 2: MVT Libraries with Windshaft and MapboxGL

When you are not including CARTO.js to implement MVT tiles, you must use the `map.setStyle` parameter to specify vector map rendering.

1) Import the required libraries:

```bash
<script src='https://api.tiles.mapbox.com/mapbox-gl-js/v0.9.0/mapbox-gl.js'></script>
<link href='https://api.tiles.mapbox.com/mapbox-gl-js/v0.9.0/mapbox-gl.css' rel='stylesheet'/>
```

2) Configure Map Client:

```bash
mapboxgl.accessToken = '{yourMapboxToken}';
```

3) Create Map Object (Mapbox):

```bash
var map = new mapboxgl.Map({
container: 'map',
zoom: 1,
minZoom: 0,
maxZoom: 18,
center: [30, 0]
});
```

4) Set the Style

```bash
map.setStyle({
    "version": 7,
    "glyphs": "...",
    "constants": {...}, 
    "sources": {
      "cartodb": {
        "type": "vector",
        "tiles": [ "http://{username}.cartodb.com/api/v1/map/named/templateId/mapnik/{z}/{x}/{y}.mvt"
        ],
        "maxzoom": 18
      }
    },
    "layers": [{...}]
});
```

**Tip:** If you are using MapboxGL, see the following resource for additional information.

- [MapboxGL API Reference](https://www.mapbox.com/mapbox-gl-js/api/)
- [MapboxGL Style Specifications](https://www.mapbox.com/mapbox-gl-js/style-spec/)
- [Example of MapboxGL Implementation](https://www.mapbox.com/mapbox-gl-js/examples/)

### Individual layers

The MapConfig specification holds the layers definition in a 0-based index. Layers can be requested individually, in different formats, depending on the layer type.

Individual layers can be accessed using that 0-based index. For UTF grid tiles:

```bash
https://{username}.carto.com/api/v1/map/{layergroupid}/{layer}/{z}/{x}/{y}.grid.json
```

In this case, `layer` as 0 returns the UTF grid tiles/attributes for layer 0, the only layer in the example MapConfig.

If the MapConfig had a Torque layer at index 1 it could be possible to request it with:

```bash
https://{username}.carto.com/api/v1/map/{layergroupid}/1/{z}/{x}/{y}.torque.json
```

### Attributes defined in `attributes` section

```bash
https://{username}.carto.com/api/v1/map/{layergroupid}/{layer}/attributes/{feature_id}
```

Which returns JSON with the attributes defined, such as:

```javascript
{ "c": 1, "d": 2 }
```

### Blending and layer selection

```bash
https://{username}.carto.com/api/v1/map/{layergroupid}/{layer_filter}/{z}/{x}/{y}.png
```

Note: currently format is limited to `png`.

`layer_filter` can be used to select some layers to be rendered together. `layer_filter` supports two formats:

- `all` alias

Using `all` as `layer_filter` will blend all layers in the layergroup

```bash
https://{username}.carto.com/api/v1/map/{layergroupid}/all/{z}/{x}/{y}.png
```

- Filter by layer index

A list of comma separated layer indexes can be used to just render a subset of layers. For example `0,3,4` will filter and blend layers with indexes 0, 3, and 4.

```bash
https://{username}.carto.com/api/v1/map/{layergroupid}/0,3,4/{z}/{x}/{y}.png
```

Some notes about filtering:

  - Invalid index values or out of bounds indexes will end in `Invalid layer filtering` errors.
  - Ordering is not considered. So right now filtering layers 0,3,4 is the very same thing as filtering 3,4,0. As this may change in the future, **it is recommended** to always select the layers in ascending order so that you will always get consistent behavior.

## Create JSONP

The JSONP endpoint is provided in order to allow web browsers access which don't support CORS.

#### Definition

```bash
GET /api/v1/map?callback=method
```

#### Params

Param | Description
--- | ---
config | Encoded JSON with the params for creating Named Maps (the variables defined in the template).
lmza | This attribute contains the same as config but LZMA compressed. It cannot be used at the same time as `config`.
callback | JSON callback name.

### Example

#### Call

```bash
curl "https://{username}.carto.com/api/v1/map?callback=callback&config=%7B%22version%22%3A%221.0.1%22%2C%22layers%22%3A%5B%7B%22type%22%3A%22cartodb%22%2C%22options%22%3A%7B%22sql%22%3A%22select+%2A+from+european_countries_e%22%2C%22cartocss%22%3A%22%23european_countries_e%7B+polygon-fill%3A+%23FF6600%3B+%7D%22%2C%22cartocss_version%22%3A%222.3.0%22%2C%22interactivity%22%3A%5B%22cartodb_id%22%5D%7D%7D%5D%7D"
```

#### Response

```javascript
callback({
  layergroupid: "d9034c133262dfb90285cea26c5c7ad7:0",
  cdn_url: {
    "http": "http://cdb.com",
    "https": "https://cdb.com"
  },
  last_updated: "1970-01-01T00:00:00.000Z"
})
```

## Remove

Anonymous Maps cannot be removed by an API call. They will expire after about five minutes, or sometimes longer. If an Anonymous Map expires and tiles are requested from it, an error will be raised. This could happen if a user leaves a map open and after time, returns to the map and attempts to interact with it in a way that requires new tiles (e.g. zoom). The client will need to go through the steps of creating the map again to fix the problem.
