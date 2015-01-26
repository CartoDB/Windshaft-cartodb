Template maps are layergroup configurations that rather than being
fully defined contain variables that can be set to produce a different
layergroup configurations (instantiation).

Template maps are persistent, can only be created and deleted by the
CartoDB user showing a valid API_KEY.


# Template format

A templated layergroup would allow using placeholders
in the "cartocss" and "sql" elements in the "option"
field of any "layer" of a layergroup configuration
(see https://github.com/CartoDB/Windshaft/wiki/MapConfig-specification).

Valid placeholder names start with a letter and can only
contain letters, numbers or underscores. They have to be
written between ``<%= `` and `` %>`` strings in order to be 
replaced. Example: ``<%= my_color %>``.

The set of supported placeholders for a template will need to be
explicitly defined specifying type and default value for each.

**placeholder types**

Placeholder type will determine the kind of escaping for the
associated value. Supported types are:

 * sql_literal (internal single-quotes will be sql-escaped)
 * sql_ident (internal double-quotes will be sql-escaped)
 * number (can only contain numerical representation)
 * css_color (can only contain color names or hex-values)
 * ... (add more as need arises)

Placeholder default value will be used when not provided at
instantiation time and could be used to test validity of the
template by creating a default instance.

```js
// template.json 
{
  version: "0.0.1",
  // there can be at most 1 template with the same name for any user 
  // valid names start with a letter and only contains letter, numbers
  // or underscores
  name: "template_name", 
  // embedded authorization certificate
  auth: {
   method: "token", // or "open" (the default if no "method" is given)
   // only (required and non empty) for "token" method
   valid_tokens: ["auth_token1","auth_token2"]
  },
  // Variables not listed here are not substituted
  // Variable not provided at instantiation time trigger an error
  // A default is required for optional variables
  // Type specification is used for quoting, to avoid injections
  placeholders: {
      color: {
        type:"css_color",
        default:"red"
      },
      cartodb_id: {
        type:"number",
        default: 1
      }
  },
  layergroup: {
   // see https://github.com/CartoDB/Windshaft/wiki/MapConfig-specification
   "version": "1.0.1",
   "layers": [{
    "type": "cartodb",
    "options": {
      "cartocss_version": "2.1.1", 
      "cartocss": "#layer { polygon-fill: <%= color %>; }",
      "sql": "select * from european_countries_e WHERE cartodb_id = <%= cartodb_id %>"
    }
   }]
  } 
}
```

# Creating a templated map

You can create a template map with a single call (for simplicity).

You'd use a POST sending JSON data:

```sh
curl -X POST \
   -H 'Content-Type: application/json' \
   -d @template.json \
   'https://docs.cartodb.com/tiles/template?api_key=APIKEY'
```

The response would be like this:
```js
{
   "template_id":"@template_name"
}
```

If a template with the same name exists in the user storage,
a 400 response is generated.

Errors are in this form:
```js
{
   "error":"Some error string here"
}
```

# Updating an existing template

You can update a template map with a PUT:

```sh
curl -X PUT \
   -H 'Content-Type: application/json' \
   -d @template.json \
   'https://docs.cartodb.com/tiles/template/:template_name?api_key=APIKEY'
```
A template with the same name will be updated, if any.

The response would be like this:
```js
{
   "template_id":"@template_name"
}
```

If a template with the same name does NOT exist,
a 400 HTTP response is generated with an error in this format:

```js
{
   "error":"Some error string here"
}
```


# Listing available templates

You can get a list of available templates with a GET to ``/template``.
A valid api_key is required.

```sh
curl -X GET 'https://docs.cartodb.com/tiles/template?api_key=APIKEY'
```

The response would be like this:
```js
{
   "template_ids": ["@template_name1","@template_name2"]
}
```

Or, on error:

```js
{
   "error":"Some error string here"
}
```

# Getting a specific template

You can get the definition of a template with a
GET to ``/template/:template_name``.
A valid api_key is required.

Example:

```sh
curl -X GET 'https://docs.cartodb.com/tiles/template/@template_name?auth_token=AUTH_TOKEN'
```

The response would be like this:
```js
{
   "template": {...}  // see template.json above
}
```

Or, on error:

```js
{
   "error":"Some error string here"
}
```

# Instantiating a template map

You can instantiate a template map passing all required parameters with
a POST to ``/template/:template_name``.

Valid credentials will be needed, if required by the template.

```js
// params.js
{
 color: '#ff0000',
 cartodb_id: 3
}
```

```sh
curl -X POST \
  -H 'Content-Type: application/json' \
  -d @params.js \
  'https://docs.cartodb.com/tiles/template/@template_name?auth_token=AUTH_TOKEN'

```

The response would be like this:
```js
{
   "layergroupid":"docs@fd2861af@c01a54877c62831bb51720263f91fb33:123456788",
   "last_updated":"2013-11-14T11:20:15.000Z"
}
```

or, on error:

```js
{
   "error":"Some error string here"
}
```

You can then use the ``layergroupid`` for fetching tiles and grids as you do
normally ( see https://github.com/CartoDB/Windshaft/wiki/Multilayer-API).
But you'll still have to show the ``auth_token``, if required by the template.

### using JSONP
There is also a special endpoint to be able to instanciate using JSONP (for old browsers)

```
curl 'https://docs.cartodb.com/tiles/template/@template_name/jsonp?auth_token=AUTH_TOKEN&callback=function_name&config=template_params_json'
```

it takes the ``callback`` function (required), ``auth_token`` in case the template needs auth and ``config`` which is the variabñes for the template (in case it has variables). For example config may be created (using javascript)
```
url += "config=" + encodeURIComponent(
JSON.stringify({ color: 'red' });
```

the response it's in this format:
```
jQuery17205720721024554223_1390996319118(
{
layergroupid: "dev@744bd0ed9b047f953fae673d56a47b4d:1390844463021.1401",
last_updated: "2014-01-27T17:41:03.021Z"
}
)
```
# Deleting a template map

You can delete a templated map with a DELETE to ``/template/:template_name``:

```sh
curl -X DELETE 'https://docs.cartodb.com/tiles/template/@template_name?auth_token=AUTH_TOKEN'
```

On success, a 204 (No Content) response would be issued.
Otherwise a 4xx response with this format:

```js
{
   "error":"Some error string here"
}
```
