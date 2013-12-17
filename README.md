Windshaft-CartoDB
==================

[![Build Status](https://travis-ci.org/CartoDB/Windshaft-cartodb.png)](http://travis-ci.org/CartoDB/Windshaft-cartodb)

This is the CartoDB map tiler. It extends Windshaft with some extra
functionality and custom filters for authentication

* reads dbname from subdomain and cartodb redis for pretty tile urls
* configures windshaft to publish ``cartodb_id`` as the interactivity layer
* gets the default geometry type from the cartodb redis store
* allows tiles to be styled individually
* provides a link to varnish high speed cache
* provides a infowindow endpoint for windshaft
* provides a ``map_metadata`` endpoint for windshaft

Requirements
------------

 [core]
 - node-0.8.x+
 - PostgreSQL-8.3+
 - PostGIS-1.5.0+
 - Redis 2.4.0+ (http://www.redis.io)
 - Mapnik 2.0 or 2.1 

 [for cache control]
 - CartoDB-SQL-API 1.0.0+
 - CartoDB 0.9.5+ (for ``CDB_QueryTables``)
 - Varnish (https://www.varnish-cache.org)

Configure
---------

Create the config/environments/<env>.js files (there are .example files
to start from). You can optionally use the ./configure script for this,
see ```./configure --help``` to see available options.

Look at lib/cartodb/server_options.js for more on config

Build/install
-------------

To fetch and build all node-based dependencies, run:

```
git clone
npm install
```

Note that the ```npm install``` step will populate the node_modules/
directory with modules, some of which being compiled on demand. If you
happen to have startup errors you may need to force rebuilding those
modules. At any time just wipe out the node_modules/ directory and run
```npm install``` again.


Run
---

```
node app.js <env> 
```

Where <env> is the name of a configuration file under config/environments/.

Note that caches are kept in redis. If you're not seeing what you expect
there may be out-of-sync records in there.
Take a look: http://redis.io/commands


URLs
----

**TILES**

[GET] subdomain.cartodb.com/tiles/:table_name/:z/:x/:y.[png|png8|grid.json]

Args:

* sql - plain SQL arguments
* interactivity - specify the column to use in UTFGrid
* cache_buster - Specify an identifier for the internal tile cache.
                 Requesting tiles with the same cache_buster value may
                 result in being served a cached version of the tile
                 (even when requesting a tile for the first time, as tiles
                 can be prepared in advance)
* cache_policy - Set to "persist" to have the server send an Cache-Control
                 header requesting caching devices to keep the response
                 cached as much as possible. This is best used with a
                 timestamp value in cache_buster for manual control of
                 updates.
* geom_type - override the cartodb default
* style - override the default map style with Carto


**STYLE**

[GET/POST] subdomain.cartodb.com/tiles/:table_name/style

Args:

* style - the style in CartoCSS you want to set
* style_version - the version of the style for POST
* style_convert - request conversion to target version (both POST and GET)


**INFOWINDOW**

[GET] subdomain.cartodb.com/tiles/:table_name/infowindow

Args:

* infowindow - returns contents of infowindow from CartoDB.


**MAP METADATA**

[GET] subdomain.cartodb.com/tiles/:table_name/map_metadata

Args:

* infowindow - returns contents of infowindow from CartoDB.


All GET requests are wrappable with JSONP using callback argument,
including the UTFGrid map tile call.
