# General Concepts

The following concepts are the same for every endpoint in the API except when it's noted explicitly.

## Auth

By default, users do not have access to private tables in CARTO. In order to instantiate a map from private table data an API Key is required. Additionally, to include some endpoints, an API Key must be included (e.g. creating a Named Map).

To execute an authorized request, `api_key=YOURAPIKEY` should be added to the request URL. The param can be also passed as POST param. Using HTTPS is mandatory when you are performing requests that include your `api_key`.

## Errors

Errors are reported using standard HTTP codes and extended information encoded in JSON with this format:

```javascript
{
  "errors": [
    "access forbidden to table TABLE"
  ]
}
```

If you use JSONP, the 200 HTTP code is always returned so the JavaScript client can receive errors from the JSON object.

## CORS Support

All the endpoints, which might be accessed using a web browser, add CORS headers and allow OPTIONS method.

## Map Tile Rendering

Map tiles create the graphical representation of your map in a web browser. The performance rendering of map tiles is dependent on the type of geospatial data model (raster or vector) that you are using.

- **Raster**: Generates map tiles based on a grid of pixels to represent your data. Each cell is a fixed size and contains values for particular map features. On the server-side, each request queries a dataset to retrieve data for each map tile. The grid size of map tiles can often lead to graphic quality issues.

- **Vector**: Generates map tiles based on pre-defined coordinates to represent your data, similar to how basemap image tiles are rendered. On the client-side, map tiles represent real-world geometries of a map. Depending on the coordinates, vertices are used to connect the data and display points, lines, or polygons for the map tiles.

**Note:** By default, CARTO uses vector graphics for map rendering. Please [contact us](mailto:support@carto.com) if you need raster rendering enabled as part of your requirements.

### Mapbox Vector Tiles (MVT)

[Mapbox Vector Tiles (MVT)](https://www.mapbox.com/vector-tiles/specification/) are map tiles that store geographic vector data on the client-side. Browser performance is fast since you can pan and zoom without having to query the server.

CARTO uses a Web Graphics Library (WebGL) to process MVT files. This is useful since WebGL's are compatible with most web browsers, include support for multiple client-side mapping engines, and do not require additional information from the server; which makes it more efficient for rendering map tiles.

**Tip:** You can process MVT files with the [`ST_AsMVT` PostGIS function](https://postgis.net/docs/manual-dev/ST_AsMVT.html) with the [Maps API Windshaft renderer](https://github.com/CartoDB/Windshaft/blob/1000x/lib/windshaft/renderers/pg_mvt/renderer.js).
