Windshaft-CartoDB
==================

NOTE: requires node-0.8.x

This is the CartoDB map tiler. It extends Windshaft with some extra
functionality and custom filters for authentication

* reads dbname from subdomain and cartodb redis for pretty tile urls
* configures windshaft to publish ``cartodb_id`` as the interactivity layer
* gets the default geometry type from the cartodb redis store
* allows tiles to be styled individually
* provides a link to varnish high speed cache
* provides a infowindow endpoint for windshaft
* provides a ``map_metadata`` endpoint for windshaft

Install
-------

```
git clone
npm install
```

Note that the ```npm install``` step will populate the node_modules/
directory with modules, some of which being compiled on demand. If you
happen to have startup errors you may need to force rebuilding those
modules. At any time just wipe out the node_modules/ directory and run
```npm install``` again.

Configure
---------

Create a config/environments/<env>.js file (there are .example files
to start from).

Look at lib/cartodb/server_options.js for more on config

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
* cache_buster - if needed you can add a cachebuster to make sure you're
  rendering new
* geom_type - override the cartodb default
* style - override the default map style with Carto


**STYLE**

[GET/POST] subdomain.cartodb.com/tiles/:table_name/style

Args:

* style - the style in CartoCSS you want to set


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
