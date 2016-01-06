# Named Maps

Named maps are essentially the same as anonymous maps except the MapConfig is stored on the server and the map is given a unique name. Two other big differences are: You can create named maps from private data, and users without an API Key can see them even though they are from that private data. 

**Note there is a hard limit of 4,096 named maps per account**. If you need to create more named maps, consider using templates in the MapConfig (explained below).

The main two differences compared to anonymous maps are:

- **auth layer**  
  This allows you to control who is able to see the map based on a token auth

- **templates**  
  Since the MapConfig is static it can contain some variables so the client can modify the map's appearance using those variables.

Template maps are persistent with no preset expiration. They can only be created or deleted by a CartoDB user with a valid API_KEY (see auth section).

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
name | There can be at most _one_ template with the same name for any user. Valid names start with a letter or a number, and only contain letters, numbers, dashes (-) or underscores (_).

auth | 
--- | ---
&#124;_ method | `"token"` or `"open"` (the default if no `"method"` is given).
&#124;_ valid_tokens | when `"method"` is set to `"token"`, the values listed here allow you to instantiate the named map.
placeholders | Variables not listed here are not substituted. Variables not provided at instantiation time trigger an error. A default is required for optional variables. Type specification is used for quoting, to avoid injections see template format section below.
layergroup | the layer list definition. This is the MapConfig explained in anonymous maps. See [MapConfig documentation](https://github.com/CartoDB/Windshaft/blob/0.44.1/doc/MapConfig-1.3.0.md) for more info.

view (optional) | extra keys to specify the compelling area for the map. It can be used to have a static preview of a named map without having to instantiate it. It is possible to specify it with `center` + `zoom` or with a bounding box `bbox`. Center+zoom takes precedence over bounding box.
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

### Template Format

A templated `layergroup` allows the use of placeholders in the "cartocss" and "sql" elements of the "option" object in any "layer" of a `layergroup` configuration

Valid placeholder names start with a letter and can only contain letters, numbers, or underscores. They have to be written between the `<%=` and `%>` strings in order to be replaced.

#### Example

```javascript
<%= my_color %>
```

The set of supported placeholders for a template will need to be explicitly defined with a specific type and default value for each.

### Placeholder Types

The placeholder type will determine the kind of escaping for the associated value. Supported types are:

Types | Description
--- | ---
sql_literal | internal single-quotes will be sql-escaped
sql_ident | internal double-quotes will be sql-escaped
number | can only contain numerical representation
css_color | can only contain color names or hex-values

Placeholder default values will be used whenever new values are not provided as options at the time of creation on the client. They can also be used to test the template by creating a default version with new options provided.

When using templates, be very careful about your selections as they can give broad access to your data if they are defined losely.

#### Call

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

Instantiating a map allows you to get the information needed to fetch tiles. That temporal map is an anonymous map.

#### Definition

```html
POST /api/v1/map/named/:template_name
```

#### Param

Param | Description
--- | ---
auth_token | optional, but required when `"method"` is set to `"token"`

```javascript
// params.json
{
 "color": "#ff0000",
 "cartodb_id": 3
}
```

The fields you pass as `params.json` depend on the variables allowed by the named map. If there are variables missing it will raise an error (HTTP 400)

- **auth_token** *optional* if the named map needs auth

### Example

You can initialize a template map by passing all of the required parameters in a POST to `/api/v1/map/named/:template_name`.

Valid credentials will be needed if required by the template.


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

You can then use the `layergroupid` for fetching tiles and grids as you would normally (see anonymous map section). However you'll need to show the `auth_token`, if required by the template.

## Using JSONP

There is also a special endpoint to be able to initialize a map using JSONP (for old browsers).

#### Definition

```bash
GET /api/v1/map/named/:template_name/jsonp
```

#### Params

Params | Description
--- | ---
auth_token | optional, but required when `"method"` is set to `"token"`
config | Encoded JSON with the params for creating named maps (the variables defined in the template)
lmza | This attribute contains the same as config but LZMA compressed. It cannot be used at the same time than `config`.
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

The response is in this format:

```javascript
callback({
  layergroupid: "dev@744bd0ed9b047f953fae673d56a47b4d:1390844463021.1401",
  last_updated: "2014-01-27T17:41:03.021Z"
})
```

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

### Other Info

Updating a named map removes all the named map instances so they need to be initialized again.

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

Delete the specified template map from the server and it disables any previously initialized versions of the map.

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

## Getting a Specific Template

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
  "template": {...} // see template.json above
}
```

#### Error

```javascript
{
  "errors" : ["Some error string here"]
}
```

## Use with CartoDB.js
Named maps can be used with CartoDB.js by specifying a named map in a layer source as follows. Named maps are treated almost the same as other layer source types in most other ways.

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

[CartoDB.js](http://docs.cartodb.com/cartodb-platform/cartodb-js/) has methods for accessing your named maps.

1. [layer.setParams()](http://docs.cartodb.com/cartodb-platform/cartodb-js/api-methods/#layersetparamskey-value) allows you to change the template variables (in the placeholders object) via JavaScript
2. [layer.setAuthToken()](http://docs.cartodb.com/cartodb-platform/cartodb-js/api-methods/#layersetauthtokenauthtoken) allows you to set the auth tokens to create the layer
