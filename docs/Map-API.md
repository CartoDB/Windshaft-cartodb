## Maps API

The CartoDB Maps API allows you to generate maps based on data hosted in your CartoDB account and style them using CartoCSS. The API generates a XYZ based URL to fetch Web Mercator projected tiles using web clients like Leaflet, Google Maps, OpenLayers.

You can create two types of maps with the Maps API:

- **Anonymous maps**  
  Maps that can be created using your CartoDB public data. Any client can change the read-only SQL and CartoCSS parameters that generate the map tiles. These maps can be created from a JavaScript application alone and no authenticated calls are needed. See [this CartoDB.js example]({{ '/cartodb-platform/cartodb-js.html' | prepend: site.baseurl }}).

- **Named maps**  
  Maps that access to your private data. These maps require an owner to setup and modify any SQL and CartoCSS parameters and are not modifiable without new setup calls. 

## Quickstart

### Anonymous maps

Here is an example of how to create an anonymous map with JavaScript:

{% highlight javascript %}
var mapconfig = {
  "version": "1.0.1",
  "layers": [{
    "type": "cartodb",
    "options": {
      "cartocss_version": "2.1.1",
      "cartocss": "#layer { polygon-fill: #FFF; }",
      "sql": "select * from european_countries_e"
    }
  }]
}

$.ajax({
  crossOrigin: true,
  type: 'POST',
  dataType: 'json',
  contentType: 'application/json',
  url: 'http://documentation.cartodb.com/api/v1/map',
  data: JSON.stringify(mapconfig),
  success: function(data) {
    var templateUrl = 'http://documentation.cartodb.com/api/v1/map/' + data.layergroupid + '{z}/{x}/{y}.png'
    console.log(templateUrl);
  }
})
{% endhighlight %}

### Named maps

Let's create a named map using some private tables in a CartoDB account.
The following API call creates a map of European countries that have a white fill color:

{% highlight javascript %}
// mapconfig.json
{
  "version": "0.0.1"
  "name": "test",
  "auth": {
    "method": "open"
  },
  "layergroup": {
    "layers": [{
      "type": "cartodb",
      "options": {
        "cartocss_version": "2.1.1",
        "cartocss": "#layer { polygon-fill: #FFF; }",
        "sql": "select * from european_countries_e"
      }
    }]
  }
}
{% endhighlight %}

The map config needs to be sent to CartoDB's Map API using an authenticated call. Here we use a command line tool called `curl`. For more info about this tool see [this blog post](http://quickleft.com/blog/command-line-tutorials-curl) or type ``man curl`` in bash. Using `curl` the call would look like:

<div class="code-title notitle code-request"></div>
{% highlight bash %}
curl 'https://{account}.cartodb.com/api/v1/map/named?api_key=APIKEY' -H 'Content-Type: application/json' -d @mapconfig.json
{% endhighlight %}

To get the `URL` to fetch the tiles you need to instantiate the map.

<div class="code-title notitle code-request"></div>
{% highlight bash %}
curl 'http://{account}.cartodb.com/api/v1/map/named/test' -H 'Content-Type: application/json'
{% endhighlight %}

The response will return JSON with properties for the `layergroupid` and the timestamp (`last_updated`) of the last data modification. 

Here is an example response:

{% highlight javascript %}
{
  "layergroupid": "c01a54877c62831bb51720263f91fb33:0",
  "last_updated": "1970-01-01T00:00:00.000Z"
}
{% endhighlight %}

You can use the `layergroupid` to instantiate a URL template for accessing tiles on the client. Here we use the `layergroupid` from the example response above in this URL template:

{% highlight bash %}
http://documentation.cartodb.com/tiles/layergroup/c01a54877c62831bb51720263f91fb33:0/{z}/{x}/{y}.png
{% endhighlight %}

## General Concepts

The following concepts are the same for every endpoint in the API except when it's noted explicitly.

### Auth

By default, users do not have access to private tables in CartoDB. In order to instantiate a map from private table data an API Key is required. Additionally, to include some endpoints an API Key must be included (e.g. creating a named map).

To execute an authorized request, api_key=YOURAPIKEY should be added to the request URL. The param can be also passed as POST param. We **strongly advise** using HTTPS when you are performing requests that include your `api_key`.

### Errors

Errors are reported using standard HTTP codes and extended information encoded in JSON with this format:

{% highlight javascript %}
{
  "errors": [
    "access forbidden to table TABLE"
  ]
}
{% endhighlight %}

If you use JSONP, the 200 HTTP code is always returned so the JavaScript client can receive errors from the JSON object.

### CORS support

All the endpoints which might be accessed using a web browser add CORS headers and allow OPTIONS method.

