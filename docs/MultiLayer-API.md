The Windshaft-CartoDB MultiLayer API extends the [Windshaft MultiLayer API](https://github.com/CartoDB/Windshaft/blob/master/doc/Multilayer-API.md) in a few ways.

## Last modification timestamp embedded in the token

It encodes a timestamp of 'last modification time' into the map token (token:EPOCH) returned to the client.
It accepts tokens with encoded timestamp from the client considering the token suffix as a cache_buster value.

Clients don't need to be aware of the extension but rather use the API as they would use the base one.
The only difference will be that the _same_ layergroup configuration may result in different tokens if source data was modified between the mapview requests. 

## Additional attributes in the response object

Windshaft-CartoDB adds the following attributes in the response object

- ``last_update`` field with ISO format (2013-11-30T12:23:10).
- ``cdn_url`` object containing CDN url client should use (not mandatory) to access the tiles. It's in the form:

   ```json
   {
     "http": "http://cdn_url.com/",
     "https": "https://secure.cdn_url.com/"
   }
   ```


## Stats tag

Windshaft-CartoDB adds support for a ``stat_tag`` element in the multilayer configuration to help [stats](https://github.com/CartoDB/Windshaft-cartodb/wiki/Redis-stats-format) gathering.
