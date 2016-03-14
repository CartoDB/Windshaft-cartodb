# Named Maps

Named Maps are essentially the same as Anonymous Maps except the MapConfig is stored on the server, and the map is given a unique name. You can create Named Maps from private data, and users without an API Key can view your Named Map (while keeping your data private). 

The Named Map workflow consists of uploading a MapConfig file to CartoDB servers, to select data from your CartoDB user database by using SQL, and specifying the CartoCSS for your map. 

The response back from the API provides the template_id of your Named Map as the `name` (the identifier of your Named Map), which is the name that you specified in the MapConfig. You can  which you can then use to create your Named Map details, or [fetch XYZ tiles](#fetching-xyz-tiles-for-named-maps) directly for Named Maps. 

**Tip:** You can also use a Named Map that you created (which is defined by its `name`), to create a map using CartoDB.js. This is achieved by adding the [`namedmap` type](http://docs.cartodb.com/cartodb-platform/cartodb-js/layer-source-object/#named-maps-layer-source-object-type-namedmap) layer source object to draw the Named Map.

The main differences, compared to Anonymous Maps, is that Named Maps include:

- **auth token**  
  This allows you to control who is able to see the map based on an auth token, and create a secure Named Map with password-protection.

- **template map**  
  The template map is static and may contain placeholders, enabling you to modify your maps appearance by using variables. Templates maps are persistent with no preset expiration. They can only be created, or deleted, by a CartoDB user with a valid API KEY (See [auth argument](#arguments)).

  Uploading a MapConfig creates a Named Map. MapConfigs are uploaded to the server by sending the server a "template".json file, which contain the [MapConfig specifications](http://docs.cartodb.com/cartodb-platform/maps-api/mapconfig/).

**Note:** There is a limit of 4,096 Named Maps allowed per account. If you need to create more Named Maps, it is recommended to use a single Named Map and change the variables using [placeholders](#placeholder-format), instead of uploading multiple [Named Map MapConfigs](http://docs.cartodb.com/cartodb-platform/maps-api/mapconfig/#named-map-layer-options).

## Create

#### Definition

```html
POST /api/v1/map/named
```

#### Params

Params | Description
--- | ---
api_key | is required
MapConfig | a [Named Map MapConfig](http://docs.cartodb.com/cartodb-platform/maps-api/mapconfig/#named-map-layer-options) is required to create a Named Map

#### template.json

The `name` argument defines how to name this "template_name".json. Note that there are some requirements for how to name a Named Map template. See the [`name`](#arguments) argument description for details.

```javascript
{
  "version": "0.0.1",
  "name": "template_name",
  "auth": {
    "method": "token",
    "valid_tokens": [
      "auth_token1",
      "auth_token2"
    ]
  },
  "placeholders": {
    "color": {
      "type": "css_color",
      "default": "red"
    },
    "cartodb_id": {
      "type": "number",
      "default": 1
    }
  },
  "layergroup": {
    "version": "1.0.1",
    "layers": [
      {
        "type": "cartodb",
        "options": {
          "cartocss_version": "2.1.1",
          "cartocss": "#layer { polygon-fill: <%= color %>; }",
          "sql": "select * from european_countries_e WHERE cartodb_id = <%= cartodb_id %>"
        }
      }
    ]
  },
  "view": {
    "zoom": 4,
    "center": {
      "lng": 0,
      "lat": 0
    },
    "bounds": {
      "west": -45,
      "south": -45,
      "east": 45,
      "north": 45
    }
  }
}
```

#### Arguments

Params | Description
--- | ---
name | There can only be _one_ template with the same name for any user. Valid names start with a letter or a number, and only contain letters, numbers, dashes (-), or underscores (_). _This is specific to the name of your Named Map that is specified in the `name` property of the template file_.

auth | 
--- | ---
&#124;_ method | `"token"` or `"open"` (`"open"` is the default if no method is specified. Use `"token"` to password-protect your map)
&#124;_ valid_tokens | when `"method"` is set to `"token"`, the values listed here allow you to instantiate the Named Map. See this [example](http://docs.cartodb.com/faqs/manipulating-your-data/#how-to-create-a-password-protected-named-map) for how to create a password-protected map.
placeholders | Placeholders are variables that can be placed in your template.json file's SQL or CartoCSS.
layergroup | the layergroup configurations, as specified in the template. See [MapConfig File Format](http://docs.cartodb.com/cartodb-platform/maps-api/mapconfig/) for more information.
view (optional) | extra keys to specify the view area for the map. It can be used to have a static preview of a Named Map without having to instantiate it. It is possible to specify it with `center` + `zoom` or with a bounding box `bbox`. Center+zoom takes precedence over bounding box.
--- | ---
&#124;_ zoom | The zoom level to use

&#124;_ center | 
--- | ---
&#124;_ &#124;_ lng | The longitude to use for the center
&#124;_ &#124;_ lat | The latitude to use for the center

&#124;_ bounds | 
--- | ---
&#124;_ &#124;_ west | LowerCorner longitude for the bounding box, in decimal degrees (aka most western)
&#124;_ &#124;_ south | LowerCorner latitude for the bounding box, in decimal degrees (aka most southern)
&#124;_ &#124;_ east | UpperCorner longitude for the bounding box, in decimal degrees (aka most eastern)
&#124;_ &#124;_ north | UpperCorner latitude for the bounding box, in decimal degrees (aka most northern)


### Placeholder Format

Placeholders are variables that can be placed in your template.json file. Placeholders need to be defined with a `type` and a default value for MapConfigs. See details about defining a MapConfig `type` for [Layergoup configurations](http://docs.cartodb.com/cartodb-platform/maps-api/mapconfig/#layergroup-configurations).

Valid placeholder names start with a letter and can only contain letters, numbers, or underscores. They have to be written between the `<%=` and `%>` strings in order to be replaced.

#### Example

```javascript
<%= my_color %>
```

The set of supported placeholders for a template need to be explicitly defined with a specific type, and default value, for each placeholder.

### Placeholder Types

The placeholder type will determine the kind of escaping for the associated value. Supported types are:

Types | Description
--- | ---
sql_literal | internal single-quotes will be sql-escaped
sql_ident | internal double-quotes will be sql-escaped
number | can only contain numerical representation
css_color | can only contain color names or hex-values

Placeholder default values will be used whenever new values are not provided as options, at the time of creation on the client. They can also be used to test the template by creating a default version with new options provided.

When using templates, be very careful about your selections as they can give broad access to your data if they are defined loosely.

#### Call

This is the call for creating the Named Map. It is sending the template.json file to the service, and the server responds with the template id.

```bash
curl -X POST \
   -H 'Content-Type: application/json' \
   -d @template.json \
   'https://documentation.cartodb.com/api/v1/map/named?api_key=APIKEY'
```

#### Response

The response back from the API provides the name of your MapConfig as a template, enabling you to edit the Named Map details by inserting your variables into the template where placeholders are defined, and create custom queries using SQL. 

```javascript
{
  "template_id":"name",
}
```

## Instantiate

Instantiating a Named Map allows you to fetch the map tiles. You can use the Maps API to instantiate, or use the CartoDB.js `createLayer()` function. The result is an Anonymous Map.

#### Definition

```html
POST /api/v1/map/named/:template_name
```

#### Param

Param | Description
--- | ---
auth_token | `"token"` or `"open"` (`"open"` is the default if not specified. Use `"token"` to password-protect your map)

```javascript
// params.json, this is required if the Named Map allows variables (if placeholders were defined in the template.json by the user)
{
 "color": "#ff0000",
 "cartodb_id": 3
}
```

The fields you pass as `params.json` depend on the variables allowed by the Named Map. If there are variables missing, it will raise an error (HTTP 400).

**Note:** It is required that you include a `params.json` file to instantiate a Named Map that contains variables, even if you have no fields to pass and the JSON is empty. (This is specific to when a Named Map allows variables (if placeholders were defined in the template.json by the user).

#### Example

You can initialize a template map by passing all of the required parameters in a POST to `/api/v1/map/named/:template_name`.

Valid auth token will be needed, if required by the template.


#### Call

```bash
curl -X POST \
  -H 'Content-Type: application/json' \
  -d @params.json \
  'https://documentation.cartodb.com/api/v1/map/named/@template_name?auth_token=AUTH_TOKEN'
```

#### Response

```javascript
{
  "layergroupid": "docs@fd2861af@c01a54877c62831bb51720263f91fb33:123456788",
  "last_updated": "2013-11-14T11:20:15.000Z"
}
```

#### Error

```javascript
{
  "errors" : ["Some error string here"]
}
```

You can then use the `layergroupid` for fetching tiles and grids as you would normally (see [Anonymous Maps](http://docs.cartodb.com/cartodb-platform/maps-api/anonymous-maps/)).

## Update

#### Definition

```bash
PUT /api/v1/map/named/:template_name
```

#### Params

Param | Description
--- | ---
api_key | is required

#### Response

Same as updating a map.

### Other Information

Updating a Named Map removes all the Named Map instances, so they need to be initialized again.

### Example

#### Call

```bash
curl -X PUT \
  -H 'Content-Type: application/json' \
  -d @template.json \
  'https://documentation.cartodb.com/api/v1/map/named/:template_name?api_key=APIKEY'
```

#### Response

```javascript
{
  "template_id": "@template_name"
}
```

If any template has the same name, it will be updated.

If a template with the same name does NOT exist, a 400 HTTP response is generated with an error in this format:

```javascript
{
  "errors" : ["error string here"]
}
```

## Delete

Deletes the specified template map from the server, and disables any previously initialized versions of the map.

#### Definition

```bash
DELETE /api/v1/map/named/:template_name
```

#### Params

Param | Description
--- | ---
api_key | is required

### Example

#### Call

```bash
curl -X DELETE 'https://documentation.cartodb.com/api/v1/map/named/:template_name?api_key=APIKEY'
```

#### Response

```javascript
{
  "errors" : ["Some error string here"]
}
```

On success, a 204 (No Content) response will be issued. Otherwise a 4xx response with an error will be returned.

## Listing Available Templates

This allows you to get a list of all available templates.

#### Definition

```bash
GET /api/v1/map/named/
```

#### Params

Param | Description
--- | ---
api_key | is required

### Example

#### Call

```bash
curl -X GET 'https://documentation.cartodb.com/api/v1/map/named?api_key=APIKEY'
```

#### Response

```javascript
{
   "template_ids": ["@template_name1","@template_name2"]
}
```

#### Error

```javascript
{
  "errors" : ["Some error string here"]
}
```

## Get Template Definition

This gets the definition of a requested template.

#### Definition

```bash
GET /api/v1/map/named/:template_name
```

#### Params

Param | Description
--- | ---
api_key | is required

### Example

#### Call

```bash
curl -X GET 'https://documentation.cartodb.com/api/v1/map/named/:template_name?api_key=APIKEY'
```

#### Response

```javascript
{
  "template": {...} // see [template.json](#templatejson)
}
```

#### Error

```javascript
{
  "errors" : ["Some error string here"]
}
```

## JSONP for Named Maps

If using a [JSONP](https://en.wikipedia.org/wiki/JSONP) (for old browsers) request, there is a special endpoint used to initialize and create a Named Map.

#### Definition

```bash
GET /api/v1/map/named/:template_name/jsonp
```

#### Params

Params | Description
--- | ---
auth_token | `"token"` or `"open"` (`"open"` is the default if no method is specified. Use `"token"` to password-protect your map)
params | Encoded JSON with the params (variables) needed for the Named Map
lmza | You can use an LZMA compressed file instead of a params JSON file
callback | JSON callback name

#### Call

```bash
curl 'https://documentation.cartodb.com/api/v1/map/named/:template_name/jsonp?auth_token=AUTH_TOKEN&callback=callback&config=template_params_json'
```

#### Response

```javascript
callback({
  "layergroupid":"c01a54877c62831bb51720263f91fb33:0",
  "last_updated":"1970-01-01T00:00:00.000Z"
  "cdn_url": {
    "http": "http://cdb.com",
    "https": "https://cdb.com"
  }
})
```

This takes the `callback` function (required), `auth_token` if the template needs auth, and `config` which is the variable for the template (in cases where it has variables).

```javascript
url += "config=" + encodeURIComponent(
JSON.stringify({ color: 'red' });
```

The response is:

```javascript
callback({
  layergroupid: "dev@744bd0ed9b047f953fae673d56a47b4d:1390844463021.1401",
  last_updated: "2014-01-27T17:41:03.021Z"
})
```

## CartoDB.js for Named Maps
You can use a Named Map that you created (which is defined by its `name`), to create a map using CartoDB.js. This is achieved by adding the [`namedmap` type](http://docs.cartodb.com/cartodb-platform/cartodb-js/layer-source-object/#named-maps-layer-source-object-type-namedmap) layer source object to draw the Named Map.

```javascript
{
  user_name: '{your_user_name}', // Required
  type: 'namedmap', // Required
  named_map: {
    name: '{name_of_map}', // Required, the 'name' of the Named Map that you have created
    // Optional
    layers: [{
      layer_name: "sublayer0", // Optional
      interactivity: "column1, column2, ..." // Optional
    },
    {
      layer_name: "sublayer1",
      interactivity: "column1, column2, ..."
    },
      ...
    ],
    // Optional
    params: {
      color: "hex_value",
      num: 2
    }
  }
}
```
**Note:** Instantiating a Named Map over a `createLayer` does not require an API Key and by default, does not include auth tokens. _If_ you defined auth tokens for the Named Map configuration, then you will have to include them.

[CartoDB.js](http://docs.cartodb.com/cartodb-platform/cartodb-js/) has methods for accessing your Named Maps.

1. [layer.setParams()](http://docs.cartodb.com/cartodb-platform/cartodb-js/api-methods/#layersetparamskey-value) allows you to change the template variables (in the placeholders object) via JavaScript

    **Note:** The CartoDB.js `layer.setParams()` function is not supported when using Named Maps for Torque.

2. [layer.setAuthToken()](http://docs.cartodb.com/cartodb-platform/cartodb-js/api-methods/#layersetauthtokenauthtoken) allows you to set the auth tokens to create the layer

#### Examples of Named Maps created with CartoDB.js

- [Named Map selectors with interaction](http://bl.ocks.org/ohasselblad/515a8af1f99d5e690484)

- [Named Map with interactivity](http://bl.ocks.org/ohasselblad/d1a45b8ff5e7bd90cd68)

- [Toggling sublayers in a Named Map](http://bl.ocks.org/ohasselblad/c1a0f4913610eec53cd3)

### Fetching XYZ tiles for Named Maps

Optionally, authenticated users can fetch projected tiles (XYZ tiles or Mapnik Retina tiles) for your Named Map.

#### Fetch XYZ tiles directly with a URL

Authenticated users, with an auth token, can use XYZ-based URLs to fetch tiles directly, and instantiate the Named Map as part of the request to your application. You do not have to do any other steps to initialize your map. 

To call a template_id in a URL:

`/:template_id/:layer/:z/:x/:y.(:format)`

For example, a complete URL might appear as:

"https://{your user name}.cartodb.com/api/v1/map/named/{template_id}/{layer}/{z}/{x}/{y}.png"

The placeholders indicate the following:

- [`template_id`](http://docs.cartodb.com/cartodb-platform/maps-api/named-maps/#response)) is the response of your Named Map.
- layers can be a number (referring to the # layer of your map), all layers of your map, or a list of layers.
  - To show just the basemap layer, enter the number value `0` in the layer placeholder "https://{your user name}.cartodb.com/api/v1/map/named/{template_id}/0/{z}/{x}/{y}.png"
  - To show the first layer, enter the number value `1` in the layer placeholder "https://{your user name}.cartodb.com/api/v1/map/named/{template_id}/1/{z}/{x}/{y}.png"
  - To show all layers, enter the value `all` for the layer placeholder "https://{your user name}.cartodb.com/api/v1/map/named/{template_id}/all/{z}/{x}/{y}.png"
  - To show a [list of layers](http://docs.cartodb.com/cartodb-platform/maps-api/anonymous-maps/#blending-and-layer-selection), enter the comma separated layer value as 0,1,2 in the layer placeholder. For example, to show the basemap and the first layer, "https://{your user name}.cartodb.com/api/v1/map/named/{template_id}/0,1/{z}/{x}/{y}.png"


#### Get Mapnik Retina Tiles

Mapnik Retina tiles are not directly supported for Named Maps, so you cannot use the Named Map template_id. To fetch Mapnik Retina tiles, get the [layergroupid](http://docs.cartodb.com/cartodb-platform/maps-api/named-maps/#response-1) to initialize the map.

Instantiate the map by using the `layergroupid` as the token value:

 `:token/:z/:x/:y@:scale_factor?x.:format`
