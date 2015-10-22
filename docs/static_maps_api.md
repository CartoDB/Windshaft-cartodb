# Static Maps API

The Static Maps API can be initiated using both named and anonymous maps using the 'layergroupid' token. The API can be used to create static images of parts of maps and thumbnails for use in web design, graphic design, print, field work, and many other applications that require standard image formats.

## Maps API endpoints

Begin by instantiating either a named or anonymous map using the `layergroupid token` as demonstrated in the Maps API documentation above. The `layergroupid` token calls to the map and allows for parameters in the definition to generate static images.

### Zoom + center

#### Definition

<div class="code-title notitle code-request"></div>
```bash
GET /api/v1/map/static/center/:token/:z/:lat/:lng/:width/:height.:format
```

#### Params

* **:token**: the layergroupid token from the map instantiation
* **:z**: the zoom level of the map
* **:lat**: the latitude for the center of the map
* **:lng**: the longitude for the center of the map
* **:width**: the width in pixels for the output image
* **:height**: the height in pixels for the output image
* **:format**: the format for the image, supported types: `png`, `jpg`
  * **jpg** will have a default quality of 85.

### Bounding Box

#### Definition

<div class="code-title notitle code-request"></div>
```bash
GET /api/v1/map/static/bbox/:token/:bbox/:width/:height.:format`
```

#### Params

* **:token**: the layergroupid token from the map instantiation
* **:bbox**: the bounding box in WGS 84 (EPSG:4326), comma separated values for:
    - LowerCorner longitude, in decimal degrees (aka most western)
    - LowerCorner latitude, in decimal degrees (aka most southern)
    - UpperCorner longitude, in decimal degrees (aka most eastern)
    - UpperCorner latitude, in decimal degrees (aka most northern)
* **:width**: the width in pixels for the output image
* **:height**: the height in pixels for the output image
* **:format**: the format for the image, supported types: `png`, `jpg`
  * **jpg** will have a default quality of 85.

Note: you can see this endpoint as:

```bash
GET /api/v1/map/static/bbox/:token/:west,:south,:east,:north/:width/:height.:format`
```

### Named map

#### Definition

<div class="code-title notitle code-request"></div>
```bash
GET /api/v1/map/static/named/:name/:width/:height.:format
```

#### Params

* **:name**: the name of the named map
* **:width**: the width in pixels for the output image
* **:height**: the height in pixels for the output image
* **:format**: the format for the image, supported types: `png`, `jpg`
  * **jpg** will have a default quality of 85.

A named maps static image will get its constraints from the [view in the template](#Arguments), if `view` is not present it will estimate the extent based on the involved tables otherwise it fallback to `"zoom": 1`, `"lng": 0` and `"lat": 0`.

####Layers

The Static Maps API allows for multiple layers of incorporation into the `MapConfig` to allow for maximum versatility in creating a static map. The examples below were used to generate the static image example in the next section, and appear in the specific order designated.

**Basemaps**

```javascript
    {
      "type": "http",
      "options": {
        "urlTemplate": "http://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
        "subdomains": [
          "a",
          "b",
          "c"
        ]
      }
    },
```

By manipulating the `"urlTemplate"` custom basemaps can be used in generating static images. Supported map types for the Static Maps API are:

          'http://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
          'http://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
          'http://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
          'http://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png',

**Mapnik**

```javascript
    {
      "type": "mapnik",
      "options": {
        "sql": "select null::geometry the_geom_webmercator",
        "cartocss": "#layer {\n\tpolygon-fill: #FF3300;\n\tpolygon-opacity: 0;\n\tline-color: #333;\n\tline-width: 0;\n\tline-opacity: 0;\n}",
        "cartocss_version": "2.2.0"
      }
    },
```

**CartoDB**

As described in the [Mapconfig documentation](https://github.com/CartoDB/Windshaft/blob/0.44.1/doc/MapConfig-1.3.0.md), a "cartodb" type layer is now just an alias to a "mapnik" type layer as above, intended for backwards compatibility.

```javascript
    {
      "type": "cartodb",
      "options": {
        "sql": "select * from park",
        "cartocss": "/** simple visualization */\n\n#park{\n  polygon-fill: #229A00;\n  polygon-opacity: 0.7;\n  line-color: #FFF;\n  line-width: 0;\n  line-opacity: 1;\n}",
        "cartocss_version": "2.1.1"
      }
    },
```

Additionally, static images from Torque maps and other map layers can be used together to generate highly customizable and versatile static maps.


### Caching

It is important to note that generated images are cached from the live data referenced with the `layergroupid token` on the specified CartoDB account. This means that if the data changes, the cached image will also change. When linking dynamically, it is important to take into consideration the state of the data and longevity of the static image to avoid broken images or changes in how the image is displayed. To obtain a static snapshot of the map as it is today and preserve the image long-term regardless of changes in data, the image must be saved and stored locally.

### Limits

* While images can encompass an entirety of a map, the default limit for pixel range is 8192 x 8192.
* Image resolution by default is set to 72 DPI
* JPEG quality by default is 85%
* Timeout limits for generating static maps are the same across the CartoDB Editor and Platform. It is important to ensure timely processing of queries.


## Examples

After instantiating a map from a CartoDB account:

<div class="code-title code-request with-result">REQUEST</div>
```bash
 GET /api/v1/map/static/center/4b615ff367e498e770e7d05e99181873:1420231989550.8699/14/40.71502926732618/-73.96039009094238/600/400.png
```

### Response

<p class="wrap-border"><img src="https://raw.githubusercontent.com/namessanti/Pictures/master/static_api.png" alt="static-api"/></p>

### MapConfig

For this map, the multiple layers, order, and stylings are defined by the MapConfig.

```javascript
{
  "version": "1.3.0",
  "layers": [
    {
      "type": "http",
      "options": {
        "urlTemplate": "http://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
        "subdomains": [
          "a",
          "b",
          "c"
        ]
      }
    },
    {
      "type": "mapnik",
      "options": {
        "sql": "select null::geometry the_geom_webmercator",
        "cartocss": "#layer {\n\tpolygon-fill: #FF3300;\n\tpolygon-opacity: 0;\n\tline-color: #333;\n\tline-width: 0;\n\tline-opacity: 0;\n}",
        "cartocss_version": "2.2.0"
      }
    },
    {
      "type": "cartodb",
      "options": {
        "sql": "select * from park",
        "cartocss": "/** simple visualization */\n\n#park{\n  polygon-fill: #229A00;\n  polygon-opacity: 0.7;\n  line-color: #FFF;\n  line-width: 0;\n  line-opacity: 1;\n}",
        "cartocss_version": "2.1.1"
      }
    },
    {
      "type": "cartodb",
      "options": {
        "sql": "select * from residential_zoning_2009",
        "cartocss": "/** simple visualization */\n\n#residential_zoning_2009{\n  polygon-fill: #c7eae5;\n  polygon-opacity: 1;\n  line-color: #FFF;\n  line-width: 0.2;\n  line-opacity: 0.5;\n}",
        "cartocss_version": "2.1.1"
      }
    },
    {
      "type": "cartodb",
      "options": {
        "sql": "select * from nycha_developments_july2011",
        "cartocss": "/** simple visualization */\n\n#nycha_developments_july2011{\n  polygon-fill: #ef3b2c;\n  polygon-opacity: 0.7;\n  line-color: #FFF;\n  line-width: 0;\n  line-opacity: 1;\n}",
        "cartocss_version": "2.1.1"
      }
    }
  ]
}
```
