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

### Retrieve resources from the layergroup

When you have a layergroup, there are several resources for retrieving layergoup details such as, accessing Mapnik tiles, getting individual layers, accessing defined Attributes, and blending and layer selection.

#### Mapnik tiles

These tiles will get just the Mapnik layers. To get individual layers, see the following section.

```bash
https://{username}.carto.com/api/v1/map/{layergroupid}/{z}/{x}/{y}.png
```

#### Individual layers

The MapConfig specification holds the layers definition in a 0-based index. Layers can be requested individually in different formats depending on the layer type.

Individual layers can be accessed using that 0-based index. For UTF grid tiles:

```bash
https://{username}.carto.com/api/v1/map/{layergroupid}/{layer}/{z}/{x}/{y}.grid.json
```

In this case, `layer` as 0 returns the UTF grid tiles/attributes for layer 0, the only layer in the example MapConfig.

If the MapConfig had a Torque layer at index 1 it could be possible to request it with:

```bash
https://{username}.carto.com/api/v1/map/{layergroupid}/1/{z}/{x}/{y}.torque.json
```

#### Attributes defined in `attributes` section

```bash
https://{username}.carto.com/api/v1/map/{layergroupid}/{layer}/attributes/{feature_id}
```

Which returns JSON with the attributes defined, like:

```javascript
{ "c": 1, "d": 2 }
```

#### Blending and layer selection

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
  - Ordering is not considered. So right now filtering layers 0,3,4 is the very same thing as filtering 3,4,0. As this
  may change in the future **it is recommended** to always select the layers in ascending order so you will get a
  consistent behavior in the future.


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
