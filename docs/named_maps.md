# Named Maps

Named Maps are essentially the same as Anonymous Maps except the MapConfig is stored on the server, and the map is given a unique name. You can create Named Maps from private data, and users without an API Key can view your Named Map (while keeping your data private). 

The Named Map workflow consists of uploading a MapConfig file to CartoDB servers, to select data from your CartoDB user database by using SQL. The response back from the API provides the name of your MapConfig as a template map; which you can then use to create your Named Map details, or [fetch XYZ tiles](#fetching-xyz-tiles-for-named-maps) directly for Named Maps. You can also use the MapConfig that you uploaded to create a map using [CartoDB.js](#use-cartodbjs-to-create-named-maps) for Named Maps.

The main differences, compared to Anonymous Maps, is that Named Maps include:

- **auth token**  
  This allows you to control who is able to see the map based on an auth token, and create a secure Named Map with password-protection.

- **templates**  
  The MapConfig generated template map is static and contains placeholders, enabling you to modify your map's appearance by using variables. Templates maps are persistent with no preset expiration. They can only be created, or deleted, by a CartoDB user with a valid API KEY (See [auth argument](#arguments)).

  Uploading a MapConfig produces a template map for your Named Maps. Such as MapConfigs are uploaded to the server, "template".json files are uploaded to the server for Named Maps.

**Note:** There is a limit of 4,096 Named Maps allowed per account. If you need to create more Named Maps, it is recommended to use template maps instead of uploading multiple [Named Map MapConfigs](http://docs.cartodb.com/cartodb-platform/maps-api/mapconfig/#named-map-layer-options).

## Create

#### Definition

```html
POST /api/v1/map/named
```

#### Params

Params | Description
--- | ---
api_key | is required

#### template.json

The response back from the API provides the name of your MapConfig as a template, enabling you to create the Named Map details by inserting your variables into the template where placeholders are defined, and create custom queries using SQL. The `name` argument defines how to name this "template_name".json. Note that there are some requirements for how to name a Named Map template. See the [`name`](#arguments) argument description for details.

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
name | There can only be _one_ template with the same name for any user. Valid names start with a letter or a number, and only contain letters, numbers, dashes (-), or underscores (_). This is specific to the name of your Named Map [template.json](#templatejson).

auth | 
--- | ---
&#124;_ method | `"token"` or `"open"` (`"open"` is the default if no method is specified. Use `"token"` to password-protect your map)
&#124;_ valid_tokens | when `"method"` is set to `"token"`, the values listed here allow you to instantiate the Named Map. See this [example](http://docs.cartodb.com/faqs/manipulating-your-data/#how-to-create-a-password-protected-named-map) for how to create a password-protected map.
placeholders | Placeholders are variables that can be placed in your template.json file's SQL or CartoCSS.
layergroup | the layergroup configurations, as specified in the MapConfig. See [MapConfig File Format](http://docs.cartodb.com/cartodb-platform/maps-api/mapconfig/) for more information.
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

{% comment %}writer note_csobier: Carla - Regarding view (optional) How do you see a Named Map without instantiating it via CartoDB.js/createLayer, is this referring to getting tiles via xyz url? Need an example here.{% endcomment %}

### Placeholder Format

Placeholders are variables that can be placed in your MapConfig, and template.json file's, SQL or CartoCSS options. Placeholders need to be defined with a `type` and a default value for MapConfigs. See details about defining a MapConfig `type` for [Layergoup configurations](http://docs.cartodb.com/cartodb-platform/maps-api/mapconfig/#layergroup-configurations).

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

{% comment %}writer note_csobier: Carla - This section seems out of place. Should it come sooner or is it part of Placeholder Types? Also, why is the curl command shown here formatted differently than curl commands listed in the rest of the docs? Perhaps we can use this opportunity to ensure all curl commands in this section are correct?{% endcomment %}

```html
curl -X POST \
   -H 'Content-Type: application/json' \
   -d @template.json \
   'https://documentation.cartodb.com/api/v1/map/named?api_key=APIKEY'
```

#### Response

```javascript
{
  "template_id":"name",
}
```

## Instantiate

Instantiating a Named Map allows you to fetch the map tiles. You can use the Maps API to instantiate, or use the CartoDB.js `createLayer()` function. The result is an Anonymous Map.

{% comment %}writer note_csobier: Carla - When do you need to instantiate a named map and when don't you? For example, you don't need to instantiate a named map with cartodb.js if you're using xyz tiles? Are there other ways to instantiate without CartoDB.js? If so, why would you?{% endcomment %}

#### Definition

```html
POST /api/v1/map/named/:template_name
```

#### Param

Param | Description
--- | ---
auth_token | `"token"` or `"open"` (`"open"` is the default if not specified. Use `"token"` to password-protect your map)

```javascript
// params.json, this is required
{
 "color": "#ff0000",
 "cartodb_id": 3
}
```

The fields you pass as `params.json` depend on the variables allowed by the Named Map. If there are variables missing, it will raise an error (HTTP 400).

**Note:** It is required that you include a `params.json` file to instantiate a Named Map, even if you have no fields to pass and the JSON is empty.

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

## Get Specific Templates

This gets the definition of a template.

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
{% comment %}writer note_csobier: Carla - Michelle tested the above curl command and it did not work. Can you confirm if this is written correctly? Should it just be "=params_json" and not "=template_params_json"? Also, need you to confirm if the Response below is still correct.{% endcomment %}

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

The response is in this format:

```javascript
callback({
  layergroupid: "dev@744bd0ed9b047f953fae673d56a47b4d:1390844463021.1401",
  last_updated: "2014-01-27T17:41:03.021Z"
})
```

## CartoDB.js for Named Maps
Named Maps can be used with CartoDB.js, by specifying a Named Map in a layer source as follows.

```js
var layerSource = {
  user_name: '{your_user_name}',
  type: 'namedmap',
  named_map: {
    name: '{template_name}',
	layers: [{
	  layer_name: "layer1",
      interactivity: "column1, column2, ..."
	}]
  }
}

cartodb.createLayer('map_dom_id',layerSource)
  .addTo(map_object);

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

Optionally, you can fetch projected tiles for your Named Map. This does not require an API Key. There are several ways to fetch XYZ tiles.

#### Get Template

If fetching XYZ tiles with the [`function getTemplate`](https://github.com/CartoDB/Windshaft-cartodb/blob/9449642773ed284d3855b08f0358c634f6634d59/lib/cartodb/controllers/named_maps_admin.js#L103) call, _it requires an auth token_.

```javascript
function getTemplate(err, authenticated) {
    ifUnauthenticated(authenticated, 'Only authenticated users can get template maps');
```

#### List Templates

If fetching XYZ tiles with the [`function listTemplates`](https://github.com/CartoDB/Windshaft-cartodb/blob/9449642773ed284d3855b08f0358c634f6634d59/lib/cartodb/controllers/named_maps_admin.js#L166) call, _it requires an auth token_.

```javascript
function listTemplates(err, authenticated) {
    ifUnauthenticated(authenticated, 'Only authenticated user can list templated maps');
```

#### Get Mapnik Retina Tiles

This method of fetching XYZ tiles ignores the Named Map template name and obtains the [Layergroup `srid`](http://docs.cartodb.com/cartodb-platform/maps-api/mapconfig/#layergroup-configurations) as the key value used to initialize the map. Note that it obtains the retina tiles that are not related to basemaps.

```javascript
GET (?:/api/v1/map|/user/:user/api/v1/map|/tiles/layergroup)/:token/:z/:x/:y@:scale_factor?x.:format {:user(f),:token(f),:z(f),:x(f),:y(f),:scale_factor(t),:format(f)} (1) 
Notes: Mapnik retina tiles [0]
```
**Tip:** This is the code defined as "Mapnik retina tiles" in the [Windshaft-cartodb Routes list](https://github.com/CartoDB/Windshaft-cartodb/blob/723dc59490f774c680efb74ab19fa2a556c66d9d/docs/Routes.md#routes-list).

#### Fetch XYZ tiles directly

This method uses XYZ-based URLs to fetch tiles directly, and instantiates the Named Map as part of the request to your application. You do not have to do any other steps to initialize your map. This is done with the [`NamedMapsController`](https://github.com/CartoDB/Windshaft-cartodb/blob/9449642773ed284d3855b08f0358c634f6634d59/lib/cartodb/controllers/named_maps.js#L31) base url value for your app.

{% comment %}writer note_csobier: Carla - Is it true that if you're using xyz urls to get tiles, that does instantiation for you? so you don't need to do any other steps to instantiate?{% endcomment %}

```javascript
NamedMapsController.prototype.register = function(app) {
app.get(app.base_url_templated +
    '/:template_id/:layer/:z/:x/:y.(:format)', cors(), userMiddleware,
    this.tile.bind(this));

app.get(app.base_url_mapconfig +
    '/static/named/:template_id/:width/:height.:format', cors(), userMiddleware,
    this.staticMap.bind(this));
};
```
