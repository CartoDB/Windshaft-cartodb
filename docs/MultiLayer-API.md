The Windshaft-CartoDB MultiLayer API extends the [Windshaft MultiLayer API](https://github.com/Vizzuality/Windshaft/wiki/Multilayer-API) in a few ways.

## Last modification timestamps

It encodes a timestamp of 'last modification time' into the map token (token:EPOCH) returned to the client.
It accepts tokens with encoded timestamp from the client considering the token suffix as a cache_buster value.

Clients don't need to be aware of the extension but rather use the API as they would use the base one.
The only difference will be that the _same_ layergroup configuration may result in different tokens if source data was modified between the mapview requests. 

Also Windshaft-CartoDB adds a ``last_update`` field with ISO format (2013-11-30T12:23:10).

## Stats tag

Windshaft-CartoDB adds support for a ``stat_tag`` element in the multilayer configuration to help [stats](Redis-stats-format) gathering.