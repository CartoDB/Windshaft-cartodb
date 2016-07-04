# Quickstart

## Anonymous Maps

Here is an example of how to create an Anonymous Map with JavaScript:

```javascript
var mapconfig = {
  "version": "1.3.1",
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
  url: 'https://{username}.carto.com/api/v1/map',
  data: JSON.stringify(mapconfig),
  success: function(data) {
    var templateUrl = 'https://{username}.carto.com/api/v1/map/' + data.layergroupid + '/{z}/{x}/{y}.png'
    console.log(templateUrl);
  }
})
```

## Named Maps

Let's create a Named Map using some private tables in a CARTO account.
The following map config sets up a map of European countries that have a white fill color:

```javascript
{
  "version": "0.0.1",
  "name": "test",
  "auth": {
    "method": "open"
  },
  "layergroup": {
    "layers": [{
      "type": "mapnik",
      "options": {
        "cartocss_version": "2.1.1",
        "cartocss": "#layer { polygon-fill: #FFF; }",
        "sql": "select * from european_countries_e"
      }
    }]
  }
}
```

The MapConfig needs to be sent to CARTO's Map API using an authenticated call. Here we will use a command line tool called `curl`. For more info about this tool, see [this blog post](http://quickleft.com/blog/command-line-tutorials-curl), or type `man curl` in bash. Using `curl`, and storing the config from above in a file `MapConfig.json`, the call would look like:

#### Call

```bash
curl 'https://{username}.carto.com/api/v1/map/named?api_key={api_key}' -H 'Content-Type: application/json' -d @mapconfig.json
```

To get the `URL` to fetch the tiles you need to instantiate the map, where `template_id` is the template name from the previous response.

#### Call

```bash
curl -X POST 'https://{username}.carto.com/api/v1/map/named/{template_id}' -H 'Content-Type: application/json'
```

The response will return JSON with properties for the `layergroupid`, the timestamp (`last_updated`) of the last data modification and some key/value pairs with `metadata` for the `layers`.

Note: all `layers` in `metadata` will always have a `type` string and a `meta` dictionary with the key/value pairs.

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
  }
}
```

You can use the `layergroupid` to instantiate a URL template for accessing tiles on the client. Here we use the `layergroupid` from the example response above in this URL template:

```bash
https://{username}.carto.com/api/v1/map/{layergroupid}/{z}/{x}/{y}.png
```
