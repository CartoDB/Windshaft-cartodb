Windshaft-cartodb metrics
=========================
See [Windshaft metrics documentation](https://github.com/CartoDB/Windshaft/blob/master/doc/metrics.md) to understand the full picture.

The next list includes the API endpoints, each endpoint may have several inner timers, some of them are displayed within this list as subitems. Find the description for them in the Inner timers section.
## Timers
- **windshaft-cartodb.get_infowindow**: time to retrieve an infowindow popup
- **windshaft-cartodb.get_map_metadata**: time to retrieve metadata for embedded maps
- **windshaft-cartodb.flush_cache**: time to flush the tile and sql cache
- **windshaft-cartodb.get_template**: time to retrieve an specific template
- **windshaft-cartodb.delete_template**: time to delete an specific template
- **windshaft-cartodb.get_template_list**: time to retrieve the list of owned templates
- **windshaft-cartodb.instance_template_post**: time to create a template via HTTP POST
- **windshaft-cartodb.instance_template_get**: time to create a template via HTTP GET
    + TemplateMaps_instance
    + createLayergroup

There are some endpoints that are not being tracked:
- Adding a template
- Updating a template

### Inner timers
Again, each inner timer may have several inner timers.

- **addCacheChannel**: time to add X-Cache-Channel header based on table last modifications
- **LZMA decompress**: time to decompress request params with LZMA
- **TemplateMaps_instance**: time to retrieve a map template instance, see *getTemplate* and *authorizedByCert*
- **affectedTables**: time to check what are the affected tables for adding the cache channel, see *addCacheChannel*
- **authorize**: time to authorize a request, see *authorizedByAPIKey*, *authorizedByCert*, *authorizedBySigner*
- **authorizedByAPIKey**: time to authorize using an API KEY
- **authorizedByCert**: time to authorize a request by a cert, see [signed map](https://github.com/CartoDB/Windshaft-cartodb/wiki/Signed-maps)
- **authorizedBySigner**: time to authorize a request for a [signed map](https://github.com/CartoDB/Windshaft-cartodb/wiki/Signed-maps)
- **cartoData.getTableGeometryType**: time to retrieve from redis the geom type for a given table
- **cors**: time to set the CORS headers
- **findLastUpdated**: time to retrieve the last update time for a list of tables, see *affectedTables*
- **fingerPrint**: time to create a fingerprint for a signed map
- **generateCacheChannel**: time to generate the headers for the cache channel based on the request, see *addCacheChannel*
- **getSignerMapKey**: time to retrieve from redis the authorized key for a signed map
- **getTablePrivacy**: time to retrieve from redis the privacy of a table
- **getTemplate**: time to retrieve from redis the template for a map
- **getUserMapKey**: time to retrieve from redis the user key for a map
- **incMapviewCount**: time to incremenent in redis the map views
- **mapStore_load**: time to retrieve from redis a map configuration
- **req2params.setup**: time to prepare the params from a request, see *req2params* in Windshaft documentation
- **setDBAuth**: time to retrieve from redis and set db user and db password from a user
- **setDBConn**: time to retrieve from redis and set db host and db name from a user
- **setDBParams**: time to prepare all db params to be able to connect/query a database, see *setDBAuth* and *setDBConn*
- **signMap**: time to sign in redis layergroup for a map, see signed maps
- **tablePrivacy_getUserDBName**: time to retrieve from redis the database for a user