## Anonymous Maps

Anonymous maps allows you to instantiate a map given SQL and CartoCSS. It also allows you to add interaction capabilities using [UTF Grid.](https://github.com/mapbox/utfgrid-spec)

### Instantiate

#### Definition

<div class="code-title notitle code-request"></div>
{% highlight html %}
POST /api/v1/map
{% endhighlight %}

#### Params

{% highlight javascript %}
{
  "version": "1.0.1",
  "layers": [{
    "type": "cartodb",
    "options": {
      "cartocss_version": "2.1.1", 
      "cartocss": "#layer { polygon-fill: #FFF; }",
      "sql": "select * from european_countries_e",
      "interactivity": ["cartodb_id", "iso3"]
    }
  }]
}
{% endhighlight %}

Should be a [Mapconfig](https://github.com/CartoDB/Windshaft/blob/0.19.1/doc/MapConfig-1.1.0.md).

#### Response

The response includes:

- **layergroupid**  
  The ID for that map, used to compose the URL for the tiles. The final URL is:

  {% highlight html %}
  http://{account}.cartodb.com/api/v1/map/:layergroupid/{z}/{x}/{y}.png
  {% endhighlight %}

- **updated_at**  
  The ISO date of the last time the data involved in the query was updated.

- **metadata** *(optional)*  
  Includes information about the layers. Some layers may not have metadata.

- **cdn_url**  
  URLs to fetch the data using the best CDN for your zone.

#### Example

<div class="code-title code-request with-result">REQUEST</div>
{% highlight bash %}
curl 'http://documentation.cartodb.com/api/v1/map' -H 'Content-Type: application/json' -d @mapconfig.json
{% endhighlight %}

<div class="code-title">RESPONSE</div>
{% highlight javascript %}
{
  "layergroupid":"c01a54877c62831bb51720263f91fb33:0",
  "last_updated":"1970-01-01T00:00:00.000Z"
  "cdn_url": {
    "http": "http://cdb.com",
    "https": "https://cdb.com"
  }
}
{% endhighlight %}

The tiles can be accessed using:

{% highlight bash %}
http://documentation.cartodb.com/api/v1/map/c01a54877c62831bb51720263f91fb33:0/{z}/{x}/{y}.png
{% endhighlight %}

For UTF grid tiles:

{% highlight bash %}
http://documentation.cartodb.com/api/v1/map/c01a54877c62831bb51720263f91fb33:0/:layer/{z}/{x}/{y}.grid.json
{% endhighlight %}

For attributes defined in `attributes` section:

{% highlight bash %}
http://documentation.cartodb.com/api/v1/map/c01a54877c62831bb51720263f91fb33:0/:layer/attributes/:feature_id
{% endhighlight %}

Which returns JSON with the attributes defined, like:

{% highlight javascript %}
{ c: 1, d: 2 }
{% endhighlight %}

Notice UTF Grid and attributes endpoints need an intenger parameter, ``layer``. That number is the 0-based index of the layer inside the mapconfig. So in this case 0 returns the UTF grid tiles/attributes for layer 0, the only layer in the example mapconfig. If a second layer was available it could be returned with 1, a third layer with 2, etc.

### Create JSONP

The JSONP endpoint is provided in order to allow web browsers access which don't support CORS.

#### Definition

<div class="code-title notitle code-request"></div>
{% highlight bash %}
GET /api/v1/map?callback=method
{% endhighlight %}

#### Params

- **auth_token** *(optional)*  
  If the named map needs authorization.

- **config**  
  Encoded JSON with the params for creating named maps (the variables defined in the template).

- **lmza**  
  This attribute contains the same as config but LZMA compressed. It cannot be used at the same time as `config`.

- **callback**  
  JSON callback name.

#### Example

<div class="code-title code-request with-result">REQUEST</div>
{% highlight bash %}
curl http://...
{% endhighlight %}

<div class="code-title">RESPONSE</div>
{% highlight javascript %}
{
}
{% endhighlight %}

### Remove

Anonymous maps cannot be removed by an API call. They will expire after about five minutes but sometimes longer. If an anonymous map expires and tiles are requested from it, an error will be raised. This could happen if a user leaves a map open and after time returns to the map an attempts to interact with it in a way that requires new tiles (e.g. zoom). The client will need to go through the steps of creating the map again to fix the problem.

## Named Maps

Named maps are essentially the same as anonymous maps but the mapconfig is stored in the server and given a unique name. Two other big differences are that you can created named maps from private data and that users without an API Key can see them even though they are from that private data. 

The main two differences compared to anonymous maps are:

- **auth layer**  
  This allows you to control who is able to see the map based on a token auth

- **templates**  
  Since the mapconfig is static it can contain some variables so the client con modify the map appearance using those variables.

Template maps are persistent with no preset expiration. They can only be created or deleted by a CartoDB user with a valid API_KEY (see auth section).

### Create

#### Definition

<div class="code-title notitle code-request"></div>
{% highlight html %}
POST /api/v1/map/named
{% endhighlight %}

#### Params

{% highlight javascript %}
// template.json 
{
  version: '0.0.1',
  // there can be at most 1 template with the same name for any user 
  // valid names start with a letter and only contains letter, numbers
  // or underscores
  name: 'template_name', 

  auth: {
   method: 'token', // or "open" (the default if no "method" is given)
   valid_tokens: ['auth_token1','auth_token2'] // only (required and non empty) for 'token' method
  },

  // Variables not listed here are not substituted
  // Variable not provided at instantiation time trigger an error
  // A default is required for optional variables
  // Type specification is used for quoting, to avoid injections
  // see template format section below
  placeholders: {
    color: {
      type:'css_color',
      default:'red'
    },
    cartodb_id: {
      type:'number',
      default: 1
    }
  },

  // the layer list definition
  layergroup: {
    // this is the MapConfig explained in anonymous maps
    // see https://github.com/CartoDB/Windshaft/blob/0.19.1/doc/MapConfig-1.1.0.md)
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
{% endhighlight %}

#### Template Format

A templated `layergroup` allows using placeholders in the "cartocss" and "sql" elements of the "option" object in any "layer" of a layergroup configuration

Valid placeholder names start with a letter and can only contain letters, numbers or underscores. They have to be written between `<%=` and `%>` strings in order to be replaced.

##### Example

{% highlight javascript %}
<%= my_color %>
{% endhighlight %}

The set of supported placeholders for a template will need to be explicitly defined with a specific type and default value for each.

#### Placeholder Types

The placeholder type will determine the kind of escaping for the associated value. Supported types are:

- **sql_literal** internal single-quotes will be sql-escaped
- **sql_ident** internal double-quotes will be sql-escaped
- **number** can only contain numerical representation
- **css_color** can only contain color names or hex-values

Placeholder default values will be used whenever new values are not provided as options at the time of creation on the client. They can also be used to test the template by creating a default version with now options provided.

When using templates, be very careful about your selections as they can give broad access to your data if they are defined losely.

<div class="code-title code-request with-result">REQUEST</div>
{% highlight html %}
curl -X POST \
   -H 'Content-Type: application/json' \
   -d @template.json \
   'https://docs.cartodb.com/api/v1/named?api_key=APIKEY'
{% endhighlight %}

<div class="code-title">RESPONSE</div>
{% highlight javascript %}
{
  "templateid":"name",
}
{% endhighlight %}

### Instantiate

Instantiating a map allows you to get the information needed to fetch tiles. That temporal map is an anonymous map.

#### Definition

<div class="code-title notitle code-request"></div>
{% highlight html %}
POST /api/v1/named/:template_name
{% endhighlight %}

#### Param

{% highlight javascript %}
// params.json
{
 color: "#ff0000",
 cartodb_id: 3
}
{% endhighlight %}

The fields you pass as `params.json` depend on the variables allowed by the named map. If there are variables missing it will raise an error (HTTP 400)

- **auth_token** *optional* if the named map needs auth

#### Example

You can initialize a template map by passing all of the required parameters in a POST to `/api/v1/named/:template_name`.

Valid credentials will be needed if required by the template.

<div class="code-title code-request with-result">REQUEST</div>
{% highlight bash %}
curl -X POST \
  -H 'Content-Type: application/json' \
  -d @params.json \
  'https://docs.cartodb.com/api/v1/template/@template_name?auth_token=AUTH_TOKEN'
{% endhighlight %}

<div class="code-title">Response</div>
{% highlight javascript %}
{
  "layergroupid": "docs@fd2861af@c01a54877c62831bb51720263f91fb33:123456788",
  "last_updated": "2013-11-14T11:20:15.000Z"
}
{% endhighlight %}

<div class="code-title">Error</div>
{% highlight javascript %}
{
  "error": "Some error string here"
}
{% endhighlight %}

You can then use the `layergroupid` for fetching tiles and grids as you would normally (see anonymous map section).  However, you'll need to show the `auth_token`, if required by the template.

### Using JSONP

There is also a special endpoint to be able to initialize a map using JSONP (for old browsers).

#### Definition

<div class="code-title notitle code-request"></div>
{% highlight bash %}
GET /api/v1/named/:template_name/jsonp
{% endhighlight %}

#### Params

- **auth_token** *(optional)* If the named map needs auth
- **config** Encoded JSON with the params for creating named maps (the variables defined in the template)
- **lmza** This attribute contains the same as config but LZMA compressed. It cannot be used at the same time than `config`.
- **callback:** JSON callback name

<div class="code-title code-request with-result">REQUEST</div>
{% highlight bash %}
curl 'https://docs.cartodb.com/api/v1/named/:template_name/jsonp?auth_token=AUTH_TOKEN&callback=function_name&config=template_params_json'
{% endhighlight %}

<div class="code-title">RESPONSE</div>
{% highlight javascript %}
callback(
  "layergroupid":"c01a54877c62831bb51720263f91fb33:0",
  "last_updated":"1970-01-01T00:00:00.000Z"
  "cdn_url": {
    "http": "http://cdb.com",
    "https": "https://cdb.com"
  }
)
{% endhighlight %}

This takes the `callback` function (required), `auth_token` if the template needs auth, and `config` which is the variable for the template (in cases where it has variables). 

{% highlight javascript %}
url += "config=" + encodeURIComponent(
JSON.stringify({ color: 'red' });
{% endhighlight %}

The response is in this format:

{% highlight javascript %}
jQuery17205720721024554223_1390996319118({
  layergroupid: "dev@744bd0ed9b047f953fae673d56a47b4d:1390844463021.1401",
  last_updated: "2014-01-27T17:41:03.021Z"
})
{% endhighlight %}

### Update

#### Definition

<div class="code-title notitle code-request"></div>
{% highlight bash %}
PUT /api/v1/map/:map_name
{% endhighlight %}

#### Params

Same params used to create a map.

#### Response

Same as updating a map.

#### Other Info

Updating a named map removes all the named map instances so they need to be initialized again.

#### Example

<div class="code-title code-request with-result">REQUEST</div>
{% highlight bash %}
curl -X PUT \
  -H 'Content-Type: application/json' \
  -d @template.json \
  'https://docs.cartodb.com/tiles/template/:template_name?api_key=APIKEY'
{% endhighlight %}

<div class="code-title">RESPONSE</div>
{% highlight javascript %}
{
  "template_id": "@template_name"
}
{% endhighlight %}

If any template has the same name, it will be updated.

If a template with the same name does NOT exist, a 400 HTTP response is generated with an error in this format:

{% highlight javascript %}
{
  "error": "error string here"
}
{% endhighlight %}

Updating a template map will also remove all signatures from previously initialized maps. 

### Delete 

Delete the specified template map from the server and disables any previously initialized versions of the map.

#### Definition

<div class="code-title notitle code-request"></div>
{% highlight bash %}
DELETE /template/:template_name
{% endhighlight %}

#### Example

<div class="code-title code-request">REQUEST</div>
{% highlight bash %}
curl -X DELETE 'https://docs.cartodb.com/tiles/template/@template_name?auth_token=AUTH_TOKEN'
{% endhighlight %}

<div class="code-title">RESPONSE</div>
{% highlight javascript %}
{
  "error": "Some error string here"
}
{% endhighlight %}

On success, a 204 (No Content) response would be issued. Otherwise a 4xx response with with an error will be returned:

### Listing Available Templates

This allows you to get a list of all available templates. 

#### Definition

<div class="code-title notitle code-request"></div>
{% highlight bash %}
GET /api/v1/map/named/
{% endhighlight %}

#### Params

- **api_key** is required

#### Example

<div class="code-title code-request with-result">REQUEST</div>
{% highlight bash %}
curl -X GET 'https://docs.cartodb.com/tiles/template?api_key=APIKEY'
{% endhighlight %}

<div class="code-title with-result">RESPONSE</div>
{% highlight javascript %}
{
   "template_ids": ["@template_name1","@template_name2"]
}
{% endhighlight %}

<div class="code-title">ERROR</div>
{% highlight javascript %}
{
   "error": "Some error string here"
}
{% endhighlight %}

### Getting a Specific Template

This gets the definition of a template

#### Definition

<div class="code-title notitle code-request"></div>
{% highlight bash %}
GET /api/v1/map/named/:template_name
{% endhighlight %}

#### Params

- **api_key** is required

#### Example

<div class="code-title code-request with-result">REQUEST</div>
{% highlight bash %}
curl -X GET 'https://docs.cartodb.com/tiles/template/@template_name?auth_token=AUTH_TOKEN'
{% endhighlight %}

<div class="code-title with-result">RESPONSE</div>
{% highlight javascript %}
{
  "template": {...} // see template.json above
}
{% endhighlight %}

<div class="code-title">ERROR</div>
{% highlight javascript %}
{
  "error": "Some error string here"
}
{% endhighlight %}
